# ChatGPT Usage Tracker

A small Chrome extension that keeps your ChatGPT usage limits in view while you chat, inspired by
[lugia19's Claude Usage Tracker](https://github.com/lugia19/Claude-Usage-Extension).

- **Composer bar.** Under the message box: your 5-hour usage as a bar, with an arrow on it marking
  your weekly usage, and the time until the 5-hour window resets. Hover the arrow for the weekly
  numbers.
- **Credit spend.** If a message was paid for with credits, a small `−0.42 credits` tag appears
  next to the bar. Once a limit is used up, the bar also says how many credits you have left.
- **Sidebar section.** A "Usage" section in the sidebar with the 5-hour and weekly bars, your credit
  balance and roughly how many credits you've used this month. Click the header to tuck it away;
  that choice is remembered.
- **Popup.** Clicking the toolbar icon shows the same numbers, a Refresh button and a Debug panel
  (recent log, last error, the raw response from ChatGPT).
- **Keeps itself up to date.** Usage refreshes every minute while a ChatGPT tab is visible (every
  5 minutes in the background), a few seconds after each reply finishes, and when a limit resets.
  Open tabs share one set of numbers, so extra tabs don't mean extra requests.

There are no settings: it's meant to be as minimal as possible.

## Install

1. Download or clone this repository.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and pick the repository folder.
4. Open (or reload) [chatgpt.com](https://chatgpt.com).

Works in Chrome, Edge, Brave and other Chromium browsers (version 111 or newer).

## How it works

The numbers come from the same endpoint ChatGPT's own usage page uses,
`https://chatgpt.com/backend-api/wham/usage`, which reports the 5-hour window, the weekly window and
your credit balance. The extension reads it with your existing ChatGPT login; it never sees your
password and needs no API key.

ChatGPT reports a credit *balance*, not what each message cost, so:

- the per-message tag is the drop in your balance between sending a message and shortly after the
  reply;
- "used this month" adds up drops in your balance while you were over a limit (credits are only
  spent then, so credits expiring don't count). It only knows about drops it has seen, starting from
  when you installed the extension.

The 5-hour and weekly limits cover ChatGPT Work and Codex. If you only use regular chat, the bars may
not move.

## Privacy

Everything stays in your browser. The extension only talks to `chatgpt.com`, and stores the latest
usage numbers, your monthly credit tally and a short debug log in the extension's local storage.

## If something looks wrong

ChatGPT changes its page layout often. If the bar or the sidebar section disappears, open the popup:
the numbers there don't depend on the page layout, and **Debug → Log** says whether the extension
couldn't find where to put things. The page selectors all live at the top of
[`content/tracker.js`](content/tracker.js) (`SELECTORS`).

## Files

| Path | What it does |
| --- | --- |
| `manifest.json` | Extension manifest (Manifest V3). |
| `shared/usage.js` | Fetches usage and normalizes it; formatting helpers. |
| `shared/ui.js`, `shared/ui.css` | Bars, rows, weekly arrow and tooltip, used by the page and the popup. |
| `content/tracker.js`, `content/tracker.css` | Composer bar, sidebar section, refresh schedule. |
| `content/page-hook.js` | Notices when a reply starts and finishes, so usage refreshes right after. |
| `background.js` | Stores the shared numbers, the monthly credit tally and the debug log. |
| `popup/` | Toolbar popup. |
