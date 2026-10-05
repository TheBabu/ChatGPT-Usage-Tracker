// Prints the GitHub release notes for the version in manifest.json, in Markdown, from the entries in
// shared/changelog.js: the same notes users see on the Release notes page. Prints nothing when the
// version has no entry, so the workflow can fall back to listing commits. See RELEASING.md.
//
// Usage: node scripts/release-notes.mjs [previous version]
// With a previous version, the entries since it (an update can skip versions); without, only the
// entry for this one.

import { readFileSync } from 'node:fs';
import '../shared/changelog.js';

const CGUT = globalThis.CGUT;
const { version } = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
const previous = process.argv[2]?.replace(/^v/, '');

const entries = previous
  ? CGUT.changelogSince(previous, version)
  : CGUT.releasedChangelog(version).filter((entry) => CGUT.compareVersions(entry.version, version) === 0);

// One entry reads as its headline and its changes. With several, each gets a heading of its own.
const several = entries.length > 1;
const notes = entries.map((entry) => {
  const heading = several ? `Version ${entry.version}${entry.title ? `: ${entry.title}` : ''}` : entry.title;
  const changes = entry.changes.map((change) => `- ${change}`).join('\n');
  return heading ? `### ${heading}\n\n${changes}` : changes;
}).join('\n\n');

if (notes) console.log(notes);
