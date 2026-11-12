import test from 'node:test';
import assert from 'node:assert/strict';

import { buildView, emptyState, foldEvent, stateSchema, viewSchema } from '../fold.js';

const PEAK = Date.UTC(2026, 10, 2, 2, 0); // 2026-11-02 10:00 Beijing
const OFF_PEAK = Date.UTC(2026, 10, 2, 12, 0); // 2026-11-02 20:00 Beijing
const FLASH = { provider: 'deepseek-official', model: 'deepseek-flash' };
const PRO = { provider: 'deepseek-official', model: 'deepseek-v4-pro' };

/** One session event with a stable shape for the fold tests. */
function event(type, data, time = PEAK) {
  return { type, seq: 0, time, data };
}

/** One assistant message carrying provider usage. */
function message(turn, step, usage, time = PEAK, source = FLASH) {
  return event('assistant/message', {
    turn,
    step,
    message: { source },
    stream: [],
    usage,
  }, time);
}

/** One attempt whose usage is embedded in its stream. */
function attempt(turn, step, usage, time = PEAK) {
  return event('assistant/attempt', {
    turn,
    step,
    stream: [{ type: 'chunk', time: 0, chunk: { type: 'usage', usage } }],
  }, time);
}

test('cross-turn usage accumulates and is priced at peak flash rates', () => {
  let state = emptyState();
  state = foldEvent(state, event('request/context', FLASH));
  state = foldEvent(state, message(1, 1, {
    inputTokens: 1_000_000,
    outputTokens: 200_000,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  }));
  state = foldEvent(state, message(2, 1, {
    inputTokens: 100_000,
    outputTokens: 50_000,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  }));

  const view = buildView(state);
  assert.equal(view.totalTokens, 1_350_000);
  assert.equal(view.totals.inputTokens, 1_100_000);
  assert.equal(view.totals.outputTokens, 250_000);
  assert.equal(view.totals.cost, 4.2);
  assert.equal(view.routes.length, 1);
  assert.equal(view.routes[0].priced, true);
  assert.equal(view.routes[0].totalTokens, 1_350_000);
  assert.equal(view.routes[0].cost, 4.2);
  assert.equal(view.peakSchedule.utcOffsetMinutes, 480);
  assert.equal(view.peakSchedule.windows.length, 2);
  assert.ok(view.peakSchedule.holidays.includes('2026-10-01'));
  assert.ok(view.peakSchedule.holidays.includes('2027-01-01'));
  assert.doesNotThrow(() => stateSchema.parse(state));
  assert.doesNotThrow(() => viewSchema.parse(view));
});

test('a new sample in the same turn and step replaces the previous sample', () => {
  let state = emptyState();
  state = foldEvent(state, message(1, 1, {
    inputTokens: 1_000_000,
    outputTokens: 200_000,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  }));
  state = foldEvent(state, message(1, 1, {
    inputTokens: 500_000,
    outputTokens: 100_000,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  }));

  const view = buildView(state);
  assert.equal(view.totalTokens, 600_000);
  assert.equal(view.totals.cost, 1.8);
});

test('a retry adds a billed attempt instead of replacing the earlier message', () => {
  let state = emptyState();
  state = foldEvent(state, event('request/context', FLASH));
  state = foldEvent(state, message(1, 1, {
    inputTokens: 500_000,
    outputTokens: 100_000,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  }));
  state = foldEvent(state, event('llm/retry-started', { turn: 1, step: 1 }));
  state = foldEvent(state, attempt(1, 1, {
    inputTokens: 100_000,
    outputTokens: 50_000,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  }));

  let view = buildView(state);
  assert.equal(view.totalTokens, 750_000);
  assert.equal(view.totals.cost, 2.4);

  // The final message of the retried attempt replaces that attempt's sample.
  state = foldEvent(state, message(1, 1, {
    inputTokens: 100_000,
    outputTokens: 50_000,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  }));
  view = buildView(state);
  assert.equal(view.totalTokens, 750_000);
  assert.equal(view.totals.cost, 2.4);
});

test('a retry for another step leaves the replacement slot untouched', () => {
  const state = foldEvent(emptyState(), message(1, 1, {
    inputTokens: 1_000,
    outputTokens: 100,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  }));
  assert.equal(foldEvent(state, event('llm/retry-started', { turn: 2, step: 1 })), state);
});

