// scripts/release-notes.mjs: the GitHub release notes, written from shared/changelog.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseNotes, entriesFor } from '../../scripts/release-notes.mjs';

const CGUT = globalThis.CGUT;

test('one version reads as its changes, under its headline when it has one', () => {
  assert.equal(releaseNotes([{ version: '1.0.1', changes: ['A fix.', 'Another fix.'] }]), '- A fix.\n- Another fix.');
  assert.equal(
    releaseNotes([{ version: '1.1.0', title: 'Big news', changes: ['A feature.'] }]),
    '### Big news\n\n- A feature.',
  );
});

test('several versions each get a heading, newest first', () => {
  assert.equal(
    releaseNotes([
      { version: '1.1.0', title: 'Big news', changes: ['A feature.'] },
      { version: '1.0.1', changes: ['A fix.'] },
    ]),
    '### Version 1.1.0: Big news\n\n- A feature.\n\n### Version 1.0.1\n\n- A fix.',
  );
});

test('a version without notes has none', () => {
  assert.equal(releaseNotes([]), '');
  assert.deepEqual(entriesFor('0.0.0.1'), []);
});

test('the entries come from the changelog: this version alone, or everything since the last release', () => {
  const [newest, next, ...rest] = CGUT.releasedChangelog('999999');
  assert.ok(next, 'needs at least two entries');
  assert.deepEqual(entriesFor(newest.version), [newest]);
  assert.deepEqual(entriesFor(newest.version, next.version), [newest]);
  if (rest.length) assert.deepEqual(entriesFor(newest.version, rest[0].version), [newest, next]);
});
