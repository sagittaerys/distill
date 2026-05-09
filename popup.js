const $ = (id) => document.getElementById(id);

const setupView      = $("setup-view");
const mainView       = $("main-view");
const idleState      = $("idle-state");
const loadingState   = $("loading-state");
const errorState     = $("error-state");
const summaryState   = $("summary-state");
const footer         = $("footer");

const apiKeyInput    = $("api-key-input");
const saveKeyBtn     = $("save-key-btn");
const summarizeBtn   = $("summarize-btn");
const reSummarizeBtn = $("re-summarize-btn");
const clearBtn       = $("clear-btn");
const copyBtn        = $("copy-btn");
const settingsBtn    = $("settings-btn");
const pageInfo       = $("page-info");
const pageTitleEl    = $("page-title");
const pageUrlEl      = $("page-url");
const loadingStep    = $("loading-step");
const errorMsg       = $("error-msg");

const tldrText     = $("tldr-text");
const bulletList   = $("bullet-list");
const insightsList = $("insights-list");
const metaRow      = $("meta-row");
const tagsRow      = $("tags-row");
const cacheBadge   = $("cache-badge");

let currentPageData = null;
let currentSummary  = null;
let isSettingsMode  = false;

function sanitizeText(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.textContent;
}

function showState(state) {
  idleState.style.display    = "none";
  loadingState.style.display = "none";
  errorState.style.display   = "none";
  summaryState.style.display = "none";

  if (state === "idle")    idleState.style.display    = "block";
  if (state === "loading") loadingState.style.display = "flex";
  if (state === "error")   errorState.style.display   = "flex";
  if (state === "summary") summaryState.style.display = "flex";
}

function setLoadingStep(text) {
  loadingStep.textContent = text;
}

function showError(msg) {
  errorMsg.textContent = sanitizeText(msg);
  showState("error");
  footer.classList.remove("hidden");
  reSummarizeBtn.style.display = "block";
}

async function init() {
  const { apiKey } = await chrome.storage.local.get("apiKey");

  if (!apiKey) {
    setupView.style.display = "flex";
    mainView.style.display  = "none";
  } else {
    setupView.style.display = "none";
    mainView.style.display  = "flex";
    await loadPageInfo();
    showState("idle");
  }
}

async function loadPageInfo() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      pageTitleEl.textContent = sanitizeText(tab.title || "Unknown page");
      pageUrlEl.textContent   = sanitizeText(tab.url   || "");
      pageInfo.style.display  = "block";
      currentPageData = { title: tab.title, url: tab.url };
    }
  } catch {
    // non-critical
  }
}

async function summarize(forceRefresh = false) {
  showState("loading");
  clearBtn.classList.add("hidden");
  copyBtn.classList.add("hidden");
  footer.classList.remove("hidden");
  reSummarizeBtn.style.display = "none";
  cacheBadge.classList.add("hidden");

  try {
    setLoadingStep("Connecting to page…");
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id) {
      throw new Error("Could not find the active tab.");
    }

    if (!tab.url?.startsWith("http")) {
      throw new Error("Distill only works on regular web pages (http/https). It can't summarize browser pages or PDFs.");
    }

    setLoadingStep("Extracting page content…");

    let contentResult;
    try {
      contentResult = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_CONTENT" });
    } catch {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"],
      });
      contentResult = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_CONTENT" });
    }

    if (!contentResult?.success) {
      throw new Error(contentResult?.error || "Could not extract page content.");
    }

    const pageData = contentResult.data;
    currentPageData = pageData;
    pageTitleEl.textContent = sanitizeText(pageData.title);
    pageUrlEl.textContent   = sanitizeText(pageData.url);
    pageInfo.style.display  = "block";

    if (pageData.wordCount < 50) {
      throw new Error("This page doesn't have enough text to summarize. Try navigating to a full article.");
    }

    if (forceRefresh) {
      await chrome.runtime.sendMessage({ type: "CLEAR_CACHE", url: pageData.url });
    }

    setLoadingStep("Asking Gemini to summarize…");

    const summaryResult = await chrome.runtime.sendMessage({
      type: "SUMMARIZE",
      pageData,
    });

    if (!summaryResult?.success) {
      if (summaryResult?.error === "NO_API_KEY") {
        setupView.style.display = "flex";
        mainView.style.display  = "none";
        return;
      }
      throw new Error(summaryResult?.error || "The AI didn't return a summary.");
    }

    currentSummary = summaryResult.summary;
    renderSummary(summaryResult.summary, summaryResult.fromCache);

  } catch (err) {
    showError(err.message);
  }
}

