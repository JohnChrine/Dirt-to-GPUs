const loginPanel = document.querySelector("[data-login-panel]");
const dashboard = document.querySelector("[data-dashboard]");
const loginForm = document.querySelector("[data-login-form]");
const loginStatus = document.querySelector("[data-login-status]");
const table = document.querySelector("[data-subscriber-table]");
const detail = document.querySelector("[data-detail]");
const searchInput = document.querySelector("[data-search]");
const statusFilter = document.querySelector("[data-status-filter]");
const refreshButton = document.querySelector("[data-refresh]");
const logoutButton = document.querySelector("[data-logout]");
const exportJsonButton = document.querySelector("[data-export-json]");
const exportCsvButton = document.querySelector("[data-export-csv]");
const backupJsonButton = document.querySelector("[data-backup-json]");
const restoreJsonButton = document.querySelector("[data-restore-json]");
const restoreFileInput = document.querySelector("[data-restore-file]");
const backupStatus = document.querySelector("[data-backup-status]");
const noteList = document.querySelector("[data-note-list]");
const noteForm = document.querySelector("[data-note-form]");
const newNoteButton = document.querySelector("[data-new-note]");
const deleteNoteButton = document.querySelector("[data-delete-note]");
const emailNoteButton = document.querySelector("[data-email-note]");
const testEmailNoteButton = document.querySelector("[data-test-email-note]");
const noteEmailStatus = document.querySelector("[data-note-email-status]");
const settingsForm = document.querySelector("[data-settings-form]");
const sourceList = document.querySelector("[data-source-list]");
const eventList = document.querySelector("[data-event-list]");
const inboxList = document.querySelector("[data-inbox-list]");
const refreshMessagesButton = document.querySelector("[data-refresh-messages]");

let subscribers = [];
let selectedId = null;
let fieldNotes = [];
let selectedNoteId = null;
let emailConfigured = false;

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function setAuthed(authed) {
  loginPanel.hidden = authed;
  dashboard.hidden = !authed;
}

function filteredSubscribers() {
  const query = searchInput.value.trim().toLowerCase();
  const status = statusFilter.value;

  return subscribers.filter((subscriber) => {
    const statusMatch = status === "all" || subscriber.status === status;
    const queryText = [subscriber.email, subscriber.source, subscriber.notes].join(" ").toLowerCase();
    return statusMatch && (!query || queryText.includes(query));
  });
}

function renderStats(stats) {
  Object.entries(stats).forEach(([key, value]) => {
    const element = document.querySelector(`[data-stat="${key}"]`);
    if (element) element.textContent = value || 0;
  });
  renderSources(stats.sourceCounts || {});
}

function renderSources(sourceCounts) {
  const entries = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]);
  sourceList.innerHTML = entries.length
    ? entries.map(([source, count]) => `
        <div class="source-item">
          <strong>${escapeHtml(source)}</strong>
          <span>${count}</span>
        </div>
      `).join("")
    : '<p class="empty">No sources yet.</p>';
}

function renderEvents(events) {
  eventList.innerHTML = events.length
    ? events.slice(0, 8).map((event) => `
        <article class="event-item">
          <strong>${escapeHtml(event.type.replaceAll("_", " "))}</strong>
          ${typeof event.sentCount === "number" ? `<span>Sent ${event.sentCount}; failed ${event.failureCount || 0}</span>` : ""}
          ${event.failures?.length ? `
            <ul class="event-failures">
              ${event.failures.map((failure) => `
                <li>
                  <strong>${escapeHtml(failure.email)}</strong>
                  <span>${escapeHtml(failure.error || "Email provider rejected this recipient.")}</span>
                </li>
              `).join("")}
            </ul>
          ` : ""}
          ${event.subscriberEmail ? `<span>${escapeHtml(event.subscriberEmail)}</span>` : ""}
          <span>${formatDate(event.at)}</span>
        </article>
      `).join("")
    : '<p class="empty">No events yet.</p>';
}

