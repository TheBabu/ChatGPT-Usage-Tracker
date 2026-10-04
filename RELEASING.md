# Releasing

1. Bump `version` in `manifest.json` and commit it to `main`.
2. Start the **Release** workflow, either way:
   - **Run it:** on the Actions tab, pick **Release**, click **Run workflow** and choose `main`.
     It tags the commit with the manifest version (`v0.2.0`) itself, and stops if that version
     has already been released.
   - **Push a tag:**
     ```sh
     git tag v0.2.0
     git push origin v0.2.0
     ```
     The tag has to match the manifest version or the workflow stops.
3. The workflow builds `simple-tracker-for-chatgpt-v0.2.0.zip` and publishes it as a GitHub
   release, with notes generated from the pull requests merged since the last release.
4. Upload that zip in the [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole).

To build the zip locally, run `node scripts/build.mjs` (Node 18 or newer). It lands in `dist/`.
