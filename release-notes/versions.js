// Version numbers, and which of the release notes in changelog.json a version shows. Loaded by the
// background worker (after shared/usage.js), the Release Notes page and scripts/release-notes.mjs,
// which each read changelog.json themselves and pass it in. See RELEASING.md for writing the notes.
'use strict';

(() => {
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

  // The entries for `version` and earlier, newest first. Entries for versions newer than the
  // installed one stay hidden until that version ships, so the next release's notes can be written
  // ahead of time.
  function releasedChangelog(changelog, version) {
    return changelog
      .filter((entry) => compareVersions(entry.version, version) <= 0)
      .sort((a, b) => compareVersions(b.version, a.version));
  }

  // The entries an update from `from` to `to` brings in.
  function changelogSince(changelog, from, to) {
    return releasedChangelog(changelog, to).filter((entry) => compareVersions(entry.version, from) > 0);
  }

  globalThis.CGUT = globalThis.CGUT || {};
  Object.assign(globalThis.CGUT, { compareVersions, releasedChangelog, changelogSince });
})();
