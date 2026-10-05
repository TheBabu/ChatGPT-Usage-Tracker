// The popup's "Usage bar in the message box" option, end to end, with the extension in a real
// Chromium. chatgpt.com is a stand-in here: a page with a composer shaped like ChatGPT's, and the
// session and usage endpoints answered with made-up data, since a test can't sign in. So this checks
// the option and the bar, not that the bar still finds ChatGPT's real composer. Screenshots of the
// popup land in test-results/.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, copyExtension, launchChrome, sleep } from './chrome.mjs';

const { version } = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));

// A rounded, painted box around the input, laid out as a grid like ChatGPT's, in Work mode (read
// from the placeholder), with a sidebar for the Usage section.
const PAGE = `<!doctype html>
<html><head><style>
  body { display: flex; margin: 0; font-family: sans-serif; }
  nav { width: 260px; }
  main { flex: 1; padding: 200px 40px; }
  .box { display: grid; border-radius: 28px; background: #f3f3f3; }
  textarea { border: 0; padding: 16px 20px; background: none; }
</style></head><body>
  <nav aria-label="Chat history"></nav>
  <main><form data-type="unified-composer"><div class="box">
    <textarea id="prompt-textarea" placeholder="Work on anything"></textarea>
    <div><button type="button">Send</button></div>
  </div></form></main>
</body></html>`;

const HOUR = 3600;
const ROUTES = {
  '/': { type: 'text/html', body: PAGE },
  '/api/auth/session': { type: 'application/json', body: JSON.stringify({ accessToken: 'test-token' }) },
  '/backend-api/wham/usage': {
    type: 'application/json',
    body: JSON.stringify({
      plan_type: 'plus',
      rate_limit: {
        primary_window: { used_percent: 37, limit_window_seconds: 5 * HOUR, reset_after_seconds: 3 * HOUR },
        secondary_window: { used_percent: 12, limit_window_seconds: 7 * 24 * HOUR, reset_after_seconds: 80 * HOUR },
      },
    }),
  },
};

// Open means on show and not on its way closed; closed means hidden once it has finished closing.
const BAR_STATE = `(() => {
  const bar = document.getElementById('cgut-bar');
  if (!bar?.isConnected) return 'missing';
  if (bar.hidden) return 'closed';
  return bar.classList.contains('cgut-bar-closed') ? 'closing' : 'open';
})()`;

async function waitForBar(chrome, tab, want) {
  let state;
  for (let i = 0; i < 50; i++) {
    state = await chrome.evaluate(tab, BAR_STATE).catch(() => null);
    if (state === want) return state;
    await sleep(100);
  }
  return state;
}

test('the bar in the message box can be turned off from the popup', async (t) => {
  const chrome = await launchChrome();
  t.after(() => chrome.quit());
  await chrome.openWindow();
  await chrome.serveChatGPT(ROUTES);
  const id = await chrome.loadUnpacked(copyExtension(version));
  await sleep(1000);

  const tab = await chrome.openSite('https://chatgpt.com/');
  assert.equal(await waitForBar(chrome, tab, 'open'), 'open', 'the bar opens in Work mode');
  assert.equal(await chrome.evaluate(tab, `!!document.getElementById('cgut-sidebar')?.isConnected`), true);

  const popup = await chrome.open(`chrome-extension://${id}/popup/popup.html`);
  assert.equal(await chrome.evaluate(popup, `document.getElementById('show-bar').checked`), true, 'on by default');

  const out = join(ROOT, 'test-results');
  mkdirSync(out, { recursive: true });
  for (const colorScheme of ['light', 'dark']) {
    writeFileSync(join(out, `popup-${colorScheme}.png`), await chrome.screenshot(popup, { width: 332, height: 300, colorScheme }));
  }

  await chrome.evaluate(popup, `document.getElementById('show-bar').click()`);
  assert.equal(await waitForBar(chrome, tab, 'closed'), 'closed', 'turning it off closes the bar in open tabs');
  assert.equal(await chrome.evaluate(tab, `!!document.getElementById('cgut-sidebar')?.isConnected`), true, 'the sidebar section stays');

  const send = await chrome.session(tab);
  await send('Page.reload');
  await sleep(2000);
  assert.notEqual(await chrome.evaluate(tab, BAR_STATE), 'open', 'and keeps it closed after a reload');

  const popup2 = await chrome.open(`chrome-extension://${id}/popup/popup.html`);
  assert.equal(await chrome.evaluate(popup2, `document.getElementById('show-bar').checked`), false, 'the setting is remembered');
  await chrome.evaluate(popup2, `document.getElementById('show-bar').click()`);
  assert.equal(await waitForBar(chrome, tab, 'open'), 'open', 'turning it back on opens the bar again');
});
