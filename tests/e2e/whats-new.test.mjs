// The What's new page, end to end, with the extension in a real Chromium: when an update opens it,
// what it shows, and the popup link. Screenshots of the page land in test-results/.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, copyExtension, launchChrome, setVersion, sleep } from './chrome.mjs';

const isWhatsNew = (page) => page.url.includes('/whats-new/whats-new.html');

// Loads `version` from `dir` (an update when the version changed) and returns the What's new tabs
// that opened because of it.
async function update(chrome, dir, version) {
  const before = new Set((await chrome.pages()).filter(isWhatsNew).map((p) => p.targetId));
  setVersion(dir, version);
  await chrome.loadUnpacked(dir);
  await sleep(2000);
  return (await chrome.pages()).filter((p) => isWhatsNew(p) && !before.has(p.targetId));
}

async function newWhatsNewTabs(chrome, action) {
  const before = new Set((await chrome.pages()).filter(isWhatsNew).map((p) => p.targetId));
  await action();
  await sleep(800);
  return (await chrome.pages()).filter((p) => isWhatsNew(p) && !before.has(p.targetId));
}

test('when an update opens the page', async (t) => {
  const chrome = await launchChrome();
  t.after(() => chrome.quit());
  await chrome.openWindow();
  const dir = copyExtension('0.1.0');
  const id = await chrome.loadUnpacked(dir);
  await sleep(1500);
  assert.equal((await chrome.pages()).filter(isWhatsNew).length, 0, 'a fresh install opens nothing');

  const [opened, ...extra] = await update(chrome, dir, '0.1.1');
  assert.equal(extra.length, 0);
  assert.ok(opened?.url.endsWith('whats-new.html?from=0.1.0'), 'an update opens the page, saying what it updated from');
  await chrome.ready(opened.targetId);
  const tab = await chrome.evaluate(opened.targetId, 'chrome.tabs.getCurrent().then((tab) => tab.active)');
  assert.equal(tab, false, 'in a tab behind the current one');

  assert.deepEqual(await update(chrome, dir, '0.1.1'), [], 'reloading the same version opens nothing');

  const popup = await chrome.open(`chrome-extension://${id}/popup/popup.html`);
  assert.equal(await chrome.evaluate(popup, `document.getElementById('whats-new').textContent`), "What's new in 0.1.1");
  const [fromPopup] = await newWhatsNewTabs(chrome, () => chrome.evaluate(popup, `document.getElementById('whats-new').click()`));
  assert.equal(fromPopup?.url, `chrome-extension://${id}/whats-new/whats-new.html`, 'the popup links to the page');

  const page = await chrome.ready(fromPopup.targetId);
  assert.equal(await chrome.evaluate(page, `document.getElementById('updated-from').hidden`), true, 'no "Updated from" line when opened by hand');
  await chrome.evaluate(page, `document.getElementById('on-update').click()`);
  await sleep(300);
  assert.deepEqual(await update(chrome, dir, '0.2.0'), [], 'turned off, an update opens nothing');

  const page2 = await chrome.open(`chrome-extension://${id}/whats-new/whats-new.html`);
  assert.equal(await chrome.evaluate(page2, `document.getElementById('on-update').checked`), false, 'the setting is remembered');
  await chrome.evaluate(page2, `document.getElementById('on-update').click()`);
  await sleep(300);
  assert.deepEqual(await update(chrome, dir, '0.2.0.1'), [], 'a version without release notes updates quietly');
});

test('what the page shows after skipping a version', async (t) => {
  const chrome = await launchChrome();
  t.after(() => chrome.quit());
  await chrome.openWindow();
  const dir = copyExtension('0.1.0');
  await chrome.loadUnpacked(dir);
  await sleep(1500);
  const [opened] = await update(chrome, dir, '0.2.0');
  assert.ok(opened, 'the update opens the page');
  const page = await chrome.ready(opened.targetId);
  const shown = await chrome.evaluate(page, `({
    updatedFrom: document.getElementById('updated-from').textContent,
    latest: document.querySelector('.entry-latest .entry-version')?.textContent,
    earlier: [...document.querySelectorAll('.entry-earlier')].map((e) =>
      e.querySelector('.entry-version').textContent + (e.querySelector('.entry-new') ? ' [New]' : '')),
  })`);
  assert.deepEqual(shown, {
    updatedFrom: 'Updated from version 0.1.0 to 0.2.0.',
    latest: 'Version 0.2.0',
    earlier: ['Version 0.1.1 [New]', 'Version 0.1.0'],
  });

  const out = join(ROOT, 'test-results');
  mkdirSync(out, { recursive: true });
  for (const colorScheme of ['light', 'dark']) {
    writeFileSync(join(out, `whats-new-${colorScheme}.png`), await chrome.screenshot(page, { width: 1100, height: 1150, colorScheme }));
  }
});

test('an update while no window is open shows the page in the next window', async (t) => {
  const chrome = await launchChrome();
  t.after(() => chrome.quit());
  const dir = copyExtension('0.1.0');
  await chrome.loadUnpacked(dir);
  await sleep(1500);
  assert.deepEqual(await update(chrome, dir, '0.2.0'), [], 'nowhere to open it yet');
  const [later] = await newWhatsNewTabs(chrome, async () => { await chrome.openWindow(); await sleep(700); });
  assert.ok(later?.url.endsWith('whats-new.html?from=0.1.0'), 'it opens in the next window');
});
