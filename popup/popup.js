// The toolbar popup: the same usage rows as the sidebar, a refresh button, and a debug panel.
'use strict';

(() => {
  const CGUT = globalThis.CGUT;
  const { ui } = CGUT;
  const $ = (id) => document.getElementById(id);

  const STALE_ON_OPEN_MS = 60 * 1000;
  const KEYS = ['usage', 'usageError', 'creditLedger', 'debugLog'];

  const panel = new ui.UsagePanel();
  $('panel').append(panel.root);
  ui.installTooltips();

  let stored = {};

  function render() {
    const now = Date.now();
    const usage = stored.usage || null;
    panel.render({ usage, error: stored.usageError || null, ledger: stored.creditLedger || {} }, now);

    const plan = CGUT.planLabel(usage?.planType);
    $('plan').hidden = !plan;
    $('plan').textContent = plan || '';
    $('updated').textContent = usage ? `Updated ${CGUT.formatAgo(usage.fetchedAt, now)}` : '';

    if ($('debug').open) renderDebug();
  }

  function windowForDebug(win) {
    return win && { pct: win.pct, windowSec: win.windowSec, resetsAt: win.resetsAt && new Date(win.resetsAt).toLocaleString() };
  }

  function debugStatus() {
    const usage = stored.usage;
    const error = stored.usageError;
    return {
      version: chrome.runtime.getManifest().version,
      account: usage ? `${usage.accountId.slice(0, 8)}…` : null,
      plan: usage?.planType ?? null,
      fetchedAt: usage ? new Date(usage.fetchedAt).toLocaleString() : null,
      session: windowForDebug(usage?.session),
      weekly: windowForDebug(usage?.weekly),
      limitReached: usage?.limitReached ?? null,
      credits: usage?.credits ?? null,
      creditLedger: usage ? stored.creditLedger?.[usage.accountId] ?? null : null,
      lastError: error ? `${error.message} (${new Date(error.at).toLocaleString()})` : null,
    };
  }

  function debugLogText() {
    const lines = (stored.debugLog || []).slice().reverse()
      .map((entry) => `${new Date(entry.t).toLocaleTimeString()}  ${entry.message}`);
    return lines.join('\n') || '(empty)';
  }

  function renderDebug() {
    $('debug-status').textContent = JSON.stringify(debugStatus(), null, 2);
    $('debug-log').textContent = debugLogText();
    $('debug-raw').textContent = stored.usage?.raw ? JSON.stringify(stored.usage.raw, null, 2) : '(none yet)';
  }

  async function refresh() {
    const button = $('refresh');
    button.disabled = true;
    button.classList.add('spinning');
    try {
      await chrome.runtime.sendMessage({ type: 'cgut:refresh' });
    } finally {
      button.disabled = false;
      button.classList.remove('spinning');
    }
  }

  async function copyDebug() {
    const text = [
      JSON.stringify(debugStatus(), null, 2),
      debugLogText(),
      stored.usage?.raw ? JSON.stringify(stored.usage.raw, null, 2) : '',
    ].join('\n\n');
    await navigator.clipboard.writeText(text);
    $('copy-debug').textContent = 'Copied';
    setTimeout(() => { $('copy-debug').textContent = 'Copy'; }, 1500);
  }

  // Opens the What's new page in a tab (a plain link would open it inside the popup).
  $('whats-new').textContent = `What's new in ${chrome.runtime.getManifest().version}`;
  $('whats-new').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL('whats-new/whats-new.html') });
    window.close();
  });

  $('refresh').addEventListener('click', refresh);
  $('copy-debug').addEventListener('click', copyDebug);
  $('clear-log').addEventListener('click', () => chrome.storage.local.set({ debugLog: [] }));
  $('debug').addEventListener('toggle', render);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const key of KEYS) {
      if (changes[key]) stored[key] = changes[key].newValue;
    }
    render();
  });

  chrome.storage.local.get(KEYS).then((values) => {
    stored = values;
    render();
    setInterval(render, 1000);
    if (!stored.usage || Date.now() - stored.usage.fetchedAt > STALE_ON_OPEN_MS) refresh();
  });
})();
