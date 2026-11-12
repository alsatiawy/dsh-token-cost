import test from 'node:test';
import assert from 'node:assert/strict';

import { PEAK_SCHEDULE, PRICING, costOfBuckets, priceClassAt, ratesFor } from '../pricing.js';

/** Epoch milliseconds for a Beijing wall-clock time. */
function beijing(year, month, day, hour, minute) {
  return Date.UTC(year, month - 1, day, hour - 8, minute);
}

test('2026-11-02 is a Monday used by boundary tests', () => {
  assert.equal(new Date(Date.UTC(2026, 10, 2)).getUTCDay(), 1);
});

test('peak windows are left-inclusive and right-exclusive in Beijing time', () => {
  const cases = [
    [8, 59, 'offPeak'],
    [9, 0, 'peak'],
    [11, 59, 'peak'],
    [12, 0, 'offPeak'],
    [13, 59, 'offPeak'],
    [14, 0, 'peak'],
    [17, 59, 'peak'],
    [18, 0, 'offPeak'],
    [23, 59, 'offPeak'],
  ];
  for (const [hour, minute, expected] of cases) {
    assert.equal(
      priceClassAt(beijing(2026, 11, 2, hour, minute)),
      expected,
      `${hour}:${String(minute).padStart(2, '0')} Beijing time`,
    );
  }
});

test('weekends are off-peak all day', () => {
  assert.equal(priceClassAt(beijing(2026, 11, 7, 10, 0)), 'offPeak');
  assert.equal(priceClassAt(beijing(2026, 11, 8, 15, 0)), 'offPeak');
});

test('2026 statutory holidays are off-peak on weekdays', () => {
  assert.equal(priceClassAt(beijing(2026, 10, 1, 10, 0)), 'offPeak');
  assert.equal(priceClassAt(beijing(2026, 10, 7, 15, 0)), 'offPeak');
  assert.equal(priceClassAt(beijing(2026, 2, 16, 10, 0)), 'offPeak');
  assert.equal(priceClassAt(beijing(2026, 11, 2, 10, 0)), 'peak');
});

test('2027 statutory holidays are off-peak on weekdays', () => {
  const weekdays = [
    [1, 1],   // New Year's Day, Friday
    [2, 5],   // Spring Festival, Friday
    [2, 8],   // Spring Festival, Monday
    [2, 12],  // Spring Festival, Friday
    [4, 5],   // Qingming, Monday
    [5, 4],   // Labour Day, Tuesday
    [6, 9],   // Dragon Boat, Wednesday
    [9, 15],  // Mid-Autumn, Wednesday
    [10, 1],  // National Day, Friday
    [10, 7],  // National Day, Thursday
  ];
  for (const [month, day] of weekdays) {
    assert.equal(
      priceClassAt(beijing(2027, month, day, 10, 0)),
      'offPeak',
      `2027-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} should be off-peak`,
    );
  }
  assert.equal(priceClassAt(beijing(2027, 10, 8, 10, 0)), 'peak');
});

test('the holiday table switches automatically at the Beijing year boundary', () => {
  assert.equal(priceClassAt(beijing(2026, 12, 31, 10, 0)), 'peak');
  assert.equal(priceClassAt(beijing(2027, 1, 1, 10, 0)), 'offPeak');
  assert.equal(priceClassAt(beijing(2027, 1, 4, 10, 0)), 'peak');
  assert.equal(priceClassAt(beijing(2027, 2, 15, 10, 0)), 'peak');
});

test('invalid timestamps are conservatively classified as peak', () => {
  assert.equal(priceClassAt(Number.NaN), 'peak');
  assert.equal(priceClassAt(undefined), 'peak');
});

