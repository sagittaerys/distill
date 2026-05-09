const AI_MODEL = "gemini-1.5-flash";
const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${AI_MODEL}:generateContent`;

const rateLimiter = {
  requests: [],
  maxRequests: 5,
  windowMs: 60_000,

  canMakeRequest() {
    const now = Date.now();
    this.requests = this.requests.filter((t) => now - t < this.windowMs);
    return this.requests.length < this.maxRequests;
  },

  record() {
    this.requests.push(Date.now());
  },

  timeUntilReset() {
    if (this.requests.length === 0) return 0;
    const oldest = Math.min(...this.requests);
    return Math.ceil((this.windowMs - (Date.now() - oldest)) / 1000);
  },
};

function buildPrompt(pageData) {
  const systemPrompt = `You are a precise content analyst. When given webpage text, you output a clean, structured summary in the following JSON format ONLY — no markdown, no prose outside the JSON:

{
  "tldr": "One sentence (max 25 words) capturing the core idea.",
  "bullets": [
    "Key point 1 — specific and informative",
    "Key point 2 — specific and informative",
    "Key point 3 — specific and informative",
    "Key point 4 — specific and informative",
    "Key point 5 — specific and informative"
  ],
  "keyInsights": [
    "Deeper insight or implication 1",
    "Deeper insight or implication 2",
    "Deeper insight or implication 3"
  ],
  "readingTimeMinutes": <integer>,
  "sentiment": "positive | neutral | negative | mixed",
  "topicTags": ["tag1", "tag2", "tag3"]
}

Rules:
- bullets: 4-6 items, each ≤ 20 words
- keyInsights: 2-3 items highlighting non-obvious takeaways
- readingTimeMinutes: based on ~200 wpm reading speed
- Only output valid JSON. No extra keys.`;

  const userMessage = `Page title: ${pageData.title}
URL: ${pageData.url}
Word count: ${pageData.wordCount}

Content:
${pageData.text}`;

  return { systemPrompt, userMessage };
}

async function callAI(pageData, apiKey) {
  const { systemPrompt, userMessage } = buildPrompt(pageData);

  
  const response = await fetch(`${API_ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: userMessage }],
        },
      ],
      generationConfig: {
        maxOutputTokens: 1024,
        temperature: 0.3,
      },
    }),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    const msg = errBody?.error?.message || `HTTP ${response.status}`;
    throw new Error(`API error: ${msg}`);
  }

  const data = await response.json();

//  response shape
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

  try {
    const cleaned = rawText.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    throw new Error("AI returned malformed JSON. Try again.");
  }
}

async function getCached(url) {
  const key = `cache_${btoa(url).slice(0, 64)}`;
  const result = await chrome.storage.local.get(key);
  const entry = result[key];
  if (!entry) return null;
  if (Date.now() - entry.timestamp > 86_400_000) return null;
  return entry.summary;
}

async function setCached(url, summary) {
  const key = `cache_${btoa(url).slice(0, 64)}`;
  await chrome.storage.local.set({
    [key]: { summary, timestamp: Date.now() },
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "SUMMARIZE") {
    handleSummarize(message.pageData, sendResponse);
    return true;
  }

  if (message.type === "CLEAR_CACHE") {
    const key = `cache_${btoa(message.url).slice(0, 64)}`;
    chrome.storage.local.remove(key).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
});

async function handleSummarize(pageData, sendResponse) {
  try {
    const cached = await getCached(pageData.url);
    if (cached) {
      sendResponse({ success: true, summary: cached, fromCache: true });
      return;
    }

    if (!rateLimiter.canMakeRequest()) {
      const wait = rateLimiter.timeUntilReset();
      sendResponse({
        success: false,
        error: `Rate limit reached. Please wait ${wait}s before summarizing again.`,
      });
      return;
    }

    const { apiKey } = await chrome.storage.local.get("apiKey");
    if (!apiKey) {
      sendResponse({
        success: false,
        error: "NO_API_KEY",
      });
      return;
    }

    rateLimiter.record();
    const summary = await callAI(pageData, apiKey);

    await setCached(pageData.url, summary);
    sendResponse({ success: true, summary, fromCache: false });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}