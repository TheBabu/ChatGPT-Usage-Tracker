// What changed in each version, as users see it on the Release notes page, newest first. Write an
// entry when you bump the version (see RELEASING.md): an update with an entry opens the page in a
// new tab, and one without updates quietly. Entries for versions newer than the manifest stay
// hidden until that version ships, so the next release's notes can be written ahead of time.
// Loaded by the background worker (after usage.js) and by the Release notes page.
'use strict';

(() => {
  const CHANGELOG = [
    {
      version: '0.2.1',
      date: '2026-10-05',
      changes: [
        "What's new is now called Release notes, since it lists every version.",
        'Older versions fold away behind "Show older versions", so the page stays short.',
        'In the toolbar popup, the Release notes link sits beside Debug.',
      ],
    },
    {
      version: '0.2.0',
      date: '2026-10-05',
      title: 'Smoother switching to Work, and release notes',
      changes: [
        'The usage bar no longer jitters when you switch from Chat to Work. It slides in at the bottom of the message box as soon as you switch.',
        'The bar no longer flickers in and out after you reload ChatGPT. It appears once the message box has finished loading.',
        'Switching back to Chat closes the bar smoothly instead of the box jumping.',
        "The bar sits below the message box's buttons again, not above the text field.",
        "This page: after an update, a tab shows what changed. You can turn that off at the bottom of the page, and open it any time from the extension's toolbar popup.",
      ],
    },
    {
      version: '0.1.1',
      date: '2026-10-04',
      changes: [
        'The usage bar no longer shows up under the message box for a moment when you switch to Work.',
        'A clearer refresh button in the toolbar popup.',
      ],
    },
    {
      version: '0.1.0',
      date: '2026-10-04',
      title: 'First release',
      changes: [
        'A usage bar in the message box while you are in Work mode: your 5-hour usage, an arrow marking your weekly usage, and when the 5-hour limit resets.',
        'A Usage section in the sidebar, which you can collapse.',
        'Your credit balance, and how many credits a message used when it was paid for with credits.',
        'Usage updates on its own as you chat.',
      ],
    },
  ];

  // Compares dot-separated version numbers ("0.10.0" is after "0.9.1"): negative, 0 or positive.
  function compareVersions(a, b) {
    const pa = String(a).split('.').map(Number);
    const pb = String(b).split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const diff = (pa[i] || 0) - (pb[i] || 0);
      if (diff) return Math.sign(diff);
    }
    return 0;
  }

  // The entries for `version` and earlier, newest first.
  function releasedChangelog(version) {
    return CHANGELOG
      .filter((entry) => compareVersions(entry.version, version) <= 0)
      .sort((a, b) => compareVersions(b.version, a.version));
  }

  // The entries an update from `from` to `to` brings in.
  function changelogSince(from, to) {
    return releasedChangelog(to).filter((entry) => compareVersions(entry.version, from) > 0);
  }

  globalThis.CGUT = globalThis.CGUT || {};
  Object.assign(globalThis.CGUT, { compareVersions, releasedChangelog, changelogSince });
})();
