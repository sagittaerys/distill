function scoreElement(el) {
  let score = 0;
  const tag = el.tagName.toLowerCase();
  const id = (el.id || "").toLowerCase();
  const cls = (el.className || "").toLowerCase();

  
  const positivePatterns = /article|post|content|main|body|entry|text|story|blog/;
  
  const negativePatterns = /nav|header|footer|sidebar|menu|widget|ad|banner|comment|social|share|related/;

  if (positivePatterns.test(id) || positivePatterns.test(cls)) score += 25;
  if (negativePatterns.test(id) || negativePatterns.test(cls)) score -= 25;

  if (tag === "article") score += 30;
  if (tag === "main") score += 20;
  if (tag === "section") score += 10;
  if (["nav", "footer", "header", "aside"].includes(tag)) score -= 30;

  const paragraphs = el.querySelectorAll("p");
  score += Math.min(paragraphs.length * 3, 30);

  const text = el.innerText || "";
  if (text.length < 200) score -= 20;

  return score;
}

function findMainContent() {
  
  const semanticSelectors = [
    "article",
    "main",
    '[role="main"]',
    ".post-content",
    ".article-body",
    ".entry-content",
    ".post-body",
    "#article-body",
    "#main-content",
  ];

  for (const selector of semanticSelectors) {
    const el = document.querySelector(selector);
    if (el && (el.innerText || "").trim().length > 300) {
      return el;
    }
  }

  const candidates = document.querySelectorAll(
    "div, section, article, main, .content, .post, .entry"
  );
  let bestEl = document.body;
  let bestScore = -Infinity;

  for (const el of candidates) {
    
    if (el.offsetHeight === 0 || el.offsetWidth === 0) continue;
    const score = scoreElement(el);
    if (score > bestScore) {
      bestScore = score;
      bestEl = el;
    }
  }

  return bestEl;
}


function cleanText(raw) {
  return raw
    .replace(/\s+/g, " ")          
    .replace(/\n{3,}/g, "\n\n")    
    .trim()
    .slice(0, 12000);             
}


function extractPageContent() {
  const mainEl = findMainContent();

  
  const clone = mainEl.cloneNode(true);

  
  const junk = clone.querySelectorAll(
    "script, style, noscript, iframe, svg, button, input, form, select, textarea, [aria-hidden='true']"
  );
  junk.forEach((el) => el.remove());

  const rawText = clone.innerText || clone.textContent || "";
  const text = cleanText(rawText);

  return {
    title: document.title || "Untitled Page",
    url: window.location.href,
    text,
    wordCount: text.split(/\s+/).filter(Boolean).length,
  };
}


chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "EXTRACT_CONTENT") {
    try {
      const content = extractPageContent();
      sendResponse({ success: true, data: content });
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }
  }
  
  return true;
});