function renderMessages(messages) {
  inboxList.innerHTML = messages.length
    ? messages.map((message) => `
        <article class="inbox-item">
          <div>
            <span>${escapeHtml(message.status)}</span>
            <h3>${escapeHtml(message.email)}</h3>
            <p>${formatDate(message.createdAt)}</p>
          </div>
          <p>${escapeHtml(message.message)}</p>
          <div class="detail-actions">
            <button type="button" data-message-status="read" data-message-id="${message.id}">Read</button>
            <button type="button" data-message-status="replied" data-message-id="${message.id}">Replied</button>
            <button type="button" data-message-status="archived" data-message-id="${message.id}">Archive</button>
          </div>
        </article>
      `).join("")
    : '<p class="empty">No messages yet.</p>';

  inboxList.querySelectorAll("[data-message-status]").forEach((button) => {
    button.addEventListener("click", async () => {
      await api(`/api/admin/messages/${button.dataset.messageId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: button.dataset.messageStatus }),
      });
      await loadMessages();
      await loadEvents();
    });
  });
}

function renderTable() {
  const rows = filteredSubscribers();
  table.innerHTML = rows
    .map((subscriber) => `
      <tr data-id="${subscriber.id}" class="${subscriber.id === selectedId ? "is-selected" : ""}">
        <td>${escapeHtml(subscriber.email)}</td>
        <td><span class="pill ${escapeHtml(subscriber.status)}">${escapeHtml(subscriber.status)}</span></td>
        <td>${escapeHtml(subscriber.source || "site")}</td>
        <td>${formatDate(subscriber.createdAt)}</td>
      </tr>
    `)
    .join("");

  table.querySelectorAll("tr").forEach((row) => {
    row.addEventListener("click", () => {
      selectedId = row.dataset.id;
      renderTable();
      renderDetail();
    });
  });
}

function renderDetail() {
  const subscriber = subscribers.find((item) => item.id === selectedId);
  if (!subscriber) {
    detail.innerHTML = '<p class="empty">Select a subscriber to view notes, status, and contact actions.</p>';
    return;
  }

  detail.innerHTML = `
    <h2>${escapeHtml(subscriber.email)}</h2>
    <p class="meta">
      Joined ${formatDate(subscriber.createdAt)}<br>
      Updated ${formatDate(subscriber.updatedAt)}<br>
      Last contacted ${formatDate(subscriber.lastContactedAt)}
    </p>
    <div class="detail-actions">
      <button type="button" data-remove class="danger">Remove</button>
    </div>
    <form data-detail-form>
      <label>
        Status
        <select name="status">
          <option value="active" ${subscriber.status === "active" ? "selected" : ""}>Active</option>
          <option value="removed" ${subscriber.status === "removed" ? "selected" : ""}>Removed</option>
        </select>
      </label>
      <label>
        Notes
        <textarea name="notes" placeholder="Who are they? What did they ask for? Any follow-up?"></textarea>
      </label>
      <button type="submit">Save subscriber</button>
    </form>
    <form data-message-form class="message-form">
      <label>
        Direct message draft
        <textarea name="message" placeholder="Write a direct message. For now this saves locally; later we can send it from your brand email."></textarea>
      </label>
      <button type="submit">Save DM draft</button>
    </form>
    <div class="message-history">
      <h3>DM history</h3>
      ${
        subscriber.messages && subscriber.messages.length
          ? subscriber.messages.map((message) => `
              <article>
                <span>${formatDate(message.createdAt)} &middot; ${escapeHtml(message.status)}</span>
                <p>${escapeHtml(message.body)}</p>
              </article>
            `).join("")
          : '<p class="empty">No direct messages drafted yet.</p>'
      }
    </div>
  `;

  detail.querySelector('textarea[name="notes"]').value = subscriber.notes || "";

  detail.querySelector("[data-remove]").addEventListener("click", async () => {
    const confirmed = window.confirm(`Remove ${subscriber.email} from the active subscriber list?`);
    if (!confirmed) return;

    await api(`/api/admin/subscribers/${subscriber.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "removed" }),
    });
    await loadSubscribers();
  });

  detail.querySelector("[data-message-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api(`/api/admin/subscribers/${subscriber.id}/contact`, {
      method: "POST",
      body: JSON.stringify({ message: form.get("message") }),
    });
    await loadSubscribers();
  });

  detail.querySelector("[data-detail-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api(`/api/admin/subscribers/${subscriber.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: form.get("status"),
        notes: form.get("notes"),
      }),
    });
    await loadSubscribers();
  });
}

function downloadFile(filename, contents, type) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function setBackupStatus(message, isError = false) {
  backupStatus.textContent = message;
  backupStatus.classList.toggle("is-error", isError);
}

function exportCsv() {
  const headers = ["email", "status", "source", "createdAt", "updatedAt", "lastContactedAt", "notes"];
  const escapeCell = (value) => `"${String(value || "").replaceAll('"', '""')}"`;
  const rows = subscribers.map((subscriber) => headers.map((header) => escapeCell(subscriber[header])).join(","));
  downloadFile("from-dirt-to-gpus-subscribers.csv", [headers.join(","), ...rows].join("\n"), "text/csv");
}

async function loadSubscribers() {
  const data = await api("/api/admin/subscribers");
  subscribers = data.subscribers;
  renderStats(data.stats);
  if (selectedId && !subscribers.some((subscriber) => subscriber.id === selectedId)) selectedId = null;
  renderTable();
  renderDetail();
}

async function loadEvents() {
  const data = await api("/api/admin/events");
  renderEvents(data.events || []);
}

async function loadMessages() {
  const data = await api("/api/admin/messages");
  renderMessages(data.messages || []);
}

function resetNoteForm() {
  selectedNoteId = null;
  noteForm.reset();
  noteForm.elements.status.value = "draft";
  deleteNoteButton.hidden = true;
  emailNoteButton.disabled = true;
  testEmailNoteButton.disabled = true;
  noteEmailStatus.textContent = emailConfigured
    ? "Select a published note to email subscribers."
    : "Email sender not configured yet.";
  noteEmailStatus.classList.toggle("is-error", !emailConfigured);
  renderNotes();
}

function renderNotes() {
  if (!fieldNotes.length) {
    noteList.innerHTML = '<p class="empty">No field notes yet.</p>';
    return;
  }

  noteList.innerHTML = fieldNotes.map((note) => `
    <article class="draft-card ${note.id === selectedNoteId ? "is-selected" : ""}" data-note-id="${note.id}">
      <h3>${escapeHtml(note.title)}</h3>
      <p>${escapeHtml(note.category || "Field note")} &middot; ${escapeHtml(note.status)}</p>
      <p>${formatDate(note.updatedAt)}</p>
    </article>
  `).join("");

  noteList.querySelectorAll("[data-note-id]").forEach((card) => {
    card.addEventListener("click", () => {
      const note = fieldNotes.find((item) => item.id === card.dataset.noteId);
      if (!note) return;
      selectedNoteId = note.id;
      noteForm.elements.id.value = note.id;
      noteForm.elements.title.value = note.title || "";
      noteForm.elements.category.value = note.category || "";
      noteForm.elements.summary.value = note.summary || "";
      noteForm.elements.body.value = note.body || "";
      noteForm.elements.status.value = note.status || "draft";
      deleteNoteButton.hidden = false;
      emailNoteButton.disabled = !emailConfigured || note.status !== "published";
      testEmailNoteButton.disabled = !emailConfigured || note.status !== "published";
      noteEmailStatus.textContent = note.emailSentAt
        ? `Last emailed ${formatDate(note.emailSentAt)}.`
        : note.status !== "published"
          ? "Publish this note before emailing subscribers."
          : emailConfigured
            ? "Ready to email active subscribers."
          : "Email sender not configured yet.";
      noteEmailStatus.classList.toggle("is-error", !emailConfigured);
      renderNotes();
    });
  });
}

async function loadNotes() {
  const data = await api("/api/admin/field-notes");
  fieldNotes = data.notes;
  emailConfigured = Boolean(data.emailConfigured);
  renderNotes();
}

async function loadSettings() {
  const data = await api("/api/admin/settings");
  const settings = data.settings;
  settingsForm.elements.adminName.value = settings.adminName || "";
  settingsForm.elements.brandEmail.value = settings.brandEmail || "";
  settingsForm.elements.newsletterCadence.value = settings.newsletterCadence || "";
  settingsForm.elements.dmMode.value = settings.dmMode || "draft-only";
  settingsForm.elements.publicSignupEnabled.checked = Boolean(settings.publicSignupEnabled);
}

async function checkAuth() {
  try {
    await api("/api/admin/me");
    setAuthed(true);
    await loadSubscribers();
    await loadEvents();
    await loadMessages();
    await loadNotes();
    await loadSettings();
  } catch {
    setAuthed(false);
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginStatus.textContent = "";

  try {
    const form = new FormData(loginForm);
    await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({
        username: form.get("username"),
        password: form.get("password"),
      }),
    });
    loginForm.reset();
    setAuthed(true);
    await loadSubscribers();
    await loadEvents();
    await loadMessages();
    await loadNotes();
    await loadSettings();
  } catch (error) {
    loginStatus.textContent = error.message;
  }
});

