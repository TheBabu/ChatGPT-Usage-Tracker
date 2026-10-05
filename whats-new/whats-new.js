// The What's new page: the latest release's notes up top, earlier releases below. The background
// worker opens it after an update (with ?from=<previous version>), and the toolbar popup links to it.
// Depends on shared/changelog.js.
'use strict';

(() => {
  const CGUT = globalThis.CGUT;
  const $ = (id) => document.getElementById(id);
  const manifest = chrome.runtime.getManifest();
  const from = new URLSearchParams(location.search).get('from');

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

  function render() {
    document.title = `What's new · ${manifest.name}`;
    $('product').textContent = manifest.name;

    if (from && CGUT.compareVersions(from, manifest.version) < 0) {
      $('updated-from').hidden = false;
      $('updated-from').textContent = `Updated from version ${from} to ${manifest.version}.`;
    }

    const [latest, ...earlier] = CGUT.releasedChangelog(manifest.version);
    if (!latest) {
      $('latest').append(el('p', 'entry-empty', 'No release notes yet.'));
      return;
    }
    $('latest').append(renderEntry(latest, { className: 'entry-latest', headingTag: 'h2' }));

    $('earlier').hidden = !earlier.length;
    for (const entry of earlier) {
      const isNew = !!from && CGUT.compareVersions(entry.version, from) > 0;
      $('earlier-list').append(renderEntry(entry, { className: 'entry-earlier', headingTag: 'h3', isNew }));
    }
  }

  const toggle = $('on-update');
  chrome.storage.local.get('whatsNewOnUpdate').then(({ whatsNewOnUpdate }) => {
    toggle.checked = whatsNewOnUpdate !== false;
  });
  toggle.addEventListener('change', () => chrome.storage.local.set({ whatsNewOnUpdate: toggle.checked }));

  render();
})();
