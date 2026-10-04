# Releasing

1. Bump `version` in `manifest.json` and commit.
2. Tag the commit and push the tag:
   ```sh
   git tag v0.2.0
   git push origin v0.2.0
   ```
3. The **Release** workflow builds `simple-tracker-for-chatgpt-v0.2.0.zip` and publishes it as a
   GitHub release. The tag has to match the manifest version or the workflow stops.
4. Upload that zip in the [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole).

To build the zip locally, run `node scripts/build.mjs` (Node 18 or newer). It lands in `dist/`.