searchInput.addEventListener("input", renderTable);
statusFilter.addEventListener("change", renderTable);
refreshButton.addEventListener("click", async () => {
  await loadSubscribers();
  await loadEvents();
});
refreshMessagesButton.addEventListener("click", loadMessages);
logoutButton.addEventListener("click", async () => {
  await api("/api/admin/logout", { method: "POST" });
  setAuthed(false);
});
exportJsonButton.addEventListener("click", () => {
  downloadFile("from-dirt-to-gpus-subscribers.json", JSON.stringify(subscribers, null, 2), "application/json");
});
exportCsvButton.addEventListener("click", exportCsv);
backupJsonButton.addEventListener("click", async () => {
  try {
    const backup = await api("/api/admin/backup");
    const stamp = new Date().toISOString().replaceAll(":", "-").slice(0, 19);
    downloadFile(`from-dirt-to-gpus-backup-${stamp}.json`, JSON.stringify(backup, null, 2), "application/json");
    setBackupStatus("Full backup downloaded.");
  } catch (error) {
    setBackupStatus(error.message, true);
  }
});
restoreJsonButton.addEventListener("click", () => {
  restoreFileInput.click();
});
restoreFileInput.addEventListener("change", async () => {
  const file = restoreFileInput.files?.[0];
  restoreFileInput.value = "";
  if (!file) return;

  const confirmed = window.confirm("Restore this backup? This replaces current subscribers, notes, messages, and events.");
  if (!confirmed) return;

  try {
    const backup = JSON.parse(await file.text());
    const result = await api("/api/admin/restore", {
      method: "POST",
      body: JSON.stringify({ confirmation: "RESTORE", backup }),
    });
    setBackupStatus(`Restored ${result.subscribers} subscribers and ${result.fieldNotes} notes.`);
    selectedId = null;
    selectedNoteId = null;
    await loadSubscribers();
    await loadEvents();
    await loadMessages();
    await loadNotes();
  } catch (error) {
    setBackupStatus(error.message, true);
  }
});
newNoteButton.addEventListener("click", resetNoteForm);
noteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(noteForm);
  const payload = {
    title: form.get("title"),
    category: form.get("category"),
    summary: form.get("summary"),
    body: form.get("body"),
    status: form.get("status"),
  };

  if (selectedNoteId) {
    await api(`/api/admin/field-notes/${selectedNoteId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  } else {
    await api("/api/admin/field-notes", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  await loadNotes();
  const savedNote = fieldNotes.find((note) => note.id === selectedNoteId) || fieldNotes[0];
  if (savedNote) selectedNoteId = savedNote.id;
  emailNoteButton.disabled = !emailConfigured || savedNote?.status !== "published";
  testEmailNoteButton.disabled = !emailConfigured || savedNote?.status !== "published";
  noteEmailStatus.textContent = savedNote?.status === "published"
    ? "Ready to email active subscribers."
    : "Publish this note before emailing subscribers.";
});
testEmailNoteButton.addEventListener("click", async () => {
  if (!selectedNoteId) return;
  const testEmail = window.prompt("Send test email to:", "georgesmonsif99@gmail.com");
  if (!testEmail) return;

  noteEmailStatus.textContent = "Sending test...";
  noteEmailStatus.classList.remove("is-error");
  testEmailNoteButton.disabled = true;

  try {
    const result = await api(`/api/admin/field-notes/${selectedNoteId}/test-email`, {
      method: "POST",
      body: JSON.stringify({ email: testEmail }),
    });
    noteEmailStatus.textContent = `Test sent to ${result.email}.`;
    await loadEvents();
  } catch (error) {
    noteEmailStatus.textContent = error.message;
    noteEmailStatus.classList.add("is-error");
  } finally {
    const selectedNote = fieldNotes.find((item) => item.id === selectedNoteId);
    testEmailNoteButton.disabled = !emailConfigured || selectedNote?.status !== "published";
  }
});
emailNoteButton.addEventListener("click", async () => {
  if (!selectedNoteId) return;
  const note = fieldNotes.find((item) => item.id === selectedNoteId);
  const confirmed = window.confirm(`Email "${note?.title || "this field note"}" to all active subscribers?`);
  if (!confirmed) return;

  noteEmailStatus.textContent = "Sending...";
  noteEmailStatus.classList.remove("is-error");
  emailNoteButton.disabled = true;

  try {
    const result = await api(`/api/admin/field-notes/${selectedNoteId}/email`, { method: "POST" });
    const failureDetails = result.failures?.length
      ? ` Failed: ${result.failures.map((failure) => `${failure.email} (${failure.error || "rejected"})`).join("; ")}`
      : "";
    noteEmailStatus.textContent = result.failureCount
      ? `Sent to ${result.sentCount}; ${result.failureCount} failed.${failureDetails}`
      : `Sent to ${result.sentCount} subscriber${result.sentCount === 1 ? "" : "s"}.`;
    noteEmailStatus.classList.toggle("is-error", Boolean(result.failureCount));
    await loadNotes();
    await loadEvents();
  } catch (error) {
    noteEmailStatus.textContent = error.message;
    noteEmailStatus.classList.add("is-error");
  } finally {
    emailNoteButton.disabled = !emailConfigured;
  }
});
deleteNoteButton.addEventListener("click", async () => {
  if (!selectedNoteId) return;
  const note = fieldNotes.find((item) => item.id === selectedNoteId);
  const confirmed = window.confirm(`Delete "${note?.title || "this field note"}"? This cannot be undone.`);
  if (!confirmed) return;

  await api(`/api/admin/field-notes/${selectedNoteId}`, { method: "DELETE" });
  resetNoteForm();
  await loadNotes();
});
settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(settingsForm);
  await api("/api/admin/settings", {
    method: "PATCH",
    body: JSON.stringify({
      adminName: form.get("adminName"),
      brandEmail: form.get("brandEmail"),
      newsletterCadence: form.get("newsletterCadence"),
      dmMode: form.get("dmMode"),
      publicSignupEnabled: settingsForm.elements.publicSignupEnabled.checked,
    }),
  });
  await loadSettings();
});

checkAuth();
