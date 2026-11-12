/**
 * Pure session fold for token-cost accounting.
 *
 * The fold mirrors dsh-token-meter's `tokenUsage` replacement semantics: the
 * last usage sample of a turn/step replaces the previous one, while
 * `llm/retry-started` closes that replacement slot so each retried request is
 * billed as its own attempt. It additionally attributes every sample to a
 * provider/model route and to the peak or off-peak price class of the event
 * timestamp.
 *
 * This module has no imports from DSH packages. The projection contract's
 * `parse` calls are satisfied by small schema objects below instead of a real
 * Zod schema, keeping the plugin dependency-free.
 */

import { PEAK_SCHEDULE, PRICING, costOfBuckets, priceClassAt, ratesFor, roundCost } from './pricing.js';

const UNKNOWN_ROUTE = Object.freeze({ provider: 'unknown', model: 'unknown' });

/** @typedef {{input: number, cacheRead: number, cacheWrite: number, output: number}} Buckets */
/** @typedef {{provider: string, model: string}} Route */
/** @typedef {{turn: number|null, step: number|null, route: Route, class: 'peak'|'offPeak', buckets: Buckets}} LastSample */

/** A fresh all-zero token bucket. */
export function emptyBuckets() {
  return { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
}

/** A fresh state for an empty session log. */
export function emptyState() {
  return { routes: {}, last: null, route: null };
}

/** Whether one value is a plain object. */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Whether one value is a non-negative safe integer. */
function isCount(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** Normalize a bucket-shaped value, filling malformed entries with zero. */
function bucketShape(value) {
  const source = isRecord(value) ? value : {};
  return {
    input: isCount(source.input) ? source.input : 0,
    cacheRead: isCount(source.cacheRead) ? source.cacheRead : 0,
    cacheWrite: isCount(source.cacheWrite) ? source.cacheWrite : 0,
    output: isCount(source.output) ? source.output : 0,
  };
}

/** Whether one bucket object is entirely zero. */
function isZeroBuckets(value) {
  return value.input === 0 && value.cacheRead === 0 && value.cacheWrite === 0 && value.output === 0;
}

/** Combine a bucket with another, clamping at zero on subtraction. */
function combineBuckets(current, incoming, sign) {
  return {
    input: Math.max(0, current.input + sign * incoming.input),
    cacheRead: Math.max(0, current.cacheRead + sign * incoming.cacheRead),
    cacheWrite: Math.max(0, current.cacheWrite + sign * incoming.cacheWrite),
    output: Math.max(0, current.output + sign * incoming.output),
  };
}

/** Stable internal route key; the NUL-free JSON form has no delimiter collisions. */
function routeKey(provider, model) {
  return JSON.stringify([provider, model]);
}

/** Extract a non-empty route from a message source or request config. */
function routeOf(value) {
  if (!isRecord(value)) return undefined;
  const provider = typeof value.provider === 'string' ? value.provider.trim() : '';
  const model = typeof value.model === 'string' ? value.model.trim() : '';
  if (provider.length === 0 || model.length === 0) return undefined;
  return { provider, model };
}

/** Whether two routes are the same provider/model pair. */
function sameRoute(left, right) {
  return left !== null && left !== undefined && right !== null && right !== undefined
    && left.provider === right.provider && left.model === right.model;
}

/** Set the fallback route, reusing the state reference when unchanged. */
function setRoute(state, route) {
  if (sameRoute(state.route, route)) return state;
  return { ...state, route };
}

/** Add or remove one bucket at one route/class; drop an entry that becomes zero. */
function adjustRoute(routes, route, classKey, buckets, sign) {
  const key = routeKey(route.provider, route.model);
  const existing = routes[key];
  const base = existing === undefined
    ? {
        provider: route.provider,
        model: route.model,
        peak: emptyBuckets(),
        offPeak: emptyBuckets(),
      }
    : {
        provider: route.provider,
        model: route.model,
        peak: bucketShape(existing.peak),
        offPeak: bucketShape(existing.offPeak),
      };
  const next = { ...base, [classKey]: combineBuckets(base[classKey], buckets, sign) };
  if (isZeroBuckets(next.peak) && isZeroBuckets(next.offPeak)) {
    const { [key]: _removed, ...rest } = routes;
    return rest;
  }
  return { ...routes, [key]: next };
}

/** Extract the four token buckets from one provider usage value. */
function bucketsOfUsage(usage) {
  if (!isRecord(usage)) return undefined;
  const input = isCount(usage.inputTokens) ? usage.inputTokens : undefined;
  const output = isCount(usage.outputTokens) ? usage.outputTokens : undefined;
  if (input === undefined || output === undefined) return undefined;
  const cacheRead = usage.cacheReadTokens === undefined
    ? 0
    : isCount(usage.cacheReadTokens) ? usage.cacheReadTokens : undefined;
  const cacheWrite = usage.cacheWriteTokens === undefined
    ? 0
    : isCount(usage.cacheWriteTokens) ? usage.cacheWriteTokens : undefined;
  if (cacheRead === undefined || cacheWrite === undefined) return undefined;
  return { input, cacheRead, cacheWrite, output };
}

/** Read the last provider usage sample embedded in one attempt/message event. */
function usageOfEvent(event) {
  const data = event.data;
  if (!isRecord(data)) return undefined;
  if (event.type === 'assistant/message' && isRecord(data.usage)) return data.usage;
  const stream = data.stream;
  if (!Array.isArray(stream)) return undefined;
  for (let index = stream.length - 1; index >= 0; index -= 1) {
    const record = stream[index];
    if (!isRecord(record) || record.type !== 'chunk' || !isRecord(record.chunk)) continue;
    if (record.chunk.type === 'usage' && isRecord(record.chunk.usage)) return record.chunk.usage;
  }
  return undefined;
}

/**
 * Fold one committed session event into the token-cost state.
 *
 * Unrelated events return the same state reference so the projection registry
 * performs no downstream work.
 *
 * @param {object} state - previous state.
 * @param {{type?: string, time?: number, data?: object}} event - committed session event.
 * @returns {object} next state; the same reference for unrelated events.
 */
export function foldEvent(state, event) {
  if (!isRecord(state)) return emptyState();
  if (!isRecord(event)) return state;
  const data = isRecord(event.data) ? event.data : {};

  if (event.type === 'request/context') {
    const route = routeOf(data);
    return route === undefined ? state : setRoute(state, route);
  }
  if (event.type === 'request/header') {
    const route = routeOf(isRecord(data.header) ? data.header.config : undefined);
    return route === undefined ? state : setRoute(state, route);
  }
  if (event.type === 'llm/retry-started') {
    const last = state.last;
    if (last !== null && last !== undefined && last.turn === data.turn && last.step === data.step) {
      return { ...state, last: null };
    }
    return state;
  }
  if (event.type !== 'assistant/message' && event.type !== 'assistant/attempt') return state;

  const sourceRoute = event.type === 'assistant/message' && isRecord(data.message)
    ? routeOf(data.message.source)
    : undefined;
  const knownRoute = sourceRoute ?? state.route ?? null;
  const attribution = knownRoute ?? UNKNOWN_ROUTE;
  const buckets = bucketsOfUsage(usageOfEvent(event));
  if (buckets === undefined) {
    return sourceRoute === undefined ? state : setRoute(state, sourceRoute);
  }

  const turn = isCount(data.turn) ? data.turn : null;
  const step = isCount(data.step) ? data.step : null;
  const classKey = priceClassAt(event.time);
  let routes = isRecord(state.routes) ? state.routes : {};
  const previous = state.last;
  if (previous !== null && previous !== undefined && previous.turn === turn && previous.step === step) {
    routes = adjustRoute(routes, previous.route, previous.class, previous.buckets, -1);
  }
  routes = adjustRoute(routes, attribution, classKey, buckets, 1);
  return {
    ...state,
    routes,
    last: { turn, step, route: { provider: attribution.provider, model: attribution.model }, class: classKey, buckets },
    route: knownRoute,
  };
}

/** Validate one route-shaped value. */
function validRoute(value) {
  return isRecord(value)
    && typeof value.provider === 'string' && value.provider.length > 0
    && typeof value.model === 'string' && value.model.length > 0;
}

/** Validate one bucket-shaped value with all four fields. */
function validBuckets(value) {
  return isRecord(value)
    && isCount(value.input) && isCount(value.cacheRead)
    && isCount(value.cacheWrite) && isCount(value.output);
}

/** Validate one replacement slot. */
function validLast(value) {
  return isRecord(value)
    && (value.turn === null || isCount(value.turn))
    && (value.step === null || isCount(value.step))
    && validRoute(value.route)
    && (value.class === 'peak' || value.class === 'offPeak')
    && validBuckets(value.buckets);
}

/** Projection state schema: only `parse` is used by the registry. */
export const stateSchema = {
  parse(value) {
    if (!isRecord(value)) throw new Error('tokenCost state must be an object');
    if (!isRecord(value.routes)) throw new Error('tokenCost state.routes must be an object');
    for (const [key, route] of Object.entries(value.routes)) {
      if (!validRoute(route)) throw new Error(`tokenCost state.routes[${key}] is malformed`);
      if (!validBuckets(route.peak) || !validBuckets(route.offPeak)) {
        throw new Error(`tokenCost state.routes[${key}] has malformed buckets`);
      }
    }
    if (value.last !== null && !validLast(value.last)) throw new Error('tokenCost state.last is malformed');
    if (value.route !== null && value.route !== undefined && !validRoute(value.route)) {
      throw new Error('tokenCost state.route is malformed');
    }
    return value;
  },
};

/** Empty route cost result. */
function zeroCost() {
  return { inputCost: 0, cacheReadCost: 0, cacheWriteCost: 0, outputCost: 0, cost: 0 };
}

/** Sum two bucket-shaped values. */
function sumBuckets(left, right) {
  return {
    input: left.input + right.input,
    cacheRead: left.cacheRead + right.cacheRead,
    cacheWrite: left.cacheWrite + right.cacheWrite,
    output: left.output + right.output,
  };
}

/**
 * Build the client-visible whole value at one state revision.
 *
 * All pricing is done here so the browser only formats finished numbers.
 *
 * @param {object} state - current token-cost state.
 * @returns {object} wire view.
 */
export function buildView(state) {
  const totals = {
    cost: 0,
    peakCost: 0,
    offPeakCost: 0,
    inputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    inputCost: 0,
    cacheReadCost: 0,
    cacheWriteCost: 0,
    outputCost: 0,
  };
  const routes = [];
  const sourceRoutes = isRecord(state) && isRecord(state.routes) ? Object.values(state.routes) : [];
  for (const entry of sourceRoutes) {
    if (!isRecord(entry) || !validRoute(entry)) continue;
    const peakBuckets = bucketShape(entry.peak);
    const offPeakBuckets = bucketShape(entry.offPeak);
    const peakRates = ratesFor(entry.model, 'peak');
    const offPeakRates = ratesFor(entry.model, 'offPeak');
    const priced = peakRates !== undefined && offPeakRates !== undefined;
    const peak = priced ? costOfBuckets(peakRates, peakBuckets) : zeroCost();
    const offPeak = priced ? costOfBuckets(offPeakRates, offPeakBuckets) : zeroCost();
    const buckets = sumBuckets(peakBuckets, offPeakBuckets);
    const totalTokens = buckets.input + buckets.cacheRead + buckets.cacheWrite + buckets.output;
    const cost = roundCost(peak.cost + offPeak.cost);
    if (totalTokens === 0 && cost === 0) continue;
    const route = {
      provider: entry.provider,
      model: entry.model,
      priced,
      totalTokens,
      peakCost: peak.cost,
      offPeakCost: offPeak.cost,
      cost,
      inputTokens: buckets.input,
      cacheReadTokens: buckets.cacheRead,
      cacheWriteTokens: buckets.cacheWrite,
      outputTokens: buckets.output,
      inputCost: roundCost(peak.inputCost + offPeak.inputCost),
      cacheReadCost: roundCost(peak.cacheReadCost + offPeak.cacheReadCost),
      cacheWriteCost: roundCost(peak.cacheWriteCost + offPeak.cacheWriteCost),
      outputCost: roundCost(peak.outputCost + offPeak.outputCost),
    };
    routes.push(route);
    totals.cost = roundCost(totals.cost + route.cost);
    totals.peakCost = roundCost(totals.peakCost + route.peakCost);
    totals.offPeakCost = roundCost(totals.offPeakCost + route.offPeakCost);
    totals.inputTokens += route.inputTokens;
    totals.cacheReadTokens += route.cacheReadTokens;
    totals.cacheWriteTokens += route.cacheWriteTokens;
    totals.outputTokens += route.outputTokens;
    totals.inputCost = roundCost(totals.inputCost + route.inputCost);
    totals.cacheReadCost = roundCost(totals.cacheReadCost + route.cacheReadCost);
    totals.cacheWriteCost = roundCost(totals.cacheWriteCost + route.cacheWriteCost);
    totals.outputCost = roundCost(totals.outputCost + route.outputCost);
  }
  routes.sort((left, right) => right.cost - left.cost
    || right.totalTokens - left.totalTokens
    || left.model.localeCompare(right.model)
    || left.provider.localeCompare(right.provider));
  const promptTokens = totals.inputTokens + totals.cacheReadTokens + totals.cacheWriteTokens;
  const unpriced = routes.filter((route) => !route.priced);
  return {
    currency: PRICING.currency,
    symbol: PRICING.symbol,
    priceVersion: PRICING.version,
    peakSchedule: PEAK_SCHEDULE,
    totalTokens: promptTokens + totals.outputTokens,
    cacheHitPercent: promptTokens > 0 ? (totals.cacheReadTokens / promptTokens) * 100 : null,
    unpricedTokens: unpriced.reduce((sum, route) => sum + route.totalTokens, 0),
    unpricedModels: [...new Set(unpriced.map((route) => `${route.provider}/${route.model}`))].sort(),
    totals,
    routes,
  };
}

/** Validate one non-negative finite cost or count. */
function validNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** Projection wire schema: only `parse` is used by the registry. */
export const viewSchema = {
  parse(value) {
    if (!isRecord(value)) throw new Error('tokenCost view must be an object');
    if (typeof value.currency !== 'string' || typeof value.symbol !== 'string') {
      throw new Error('tokenCost view is missing currency metadata');
    }
    if (typeof value.priceVersion !== 'string') throw new Error('tokenCost view is missing priceVersion');
    if (!isRecord(value.peakSchedule)
      || !Number.isFinite(value.peakSchedule.utcOffsetMinutes)
      || !Array.isArray(value.peakSchedule.windows)
      || !value.peakSchedule.windows.every((window) => Array.isArray(window)
        && window.length === 2 && window.every(validNumber))
      || !Array.isArray(value.peakSchedule.holidays)
      || !value.peakSchedule.holidays.every((item) => typeof item === 'string')) {
      throw new Error('tokenCost view has an invalid peak schedule');
    }
    if (!validNumber(value.totalTokens) || !validNumber(value.unpricedTokens)) {
      throw new Error('tokenCost view has invalid totals');
    }
    if (value.cacheHitPercent !== null && !validNumber(value.cacheHitPercent)) {
      throw new Error('tokenCost view has an invalid cache hit percentage');
    }
    if (!Array.isArray(value.unpricedModels) || !value.unpricedModels.every((item) => typeof item === 'string')) {
      throw new Error('tokenCost view has invalid unpricedModels');
    }
    if (!isRecord(value.totals) || !validNumber(value.totals.cost)) {
      throw new Error('tokenCost view has invalid totals');
    }
    if (!Array.isArray(value.routes)) throw new Error('tokenCost view has invalid routes');
    for (const route of value.routes) {
      if (!isRecord(route) || !validRoute(route) || typeof route.priced !== 'boolean'
        || !validNumber(route.totalTokens) || !validNumber(route.cost)) {
        throw new Error('tokenCost view has a malformed route');
      }
    }
    return value;
  },
};
