// Drives a real Chromium with the extension in it, over Playwright's browser-level DevTools session.
// That session can call Extensions.loadUnpacked: loading the folder again after its version changed
// is a real update (onInstalled fires with reason "update"), the same as Reload on
// chrome://extensions or Chrome installing a store update.
import { chromium } from 'playwright';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PACKAGE = ['manifest.json', 'background.js', 'content', 'shared', 'popup', 'release-notes', 'icons'];

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A copy of the extension in a temporary folder, so its version can be changed.
export function copyExtension(version) {
  const dir = mkdtempSync(join(tmpdir(), 'cgut-ext-'));
  for (const name of PACKAGE) cpSync(join(ROOT, name), join(dir, name), { recursive: true });
  setVersion(dir, version);
  return dir;
}

export function setVersion(dir, version) {
  const file = join(dir, 'manifest.json');
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  manifest.version = version;
  writeFileSync(file, JSON.stringify(manifest, null, 2));
}

export async function launchChrome() {
  const browser = await chromium.launch({
    channel: 'chromium', // the full browser, which runs extensions headless
    headless: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging'],
  });
  const cdp = await browser.newBrowserCDPSession();
  await cdp.send('Target.setDiscoverTargets', { discover: true });

  // Pages are reached through non-flat sessions, since Playwright's session object can't address
  // flat child sessions.
  let lastId = 0;
  const waiting = new Map();
  cdp.on('Target.receivedMessageFromTarget', ({ message }) => {
    const reply = JSON.parse(message);
    waiting.get(reply.id)?.(reply);
    waiting.delete(reply.id);
  });
  const sessions = new Map();
  async function session(targetId) {
    if (!sessions.has(targetId)) {
      sessions.set(targetId, (await cdp.send('Target.attachToTarget', { targetId, flatten: false })).sessionId);
    }
    const sessionId = sessions.get(targetId);
    return (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++lastId;
      waiting.set(id, (reply) => (reply.error ? reject(new Error(`${method}: ${reply.error.message}`)) : resolve(reply.result)));
      cdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) }).catch(reject);
    });
  }

  async function evaluate(targetId, expression) {
    const send = await session(targetId);
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) {
      throw new Error(`${expression}: ${result.exceptionDetails.exception?.description || result.exceptionDetails.text}`);
    }
    return result.result.value;
  }

  // Waits until an extension page has loaded and can use the chrome.* APIs.
  async function ready(targetId) {
    for (let i = 0; i < 50; i++) {
      try {
        if (await evaluate(targetId, `document.readyState === 'complete' && !!globalThis.chrome?.runtime?.id`)) return targetId;
      } catch {
        // Not attached or not loaded yet.
      }
      await sleep(100);
    }
    throw new Error(`page ${targetId} never finished loading`);
  }

  // Answers every request to chatgpt.com from `routes` (path → { type, body }), and anything else
  // there with a 404, so the content script runs against a stand-in page without signing in.
  async function serveChatGPT(routes) {
    cdp.on('Fetch.requestPaused', ({ requestId, request }) => {
      const route = routes[new URL(request.url).pathname];
      const body = Buffer.from(route ? route.body : '').toString('base64');
      const headers = route ? [{ name: 'Content-Type', value: route.type }] : [];
      cdp.send('Fetch.fulfillRequest', { requestId, responseCode: route ? 200 : 404, responseHeaders: headers, body }).catch(() => {});
    });
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: 'https://chatgpt.com/*' }] });
  }

  return {
    session,
    evaluate,
    ready,
    serveChatGPT,
    loadUnpacked: async (dir) => (await cdp.send('Extensions.loadUnpacked', { path: dir })).id,
    pages: async () => (await cdp.send('Target.getTargets')).targetInfos.filter((t) => t.type === 'page'),
    open: async (url, options = {}) => ready((await cdp.send('Target.createTarget', { url, ...options })).targetId),
    // For a web page, which has no chrome.* APIs for `ready` to wait on.
    openSite: async (url) => (await cdp.send('Target.createTarget', { url })).targetId,
    openWindow: async () => (await cdp.send('Target.createTarget', { url: 'about:blank', newWindow: true })).targetId,
    close: async (targetId) => cdp.send('Target.closeTarget', { targetId }),
    screenshot: async (targetId, { width, height, colorScheme }) => {
      const send = await session(targetId);
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: colorScheme }] });
      await sleep(200);
      return Buffer.from((await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })).data, 'base64');
    },
    quit: () => browser.close(),
  };
}
