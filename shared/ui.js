// DOM pieces shared by the in-page sidebar section and the popup: progress bars, the weekly marker,
// limit rows, the credits row and a small tooltip. Depends on shared/usage.js.
'use strict';

(() => {
  const {
    WARN_PCT, windowLabel, formatPct, formatDuration, formatAgo, formatCredits,
    hasCreditsInfo, creditsUsedThisMonth,
  } = globalThis.CGUT;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // ---------- Tooltip ----------

  let tipNode = null;
  let tipTarget = null;

  function positionTip() {
    if (!tipNode || !tipTarget) return;
    const r = tipTarget.getBoundingClientRect();
    const t = tipNode.getBoundingClientRect();
    const left = Math.min(Math.max(8, r.left + r.width / 2 - t.width / 2), window.innerWidth - t.width - 8);
    let top = r.top - t.height - 6;
    if (top < 8) top = r.bottom + 6;
    tipNode.style.left = `${left}px`;
    tipNode.style.top = `${top}px`;
  }

  function showTip(target) {
    tipTarget = target;
    if (!tipNode) tipNode = el('div', 'cgut-root cgut-tooltip');
    if (!tipNode.isConnected) document.body.append(tipNode);
    tipNode.textContent = target.dataset.cgutTip;
    tipNode.classList.add('cgut-tooltip-visible');
    positionTip();
  }

  function hideTip() {
    tipTarget = null;
    tipNode?.classList.remove('cgut-tooltip-visible');
  }

  // Sets an element's tooltip, updating it in place if it is the one currently showing.
  function setTip(node, text) {
    if (text) node.dataset.cgutTip = text;
    else delete node.dataset.cgutTip;
    if (node !== tipTarget) return;
    if (text) {
      tipNode.textContent = text;
      positionTip();
    } else {
      hideTip();
    }
  }

  let tooltipsInstalled = false;

  function installTooltips() {
    if (tooltipsInstalled) return;
    tooltipsInstalled = true;
    document.addEventListener('mouseover', (e) => {
      const target = e.target instanceof Element ? e.target.closest('[data-cgut-tip]') : null;
      if (target === tipTarget) return;
      if (target) showTip(target);
      else hideTip();
    }, true);
    document.addEventListener('scroll', hideTip, true);
  }

  // ---------- Progress bar with optional weekly marker ----------

  function createProgress() {
    const root = el('div', 'cgut-progress');
    const track = el('div', 'cgut-track');
    const fill = el('div', 'cgut-fill');
    track.append(fill);
    root.append(track);
    return { root, fill, marker: null };
  }

  function setProgress(progress, pct) {
    progress.fill.style.width = `${pct}%`;
    progress.root.classList.toggle('cgut-warn', pct >= WARN_PCT);
  }

  function setMarker(progress, pct, tip) {
    if (!progress.marker) {
      progress.marker = el('div', 'cgut-marker');
      progress.root.append(progress.marker);
    }
    progress.marker.style.left = `${Math.max(0, Math.min(100, pct))}%`;
    progress.marker.classList.toggle('cgut-warn', pct >= WARN_PCT);
    setTip(progress.marker, tip);
  }

  function clearMarker(progress) {
    if (!progress.marker) return;
    if (progress.marker === tipTarget) hideTip();
    progress.marker.remove();
    progress.marker = null;
  }

  function resetText(resetsAt, now) {
    if (!resetsAt) return '';
    return resetsAt <= now ? 'Resetting…' : `Resets in ${formatDuration(resetsAt - now)}`;
  }

  // ---------- Rows ----------

  function createLimitRow() {
    const row = el('div', 'cgut-row');
    const top = el('div', 'cgut-row-top');
    const label = el('span', 'cgut-row-label');
    const pct = el('span', 'cgut-pct');
    const reset = el('span', 'cgut-row-reset');
    top.append(label, pct, reset);
    const progress = createProgress();
    row.append(top, progress.root);
    return { row, label, pct, reset, progress };
  }

  function updateLimitRow(r, win, label, now) {
    r.label.textContent = label;
    r.pct.textContent = formatPct(win.pct);
    r.pct.classList.toggle('cgut-warn', win.pct >= WARN_PCT);
    setProgress(r.progress, win.pct);
    setTip(r.progress.root, `${formatPct(win.pct)} of your ${label.toLowerCase()} limit used`);
    updateLimitReset(r, win, now);
  }

  function updateLimitReset(r, win, now) {
    r.reset.textContent = resetText(win.resetsAt, now);
    r.reset.classList.toggle('cgut-resetting', !!win.resetsAt && win.resetsAt <= now);
    setTip(r.reset, win.resetsAt ? `Resets ${new Date(win.resetsAt).toLocaleString()}` : '');
  }

  function createCreditsRow() {
    const row = el('div', 'cgut-row cgut-credits-row');
    const top = el('div', 'cgut-row-top');
    const label = el('span', 'cgut-row-label', 'Credits');
    const value = el('span', 'cgut-credits-value');
    top.append(label, value);
    const sub = el('div', 'cgut-row-sub');
    row.append(top, sub);
    return { row, value, sub };
  }

  function updateCreditsRow(r, credits, usedThisMonth) {
    r.value.textContent = credits.unlimited ? 'Unlimited' : `${formatCredits(credits.balance ?? 0)} left`;
    r.sub.textContent = usedThisMonth > 0
      ? `${formatCredits(usedThisMonth)} used this month`
      : 'None used this month';
    setTip(r.sub, "Estimated from drops in your credit balance while over a limit. ChatGPT doesn't report credit spending directly.");
  }

  // ---------- Panel: the stack of rows shown in the sidebar and the popup ----------

  class UsagePanel {
    constructor() {
      this.root = el('div', 'cgut-panel');
      this.session = createLimitRow();
      this.weekly = createLimitRow();
      this.credits = createCreditsRow();
      this.note = el('div', 'cgut-note');
      this.root.append(this.session.row, this.weekly.row, this.credits.row, this.note);
    }

    // { usage, error, ledger } as kept in chrome.storage.local.
    render({ usage, error, ledger }, now = Date.now()) {
      const { session, weekly, credits, note } = this;

      session.row.hidden = !usage?.session;
      if (usage?.session) updateLimitRow(session, usage.session, windowLabel(usage.session, '5-hour'), now);

      weekly.row.hidden = !usage?.weekly;
      if (usage?.weekly) updateLimitRow(weekly, usage.weekly, windowLabel(usage.weekly, 'Weekly'), now);

      const showCredits = hasCreditsInfo(usage);
      credits.row.hidden = !showCredits;
      if (showCredits) updateCreditsRow(credits, usage.credits, creditsUsedThisMonth(ledger, usage.accountId));

      const message = this.noteText(usage, error);
      note.hidden = !message;
      note.textContent = message || '';
      note.classList.toggle('cgut-note-warn', !!error && (!usage || error.at > usage.fetchedAt));
    }

    noteText(usage, error) {
      const failedSinceLastData = error && (!usage || error.at > usage.fetchedAt);
      if (!usage) {
        if (!error) return 'Loading usage…';
        return error.code === 'signed-out' ? 'Sign in to ChatGPT to see your usage.' : `Couldn't load usage: ${error.message}`;
      }
      if (failedSinceLastData) return `Last update failed (${error.message}). Showing data from ${formatAgo(usage.fetchedAt)}.`;
      if (!usage.session && !usage.weekly) return "ChatGPT isn't reporting any usage limits for this account.";
      return '';
    }
  }

  globalThis.CGUT.ui = {
    el,
    setTip,
    installTooltips,
    createProgress,
    setProgress,
    setMarker,
    clearMarker,
    resetText,
    UsagePanel,
  };
})();
