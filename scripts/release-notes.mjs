// Prints the GitHub release notes for the version in manifest.json, in Markdown, from the entries in
// shared/changelog.js: the same notes users see on the Release notes page. Prints nothing when the
// version has no entry, so the workflow can fall back to listing commits. See RELEASING.md.
//
// Usage: node scripts/release-notes.mjs [previous version]
// With a previous version, the entries since it (an update can skip versions); without, only the
// entry for this one.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import '../shared/changelog.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CGUT = globalThis.CGUT;

// One entry reads as its headline and its changes. With several, each gets a heading of its own.
export function releaseNotes(entries) {
  const several = entries.length > 1;
  return entries.map((entry) => {
    const heading = several ? `Version ${entry.version}${entry.title ? `: ${entry.title}` : ''}` : entry.title;
    const changes = entry.changes.map((change) => `- ${change}`).join('\n');
    return heading ? `### ${heading}\n\n${changes}` : changes;
  }).join('\n\n');
}

export function entriesFor(version, previous) {
  if (previous) return CGUT.changelogSince(previous, version);
  return CGUT.releasedChangelog(version).filter((entry) => CGUT.compareVersions(entry.version, version) === 0);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { version } = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
  const notes = releaseNotes(entriesFor(version, process.argv[2]?.replace(/^v/, '')));
  if (notes) console.log(notes);
}
