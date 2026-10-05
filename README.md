# Simple Usage Tracker for ChatGPT

See your ChatGPT usage limits without leaving the chat. Inspired by [lugia19's Claude Usage Tracker](https://github.com/lugia19/Claude-Usage-Extension).

<img width="2875" height="1161" alt="image" src="https://github.com/user-attachments/assets/d5937ab5-7421-4f5c-bc6d-6768487e38f8" />

- A usage bar in the message box while you're in Work mode: your 5-hour usage, an arrow marking
  your weekly usage, and when the 5-hour limit resets
- A Usage section in the sidebar, which you can collapse
- Your credit balance, and how many credits a message used when it was paid for with credits
- Updates on its own as you chat

Not affiliated with or endorsed by OpenAI.

#### Developer note:
I really liked lugia19's extension for Claude, however I am transitioning to ChatGPT since it suits my needs better. But I couldn't find a good extension that is like lugia19's for ChatGPT, so I decided to basically entirely vibe code an entire extension for this reason (ironically mostly by Claude).
I don't plan to to actively maintain this extension, as this is just a something I wanted personally and I thought I would share to other people. I will just update it as I personally see fit.

## Install

**Chrome Web Store:** coming soon.

**Manually:**
1. Download the latest zip from [Releases](../../releases) and unzip it.
2. Go to `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and choose the unzipped folder.

## Privacy Policy

**What it accesses:** While you're signed in to chatgpt.com, the extension uses your existing
ChatGPT session to read your usage limits and credit balance from chatgpt.com. It does not read
your conversations, and it never sees your password.

**What it stores:** Your latest usage numbers, a running total of credits used per month, whether
the sidebar section is collapsed, whether to show release notes after updates, and a short
troubleshooting log. All of it is kept in your browser's extension storage and is removed when you
uninstall the extension.

**What it shares:** Nothing. The extension only communicates with chatgpt.com. It has no servers,
analytics or tracking, and no data is sold or transferred to anyone.
