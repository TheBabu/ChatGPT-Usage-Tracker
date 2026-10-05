// DOM pieces shared by the in-page sidebar section and the popup: percentages, progress bars, the
// weekly marker, limit rows, the credits row and a small tooltip. Depends on shared/usage.js.
'use strict';

(() => {
  const {
    WARN_PCT, windowLabel, formatPct, shownPct, usageWord, formatDuration, formatAgo, formatCredits,
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

  // ---------- Percentage: "4% used" or "96% left" ----------

  // The word is spelled out next to every number, so the option in the popup never leaves anyone
  // guessing which way the numbers count.
  function createPct() {
    const root = el('span', 'cgut-pct');
    const value = el('span', 'cgut-pct-value');
    const word = el('span', 'cgut-pct-word');
    root.append(value, ' ', word);
    return { root, value, word };
  }

  // `pct` is the used percentage; `display` is the popup's "Show usage" option.
  function setPct(node, pct, display) {
    node.value.textContent = formatPct(shownPct(pct, display));
    node.word.textContent = usageWord(display);
    node.word.hidden = false;
    node.root.classList.toggle('cgut-warn', pct >= WARN_PCT);
  }

  // In place of a number, while there is none ("unavailable", "…").
  function setPctText(node, text) {
    node.value.textContent = text;
    node.word.hidden = true;
    node.root.classList.remove('cgut-warn');
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

  // Showing what is left, the bar fills with what is left, and warns when little is.
  function setProgress(progress, pct, display) {
    progress.fill.style.width = `${shownPct(pct, display)}%`;
    progress.root.classList.toggle('cgut-warn', pct >= WARN_PCT);
  }

  function setMarker(progress, pct, tip, display) {
    if (!progress.marker) {
      progress.marker = el('div', 'cgut-marker');
      progress.root.append(progress.marker);
    }
    progress.marker.style.left = `${Math.max(0, Math.min(100, shownPct(pct, display)))}%`;
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
    const pct = createPct();
    const reset = el('span', 'cgut-row-reset');
    top.append(label, pct.root, reset);
    const progress = createProgress();
    row.append(top, progress.root);
    return { row, label, pct, reset, progress };
  }

  function updateLimitRow(r, win, label, display, now) {
    r.label.textContent = label;
    setPct(r.pct, win.pct, display);
    setProgress(r.progress, win.pct, display);
    updateLimitReset(r, win, now);
  }

  function updateLimitReset(r, win, now) {
    r.reset.textContent = resetText(win.resetsAt, now);
    r.reset.classList.toggle('cgut-resetting', !!win.resetsAt && win.resetsAt <= now);
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

    // { usage, error, ledger } as kept in chrome.storage.local, and `display`, the "Show usage"
    // option.
    render({ usage, error, ledger, display }, now = Date.now()) {
      const { session, weekly, credits, note } = this;

      session.row.hidden = !usage?.session;
      if (usage?.session) updateLimitRow(session, usage.session, windowLabel(usage.session, '5-hour'), display, now);

      weekly.row.hidden = !usage?.weekly;
      if (usage?.weekly) updateLimitRow(weekly, usage.weekly, windowLabel(usage.weekly, 'Weekly'), display, now);

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
    createPct,
    setPct,
    setPctText,
    createProgress,
    setProgress,
    setMarker,
    clearMarker,
    resetText,
    UsagePanel,
  };
})();
