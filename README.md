# Distill — AI Page Summarizer

> A Manifest V3 Chrome Extension that extracts content from any webpage and returns a structured AI-powered summary — with bullet points, key insights, sentiment, reading time, and topic tags.

---

## Table of Contents

- [Demo](#demo)
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
git clone https://github.com/YOUR_USERNAME/distill-extension.git
```

Or download as a ZIP from GitHub and extract it.

**2. Open Chrome Extensions**

Navigate to `chrome://extensions` in your browser.

**3. Enable Developer Mode**

Toggle **Developer mode** on — it's in the top-right corner of the extensions page.

**4. Load the extension**

Click **Load unpacked** and select the root folder of the project (the folder that contains `manifest.json`).

**5. Pin the extension** *(I'd recommended this)*

Click the puzzle icon in the Chrome toolbar and pin **Distill** so it's always accessible.

---

## Setup

Distill uses the **Gemini API** (free tier) to generate summaries.

**Get a free API key:**

1. Go to [aistudio.google.com](https://aistudio.google.com)
2. Sign in with your Google account
3. Click **Get API key** → **Create API key**
4. Copy the key — it starts with `AIza…`

> No credit card required. The free tier allows 15 requests/minute and 1,500 requests/day — more than enough for personal use.

**Enter your key in the extension:**

1. Click the Distill icon in your Chrome toolbar
2. Paste your API key into the setup screen
3. Click **Save & Continue**

Your key is stored locally in `chrome.storage.local` and is never transmitted anywhere except directly to Google's Gemini API.

**To update your key later:** click the ⚙ settings icon in the top-right of the popup.

---

## Architecture

Distill is built on **Manifest V3** and follows Chrome's recommended extension architecture. There are four components, each with a distinct responsibility:

```
┌─────────────────────────────────────────────────────┐
│                   Chrome Browser                    │
│                                                     │
│  ┌─────────────┐        ┌──────────────────────┐   │
│  │  popup.html │        │     background.js    │   │
│  │  popup.js   │◄──────►│   (service worker)   │   │
│  │  popup.css  │        │  - AI API calls      │   │
│  └──────┬──────┘        │  - Cache management  │   │
│         │               │  - Rate limiting      │   │
│         │               └──────────┬───────────┘   │
│         │                          │               │
│         ▼                          ▼               │
│  ┌─────────────┐        ┌──────────────────────┐   │
│  │  content.js │        │   Gemini API         │   │
│  │ (injected   │        │ (external)           │   │
│  │  into page) │        └──────────────────────┘   │
│  └─────────────┘                                   │
└─────────────────────────────────────────────────────┘
```

### Component breakdown

**`manifest.json`**
The extension's configuration file. Declares all permissions, file locations, and the content security policy. Uses Manifest V3 — the current standard. No deprecated V2 APIs are used.

**`content.js`** — *injected into the active webpage*
Responsible for extracting readable content from the page DOM. Uses a scoring heuristic to identify the main article container, strips navigation, ads, and boilerplate, then returns clean text to the popup. It never makes network requests.

**`background.js`** — *service worker*
The secure backend of the extension. Handles all communication with the Gemini API, manages the summary cache in `chrome.storage.local`, and enforces rate limiting. It runs in an isolated context — its code is not accessible from any webpage's DevTools.

**`popup.html` / `popup.js` / `popup.css`** — *the UI*
The interface shown when the extension icon is clicked. Orchestrates the full summarization flow by passing messages between content.js and background.js, then renders the structured summary. Handles all UI states: idle, loading, error, and summary display.

### Message passing flow

```
User clicks "Summarize"
        │
        ▼
   popup.js
        │  chrome.tabs.sendMessage → { type: "EXTRACT_CONTENT" }
        ▼
   content.js  (runs inside the webpage)
        │  extracts + cleans page text
        │  sendResponse({ success: true, data: { title, url, text, wordCount } })
        ▼
   popup.js
        │  chrome.runtime.sendMessage → { type: "SUMMARIZE", pageData }
        ▼
   background.js  (service worker)
        │  checks cache → checks rate limit → fetches API key from storage
        │  POST https://generativelanguage.googleapis.com/...
        ▼
   Gemini API
        │  returns structured JSON summary
        ▼
   background.js
        │  caches result → sendResponse({ success: true, summary })
        ▼
   popup.js
        │  renders summary into the DOM
        ▼
   User sees the summary
```

---

## AI Integration

Distill uses **Google Gemini 2.0 Flash** via the Generative Language REST API.

**Model:** `gemini-2.0-flash`
**Endpoint:** `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`

### Prompt design

The AI is given a strict **system instruction** that constrains it to return only valid JSON in a defined schema:

```json
{
  "tldr": "string",
  "bullets": ["string"],
  "keyInsights": ["string"],
  "readingTimeMinutes": 5,
  "sentiment": "positive | neutral | negative | mixed",
  "topicTags": ["string"]
}
```

The **user message** contains the page title, URL, word count, and extracted text (capped at 12,000 characters to stay within a safe token budget).

**Temperature** is set to `0.3` — low enough for consistent, structured output without being completely deterministic.

### Response parsing

The model's text response is stripped of any accidental markdown fences (` ```json `) and parsed with `JSON.parse()`. If parsing fails, a user-friendly error is shown and the user can retry.

---

## Security Decisions

**API key never hardcoded**
The Gemini API key is entered by the user and stored in `chrome.storage.local`. It is retrieved at request time by the background service worker. It is never present in any source file committed to the repository.

**API calls made only from the background service worker**
The service worker runs in an isolated process. Unlike popup scripts or content scripts, it is not inspectable from a webpage's DevTools, which prevents key extraction via the browser console.

**Content sanitization**
All text inserted into the DOM goes through a `sanitizeText()` function that uses `element.textContent` assignment rather than `innerHTML`. This prevents XSS attacks where a malicious page could inject script tags into the summary output.

**Minimal permissions**
The extension only requests what it needs:
- `activeTab` — read the currently active tab's URL and title
- `scripting` — inject content.js when needed
- `storage` — store the API key and summary cache

It does not request `tabs`, `history`, `bookmarks`, `cookies`, or `<all_urls>` broad host access beyond what is needed for the Gemini API endpoint.

**Message validation**
The background service worker only acts on messages with known `type` values (`SUMMARIZE`, `CLEAR_CACHE`). Unknown message types are silently ignored.

---

## Trade-offs

**User-supplied API key vs. proxy server**
The current approach requires each user to supply their own Gemini API key. The alternative — a proxy server that holds the key server-side — would be more seamless but introduces infrastructure cost and a single point of failure. For a portfolio/demo extension, the user-key approach is the honest, secure choice and demonstrates an understanding of the security concern rather than hiding it.

**Content extraction heuristics vs. full Readability parser**
The content extractor uses a custom scoring heuristic rather than a full library like Mozilla Readability. This keeps the extension lightweight (zero dependencies, no build step) but means it may occasionally pick up sidebar content on unusually structured pages. The heuristic covers the vast majority of standard article pages correctly.

**In-memory rate limiting**
The rate limiter resets when the service worker is terminated and restarted by Chrome (which can happen after a period of inactivity). This means the limit is approximate rather than strict. A persistent rate limit could be built using `chrome.storage`, but the added complexity isn't warranted for the use case.

**12,000 character content cap**
Page content is truncated to 12,000 characters before being sent to the API. This keeps token usage low and responses fast, but means very long articles are summarized from their first ~3,000 words rather than the full text. A chunking + map-reduce approach could address this but would multiply API calls and cost.

**No build step**
The extension uses plain JavaScript with no bundler, transpiler, or framework. This makes it trivial to load and inspect locally, which is ideal for a demo and learning exercise. A production extension would benefit from TypeScript and a bundler like esbuild for type safety and tree-shaking.

---

## File Structure

```
distill-extension/
├── manifest.json       # Extension config (Manifest V3)
├── background.js       # Service worker — AI API calls, cache, rate limiting
├── content.js          # Injected into pages — content extraction
├── popup.html          # Extension popup UI
├── popup.js            # Popup controller logic
├── popup.css           # Popup styles
├── icons/
│   ├── icon16.png      # Toolbar icon
│   ├── icon48.png      # Extensions page icon
│   └── icon128.png     # Install dialog icon
└── README.md
```