function renderSummary(summary, fromCache) {
  tldrText.textContent = sanitizeText(summary.tldr || "No summary available.");

  metaRow.innerHTML = "";

  const timeChip = document.createElement("span");
  timeChip.className = "meta-chip";
  timeChip.textContent = `📖 ${summary.readingTimeMinutes ?? "?"} min read`;
  metaRow.appendChild(timeChip);

  if (summary.sentiment) {
    const sentChip = document.createElement("span");
    const sentMap = {
      positive: "sentiment-positive",
      negative: "sentiment-negative",
      mixed:    "sentiment-mixed",
      neutral:  "",
    };
    sentChip.className = `meta-chip ${sentMap[summary.sentiment] || ""}`;
    const sentEmoji = { positive: "✓", negative: "!", mixed: "~", neutral: "—" };
    sentChip.textContent = `${sentEmoji[summary.sentiment] || ""} ${summary.sentiment}`;
    metaRow.appendChild(sentChip);
  }

  if (fromCache) {
    cacheBadge.classList.remove("hidden");
  }

  bulletList.innerHTML = "";
  for (const point of (summary.bullets || [])) {
    const li = document.createElement("li");
    li.className = "bullet-item";

    const dot = document.createElement("span");
    dot.className = "bullet-dot";

    const text = document.createElement("span");
    text.textContent = sanitizeText(point);

    li.appendChild(dot);
    li.appendChild(text);
    bulletList.appendChild(li);
  }

  insightsList.innerHTML = "";
  for (const insight of (summary.keyInsights || [])) {
    const div = document.createElement("div");
    div.className = "insight-item";

    const icon = document.createElement("span");
    icon.className = "insight-icon";
    icon.textContent = "💡";

    const text = document.createElement("span");
    text.textContent = sanitizeText(insight);

    div.appendChild(icon);
    div.appendChild(text);
    insightsList.appendChild(div);
  }

  tagsRow.innerHTML = "";
  for (const tag of (summary.topicTags || [])) {
    const span = document.createElement("span");
    span.className = "topic-tag";
    span.textContent = sanitizeText(`#${tag}`);
    tagsRow.appendChild(span);
  }

  showState("summary");
  footer.classList.remove("hidden");
  reSummarizeBtn.style.display = "block";
  clearBtn.classList.remove("hidden");
  copyBtn.classList.remove("hidden");
}

function buildPlainTextSummary(summary) {
  const lines = [
    `DISTILL SUMMARY`,
    `───────────────────────────────`,
    `TL;DR: ${summary.tldr}`,
    ``,
    `Key Points:`,
    ...(summary.bullets || []).map((b) => `• ${b}`),
    ``,
    `Key Insights:`,
    ...(summary.keyInsights || []).map((i) => `💡 ${i}`),
    ``,
    `Reading time: ${summary.readingTimeMinutes ?? "?"} min`,
    `Sentiment: ${summary.sentiment}`,
    `Topics: ${(summary.topicTags || []).map((t) => `#${t}`).join(", ")}`,
  ];
  return lines.join("\n");
}

async function copySummary() {
  if (!currentSummary) return;
  try {
    await navigator.clipboard.writeText(buildPlainTextSummary(currentSummary));
    copyBtn.textContent = "✓";
    setTimeout(() => (copyBtn.textContent = "⎘"), 1500);
  } catch {
    copyBtn.textContent = "!";
    setTimeout(() => (copyBtn.textContent = "⎘"), 1500);
  }
}

saveKeyBtn.addEventListener("click", async () => {
  const key = apiKeyInput.value.trim();
 
  if (!key || !key.startsWith("gsk_")) {
    apiKeyInput.style.borderColor = "#f87171";
    setTimeout(() => (apiKeyInput.style.borderColor = ""), 1500);
    return;
  }
  await chrome.storage.local.set({ apiKey: key });
  apiKeyInput.value = "";
  setupView.style.display = "none";
  mainView.style.display  = "flex";
  isSettingsMode = false;
  await loadPageInfo();
  showState("idle");
});

apiKeyInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") saveKeyBtn.click();
});

summarizeBtn.addEventListener("click", () => summarize(false));
reSummarizeBtn.addEventListener("click", () => summarize(true));

clearBtn.addEventListener("click", () => {
  currentSummary = null;
  showState("idle");
  footer.classList.add("hidden");
  clearBtn.classList.add("hidden");
  copyBtn.classList.add("hidden");
  cacheBadge.classList.add("hidden");
});

copyBtn.addEventListener("click", copySummary);

settingsBtn.addEventListener("click", async () => {
  if (isSettingsMode) {
    isSettingsMode = false;
    setupView.style.display = "none";
    mainView.style.display  = "flex";
    return;
  }
  isSettingsMode = true;
  const { apiKey } = await chrome.storage.local.get("apiKey");
  if (apiKey) {
    apiKeyInput.placeholder = `Current: AIza…${apiKey.slice(-6)}`;
  }
  setupView.style.display = "flex";
  mainView.style.display  = "none";
  document.querySelector(".setup-title").textContent = "Update API Key";
  saveKeyBtn.textContent = "Update Key →";
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && mainView.style.display !== "none") {
    if (idleState.style.display !== "none") {
      summarizeBtn.click();
    }
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "c" && currentSummary) {
    copySummary();
  }
});

init();