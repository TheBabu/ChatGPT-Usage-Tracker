# Releasing

1. Add an entry for the new version at the top of `release-notes/changelog.json`, written for
   users. After the update, the extension opens it in a Release notes tab (behind the current one),
   above the notes for earlier versions. A version without an entry updates quietly, which suits a
   small fix. Entries for versions newer than the manifest stay hidden, so notes can be written
   ahead.

   ```json
   {
     "version": "0.3.0",
     "date": "2026-10-05",
     "title": "An optional headline",
     "changes": [
       "One short, plain sentence per change, in sentence case."
     ]
   },
   ```

   It's JSON, so double quotes inside a change need a backslash (`\"`), and the last item in a
   list takes no comma. `npm run build` fails if the file doesn't parse.
2. Bump `version` in `manifest.json` and push it to `main`.
3. The **Release** workflow sees the new version, tags the commit (`v0.2.0`), builds
   `simple-tracker-for-chatgpt-v0.2.0.zip` and publishes it as a GitHub release. Its notes are the
   version's entry from `release-notes/changelog.json` (`node scripts/release-notes.mjs` previews
   them), with the commits since the last release folded away below; a version without an entry
   lists just the commits. A push that changes `manifest.json` but not the version publishes
   nothing.
4. Upload that zip in the [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole).

Each version is released once and never replaced, so ship a fix as a new version.

To build the zip locally, run `node scripts/build.mjs` (Node 18 or newer). It lands in `dist/`.
