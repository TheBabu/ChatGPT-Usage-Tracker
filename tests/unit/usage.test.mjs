// shared/usage.js: turning ChatGPT's usage response into what the bar, sidebar and popup show.
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../shared/usage.js';

const CGUT = globalThis.CGUT;
const HOUR = 3600;
const DAY = 24 * HOUR;
const FETCHED_AT = Date.UTC(2026, 9, 5, 12, 0, 0);

const raw = (rateLimit, extra = {}) => ({ plan_type: 'plus', rate_limit: rateLimit, ...extra });

test('primary and secondary windows become the 5-hour and weekly limits', () => {
  const usage = CGUT.normalizeUsage(raw({
    primary_window: { used_percent: 37, limit_window_seconds: 5 * HOUR, reset_after_seconds: 600 },
    secondary_window: { used_percent: 12, limit_window_seconds: 7 * DAY, reset_at: 1791200000 },
  }), FETCHED_AT, 'acct');
  assert.equal(usage.accountId, 'acct');
  assert.equal(usage.planType, 'plus');
  assert.deepEqual(usage.session, { pct: 37, windowSec: 5 * HOUR, resetsAt: FETCHED_AT + 600 * 1000 });
  assert.deepEqual(usage.weekly, { pct: 12, windowSec: 7 * DAY, resetsAt: 1791200000 * 1000 });
});

test('windows are told apart by length, not by which slot they arrive in', () => {
  const usage = CGUT.normalizeUsage(raw({
    primary_window: { used_percent: 50, limit_window_seconds: 7 * DAY },
    secondary_window: { used_percent: 10, limit_window_seconds: 5 * HOUR },
  }), FETCHED_AT);
  assert.equal(usage.session.pct, 10);
  assert.equal(usage.weekly.pct, 50);
});

test('a single long window is the weekly limit, with no 5-hour limit', () => {
  const usage = CGUT.normalizeUsage(raw({ primary_window: { used_percent: 5, limit_window_seconds: 7 * DAY } }), FETCHED_AT);
  assert.equal(usage.session, null);
  assert.equal(usage.weekly.pct, 5);
});

test('percentages are parsed from strings and kept within 0-100', () => {
  const usage = CGUT.normalizeUsage(raw({
    primary_window: { used_percent: '120.5', limit_window_seconds: 5 * HOUR },
    secondary_window: { used_percent: -3, limit_window_seconds: 7 * DAY },
  }), FETCHED_AT);
  assert.equal(usage.session.pct, 100);
  assert.equal(usage.weekly.pct, 0);
});

test('a window without a percentage is ignored, and accountId defaults', () => {
  const usage = CGUT.normalizeUsage(raw({ primary_window: { limit_window_seconds: 5 * HOUR } }), FETCHED_AT);
  assert.equal(usage.session, null);
  assert.equal(usage.weekly, null);
  assert.equal(usage.accountId, 'default');
});

test('limit reached and credits', () => {
  const usage = CGUT.normalizeUsage(raw({ allowed: false }, {
    credits: { has_credits: true, unlimited: false, balance: '12.5' },
  }), FETCHED_AT);
  assert.equal(usage.limitReached, true);
  assert.deepEqual(usage.credits, { hasCredits: true, unlimited: false, balance: 12.5 });
  assert.equal(CGUT.isOverLimit(usage), true);
  assert.equal(CGUT.hasCreditsInfo(usage), true);
});

test('credits only count as worth showing when there are some', () => {
  const none = { credits: { hasCredits: false, unlimited: false, balance: 0 } };
  assert.equal(CGUT.hasCreditsInfo(none), false);
  assert.equal(CGUT.hasCreditsInfo({ credits: { ...none.credits, unlimited: true } }), true);
  assert.equal(CGUT.hasCreditsInfo({ credits: { ...none.credits, balance: 3 } }), true);
  assert.equal(CGUT.hasCreditsInfo(null), false);
});

test('over the limit means limit reached or a window at 100%', () => {
  assert.equal(CGUT.isOverLimit({ limitReached: false, session: { pct: 100 } }), true);
  assert.equal(CGUT.isOverLimit({ limitReached: false, session: { pct: 99 }, weekly: { pct: 40 } }), false);
  assert.equal(CGUT.isOverLimit(null), false);
});

test('window labels', () => {
  assert.equal(CGUT.windowLabel({ windowSec: 5 * HOUR }, 'x'), '5-hour');
  assert.equal(CGUT.windowLabel({ windowSec: 7 * DAY }, 'x'), 'Weekly');
  assert.equal(CGUT.windowLabel({ windowSec: 2 * DAY }, 'x'), '2-day');
  assert.equal(CGUT.windowLabel({}, 'Weekly'), 'Weekly');
});

test('durations and percentages', () => {
  assert.equal(CGUT.formatDuration(0), 'now');
  assert.equal(CGUT.formatDuration(30 * 1000), '<1m');
  assert.equal(CGUT.formatDuration(45 * 60 * 1000), '45m');
  assert.equal(CGUT.formatDuration((4 * 60 + 28) * 60 * 1000), '4h 28m');
  assert.equal(CGUT.formatDuration((2 * 24 + 3) * HOUR * 1000), '2d 3h');
  assert.equal(CGUT.formatAgo(FETCHED_AT - 20 * 1000, FETCHED_AT), '20s ago');
  assert.equal(CGUT.formatAgo(FETCHED_AT - 90 * 60 * 1000, FETCHED_AT), '1h 30m ago');
  assert.equal(CGUT.formatAgo(0, FETCHED_AT), 'never');
  assert.equal(CGUT.formatPct(36.6), '37%');
});

test('small credit amounts keep an extra decimal so a cheap message does not read as 0', () => {
  assert.equal(CGUT.formatCredits(0.1234), '0.123');
  assert.equal(CGUT.formatCredits(null), '–');
});

test('monthly credit totals are read per account and month', () => {
  const ledger = { acct: { months: { '2026-10': 4.5 } } };
  assert.equal(CGUT.monthKey(new Date(2026, 9, 5)), '2026-10');
  assert.equal(CGUT.creditsUsedThisMonth(ledger, 'acct', new Date(2026, 9, 20)), 4.5);
  assert.equal(CGUT.creditsUsedThisMonth(ledger, 'acct', new Date(2026, 10, 1)), 0);
  assert.equal(CGUT.creditsUsedThisMonth(ledger, 'other', new Date(2026, 9, 1)), 0);
});

test('the page bootstrap yields the session, or null when it cannot be read', () => {
  assert.deepEqual(CGUT.parseBootstrap('{"session":{"accessToken":"t"}}'), { accessToken: 't' });
  assert.equal(CGUT.parseBootstrap('not json'), null);
  assert.equal(CGUT.parseBootstrap(''), null);
});

test('plan labels and error records', () => {
  assert.equal(CGUT.planLabel('plus'), 'Plus');
  assert.equal(CGUT.planLabel(null), null);
  const record = CGUT.errorRecord(new CGUT.UsageError('Not signed in', 'signed-out'));
  assert.equal(record.code, 'signed-out');
  assert.equal(record.message, 'Not signed in');
  assert.equal(typeof record.at, 'number');
});
