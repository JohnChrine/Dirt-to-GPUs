const signupForms = document.querySelectorAll("[data-signup-form]");
const subscriberEmailKey = "fdtg-subscriber-email";
let fieldNoteModal = null;
let previousFocus = null;

async function submitSignup(form) {
  const input = form.querySelector('input[name="email"]');
  const status = form.querySelector("[data-form-status]");
  const button = form.querySelector("button");
  const email = input.value.trim();

  status.textContent = "";
  status.classList.remove("is-error");
  button.disabled = true;
  button.textContent = "Joining...";

  try {
    const response = await fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        source: form.id === "join" ? "about-section" : "hero",
      }),
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Could not subscribe.");
    }

    localStorage.setItem(subscriberEmailKey, email);
    input.value = "";
    status.textContent = result.alreadySubscribed
      ? "Already on the list. Good taste."
      : "You are on the list.";
  } catch (error) {
    status.textContent = error.message;
    status.classList.add("is-error");
  } finally {
    button.disabled = false;
    button.textContent = "Join the field notes";
  }
}

signupForms.forEach((form) => {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submitSignup(form);
  });
});

function bindFieldNoteCards() {
  document.querySelectorAll(".field-note-card").forEach((card) => {
    if (card.dataset.bound === "true") return;
    card.dataset.bound = "true";

    card.addEventListener("click", (event) => {
      if (event.target.closest("[data-reaction]")) return;
      openFieldNoteModal(card);
    });
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openFieldNoteModal(card);
      }
    });
  });
}

function ensureFieldNoteModal() {
  if (fieldNoteModal) return fieldNoteModal;

  const modal = document.createElement("div");
  modal.className = "field-note-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "field-note-modal-title");
  modal.hidden = true;
  modal.innerHTML = `
    <div class="field-note-modal__backdrop" data-close-field-note></div>
    <article class="field-note-modal__panel">
      <button class="field-note-modal__close" type="button" data-close-field-note aria-label="Close field note">Close</button>
      <p class="field-note-modal__meta" data-modal-meta></p>
      <h2 id="field-note-modal-title" data-modal-title></h2>
      <p class="field-note-modal__summary" data-modal-summary></p>
      <div class="field-note-modal__body" data-modal-body></div>
    </article>
  `;

  modal.querySelectorAll("[data-close-field-note]").forEach((control) => {
    control.addEventListener("click", closeFieldNoteModal);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) closeFieldNoteModal();
  });

  document.body.appendChild(modal);
  fieldNoteModal = modal;
  return fieldNoteModal;
}

