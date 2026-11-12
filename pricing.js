/**
 * Official DeepSeek pricing, peak/off-peak classification, and cost math.
 *
 * Prices are CNY per 1,000,000 tokens. The table was captured on 2026-11-02
 * from the Chinese DeepSeek API pricing page. Peak pricing follows Beijing
 * time (fixed UTC+8) on Monday through Friday, excluding Chinese statutory
 * holidays; every other moment is off-peak.
 *
 * This module is intentionally dependency-free so the plugin can ship as a
 * self-contained bundle without a build step.
 *
 * Sources:
 * - https://api-docs.deepseek.com/zh-cn/quick_start/pricing/
 * - https://www.gov.cn/zhengce/content/202511/content_7047090.htm (2026 holidays)
 * - https://www.gov.cn/zhengce/content/202611/content_7085101.htm (2027 holidays)
 */

export const PRICING = Object.freeze({
  currency: 'CNY',
  symbol: '¥',
  version: '2026-11-02',
  source: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/',
  unitTokens: 1_000_000,
  peakTimeZone: 'Asia/Shanghai',
});

/** DeepSeek list prices, CNY per million tokens. */
const MODELS = Object.freeze({
  'deepseek-flash': Object.freeze({
    peak: Object.freeze({ cacheHit: 0.04, cacheMiss: 2, output: 8 }),
    offPeak: Object.freeze({ cacheHit: 0.02, cacheMiss: 1, output: 4 }),
  }),
  'deepseek-v4-pro': Object.freeze({
    peak: Object.freeze({ cacheHit: 0.3, cacheMiss: 9, output: 27 }),
    offPeak: Object.freeze({ cacheHit: 0.15, cacheMiss: 4.5, output: 13.5 }),
  }),
});

/** Legacy or dated model ids that the provider still bills at a current model's price. */
const MODEL_ALIASES = new Map([
  ['deepseek-v4-flash', 'deepseek-flash'],
  ['deepseek-v4-flash-vision-exp', 'deepseek-flash'],
  ['deepseek-flash-1017', 'deepseek-flash'],
  ['deepseek-v4-pro-0813', 'deepseek-v4-pro'],
]);

/**
 * Chinese statutory holidays by year, as inclusive Beijing-date ranges.
 *
 * Add a new year here when the State Council publishes its notice. Every date
 * carries its own year, so a table becomes effective automatically at 00:00
 * Beijing time on January 1; no separate "current year" switch is needed.
 */
const HOLIDAY_RANGES_BY_YEAR = {
  2026: [
    ['2026-01-01', '2026-01-03'],
    ['2026-02-15', '2026-02-23'],
    ['2026-04-04', '2026-04-06'],
    ['2026-05-01', '2026-05-05'],
    ['2026-06-19', '2026-06-21'],
    ['2026-09-25', '2026-09-27'],
    ['2026-10-01', '2026-10-07'],
  ],
  2027: [
    ['2027-01-01', '2027-01-03'],
    ['2027-02-05', '2027-02-13'],
    ['2027-04-03', '2027-04-05'],
    ['2027-05-01', '2027-05-05'],
    ['2027-06-09', '2027-06-09'],
    ['2027-09-15', '2027-09-15'],
    ['2027-10-01', '2027-10-07'],
  ],
};

/** Peak windows in minutes from midnight, Beijing time; start inclusive, end exclusive. */
const PEAK_WINDOWS = Object.freeze([
  Object.freeze([9 * 60, 12 * 60]),
  Object.freeze([14 * 60, 18 * 60]),
]);

const DAY_MS = 24 * 60 * 60 * 1000;
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

const HOLIDAYS = buildHolidaySet(Object.values(HOLIDAY_RANGES_BY_YEAR).flat());

/**
 * Peak calendar shared with the browser so the pill icon can follow the
 * current class without duplicating holiday data in the client bundle.
 *
 * The list contains every built-in year, so the browser follows the year
 * boundary automatically as its clock advances.
 */
export const PEAK_SCHEDULE = Object.freeze({
  utcOffsetMinutes: 8 * 60,
  windows: PEAK_WINDOWS,
  holidays: Object.freeze([...HOLIDAYS].sort()),
});

/** Pad a positive integer to two digits. */
function pad2(value) {
  return String(value).padStart(2, '0');
}

/** Build a YYYY-MM-DD key from a UTC date, used only for Beijing calendar dates. */
function calendarKey(date) {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

/** Expand inclusive YYYY-MM-DD ranges into a calendar-key set. */
function buildHolidaySet(ranges) {
  const holidays = new Set();
  for (const [start, end] of ranges) {
    const startMs = Date.parse(`${start}T00:00:00Z`);
    const endMs = Date.parse(`${end}T00:00:00Z`);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) continue;
    for (let ms = startMs; ms <= endMs; ms += DAY_MS) {
      holidays.add(calendarKey(new Date(ms)));
    }
  }
  return holidays;
}