test('official flash and pro rates are exposed per class', () => {
  assert.deepEqual(ratesFor('deepseek-flash', 'peak'), {
    cacheHit: 0.04,
    cacheMiss: 2,
    cacheWrite: 2,
    output: 8,
  });
  assert.deepEqual(ratesFor('deepseek-flash', 'offPeak'), {
    cacheHit: 0.02,
    cacheMiss: 1,
    cacheWrite: 1,
    output: 4,
  });
  assert.deepEqual(ratesFor('deepseek-v4-pro', 'peak'), {
    cacheHit: 0.3,
    cacheMiss: 9,
    cacheWrite: 9,
    output: 27,
  });
  assert.deepEqual(ratesFor('deepseek-v4-pro', 'offPeak'), {
    cacheHit: 0.15,
    cacheMiss: 4.5,
    cacheWrite: 4.5,
    output: 13.5,
  });
});

test('legacy flash aliases use the flash price', () => {
  assert.deepEqual(
    ratesFor('deepseek-v4-flash', 'peak'),
    ratesFor('deepseek-flash', 'peak'),
  );
  assert.deepEqual(
    ratesFor('deepseek-v4-flash-vision-exp', 'offPeak'),
    ratesFor('deepseek-flash', 'offPeak'),
  );
});

test('unknown models have no rates', () => {
  assert.equal(ratesFor('unknown-model', 'peak'), undefined);
  assert.equal(ratesFor('', 'peak'), undefined);
  assert.equal(ratesFor(undefined, 'peak'), undefined);
});

test('official example: flash peak 1M miss + 0.5M hit + 0.2M output = CNY 3.62', () => {
  const result = costOfBuckets(
    ratesFor('deepseek-flash', 'peak'),
    { input: 1_000_000, cacheRead: 500_000, cacheWrite: 0, output: 200_000 },
  );
  assert.equal(result.cost, 3.62);
  assert.equal(result.inputCost, 2);
  assert.equal(result.cacheReadCost, 0.02);
  assert.equal(result.outputCost, 1.6);
});

test('official example: the same buckets off-peak = CNY 1.81', () => {
  const result = costOfBuckets(
    ratesFor('deepseek-flash', 'offPeak'),
    { input: 1_000_000, cacheRead: 500_000, cacheWrite: 0, output: 200_000 },
  );
  assert.equal(result.cost, 1.81);
});

test('cache writes fall back to the cache-miss rate when no write rate is declared', () => {
  const result = costOfBuckets(
    ratesFor('deepseek-flash', 'peak'),
    { input: 0, cacheRead: 0, cacheWrite: 1_000_000, output: 0 },
  );
  assert.equal(result.cacheWriteCost, 2);
  assert.equal(result.cost, 2);
});

test('missing rates produce a zero cost instead of throwing', () => {
  const result = costOfBuckets(undefined, { input: 1, cacheRead: 1, cacheWrite: 1, output: 1 });
  assert.deepEqual(result, {
    inputCost: 0,
    cacheReadCost: 0,
    cacheWriteCost: 0,
    outputCost: 0,
    cost: 0,
  });
});

test('pricing metadata names the CNY official source', () => {
  assert.equal(PRICING.currency, 'CNY');
  assert.equal(PRICING.symbol, '¥');
  assert.equal(PRICING.version, '2026-11-02');
  assert.match(PRICING.source, /api-docs\.deepseek\.com/);
});

test('the shared peak schedule carries offset, windows, and both holiday years', () => {
  assert.equal(PEAK_SCHEDULE.utcOffsetMinutes, 480);
  assert.deepEqual(PEAK_SCHEDULE.windows, [[9 * 60, 12 * 60], [14 * 60, 18 * 60]]);
  assert.ok(PEAK_SCHEDULE.holidays.includes('2026-01-01'));
  assert.ok(PEAK_SCHEDULE.holidays.includes('2026-10-01'));
  assert.ok(PEAK_SCHEDULE.holidays.includes('2027-01-01'));
  assert.ok(PEAK_SCHEDULE.holidays.includes('2027-02-05'));
  assert.ok(PEAK_SCHEDULE.holidays.includes('2027-10-07'));
  assert.equal(PEAK_SCHEDULE.holidays.filter((date) => date.startsWith('2027-')).length, 29);
  assert.equal(PEAK_SCHEDULE.holidays.length, 62);
});
