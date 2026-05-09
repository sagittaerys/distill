# Distill — AI Page Summarizer

> A Manifest V3 Chrome Extension that extracts content from any webpage and returns a structured AI-powered summary — with bullet points, key insights, sentiment, reading time, and topic tags.

---

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Setup](#setup)
- [Architecture](#architecture)
- [AI Integration](#ai-integration)
- [Security Decisions](#security-decisions)
- [Trade-offs](#trade-offs)
- [File Structure](#file-structure)

---

## Features

- **TL;DR** — one-sentence summary of the page
- **Bullet points** — 4–6 key points extracted from the content
- **Key insights** — 2–3 non-obvious implications or takeaways
- **Reading time** — estimated at ~200 wpm
- **Sentiment** — positive / negative / neutral / mixed
- **Topic tags** — auto-generated content categories
- **Smart caching** — summaries are cached per URL for 24 hours so repeat visits don't burn API quota
- **Rate limiting** — max 5 requests per minute, enforced in the background worker
- **Copy to clipboard** — copy the full summary as plain text
- **Re-summarize** — force a fresh summary, bypassing the cache

---

## Installation

This is a local extension and is **not listed on the Chrome Web Store**. Follow these steps to install it manually.

**1. Download the repository**

```bash
git clone https://github.com/sagittaerys/distill-extension.git
```

Or download as a ZIP from GitHub and extract it.

**2. Open Chrome Extensions**

Navigate to `chrome://extensions` in your browser.

**3. Enable Developer Mode**

Toggle **Developer mode** on — it's in the top-right corner of the extensions page.

**4. Load the extension**

Click **Load unpacked** and select the root folder of the project (the folder that contains `manifest.json`).

**5. Pin the extension** *(recommended)*

Click the puzzle icon in the Chrome toolbar and pin **Distill** so it's always accessible.

---

## Setup

Distill uses the **Groq API** (free tier) to generate summaries.

**Get a free API key:**

1. Go to [console.groq.com](https://console.groq.com)
2. Sign up with your Google account or email
3. Click **API Keys** → **Create API key**
4. Copy the key — it starts with `gsk_…`

> No credit card required. The free tier is generous enough for personal and demo use.

**Enter your key in the extension:**

1. Click the Distill icon in your Chrome toolbar
2. Paste your API key into the setup screen
3. Click **Save & Continue**

Your key is stored locally in `chrome.storage.local` and is never transmitted anywhere except directly to Groq's API.

**To update your key later:** click the ⚙ settings icon in the top-right of the popup.

---

## Architecture

Distill is built on **Manifest V3** and follows Chrome's recommended extension architecture. There are four components, each with a distinct responsibility:
