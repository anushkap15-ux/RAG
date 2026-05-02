let activeDocumentId = null;
let documents = [];
let conversationHistory = [];
let currentStats = {
  questionsAsked: 0,
  averageConfidence: 0,
  totalChunksRetrieved: 0,
  sessionStartTime: Date.now(),
};

// Dark mode management
const savedTheme = localStorage.getItem('darkMode');
let isDarkMode = savedTheme === null ? true : savedTheme === 'true';
const themeToggle = document.querySelector('#theme-toggle');

// Initialize dark mode from localStorage
if (isDarkMode) {
  document.body.classList.add('dark-mode');
  if (themeToggle) {
    themeToggle.textContent = '☀️';
  }
}
const uploadForm = document.querySelector("#upload-form");
const fileInput = document.querySelector("#pdf");
const dropLabel = document.querySelector("#drop-label");
const questionForm = document.querySelector("#question-form");
const questionInput = document.querySelector("#question");
const askButton = questionForm.querySelector("button");
const statusEl = document.querySelector("#status");
const sourcesEl = document.querySelector("#sources");
const documentListEl = document.querySelector("#document-list");
const previewEl = document.querySelector("#document-preview");
const activeLabelEl = document.querySelector("#active-label");
const activeTitleEl = document.querySelector("#active-title");
const pagesMetric = document.querySelector("#metric-pages");
const chunksMetric = document.querySelector("#metric-chunks");
const confidenceMetric = document.querySelector("#metric-confidence");
const chatLog = document.querySelector("#chat-log");
const topKInput = document.querySelector("#top-k");
const topKValue = document.querySelector("#top-k-value");
const clearDocsButton = document.querySelector("#clear-docs");
const searchForm = document.querySelector("#search-form");
const sourceQuery = document.querySelector("#source-query");
const searchButton = searchForm.querySelector("button");
const searchResults = document.querySelector("#search-results");
const exportHistoryBtn = document.querySelector("#export-history");
const showStatsBtn = document.querySelector("#show-stats");

document.addEventListener("DOMContentLoaded", refreshDocuments);

// Export conversation history
exportHistoryBtn.addEventListener("click", exportChat);

// Show statistics
showStatsBtn.addEventListener("click", showStatistics);

// Theme toggle
if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    isDarkMode = !isDarkMode;
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', isDarkMode);
    themeToggle.textContent = isDarkMode ? '☀️' : '🌙';
    showToast(isDarkMode ? '🌙 Dark mode enabled' : '☀️ Light mode enabled', 'success');
  });
}
fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  dropLabel.querySelector("strong").textContent = file ? file.name : "Drop a PDF or browse";
});

["dragenter", "dragover"].forEach((eventName) => {
  dropLabel.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropLabel.classList.add("is-dragging");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropLabel.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropLabel.classList.remove("is-dragging");
  });
});

dropLabel.addEventListener("drop", (event) => {
  const file = event.dataTransfer.files[0];
  if (!file) return;
  const transfer = new DataTransfer();
  transfer.items.add(file);
  fileInput.files = transfer.files;
  dropLabel.querySelector("strong").textContent = file.name;
});

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!fileInput.files.length) return;

  setBusy("🔄 Indexing document...");
  const response = await fetch("/upload", {
    method: "POST",
    body: new FormData(uploadForm),
  });

  // Upload PDF and receive document ID + metadata
  const data = await response.json();
  if (!response.ok) {
    setStatus("Upload failed", "error");
    addMessage("assistant", `❌ ${data.error || "Could not upload this PDF."}`);
    return;
  }

  // Store document ID and refresh UI
  activeDocumentId = data.document_id;
  uploadForm.reset();
  dropLabel.querySelector("strong").textContent = "Drop a PDF or browse";
  await refreshDocuments();
  await loadDocument(data.document_id);
  addMessage("assistant", `✅ Successfully indexed <strong>${escapeHtml(data.filename)}</strong> with ${data.chunk_count} chunks across ${data.page_count} pages.`);
  setStatus("Document indexed", "ok");
});

// Question submission handler - retrieves relevant chunks and generates answer
questionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const question = questionInput.value.trim();
  if (!question || !activeDocumentId) return;

  questionInput.value = "";
  addMessage("user", question);
  const pending = addMessage("assistant", '<span class="loading"></span> Searching retrieved chunks...');
  sourcesEl.innerHTML = "";
  setBusy("🔍 Retrieving...");

  // Send question to backend for semantic search and extraction
  const response = await fetch("/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      document_id: activeDocumentId,
      question,
      top_k: Number(topKInput.value),
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    pending.querySelector("p").textContent = `❌ ${data.error || "Could not answer the question."}`;
    setStatus("Answer failed", "error");
    return;
  }

  // Update session statistics
  // Update statistics
  currentStats.questionsAsked++;
  currentStats.totalChunksRetrieved += (data.retrieved_count || 0);
  currentStats.averageConfidence = Math.round(
    (currentStats.averageConfidence * (currentStats.questionsAsked - 1) + (data.confidence || 0)) / currentStats.questionsAsked
  );

  // Store conversation for export
  // Update conversation history
  conversationHistory.push({
    question,
    answer: data.answer,
    confidence: data.confidence,
    timestamp: new Date().toLocaleTimeString(),
    chunksRetrieved: data.retrieved_count,
  });

  pending.querySelector("p").innerHTML = data.answer;
  confidenceMetric.textContent = `${data.confidence || 0}%`;
  renderSources(data.sources || [], sourcesEl);
  setStatus(`✅ ${data.retrieved_count || 0} chunks retrieved`, "ok");
});

// Export conversation history to JSON file
searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = sourceQuery.value.trim();
  if (!query || !activeDocumentId) return;

  searchResults.innerHTML = '<p class="muted">🔍 Searching passages...</p>';
  const response = await fetch("/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ document_id: activeDocumentId, query }),
  });

  const data = await response.json();
  if (!response.ok) {
    searchResults.innerHTML = `<p class="muted">❌ ${escapeHtml(data.error || "Search failed.")}</p>`;
    return;
  }
  renderSources(data.results || [], searchResults);
});

topKInput.addEventListener("input", () => {
  topKValue.value = topKInput.value;
});

clearDocsButton.addEventListener("click", async () => {
  if (!confirm("Clear all documents and reset workspace?")) return;
  
  await fetch("/documents", { method: "DELETE" });
  activeDocumentId = null;
  documents = [];
  conversationHistory = [];
  currentStats = {
    questionsAsked: 0,
    averageConfidence: 0,
    totalChunksRetrieved: 0,
    sessionStartTime: Date.now(),
  };
  renderDocuments();
  setActiveState(null);
  addMessage("assistant", "🗑️ Workspace cleared. Ready for new documents!");
});

document.querySelectorAll("[data-prompt]").forEach((button) => {
  button.addEventListener("click", () => {
    questionInput.value = button.dataset.prompt;
    questionInput.focus();
  });
});

async function refreshDocuments() {
  const response = await fetch("/documents");
  const data = await response.json();
  documents = data.documents || [];
  renderDocuments();
  if (!activeDocumentId && documents.length) {
    await loadDocument(documents[0].document_id);
  }
}

function renderDocuments() {
  if (!documents.length) {
    documentListEl.innerHTML = '<p class="muted">📄 No PDFs indexed yet.</p>';
    return;
  }

  documentListEl.innerHTML = documents
    .map(
      (doc) => `
        <article class="document-item ${doc.document_id === activeDocumentId ? "active" : ""}">
          <button type="button" data-document="${doc.document_id}">
            <strong>${escapeHtml(doc.filename)}</strong>
            <span>${doc.page_count} pages / ${doc.chunk_count} chunks</span>
          </button>
          <button type="button" class="remove-doc" data-remove="${doc.document_id}" aria-label="Remove ${escapeHtml(doc.filename)}" title="Delete document">×</button>
        </article>
      `,
    )
    .join("");

  documentListEl.querySelectorAll("[data-document]").forEach((button) => {
    button.addEventListener("click", () => loadDocument(button.dataset.document));
  });
  documentListEl.querySelectorAll("[data-remove]").forEach((button) => {
    button.addEventListener("click", async () => {
      await fetch(`/documents/${button.dataset.remove}`, { method: "DELETE" });
      if (activeDocumentId === button.dataset.remove) activeDocumentId = null;
      await refreshDocuments();
      if (!documents.length) setActiveState(null);
    });
  });
}

async function loadDocument(documentId) {
  const response = await fetch(`/documents/${documentId}`);
  const data = await response.json();
  if (!response.ok) {
    setStatus(data.error || "Document not found", "error");
    return;
  }
  activeDocumentId = documentId;
  setActiveState(data);
  renderDocuments();
}

function setActiveState(doc) {
  const enabled = Boolean(doc);
  questionInput.disabled = !enabled;
  askButton.disabled = !enabled;
  sourceQuery.disabled = !enabled;
  searchButton.disabled = !enabled;

  if (!doc) {
    activeLabelEl.textContent = "No active document";
    activeTitleEl.textContent = "Upload a PDF to start asking grounded questions.";
    pagesMetric.textContent = "0";
    chunksMetric.textContent = "0";
    confidenceMetric.textContent = "0%";
    previewEl.innerHTML = '<p class="muted">Document text preview appears here after upload.</p>';
    sourcesEl.innerHTML = '<p class="muted">Citations appear after each answer.</p>';
    searchResults.innerHTML = "";
    setStatus("Ready", "idle");
    return;
  }

  activeLabelEl.textContent = "Active document";
  activeTitleEl.textContent = doc.filename;
  pagesMetric.textContent = doc.page_count;
  chunksMetric.textContent = doc.chunk_count;
  previewEl.innerHTML = (doc.preview || [])
    .map((page) => `<article><strong>📄 Page ${page.page}</strong><p>${escapeHtml(page.snippet)}</p></article>`)
    .join("");
  questionInput.focus();
}

function renderSources(sources, target) {
  if (!sources.length) {
    target.innerHTML = '<p class="muted">No matching source snippets found.</p>';
    return;
  }

  target.innerHTML = sources
    .map(
      (source, index) => {
        const confidencePercent = Math.round((source.score || 0) * 100);
        const confidenceColor = confidencePercent >= 70 ? 'green' : confidencePercent >= 50 ? 'amber' : 'red';
        return `
          <article class="source">
            <div class="source-meta">
              <span>📌 Source ${index + 1}</span>
              <button class="copy-btn" onclick="copyToClipboard(event, '${escapeHtmlAttr(source.snippet)}', this)" title="Copy source">📋</button>
            </div>
            <div class="score-bar">
              <span class="score-label">Relevance:</span>
              <div class="score-track">
                <div class="score-fill" style="width: ${confidencePercent}%"></div>
              </div>
              <span style="font-size: 0.78rem; color: var(--muted);">${confidencePercent}%</span>
            </div>
            <p>📄 Page ${source.page}</p>
            <p>${escapeHtml(source.snippet)}</p>
          </article>
        `;
      },
    )
    .join("");
}

function addMessage(role, text) {
  const node = document.createElement("article");
  node.className = `message ${role}`;
  const htmlContent = role === "assistant" ? text : escapeHtml(text);
  node.innerHTML = `
    <div class="avatar">${role === "user" ? "👤" : "🤖"}</div>
    <div class="bubble"><p>${htmlContent}</p></div>
  `;
  chatLog.appendChild(node);
  chatLog.scrollTop = chatLog.scrollHeight;
  return node;
}

function copyToClipboard(event, text, button) {
  event.preventDefault();
  event.stopPropagation();
  navigator.clipboard.writeText(text).then(() => {
    button.classList.add("copied");
    button.textContent = "✓";
    setTimeout(() => {
      button.classList.remove("copied");
      button.textContent = "📋";
    }, 2000);
    showToast("Copied to clipboard!", "success");
  });
}

function exportChat() {
  if (conversationHistory.length === 0) {
    showToast("No conversation history to export", "error");
    return;
  }

  const exportData = {
    exportedAt: new Date().toLocaleString(),
    activeDocument: documents.find(d => d.document_id === activeDocumentId)?.filename || "Unknown",
    conversationHistory: conversationHistory,
    statistics: currentStats,
  };

  const dataStr = JSON.stringify(exportData, null, 2);
  const dataBlob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `rag-chat-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  
    showToast(`Exported ${conversationHistory.length} messages`, "success");
  
  showToast(`Exported ${conversationHistory.length} messages`, "success");
}

// Display real-time session statistics
function showStatistics() {
  const sessionDuration = Math.round((Date.now() - currentStats.sessionStartTime) / 1000);
  const minutes = Math.floor(sessionDuration / 60);
  const seconds = sessionDuration % 60;
  
    // Build statistics HTML with formatted metrics
  
  const statsHtml = `
    <div class="stats-grid">
      <div class="stat-card">
        <span class="stat-value">${currentStats.questionsAsked}</span>
        <span class="stat-label">Questions Asked</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">${currentStats.averageConfidence}%</span>
        <span class="stat-label">Avg Relevance</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">${currentStats.totalChunksRetrieved}</span>
        <span class="stat-label">Chunks Retrieved</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">${minutes}m ${seconds}s</span>
        <span class="stat-label">Session Duration</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">${documents.length}</span>
        <span class="stat-label">Documents Indexed</span>
  
      </div>
    </div>
  `;
  
  document.getElementById("stats-content").innerHTML = statsHtml;
  document.getElementById("stats-modal").style.display = "flex";
}

function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

function setBusy(message) {
  statusEl.innerHTML = message;
  statusEl.className = "status busy";
}

function setStatus(message, mode = "idle") {
  statusEl.textContent = message;
  statusEl.className = `status ${mode}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return map[char];
  });
}

function escapeHtmlAttr(value) {
  return String(value).replace(/'/g, "\\'").replace(/"/g, "&quot;");
}
