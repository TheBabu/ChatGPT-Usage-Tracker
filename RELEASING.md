# Releasing

1. Bump `version` in `manifest.json` and push it to `main`.
2. The **Release** workflow sees the new version, tags the commit (`v0.2.0`), builds
   `simple-tracker-for-chatgpt-v0.2.0.zip` and publishes it as a GitHub release. The notes list the
   commits since the last release. A push that changes `manifest.json` but not the version
   publishes nothing.
3. Upload that zip in the [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole).

Each version is released once and never replaced, so ship a fix as a new version.

To build the zip locally, run `node scripts/build.mjs` (Node 18 or newer). It lands in `dist/`.