test('routes are priced independently and sorted by cost', () => {
  let state = emptyState();
  state = foldEvent(state, event('request/context', FLASH));
  state = foldEvent(state, message(1, 1, {
    inputTokens: 1_000_000,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  }));
  state = foldEvent(state, event('request/context', PRO));
  state = foldEvent(state, message(2, 1, {
    inputTokens: 1_000_000,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  }, PEAK, PRO));

  const view = buildView(state);
  assert.equal(view.totalTokens, 2_000_000);
  assert.equal(view.totals.cost, 11);
  assert.equal(view.routes.length, 2);
  assert.equal(view.routes[0].model, 'deepseek-v4-pro');
  assert.equal(view.routes[0].cost, 9);
  assert.equal(view.routes[1].model, 'deepseek-flash');
  assert.equal(view.routes[1].cost, 2);
});

test('off-peak samples use half of the flash peak rates', () => {
  let state = emptyState();
  state = foldEvent(state, message(1, 1, {
    inputTokens: 1_000_000,
    outputTokens: 200_000,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  }, OFF_PEAK));

  const view = buildView(state);
  assert.equal(view.totals.cost, 1.8);
  assert.equal(view.totals.peakCost, 0);
  assert.equal(view.totals.offPeakCost, 1.8);
});

test('cache hit percentage uses input plus cache traffic as the prompt', () => {
  let state = emptyState();
  state = foldEvent(state, message(1, 1, {
    inputTokens: 1_000_000,
    outputTokens: 0,
    cacheReadTokens: 1_000_000,
    cacheWriteTokens: 0,
  }));

  const view = buildView(state);
  assert.equal(view.cacheHitPercent, 50);
  assert.equal(view.totals.inputTokens, 1_000_000);
  assert.equal(view.totals.cacheReadTokens, 1_000_000);
  assert.equal(view.totals.cost, 2.04);
});

test('usage is read from a message stream when the message has no explicit usage field', () => {
  let state = emptyState();
  state = foldEvent(state, event('assistant/message', {
    turn: 1,
    step: 1,
    message: { source: FLASH },
    stream: [{ type: 'chunk', time: 0, chunk: { type: 'usage', usage: { inputTokens: 1_000, outputTokens: 100 } } }],
  }));

  const view = buildView(state);
  assert.equal(view.totalTokens, 1_100);
  assert.equal(view.routes[0].priced, true);
});

test('a request/header route attributes attempts that carry no message source', () => {
  let state = emptyState();
  state = foldEvent(state, event('request/header', {
    reason: 'initial',
    header: { config: FLASH },
  }));
  state = foldEvent(state, attempt(1, 1, {
    inputTokens: 1_000,
    outputTokens: 100,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  }));

  const view = buildView(state);
  assert.equal(view.unpricedTokens, 0);
  assert.equal(view.routes[0].priced, true);
});

test('unknown routes keep token counts but expose no cost', () => {
  let state = emptyState();
  state = foldEvent(state, event('request/context', { provider: 'other', model: 'mystery' }));
  state = foldEvent(state, attempt(1, 1, {
    inputTokens: 1_000,
    outputTokens: 100,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  }));

  const view = buildView(state);
  assert.equal(view.totalTokens, 1_100);
  assert.equal(view.totals.cost, 0);
  assert.equal(view.unpricedTokens, 1_100);
  assert.deepEqual(view.unpricedModels, ['other/mystery']);
  assert.equal(view.routes[0].priced, false);
});

test('unrelated events preserve the state reference', () => {
  const state = emptyState();
  assert.equal(foldEvent(state, event('tool/call', { turn: 1, step: 1 })), state);
});

test('malformed usage samples do not add token or cost', () => {
  const state = emptyState();
  const next = foldEvent(state, message(1, 1, {
    inputTokens: -1,
    outputTokens: 100,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  }));
  assert.equal(next.routes, state.routes);
  assert.equal(buildView(next).totalTokens, 0);
  assert.equal(buildView(next).totals.cost, 0);
});

test('state and view schemas reject malformed shapes', () => {
  assert.throws(() => stateSchema.parse({ routes: {}, last: null, route: { provider: 'x' } }));
  assert.throws(() => stateSchema.parse({ routes: {}, last: { turn: 1 } }));
  assert.throws(() => viewSchema.parse({}));

  const state = emptyState();
  const view = buildView(state);
  assert.doesNotThrow(() => stateSchema.parse(state));
  assert.doesNotThrow(() => viewSchema.parse(view));
  assert.equal(view.totalTokens, 0);
  assert.equal(view.cacheHitPercent, null);
});
