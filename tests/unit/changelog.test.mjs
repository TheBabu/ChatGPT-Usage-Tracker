// shared/changelog.js: the release notes behind the Release notes page, and when an update shows them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../../shared/changelog.js';

const CGUT = globalThis.CGUT;
const manifest = JSON.parse(readFileSync(new URL('../../manifest.json', import.meta.url), 'utf8'));
const everything = CGUT.releasedChangelog('999999');

test('versions compare number by number', () => {
  assert.equal(CGUT.compareVersions('0.10.0', '0.9.1'), 1);
  assert.equal(CGUT.compareVersions('0.1', '0.1.0'), 0);
  assert.equal(CGUT.compareVersions('1.2.3', '1.2.4'), -1);
});

test('every entry is well formed', () => {
  const seen = new Set();
  for (const entry of everything) {
    assert.match(entry.version, /^\d+(\.\d+){0,3}$/, `version ${entry.version}`);
    assert.ok(!seen.has(entry.version), `${entry.version} appears twice`);
    seen.add(entry.version);
    assert.match(entry.date, /^\d{4}-\d{2}-\d{2}$/, `${entry.version} date`);
    assert.ok(!Number.isNaN(Date.parse(entry.date)), `${entry.version} date is a real date`);
    if (entry.title !== undefined) assert.ok(typeof entry.title === 'string' && entry.title.trim(), `${entry.version} title`);
    assert.ok(Array.isArray(entry.changes) && entry.changes.length, `${entry.version} has changes`);
    for (const change of entry.changes) assert.ok(typeof change === 'string' && change.trim(), `${entry.version} change text`);
  }
});

test('entries are written newest first', () => {
  const source = readFileSync(new URL('../../shared/changelog.js', import.meta.url), 'utf8');
  const order = [...source.matchAll(/version: '([^']+)'/g)].map((m) => m[1]);
  const sorted = [...order].sort((a, b) => CGUT.compareVersions(b, a));
  assert.deepEqual(order, sorted);
});

test('versions newer than the installed one stay hidden', () => {
  const shown = CGUT.releasedChangelog(manifest.version);
  assert.ok(shown.every((entry) => CGUT.compareVersions(entry.version, manifest.version) <= 0));
  assert.deepEqual(shown.map((e) => e.version), [...shown.map((e) => e.version)].sort((a, b) => CGUT.compareVersions(b, a)));
});

test('an update brings in the entries after the old version, up to the new one', () => {
  const [newest, ...older] = everything;
  assert.ok(older.length, 'needs at least two entries');
  const oldest = older[older.length - 1].version;
  const since = CGUT.changelogSince(oldest, newest.version).map((e) => e.version);
  assert.equal(since[0], newest.version);
  assert.ok(!since.includes(oldest));
  assert.deepEqual(CGUT.changelogSince(newest.version, newest.version), []);
});
