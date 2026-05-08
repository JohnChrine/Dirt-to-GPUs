const form = document.querySelector("[data-message-form]");
const status = document.querySelector("[data-message-status]");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  status.textContent = "";
  status.classList.remove("is-error");

  const button = form.querySelector("button");
  const data = new FormData(form);
  const email = String(data.get("email") || "").trim();
  const message = String(data.get("message") || "").trim();

  if (!email || !message) {
    status.textContent = "Email and message are required.";
    status.classList.add("is-error");
    return;
  }

  button.disabled = true;
  button.textContent = "Sending...";

  try {
    const response = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        message,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not send message.");

    form.reset();
    status.textContent = "Message sent. I will read it and reply if there is something to follow up on.";
    status.classList.add("is-success");
  } catch (error) {
    status.textContent = error.message;
    status.classList.remove("is-success");
    status.classList.add("is-error");
  } finally {
    button.disabled = false;
    button.textContent = "Send message";
  }
});
