// Owns the shared state in chrome.storage.local: the latest usage, the last error, the per-account
// monthly credit tally and a short debug log. Tabs do the fetching; this worker stores what they
// report, and fetches itself only when the popup asks and no chatgpt.com tab can.
'use strict';

importScripts('shared/usage.js');

const LOG_LIMIT = 150;
const LEDGER_MONTHS_KEPT = 12;

// Every read-modify-write of storage goes through this queue. Without it two tabs reporting at
// once would both read the same previous balance and count the same spend twice.
let queue = Promise.resolve();
function serialized(task) {
  const run = queue.then(task);
  queue = run.catch(() => {});
  return run;
}

async function appendLog(message) {
  const { debugLog = [] } = await chrome.storage.local.get('debugLog');
  debugLog.push({ t: Date.now(), message: String(message).slice(0, 500) });
  await chrome.storage.local.set({ debugLog: debugLog.slice(-LOG_LIMIT) });
}

function log(message) {
  return serialized(() => appendLog(message));
}

function round(n) {
  return Math.round(n * 10000) / 10000;
}

function describeUsage(usage, spent) {
  const parts = [];
  if (usage.session) parts.push(`${CGUT.windowLabel(usage.session, '5-hour')} ${CGUT.formatPct(usage.session.pct)}`);
  if (usage.weekly) parts.push(`${CGUT.windowLabel(usage.weekly, 'weekly')} ${CGUT.formatPct(usage.weekly.pct)}`);
  if (usage.credits?.balance != null) parts.push(`credits ${CGUT.formatCredits(usage.credits.balance)}`);
  if (spent > 0) parts.push(`spent ${CGUT.formatCredits(spent)}`);
  return `Updated: ${parts.join(', ') || 'no limits reported'}`;
}

// ChatGPT reports a credit balance, not what was spent, so the monthly figure is built from drops
// in the balance between fetches. Rises (top-ups, grants) are not usage. Neither is a drop while
// every limit had room: credits are only drawn past a limit, so that drop is credits expiring.
function recordBalance(ledger, usage) {
  const entry = ledger[usage.accountId] || { lastBalance: null, lastOverLimit: false, months: {} };
  const balance = usage.credits?.balance ?? null;
  const overLimit = CGUT.isOverLimit(usage);
  let spent = 0;

  if (balance !== null && entry.lastBalance !== null && balance < entry.lastBalance && (overLimit || entry.lastOverLimit)) {
    spent = round(entry.lastBalance - balance);
    const month = CGUT.monthKey(new Date(usage.fetchedAt));
    entry.months[month] = round((entry.months[month] || 0) + spent);
    const keep = Object.keys(entry.months).sort().slice(-LEDGER_MONTHS_KEPT);
    entry.months = Object.fromEntries(keep.map((key) => [key, entry.months[key]]));
  }
  if (balance !== null) entry.lastBalance = balance;
  entry.lastOverLimit = overLimit;

  ledger[usage.accountId] = entry;
  return spent;
}

async function storeUsage(fetched) {
  const usage = CGUT.normalizeUsage(fetched.raw, fetched.fetchedAt, fetched.accountId);
  const { usage: previous, creditLedger = {} } = await chrome.storage.local.get(['usage', 'creditLedger']);

  // Tabs can finish fetches out of order; an older answer must not replace a newer one.
  if (previous && previous.accountId === usage.accountId && previous.fetchedAt >= usage.fetchedAt) return;

  const spent = recordBalance(creditLedger, usage);
  await chrome.storage.local.set({ usage, usageError: null, creditLedger });
  await appendLog(describeUsage(usage, spent));
}

async function storeError(error) {
  await chrome.storage.local.set({ usageError: error });
  await appendLog(`Update failed: ${error.message}`);
}

// Prefers an open chatgpt.com tab, which fetches exactly as the page itself would. With none
// open, the worker tries directly with the browser's chatgpt.com cookies.
async function refreshNow() {
  const tabs = await chrome.tabs.query({ url: `${CGUT.ORIGIN}/*` });
  tabs.sort((a, b) => Number(b.active) - Number(a.active) || (b.lastAccessed || 0) - (a.lastAccessed || 0));

  for (const tab of tabs) {
    try {
      const result = await chrome.tabs.sendMessage(tab.id, { type: 'cgut:refresh' });
      if (result) return { ...result, via: 'tab' };
    } catch {
      // No content script there (the tab predates the install, or was discarded).
    }
  }

  try {
    const fetched = await CGUT.fetchUsage();
    await serialized(() => storeUsage(fetched));
    return { ok: true, via: 'background' };
  } catch (e) {
    const error = CGUT.errorRecord(e);
    await serialized(() => storeError(error));
    return { ok: false, error: error.message, via: 'background' };
  }
}

const handlers = {
  'cgut:store': (message) => serialized(() => storeUsage(message.fetched)),
  'cgut:error': (message) => serialized(() => storeError(message.error)),
  'cgut:log': (message) => log(message.message),
  'cgut:refresh': () => refreshNow(),
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handler = handlers[message?.type];
  if (!handler) return false;
  handler(message).then(
    (result) => sendResponse(result ?? { ok: true }),
    (e) => sendResponse({ ok: false, error: e.message }),
  );
  return true;
});

chrome.runtime.onInstalled.addListener(({ reason }) => {
  log(`Extension ${reason} (v${chrome.runtime.getManifest().version})`);
});
