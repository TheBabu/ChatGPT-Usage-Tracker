// The Release Notes page: the latest release's notes up top, earlier releases below. The background
// worker opens it after an update (with ?from=<previous version>), and the toolbar popup links to it.
// The notes come from changelog.json; depends on versions.js.
'use strict';

(() => {
  const CGUT = globalThis.CGUT;
  const $ = (id) => document.getElementById(id);
  const manifest = chrome.runtime.getManifest();
  const from = new URLSearchParams(location.search).get('from');
  // Earlier versions shown before the rest fold away, so the footer stays near the top however
  // many releases there are.
  const EARLIER_SHOWN = 3;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function formatDate(date) {
    return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  }

  // Version and date, an optional headline, then the changes. `isNew` marks a version the update
  // that opened the page brought in, for when it skipped some.
  function renderEntry(entry, { className, headingTag, isNew = false }) {
    const root = el('article', `entry ${className}`);
    const meta = el('p', 'entry-meta');
    meta.append(el('span', 'entry-version', `Version ${entry.version}`));
    if (entry.date) meta.append(el('span', 'entry-date', formatDate(entry.date)));
    if (isNew) meta.append(el('span', 'entry-new', 'New'));
    root.append(meta);
    if (entry.title) root.append(el(headingTag, 'entry-title', entry.title));
    const list = el('ul', 'entry-changes');
    for (const change of entry.changes) list.append(el('li', null, change));
    root.append(list);
    return root;
  }

  // The page is aria-busy until the notes are in, so screen readers know when it's done.
  async function render() {
    document.title = `Release Notes · ${manifest.name}`;
    $('product').textContent = manifest.name;

    if (from && CGUT.compareVersions(from, manifest.version) < 0) {
      $('updated-from').hidden = false;
      $('updated-from').textContent = `Updated from version ${from} to ${manifest.version}.`;
    }

    const changelog = await (await fetch('changelog.json')).json();
    const [latest, ...earlier] = CGUT.releasedChangelog(changelog, manifest.version);
    if (!latest) {
      $('latest').append(el('p', 'entry-empty', 'No release notes yet.'));
      return;
    }
    $('latest').append(renderEntry(latest, { className: 'entry-latest', headingTag: 'h2' }));

    // Versions the update brought in are never folded away, even when it skipped several. They are
    // the newest ones, so they come first.
    const isNew = (entry) => !!from && CGUT.compareVersions(entry.version, from) > 0;
    const shown = Math.max(EARLIER_SHOWN, earlier.filter(isNew).length);
    const older = earlier.slice(shown);
    $('earlier').hidden = !earlier.length;
    for (const entry of earlier.slice(0, shown)) {
      $('earlier-list').append(renderEntry(entry, { className: 'entry-earlier', headingTag: 'h3', isNew: isNew(entry) }));
    }
    $('older').hidden = !older.length;
    $('older-summary').textContent = `Show ${older.length} older ${older.length === 1 ? 'version' : 'versions'}`;
    for (const entry of older) {
      $('older-list').append(renderEntry(entry, { className: 'entry-earlier', headingTag: 'h3' }));
    }
  }

  const toggle = $('on-update');
  chrome.storage.local.get('releaseNotesOnUpdate').then(({ releaseNotesOnUpdate }) => {
    toggle.checked = releaseNotesOnUpdate !== false;
  });
  toggle.addEventListener('change', () => chrome.storage.local.set({ releaseNotesOnUpdate: toggle.checked }));

  render().finally(() => $('page').removeAttribute('aria-busy'));
})();