/**
 * Classify one usage event's timestamp as peak or off-peak.
 *
 * The timestamp is shifted by Beijing's fixed UTC+8 offset and then read with
 * UTC getters, which makes the result independent of the host time zone.
 *
 * @param {number} timeMs - Unix epoch milliseconds.
 * @returns {'peak' | 'offPeak'} pricing class; invalid input is treated as peak.
 */
export function priceClassAt(timeMs) {
  if (!Number.isFinite(timeMs)) return 'peak';
  const local = new Date(timeMs + BEIJING_OFFSET_MS);
  const weekday = local.getUTCDay();
  if (weekday === 0 || weekday === 6) return 'offPeak';
  if (HOLIDAYS.has(calendarKey(local))) return 'offPeak';
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  for (const [start, end] of PEAK_WINDOWS) {
    if (minutes >= start && minutes < end) return 'peak';
  }
  return 'offPeak';
}

/** Resolve an advertised model id to the canonical table key, when known. */
function canonicalModel(model) {
  if (typeof model !== 'string' || model.length === 0) return undefined;
  if (Object.hasOwn(MODELS, model)) return model;
  const lower = model.toLowerCase();
  if (Object.hasOwn(MODELS, lower)) return lower;
  return MODEL_ALIASES.get(lower) ?? MODEL_ALIASES.get(model);
}

/** Read one non-negative finite rate. */
function rate(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/**
 * Resolve the four rates one model charges in one pricing class.
 *
 * A flat entry (no peak/offPeak tiers) is accepted for future non-DeepSeek
 * models; a missing cache-hit rate falls back to cache-miss, and a missing
 * cache-write rate falls back to cache-miss at cost time.
 *
 * @param {string} model - advertised model id.
 * @param {'peak' | 'offPeak'} classKey - pricing class.
 * @returns {{cacheHit: number, cacheMiss: number, cacheWrite: number, output: number} | undefined}
 */
export function ratesFor(model, classKey) {
  const canonical = canonicalModel(model);
  if (canonical === undefined) return undefined;
  const entry = MODELS[canonical];
  if (entry === undefined) return undefined;
  const tier = entry[classKey] ?? entry.peak ?? entry.offPeak ?? entry;
  if (tier === null || typeof tier !== 'object') return undefined;
  const cacheMiss = rate(tier.cacheMiss ?? tier.input ?? tier.cacheRead);
  const output = rate(tier.output);
  if (cacheMiss === undefined || output === undefined) return undefined;
  const cacheHit = rate(tier.cacheHit ?? tier.cachedInput ?? tier.cacheRead) ?? cacheMiss;
  const cacheWrite = rate(tier.cacheWrite) ?? cacheMiss;
  return { cacheHit, cacheMiss, cacheWrite, output };
}

/** Round a cost to a stable 1e-10 precision. */
export function roundCost(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 1e10) / 1e10;
}

/**
 * Price one route's four token buckets at one class's rates.
 *
 * @param {{cacheHit: number, cacheMiss: number, cacheWrite: number, output: number} | undefined} rates
 * @param {{input: number, cacheRead: number, cacheWrite: number, output: number}} buckets
 * @returns {{inputCost: number, cacheReadCost: number, cacheWriteCost: number, outputCost: number, cost: number}}
 */
export function costOfBuckets(rates, buckets) {
  const result = { inputCost: 0, cacheReadCost: 0, cacheWriteCost: 0, outputCost: 0, cost: 0 };
  if (rates === undefined || buckets === null || typeof buckets !== 'object') return result;
  const input = rate(buckets.input) ?? 0;
  const cacheRead = rate(buckets.cacheRead) ?? 0;
  const cacheWrite = rate(buckets.cacheWrite) ?? 0;
  const output = rate(buckets.output) ?? 0;
  result.inputCost = roundCost((input * rates.cacheMiss) / PRICING.unitTokens);
  result.cacheReadCost = roundCost((cacheRead * rates.cacheHit) / PRICING.unitTokens);
  result.cacheWriteCost = roundCost((cacheWrite * rates.cacheWrite) / PRICING.unitTokens);
  result.outputCost = roundCost((output * rates.output) / PRICING.unitTokens);
  result.cost = roundCost(
    result.inputCost + result.cacheReadCost + result.cacheWriteCost + result.outputCost,
  );
  return result;
}
