// Shared by the background worker, the content script and the popup. Everything hangs off one
// global so the same file works as a content script, an importScripts() target and a <script>.
'use strict';

(() => {
  const ORIGIN = 'https://chatgpt.com';
  const USAGE_PATH = '/backend-api/wham/usage';
  const SESSION_PATH = '/api/auth/session';

  const HOUR = 3600;
  const DAY = 24 * HOUR;

  const WARN_PCT = 90;

  // ---------- Fetching ----------

  class UsageError extends Error {
    constructor(message, code, status = null) {
      super(message);
      this.code = code; // 'signed-out' | 'http' | 'network' | 'parse'
      this.status = status;
    }
  }

  // The plain-object form errors are stored and messaged in.
  function errorRecord(e) {
    return { at: Date.now(), message: e?.message || String(e), code: e?.code || 'unknown', status: e?.status ?? null };
  }

  let cachedAuth = null; // { token, accountId, hint, expiresAt }
  const AUTH_TTL_MS = 5 * 60 * 1000;

  function decodeJwtPayload(token) {
    try {
      const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), '=')));
    } catch {
      return null;
    }
  }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // The workspace the user picked in the UI wins over the one baked into the session, since a
  // team member's session can carry their personal account while they are looking at the team.
  function resolveAccountId(session, token, accountHint) {
    if (accountHint && UUID_RE.test(accountHint)) return accountHint;
    const fromSession = session?.account?.id;
    if (fromSession && UUID_RE.test(fromSession)) return fromSession;
    const claims = decodeJwtPayload(token)?.['https://api.openai.com/auth'];
    const fromJwt = claims?.chatgpt_account_id;
    if (fromJwt && UUID_RE.test(fromJwt)) return fromJwt;
    return null;
  }

  // Every chatgpt.com page embeds the signed-in session in a JSON script tag.
  function parseBootstrap(text) {
    if (!text) return null;
    try {
      return JSON.parse(text)?.session || null;
    } catch {
      return null;
    }
  }

  const BOOTSTRAP_RE = /<script[^>]*\bid="client-bootstrap"[^>]*>([\s\S]*?)<\/script>/;

  async function readBootstrapFromHtml(base) {
    const res = await fetch(base + '/', { credentials: 'include', cache: 'no-store' });
    if (!res.ok) return null;
    return parseBootstrap((await res.text()).match(BOOTSTRAP_RE)?.[1]);
  }

  // /api/auth/session is where the web app has long fetched its token; the page bootstrap is the
  // fallback in case that endpoint moves. `readBootstrap` lets the content script read the tag
  // straight out of the live page instead of downloading it again.
  async function loadSession(base, readBootstrap) {
    let networkError = null;
    try {
      const res = await fetch(base + SESSION_PATH, { credentials: 'include', cache: 'no-store' });
      if (res.ok) {
        const session = await res.json().catch(() => null);
        if (session?.accessToken) return session;
      }
    } catch (e) {
      networkError = e;
    }

    const fromPage = await (readBootstrap || (() => readBootstrapFromHtml(base)))().catch(() => null);
    if (fromPage?.accessToken) return fromPage;

    if (networkError) throw new UsageError(`Could not reach ChatGPT (${networkError.message})`, 'network');
    throw new UsageError('Not signed in to ChatGPT', 'signed-out');
  }

  async function getAuth(base, accountHint, readBootstrap) {
    if (cachedAuth && cachedAuth.expiresAt > Date.now() && cachedAuth.hint === accountHint) return cachedAuth;

    const session = await loadSession(base, readBootstrap);
    cachedAuth = {
      token: session.accessToken,
      accountId: resolveAccountId(session, session.accessToken, accountHint),
      hint: accountHint,
      expiresAt: Date.now() + AUTH_TTL_MS,
    };
    return cachedAuth;
  }

  // Returns { raw, accountId, fetchedAt }. `base` is the page origin from the content script, or
  // chatgpt.com from the background worker.
  async function fetchUsage({ base = ORIGIN, accountHint = null, readBootstrap = null } = {}) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const auth = await getAuth(base, accountHint, readBootstrap);
      const headers = { Accept: 'application/json', Authorization: `Bearer ${auth.token}` };
      if (auth.accountId) headers['ChatGPT-Account-Id'] = auth.accountId;

      let res;
      try {
        res = await fetch(base + USAGE_PATH, { credentials: 'include', cache: 'no-store', headers });
      } catch (e) {
        throw new UsageError(`Could not reach ChatGPT (${e.message})`, 'network');
      }

      // A stale token is the usual cause; drop it and go round once more with a fresh session.
      if ((res.status === 401 || res.status === 403) && attempt === 0) {
        cachedAuth = null;
        continue;
      }
      if (!res.ok) throw new UsageError(`Usage request failed (HTTP ${res.status})`, 'http', res.status);

      try {
        return { raw: await res.json(), accountId: auth.accountId, fetchedAt: Date.now() };
      } catch {
        throw new UsageError('Usage response was not JSON', 'parse');
      }
    }
    throw new UsageError('Usage request was rejected', 'http', 401);
  }

  // ---------- Normalizing ----------

  function toNumber(value) {
    const n = typeof value === 'string' ? parseFloat(value) : value;
    return typeof n === 'number' && Number.isFinite(n) ? n : null;
  }

  function normalizeWindow(w, fetchedAt) {
    if (!w || typeof w !== 'object') return null;
    const pct = toNumber(w.used_percent);
    if (pct === null) return null;

    const windowSec = toNumber(w.limit_window_seconds);
    const resetAt = toNumber(w.reset_at);
    const resetAfter = toNumber(w.reset_after_seconds);
    let resetsAt = null;
    if (resetAt !== null && resetAt > 0) resetsAt = resetAt > 1e12 ? resetAt : resetAt * 1000;
    else if (resetAfter !== null) resetsAt = fetchedAt + resetAfter * 1000;

    return { pct: Math.max(0, Math.min(100, pct)), windowSec, resetsAt };
  }

  // primary/secondary are normally 5h/weekly, but the order is not a contract (and for a few weeks
  // in 2026 the 5h window disappeared entirely), so classify by window length where we have it.
  function classifyWindows(primary, secondary) {
    if (primary && secondary) {
      if (primary.windowSec && secondary.windowSec && primary.windowSec > secondary.windowSec) {
        return { session: secondary, weekly: primary };
      }
      return { session: primary, weekly: secondary };
    }
    const only = primary || secondary;
    if (!only) return { session: null, weekly: null };
    const isLong = only.windowSec ? only.windowSec >= DAY : only === secondary;
    return isLong ? { session: null, weekly: only } : { session: only, weekly: null };
  }

  function normalizeUsage(raw, fetchedAt, accountId = null) {
    const rl = raw?.rate_limit || {};
    const { session, weekly } = classifyWindows(
      normalizeWindow(rl.primary_window, fetchedAt),
      normalizeWindow(rl.secondary_window, fetchedAt),
    );

    const c = raw?.credits;
    const credits = c && typeof c === 'object'
      ? { hasCredits: c.has_credits === true, unlimited: c.unlimited === true, balance: toNumber(c.balance) }
      : null;

    return {
      accountId: accountId || 'default',
      planType: typeof raw?.plan_type === 'string' ? raw.plan_type : null,
      fetchedAt,
      session,
      weekly,
      limitReached: rl.limit_reached === true || rl.allowed === false,
      credits,
      raw,
    };
  }

  // Credits are only drawn once an included limit is used up.
  function isOverLimit(usage) {
    return !!usage && (usage.limitReached || (usage.session?.pct ?? 0) >= 100 || (usage.weekly?.pct ?? 0) >= 100);
  }

  // Credits are worth a row only once the account has some (or is unlimited); a plan that has never
  // bought any reports a zero balance that would just be noise.
  function hasCreditsInfo(usage) {
    const c = usage?.credits;
    return !!c && (c.unlimited || c.hasCredits || (c.balance !== null && c.balance > 0));
  }

  // ---------- Formatting ----------

  function windowLabel(win, fallback) {
    const sec = win?.windowSec;
    if (!sec) return fallback;
    if (sec >= 6 * DAY) return 'Weekly';
    if (sec >= DAY) return `${Math.round(sec / DAY)}-day`;
    return `${Math.round(sec / HOUR)}-hour`;
  }

  function formatDuration(ms) {
    if (ms <= 0) return 'now';
    const totalMin = Math.floor(ms / 60000);
    if (totalMin < 1) return '<1m';
    const d = Math.floor(totalMin / (24 * 60));
    const h = Math.floor((totalMin % (24 * 60)) / 60);
    const m = totalMin % 60;
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  function formatAgo(ts, now = Date.now()) {
    if (!ts) return 'never';
    const sec = Math.max(0, Math.round((now - ts) / 1000));
    if (sec < 60) return `${sec}s ago`;
    return `${formatDuration(now - ts)} ago`;
  }

  function formatPct(pct) {
    return `${Math.round(pct)}%`;
  }

  // The popup's "Show usage" option: 'used' counts up as ChatGPT reports it, 'left' counts down
  // from 100. Anything else (the option was never set) is 'used'. Percentages stay as used
  // everywhere else, including the warning threshold; only what is drawn turns around.
  function shownPct(pct, display) {
    return display === 'left' ? 100 - pct : pct;
  }

  function usageWord(display) {
    return display === 'left' ? 'left' : 'used';
  }

  // "4% used" or "96% left".
  function formatUsage(pct, display) {
    return `${formatPct(shownPct(pct, display))} ${usageWord(display)}`;
  }

  // Small amounts keep an extra digit so a cheap message doesn't read as 0.
  function formatCredits(n) {
    if (n === null || n === undefined) return '–';
    return n.toLocaleString(undefined, { maximumFractionDigits: Math.abs(n) < 1 ? 3 : 2 });
  }

  function monthKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  function creditsUsedThisMonth(ledger, accountId, now = new Date()) {
    return ledger?.[accountId]?.months?.[monthKey(now)] ?? 0;
  }

  function planLabel(planType) {
    if (!planType) return null;
    return planType.charAt(0).toUpperCase() + planType.slice(1);
  }

  globalThis.CGUT = {
    ORIGIN,
    WARN_PCT,
    UsageError,
    errorRecord,
    parseBootstrap,
    fetchUsage,
    normalizeUsage,
    isOverLimit,
    hasCreditsInfo,
    windowLabel,
    formatDuration,
    formatAgo,
    formatPct,
    shownPct,
    usageWord,
    formatUsage,
    formatCredits,
    monthKey,
    creditsUsedThisMonth,
    planLabel,
  };
})();