function paragraphsHtml(value) {
  return String(value || "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function openFieldNoteModal(card) {
  const modal = ensureFieldNoteModal();
  const title = card.dataset.title || card.querySelector("h3")?.textContent || "Field note";
  const summary = card.dataset.summary || card.querySelector(".note-summary")?.textContent || "";
  const body = card.dataset.body || card.querySelector(".note-body")?.textContent || summary;
  const category = card.dataset.category || card.querySelector(".note-meta span")?.textContent || "Field note";
  const date = card.dataset.date || card.querySelector("time")?.textContent || "";

  modal.querySelector("[data-modal-meta]").textContent = [category, date].filter(Boolean).join(" - ");
  modal.querySelector("[data-modal-title]").textContent = title;
  modal.querySelector("[data-modal-summary]").textContent = summary;
  modal.querySelector("[data-modal-summary]").hidden = !summary;
  modal.querySelector("[data-modal-body]").innerHTML = paragraphsHtml(body);

  previousFocus = document.activeElement;
  modal.hidden = false;
  document.body.classList.add("is-reading-field-note");
  modal.querySelector("[data-close-field-note]").focus();
}

function closeFieldNoteModal() {
  if (!fieldNoteModal || fieldNoteModal.hidden) return;
  fieldNoteModal.hidden = true;
  document.body.classList.remove("is-reading-field-note");
  if (previousFocus && typeof previousFocus.focus === "function") previousFocus.focus();
}

function bindReactions() {
  document.querySelectorAll("[data-reaction]").forEach((button) => {
    if (button.dataset.bound === "true") return;
    button.dataset.bound = "true";

    const handleReaction = async (event) => {
      event.stopPropagation();
      const card = button.closest(".field-note-card");
      const noteId = card?.dataset.noteId || card?.querySelector(".note-meta span")?.textContent?.trim();
      const reaction = button.dataset.reaction;
      const storageKey = `fdtg-reaction:${noteId}`;
      const status = card?.querySelector("[data-reaction-status]");
      const existingReaction = localStorage.getItem(storageKey);

      if (existingReaction === reaction) {
        if (status) status.textContent = "Already counted.";
        return;
      }

      if (status) {
        status.textContent = "";
        status.classList.remove("is-error");
      }

      if (!card?.dataset.noteId) {
        let subscriberEmail = localStorage.getItem(subscriberEmailKey) || "";
        if (!subscriberEmail) {
          subscriberEmail = window.prompt("Enter the email you subscribed with to react.") || "";
          subscriberEmail = subscriberEmail.trim().toLowerCase();
        }

        if (!subscriberEmail) return;

        localStorage.setItem(subscriberEmailKey, subscriberEmail);
        button.closest(".reaction-row")?.querySelectorAll("[data-reaction]").forEach((control) => {
          control.classList.toggle("is-selected", control === button);
        });
        if (existingReaction) {
          const previous = card.querySelector(`[data-reaction="${existingReaction}"] .count`);
          previous.textContent = String(Math.max(0, Number(previous.textContent || 0) - 1));
        }
        const count = button.querySelector(".count");
        count.textContent = String(Number(count.textContent || 0) + 1);
        localStorage.setItem(storageKey, reaction);
        return;
      }

      let subscriberEmail = localStorage.getItem(subscriberEmailKey) || "";
      if (!subscriberEmail) {
        subscriberEmail = window.prompt("Enter the email you subscribed with to react.") || "";
        subscriberEmail = subscriberEmail.trim().toLowerCase();
      }

      if (!subscriberEmail) {
        if (status) {
          status.textContent = "Subscribe first, then use that email to react.";
          status.classList.add("is-error");
        }
        return;
      }

      try {
        const response = await fetch(`/api/field-notes/${noteId}/react`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reaction, email: subscriberEmail }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Reaction failed.");
        localStorage.setItem(subscriberEmailKey, subscriberEmail);
        localStorage.setItem(storageKey, data.viewerReaction || reaction);
        card.querySelectorAll("[data-reaction]").forEach((control) => {
          control.classList.toggle("is-selected", control.dataset.reaction === (data.viewerReaction || reaction));
        });
        card.querySelector('[data-reaction="up"] .count').textContent = data.reactions.up;
        card.querySelector('[data-reaction="down"] .count').textContent = data.reactions.down;
        if (status) status.textContent = "Reaction counted.";
      } catch {
        if (status) {
          status.textContent = "Subscribe first, then use that email to react.";
          status.classList.add("is-error");
        }
      }
    };

    button.addEventListener("click", handleReaction);
    button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handleReaction(event);
      }
    });

    const card = button.closest(".field-note-card");
    const noteId = card?.dataset.noteId || card?.querySelector(".note-meta span")?.textContent?.trim();
    if (localStorage.getItem(`fdtg-reaction:${noteId}`) === button.dataset.reaction) {
      button.classList.add("is-selected");
    }
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadPublishedNotes() {
  const timeline = document.querySelector("[data-post-timeline]");
  if (!timeline) return;

  try {
    const response = await fetch("/api/field-notes");
    if (!response.ok) return;
    const data = await response.json();
    if (!data.notes || !data.notes.length) return;

    timeline.innerHTML = data.notes.map((note, index) => `
      <article class="field-note-card" tabindex="0" aria-expanded="false" data-note-id="${escapeHtml(note.id)}" data-title="${escapeHtml(note.title || `Field Note ${data.notes.length - index}`)}" data-summary="${escapeHtml(note.summary || "Raw note from the buildout.")}" data-body="${escapeHtml(note.body || note.summary || "Raw note from the buildout.")}" data-category="Field Note ${data.notes.length - index}" data-date="${note.publishedAt ? new Date(note.publishedAt).toLocaleDateString() : "Draft"}">
        <header>
          <div class="note-meta">
            <span>Field Note ${data.notes.length - index}</span>
            <time>${note.publishedAt ? new Date(note.publishedAt).toLocaleDateString() : "Draft"}</time>
          </div>
          <div class="reaction-row" aria-label="React to Field Note ${data.notes.length - index}">
            <span class="like-control" role="button" tabindex="0" data-reaction="up" aria-label="Like"><span class="thumb">👍</span><span class="count">${note.reactions?.up || 0}</span></span>
            <span class="like-control" role="button" tabindex="0" data-reaction="down" aria-label="Dislike"><span class="thumb">👎</span><span class="count">${note.reactions?.down || 0}</span></span>
          </div>
          <p class="reaction-status" data-reaction-status aria-live="polite"></p>
        </header>
        <div>
          <h3>${escapeHtml(note.title || `Field Note ${data.notes.length - index}`)}</h3>
          <p class="note-summary">${escapeHtml(note.summary || "Raw note from the buildout.")}</p>
          <p class="note-body">${escapeHtml(note.body || note.summary || "Raw note from the buildout.")}</p>
        </div>
      </article>
    `).join("");
    timeline.classList.remove("is-loading");
    bindFieldNoteCards();
    bindReactions();
  } catch {
    timeline.classList.remove("is-loading");
    timeline.innerHTML = '<p class="empty">Field notes are loading slowly. Refresh in a moment.</p>';
  }
}

bindFieldNoteCards();
bindReactions();
loadPublishedNotes();
