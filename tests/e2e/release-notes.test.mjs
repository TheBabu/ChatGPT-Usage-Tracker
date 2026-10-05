// The Release notes page, end to end, with the extension in a real Chromium: when an update opens it,
// what it shows, and the popup link. Screenshots of the page land in test-results/.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, copyExtension, launchChrome, setVersion, sleep } from './chrome.mjs';

const isReleaseNotes = (page) => page.url.includes('/release-notes/release-notes.html');

// Loads `version` from `dir` (an update when the version changed) and returns the Release notes tabs
// that opened because of it.
async function update(chrome, dir, version) {
  const before = new Set((await chrome.pages()).filter(isReleaseNotes).map((p) => p.targetId));
  setVersion(dir, version);
  await chrome.loadUnpacked(dir);
  await sleep(2000);
  return (await chrome.pages()).filter((p) => isReleaseNotes(p) && !before.has(p.targetId));
}

async function newReleaseNotesTabs(chrome, action) {
  const before = new Set((await chrome.pages()).filter(isReleaseNotes).map((p) => p.targetId));
  await action();
  await sleep(800);
  return (await chrome.pages()).filter((p) => isReleaseNotes(p) && !before.has(p.targetId));
}

test('when an update opens the page', async (t) => {
  const chrome = await launchChrome();
  t.after(() => chrome.quit());
  await chrome.openWindow();
  const dir = copyExtension('0.1.0');
  const id = await chrome.loadUnpacked(dir);
  await sleep(1500);
  assert.equal((await chrome.pages()).filter(isReleaseNotes).length, 0, 'a fresh install opens nothing');

  const [opened, ...extra] = await update(chrome, dir, '0.1.1');
  assert.equal(extra.length, 0);
  assert.ok(opened?.url.endsWith('release-notes.html?from=0.1.0'), 'an update opens the page, saying what it updated from');
  await chrome.ready(opened.targetId);
  const tab = await chrome.evaluate(opened.targetId, 'chrome.tabs.getCurrent().then((tab) => tab.active)');
  assert.equal(tab, false, 'in a tab behind the current one');

  assert.deepEqual(await update(chrome, dir, '0.1.1'), [], 'reloading the same version opens nothing');

  const popup = await chrome.open(`chrome-extension://${id}/popup/popup.html`);
  assert.equal(await chrome.evaluate(popup, `document.getElementById('release-notes').textContent.trim()`), 'Release notes');
  const [fromPopup] = await newReleaseNotesTabs(chrome, () => chrome.evaluate(popup, `document.getElementById('release-notes').click()`));
  assert.equal(fromPopup?.url, `chrome-extension://${id}/release-notes/release-notes.html`, 'the popup links to the page');

  const page = await chrome.ready(fromPopup.targetId);
  assert.equal(await chrome.evaluate(page, `document.getElementById('updated-from').hidden`), true, 'no "Updated from" line when opened by hand');
  await chrome.evaluate(page, `document.getElementById('on-update').click()`);
  await sleep(300);
  assert.deepEqual(await update(chrome, dir, '0.2.0'), [], 'turned off, an update opens nothing');

  const page2 = await chrome.open(`chrome-extension://${id}/release-notes/release-notes.html`);
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
    writeFileSync(join(out, `release-notes-${colorScheme}.png`), await chrome.screenshot(page, { width: 1100, height: 1150, colorScheme }));
  }
});

test('an update while no window is open shows the page in the next window', async (t) => {
  const chrome = await launchChrome();
  t.after(() => chrome.quit());
  const dir = copyExtension('0.1.0');
  await chrome.loadUnpacked(dir);
  await sleep(1500);
  assert.deepEqual(await update(chrome, dir, '0.2.0'), [], 'nowhere to open it yet');
  const [later] = await newReleaseNotesTabs(chrome, async () => { await chrome.openWindow(); await sleep(700); });
  assert.ok(later?.url.endsWith('release-notes.html?from=0.1.0'), 'it opens in the next window');
});

test('older versions fold away so the footer stays close', async (t) => {
  const chrome = await launchChrome();
  t.after(() => chrome.quit());
  await chrome.openWindow();
  // A copy at 9.9.0 with made-up releases 9.3.0 to 9.9.0 ahead of the real ones, far enough ahead
  // that a real release can't share a version with them.
  const dir = copyExtension('9.9.0');
  const file = join(dir, 'release-notes', 'changelog.json');
  const fake = [9, 8, 7, 6, 5, 4, 3].map((minor) => ({ version: `9.${minor}.0`, date: `2026-11-0${minor}`, changes: [`Change in 9.${minor}.0.`] }));
  const real = JSON.parse(readFileSync(file, 'utf8'));
  const realCount = real.length; // all older than 9.3.0, so all shown at 9.9.0
  writeFileSync(file, JSON.stringify([...fake, ...real]));
  const older = (n) => `Show ${n} older versions`;
  const id = await chrome.loadUnpacked(dir);
  await sleep(1500);

  const read = (page) => chrome.evaluate(page, `({
    shown: [...document.querySelectorAll('#earlier-list .entry-version')].map((e) => e.textContent),
    folded: document.getElementById('older').hidden ? null : document.getElementById('older-summary').textContent,
    foldedCount: document.querySelectorAll('#older-list .entry').length,
  })`);

  const byHand = await chrome.open(`chrome-extension://${id}/release-notes/release-notes.html`);
  assert.deepEqual(await read(byHand), {
    shown: ['Version 9.8.0', 'Version 9.7.0', 'Version 9.6.0'],
    folded: older(3 + realCount), // 9.5.0, 9.4.0, 9.3.0 and the real releases
    foldedCount: 3 + realCount,
  }, 'three earlier versions, the rest folded');

  // An update from 9.4.0 brought in 9.5.0 to 9.9.0; all of them stay in view.
  const updated = await chrome.open(`chrome-extension://${id}/release-notes/release-notes.html?from=9.4.0`);
  assert.deepEqual(await read(updated), {
    shown: ['Version 9.8.0', 'Version 9.7.0', 'Version 9.6.0', 'Version 9.5.0'],
    folded: older(2 + realCount), // 9.4.0, 9.3.0 and the real releases
    foldedCount: 2 + realCount,
  }, 'versions the update brought in are never folded');
});
