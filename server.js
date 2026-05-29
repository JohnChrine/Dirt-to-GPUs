const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const https = require("node:https");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const tls = require("node:tls");

const root = __dirname;
const dataDir = process.env.FDTG_DATA_DIR || path.join(root, "data");
const dataFile = path.join(dataDir, "subscribers.json");
const dbStoreId = "main";

loadEnvFile();

const port = Number(process.env.PORT || 8000);
const host = process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
const adminUsername = process.env.FDTG_ADMIN_USERNAME || "george";
const adminPassword = process.env.FDTG_ADMIN_PASSWORD || "local-admin";
const sessionSecret = process.env.FDTG_SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const emailHost = process.env.FDTG_EMAIL_HOST || "smtp.gmail.com";
const emailPort = Number(process.env.FDTG_EMAIL_PORT || 465);
const emailUser = process.env.FDTG_EMAIL_USER || "";
const emailPassword = process.env.FDTG_EMAIL_APP_PASSWORD || process.env.FDTG_EMAIL_PASSWORD || "";
const emailFromName = process.env.FDTG_EMAIL_FROM_NAME || "From Dirt to GPUs";
const resendApiKey = process.env.FDTG_RESEND_API_KEY || "";
const resendFrom = process.env.FDTG_RESEND_FROM || "";
const siteUrl = (process.env.FDTG_SITE_URL || "https://www.dirttogpus.com").replace(/\/$/, "");
const databaseUrl = process.env.DATABASE_URL || "";
let pgPool = null;
const sessions = new Map();

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function loadEnvFile() {
  const envPath = path.join(root, ".env");
  if (!fsSync.existsSync(envPath)) return;

  const lines = fsSync.readFileSync(envPath, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const separator = trimmed.indexOf("=");
    if (separator === -1) return;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !process.env[key]) process.env[key] = value;
  });
}

function json(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function notFound(res) {
  json(res, 404, { error: "Not found." });
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
    if (Buffer.concat(chunks).length > 1024 * 1024) {
      throw new Error("Request body too large.");
    }
  }

  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function ensureStore() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(dataFile, JSON.stringify(defaultStore(), null, 2));
  }
}

function normalizeStore(store) {
  const defaults = defaultStore();
  return {
    ...defaults,
    ...store,
    settings: { ...defaults.settings, ...(store.settings || {}) },
    subscribers: store.subscribers || [],
    inboundMessages: store.inboundMessages || [],
    fieldNotes: store.fieldNotes || [],
    events: store.events || [],
  };
}

async function loadJsonStore() {
  await ensureStore();
  return normalizeStore(JSON.parse(await fs.readFile(dataFile, "utf8")));
}

async function saveJsonStore(store) {
  await ensureStore();
  await fs.writeFile(dataFile, JSON.stringify(store, null, 2));
}

function getPgPool() {
  if (!databaseUrl) return null;
  if (!pgPool) {
    const { Pool } = require("pg");
    pgPool = new Pool({ connectionString: databaseUrl });
  }
  return pgPool;
}

async function seedStoreForDatabase() {
  try {
    const localStore = await loadJsonStore();
    if (localStore.subscribers.length || localStore.fieldNotes.some((note) => !String(note.id || "").startsWith("starter-"))) {
      return localStore;
    }
  } catch {
    // If local JSON is absent or invalid in production, seed with defaults.
  }

  return normalizeStore(defaultStore());
}

async function ensureDatabaseStore() {
  const pool = getPgPool();
  if (!pool) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS fdtg_store (
      id text PRIMARY KEY,
      data jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const existing = await pool.query("SELECT 1 FROM fdtg_store WHERE id = $1", [dbStoreId]);
  if (existing.rowCount) return;

  const seed = await seedStoreForDatabase();
  await pool.query(
    "INSERT INTO fdtg_store (id, data, updated_at) VALUES ($1, $2::jsonb, now()) ON CONFLICT (id) DO NOTHING",
    [dbStoreId, JSON.stringify(seed)]
  );
}

async function loadDatabaseStore() {
  await ensureDatabaseStore();
  const result = await getPgPool().query("SELECT data FROM fdtg_store WHERE id = $1", [dbStoreId]);
  return normalizeStore(result.rows[0]?.data || defaultStore());
}

async function saveDatabaseStore(store) {
  await ensureDatabaseStore();
  await getPgPool().query(
    `INSERT INTO fdtg_store (id, data, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (id)
     DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [dbStoreId, JSON.stringify(normalizeStore(store))]
  );
}

function defaultStore() {
  const now = new Date().toISOString();
  return {
    subscribers: [],
    inboundMessages: [],
    fieldNotes: [
      {
        id: "starter-ai-boom-schedule",
        title: "The AI boom sounds abstract until you are staring at a schedule.",
        category: "Field Note",
        summary: "The AI boom sounds abstract until you are staring at a schedule that needs power, cooling, controls, inspections, and a room full of people aligned enough to make it real.",
        body: "The AI boom sounds abstract until you are staring at a schedule that needs power, cooling, controls, inspections, and a room full of people aligned enough to make it real.",
        status: "draft",
        createdAt: now,
        updatedAt: now,
        publishedAt: null,
      },
      {
        id: "starter-relationships-infrastructure",
        title: "Relationships are infrastructure too.",
        category: "Field Note",
        summary: "Relationships are infrastructure too. The right phone call can move a problem faster than another meeting invite ever will.",
        body: "Relationships are infrastructure too. The right phone call can move a problem faster than another meeting invite ever will.",
        status: "draft",
        createdAt: now,
        updatedAt: now,
        publishedAt: null,
      },
      {
        id: "starter-field-truth",
        title: "The field tells the truth first.",
        category: "Field Note",
        summary: "Data centers taught me that the field always tells the truth first. The report catches up later.",
        body: "Data centers taught me that the field always tells the truth first. The report catches up later.",
        status: "draft",
        createdAt: now,
        updatedAt: now,
        publishedAt: null,
      },
      {
        id: "starter-power-schedule",
        title: "Power is the headline constraint.",
        category: "Field Note",
        summary: "Power is the headline constraint, but schedule is where the pain shows up every day.",
        body: "Power is the headline constraint, but schedule is where the pain shows up every day.",
        status: "draft",
        createdAt: now,
        updatedAt: now,
        publishedAt: null,
      },
      {
        id: "starter-ai-dirt-phase",
        title: "AI does not start with a model.",
        category: "Essay",
        summary: "It starts with land, power, concrete, steel, cooling, labor, commissioning, and trust.",
        body: "AI does not start with a model.\n\nIt starts with land. Power. Concrete. Steel. Cooling. Labor. Commissioning. Trust.\n\nEvery headline about compute has a physical world behind it. Someone has to build the room, protect the schedule, coordinate the trades, get the power online, and make the space ready for racks.\n\nThat side of the boom deserves more attention.",
        status: "draft",
        createdAt: now,
        updatedAt: now,
        publishedAt: null,
      },
      {
        id: "starter-rack-ready",
        title: "Rack ready is not a vibe.",
        category: "Buildout",
        summary: "It is a chain of handoffs, inspections, power, cooling, controls, and people who cannot miss.",
        body: "Rack ready is not a vibe.\n\nIt is not just a clean room with cabinets in it. It is a chain of handoffs that had to land correctly: power, cooling, containment, controls, QA/QC, commissioning, documentation, and the people responsible for all of it.\n\nWhen someone says a room is rack ready, they are really saying a lot of people did not drop the ball.",
        status: "draft",
        createdAt: now,
        updatedAt: now,
        publishedAt: null,
      },
      {
        id: "starter-room-with-experience",
        title: "The room with more experience does not scare me anymore.",
        category: "Career",
        summary: "Nerve is not pretending to know everything. It is knowing how to find the person who does.",
        body: "The room with more experience does not scare me anymore.\n\nI am usually not the gray-haired expert in the room. That used to feel like a disadvantage. Now I think it can be fuel if you know how to move.\n\nNerve is not pretending to know everything. It is being willing to ask better questions, find the person who knows, build trust quickly, and keep learning fast enough that people want you in the room again.",
        status: "draft",
        createdAt: now,
        updatedAt: now,
        publishedAt: null,
      },
    ],
    settings: {
      brandEmail: "",
      adminName: "George",
      newsletterCadence: "Weekly when there is something worth saying.",
      publicSignupEnabled: true,
      dmMode: "draft-only",
    },
    events: [],
  };
}

async function loadStore() {
  if (databaseUrl) return loadDatabaseStore();
  return loadJsonStore();
}

async function saveStore(store) {
  if (databaseUrl) {
    await saveDatabaseStore(store);
    return;
  }

  await saveJsonStore(store);
}

function isEmailConfigured() {
  return isResendConfigured() || isSmtpConfigured();
}

function isSmtpConfigured() {
  return Boolean(emailHost && emailPort && emailUser && emailPassword);
}

function isResendConfigured() {
  return Boolean(resendApiKey && resendFrom);
}

function encodeHeader(value) {
  return String(value || "").replace(/[\r\n]/g, " ").trim();
}

function formatEmailAddress(name, email) {
  const safeName = encodeHeader(name).replaceAll('"', "'");
  return `"${safeName}" <${email}>`;
}

function dotStuff(value) {
  return String(value || "")
    .replace(/\r?\n/g, "\r\n")
    .replace(/^\./gm, "..");
}

function cleanEmailText(value) {
  return String(value || "").replace(/\uFFFD/g, "'");
}

function escapeHtml(value) {
  return cleanEmailText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function htmlParagraphs(value) {
  return cleanEmailText(value)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function excerptText(value, maxLength = 520) {
  const text = cleanEmailText(value).replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  const trimmed = text.slice(0, maxLength).replace(/\s+\S*$/, "").trim();
  return `${trimmed}...`;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function noteSlug(note) {
  return slugify(note.slug || note.title) || String(note.id || "field-note");
}

function fieldNoteUrl(note) {
  return `${siteUrl}/field-notes/${noteSlug(note)}`;
}

function formatPostedLine(date = new Date()) {
  const postedAt = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Phoenix",
  }).format(date).replace(/\sAM$/, "am").replace(/\sPM$/, "pm");

  return `New field note posted on ${postedAt}.`;
}

function buildFieldNoteEmail(note) {
  const title = cleanEmailText(note.title || "New field note");
  const category = cleanEmailText(note.category || "Field Note");
  const summary = cleanEmailText(note.summary || "");
  const bodyText = cleanEmailText(note.body || "");
  const postedLine = formatPostedLine();
  const excerpt = excerptText(bodyText || summary);
  const noteUrl = fieldNoteUrl(note);
  const body = [
    postedLine,
    title,
    summary,
    excerpt,
    "...",
    `Read the rest: ${noteUrl}`,
    "",
    "---",
    "You are receiving this because you subscribed to From Dirt to GPUs.",
    `Website: ${siteUrl}`,
    "Want out later? Reply and ask to be removed.",
  ].filter(Boolean).join("\n\n");
  const html = `<!doctype html>
<html>
  <body style="margin:0; padding:0; background:#081110; color:#f7f1e7; font-family:Arial, Helvetica, sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#081110; padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:720px;">
            <tr>
              <td style="padding:0 0 18px;">
                <div style="color:#82d8ff; font-size:12px; font-weight:800; letter-spacing:2px; text-transform:uppercase;">From Dirt to GPUs</div>
                <p style="margin:10px 0 0; color:#cce3df; font-size:16px; line-height:1.55;">${escapeHtml(postedLine)}</p>
              </td>
            </tr>
            <tr>
              <td style="border:1px solid rgba(130,216,255,0.22); background:#101b1a; padding:28px; border-radius:8px;">
                <div style="color:#82d8ff; font-size:12px; font-weight:800; letter-spacing:1.7px; text-transform:uppercase; margin-bottom:14px;">${escapeHtml(category)}</div>
                <h1 style="margin:0 0 14px; color:#fff8eb; font-size:32px; line-height:1.14; font-weight:900;">${escapeHtml(title)}</h1>
                ${summary ? `<p style="margin:0 0 22px; color:#fff8eb; font-size:20px; line-height:1.45; font-weight:800;">${escapeHtml(summary)}</p>` : ""}
                <p style="margin:0; color:#f3eadc; font-size:17px; line-height:1.72;">${escapeHtml(excerpt)}</p>
                <p style="margin:12px 0 22px; color:#82d8ff; font-size:20px; line-height:1; letter-spacing:3px;">...</p>
                <a href="${escapeHtml(noteUrl)}" style="display:inline-block; background:#82d8ff; color:#06100f; font-size:14px; font-weight:900; text-decoration:none; padding:12px 16px; border-radius:6px;">Read the rest</a>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 0 0; color:#9fb6b2; font-size:13px; line-height:1.55;">
                <p style="margin:0;">You are receiving this because you subscribed to From Dirt to GPUs.</p>
                <p style="margin:6px 0 0;">Visit the site: <a href="${escapeHtml(siteUrl)}" style="color:#82d8ff; font-weight:800; text-decoration:none;">${escapeHtml(siteUrl.replace(/^https?:\/\//, ""))}</a></p>
                <p style="margin:6px 0 0;">Want out later? Reply and ask to be removed.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return {
    subject: `New field note: ${title}`,
    body,
    html,
  };
}

async function sendSmtpMail({ to, subject, text }) {
  if (!isSmtpConfigured()) {
    throw new Error("Email is not configured. Add Gmail SMTP variables in Railway first.");
  }

  let socket;
  let buffer = "";
  const pending = [];

  function attachSocket(nextSocket) {
    socket = nextSocket;
    socket.setEncoding("utf8");
    socket.setTimeout(20000, () => {
      while (pending.length) pending.shift()("500 ETIMEDOUT SMTP connection timed out");
      socket.destroy();
    });

    socket.on("data", (chunk) => {
      buffer += chunk;
      flushSmtpResponses();
    });

    socket.on("error", (error) => {
      const details = [error.code, error.message].filter(Boolean).join(" ") || "socket error";
      while (pending.length) pending.shift()(`500 ${details}`);
    });
  }

  function flushSmtpResponses() {
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index];
      const match = line.match(/^(\d{3}) /);
      if (match && pending.length) {
        const code = match[1];
        const start = Math.max(0, lines.findIndex((candidate) => candidate.startsWith(`${code}-`) || candidate.startsWith(`${code} `)));
        pending.shift()(lines.slice(start, index + 1).join("\n"));
        lines.splice(0, index + 1);
        index = lines.length;
      }
    }
  }

  const readResponse = () => new Promise((resolve) => {
    pending.push(resolve);
    flushSmtpResponses();
  });
  const command = async (line, expected = /^[23]/) => {
    socket.write(`${line}\r\n`);
    const response = await readResponse();
    if (!expected.test(response)) throw new Error(`Email server rejected command: ${response}`);
    return response;
  };

  if (emailPort === 465) {
    attachSocket(tls.connect({ host: emailHost, port: emailPort, servername: emailHost }));
  } else {
    attachSocket(net.connect({ host: emailHost, port: emailPort }));
  }

  const greeting = await readResponse();
  if (!/^220/.test(greeting)) throw new Error(`Email server rejected connection: ${greeting}`);

  await command("EHLO fromdirttogpus.local");

  if (emailPort !== 465) {
    await command("STARTTLS", /^220/);
    socket.removeAllListeners("data");
    socket.removeAllListeners("error");
    socket.removeAllListeners("timeout");
    buffer = "";
    attachSocket(await new Promise((resolve, reject) => {
      const secureSocket = tls.connect({ socket, servername: emailHost }, () => resolve(secureSocket));
      secureSocket.once("error", reject);
    }));
    await command("EHLO fromdirttogpus.local");
  }

  await command("AUTH LOGIN", /^334/);
  await command(Buffer.from(emailUser).toString("base64"), /^334/);
  await command(Buffer.from(emailPassword).toString("base64"), /^235/);
  await command(`MAIL FROM:<${emailUser}>`);
  await command(`RCPT TO:<${to}>`);
  await command("DATA", /^354/);

  const message = [
    `From: ${formatEmailAddress(emailFromName, emailUser)}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    dotStuff(text),
    ".",
  ].join("\r\n");

  await command(message);
  socket.write("QUIT\r\n");
  socket.end();
}

async function sendResendMail({ to, subject, text, html }) {
  if (!isResendConfigured()) {
    throw new Error("Resend email is not configured. Add FDTG_RESEND_API_KEY and FDTG_RESEND_FROM in Railway first.");
  }

  const payload = JSON.stringify({
    from: resendFrom,
    to: [to],
    subject,
    text,
    html,
    reply_to: emailUser || undefined,
  });

  const response = await new Promise((resolve, reject) => {
    const request = https.request({
      hostname: "api.resend.com",
      path: "/emails",
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
      timeout: 20000,
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        resolve({
          statusCode: res.statusCode || 0,
          body: Buffer.concat(chunks).toString("utf8"),
        });
      });
    });

    request.on("timeout", () => {
      request.destroy(new Error("Resend request timed out."));
    });
    request.on("error", reject);
    request.write(payload);
    request.end();
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    let message = response.body;
    try {
      const body = JSON.parse(response.body);
      message = body.message || body.error || response.body;
    } catch {
      // Keep the raw response body when Resend returns plain text.
    }
    throw new Error(`Resend rejected email: ${response.statusCode} ${message}`);
  }
}

async function sendEmail({ to, subject, text, html }) {
  if (isResendConfigured()) {
    await sendResendMail({ to, subject, text, html });
    return;
  }

  await sendSmtpMail({ to, subject, text });
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function hashValue(value) {
  return crypto.createHash("sha256").update(`${sessionSecret}:${value || ""}`).digest("hex").slice(0, 16);
}

function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([key, value]) => key && value)
  );
}

function createSession(res) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { createdAt: Date.now() });
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `fdtg_admin=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${secure}`);
}

function clearSession(req, res) {
  const token = parseCookies(req).fdtg_admin;
  if (token) sessions.delete(token);
  res.setHeader("Set-Cookie", "fdtg_admin=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
}

function isAuthed(req) {
  const token = parseCookies(req).fdtg_admin;
  const session = token && sessions.get(token);
  if (!session) return false;

  const eightHours = 8 * 60 * 60 * 1000;
  if (Date.now() - session.createdAt > eightHours) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function requireAdmin(req, res) {
  if (isAuthed(req)) return true;
  json(res, 401, { error: "Admin login required." });
  return false;
}

function subscriberStats(subscribers) {
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const active = subscribers.filter((subscriber) => subscriber.status === "active");
  const sourceCounts = subscribers.reduce((counts, subscriber) => {
    const source = subscriber.source || "site";
    counts[source] = (counts[source] || 0) + 1;
    return counts;
  }, {});

  return {
    total: subscribers.length,
    active: active.length,
    removed: subscribers.filter((subscriber) => subscriber.status === "removed").length,
    newLast7Days: subscribers.filter((subscriber) => now - new Date(subscriber.createdAt).getTime() <= sevenDays).length,
    lastSignupAt: subscribers
      .map((subscriber) => subscriber.createdAt)
      .sort()
      .at(-1) || null,
    sourceCounts,
  };
}

function publicSubscriber(subscriber) {
  return {
    id: subscriber.id,
    email: subscriber.email,
    status: subscriber.status,
    source: subscriber.source,
    notes: subscriber.notes || "",
    tags: subscriber.tags || [],
    createdAt: subscriber.createdAt,
    updatedAt: subscriber.updatedAt,
    lastContactedAt: subscriber.lastContactedAt || null,
    messages: subscriber.messages || [],
    reactions: subscriber.reactions || {},
  };
}

function publicFieldNote(note) {
  return {
    id: note.id,
    title: note.title,
    slug: noteSlug(note),
    category: note.category,
    summary: note.summary,
    body: note.status === "published" ? note.body : "",
    status: note.status,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    publishedAt: note.publishedAt || null,
    reactions: reactionCounts(note),
  };
}

function adminFieldNote(note) {
  return {
    id: note.id,
    title: note.title,
    slug: noteSlug(note),
    category: note.category,
    summary: note.summary,
    body: note.body || "",
    status: note.status,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    publishedAt: note.publishedAt || null,
    reactions: reactionCounts(note),
    reactionVotes: note.reactionVotes || {},
    emailSentAt: note.emailSentAt || null,
    emailSendCount: note.emailSendCount || 0,
  };
}

function exportStore(store) {
  return {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    store,
  };
}

function normalizeRestoredStore(payload, currentStore) {
  const candidate = payload.store || payload;
  const subscribers = candidate.subscribers?.subscribers || candidate.subscribers || [];
  const fieldNotes = candidate.fieldNotes?.notes || candidate.fieldNotes || [];
  const inboundMessages = candidate.messages?.messages || candidate.inboundMessages || [];
  const events = candidate.events?.events || candidate.events || [];
  const settings = candidate.settings || currentStore.settings || defaultStore().settings;

  if (!Array.isArray(subscribers) || !Array.isArray(fieldNotes) || !Array.isArray(inboundMessages) || !Array.isArray(events)) {
    throw new Error("Backup file does not look like a From Dirt to GPUs backup.");
  }

  return {
    subscribers,
    inboundMessages,
    fieldNotes,
    settings,
    events,
  };
}

function reactionCounts(note) {
  const counts = { up: 0, down: 0 };
  const votes = note.reactionVotes || {};
  Object.values(votes).forEach((reaction) => {
    if (reaction === "up" || reaction === "down") counts[reaction] += 1;
  });

  return counts;
}

async function handleApi(req, res, pathname) {
  if (req.method === "POST" && pathname === "/api/messages") {
    const body = await readBody(req);
    const email = normalizeEmail(body.email);
    const message = String(body.message || "").trim().slice(0, 5000);

    if (!isValidEmail(email)) {
      json(res, 400, { error: "Enter a real email address." });
      return;
    }

    if (message.length < 10) {
      json(res, 400, { error: "Write a little more so there is something to reply to." });
      return;
    }

    const store = await loadStore();
    const now = new Date().toISOString();
    const inbound = {
      id: crypto.randomUUID(),
      email,
      message,
      status: "new",
      createdAt: now,
      updatedAt: now,
      ipHash: hashValue(req.socket.remoteAddress),
      userAgentHash: hashValue(req.headers["user-agent"]),
    };

    store.inboundMessages.unshift(inbound);
    store.events.push({ type: "inbound_message", messageId: inbound.id, at: now });
    await saveStore(store);
    json(res, 201, { ok: true });
    return;
  }

  if (req.method === "GET" && pathname === "/api/field-notes") {
    const store = await loadStore();
    json(res, 200, {
      notes: store.fieldNotes
        .filter((note) => note.status === "published")
        .sort((a, b) => String(b.publishedAt || b.updatedAt).localeCompare(String(a.publishedAt || a.updatedAt)))
        .map(publicFieldNote),
    });
    return;
  }

  const reactionMatch = pathname.match(/^\/api\/field-notes\/([^/]+)\/react$/);
  if (req.method === "POST" && reactionMatch) {
    const body = await readBody(req);
    const reaction = body.reaction === "down" ? "down" : body.reaction === "up" ? "up" : null;
    const email = normalizeEmail(body.email);
    if (!reaction) {
      json(res, 400, { error: "Invalid reaction." });
      return;
    }

    if (!isValidEmail(email)) {
      json(res, 400, { error: "Enter the email you subscribed with to react." });
      return;
    }

    const store = await loadStore();
    const subscriber = store.subscribers.find((item) => item.email === email && item.status === "active");
    if (!subscriber) {
      json(res, 403, { error: "Subscribe with that email before reacting." });
      return;
    }

    const note = store.fieldNotes.find((item) => item.id === reactionMatch[1] && item.status === "published");
    if (!note) {
      json(res, 404, { error: "Field note not found." });
      return;
    }

    const now = new Date().toISOString();
    note.reactionVotes = note.reactionVotes || {};
    subscriber.reactions = subscriber.reactions || {};

    const previousReaction = note.reactionVotes[subscriber.id] || subscriber.reactions[note.id] || null;
    note.reactionVotes[subscriber.id] = reaction;
    note.reactions = reactionCounts(note);
    subscriber.reactions[note.id] = reaction;
    subscriber.updatedAt = now;

    store.events.push({
      type: previousReaction && previousReaction !== reaction ? "field_note_reaction_changed" : `field_note_${reaction}`,
      noteId: note.id,
      subscriberId: subscriber.id,
      reaction,
      previousReaction,
      at: now,
    });
    await saveStore(store);
    json(res, 200, { reactions: note.reactions, viewerReaction: reaction });
    return;
  }

  if (req.method === "POST" && pathname === "/api/subscribe") {
    const body = await readBody(req);
    const store = await loadStore();

    if (!store.settings.publicSignupEnabled) {
      json(res, 403, { error: "Signup is temporarily closed." });
      return;
    }

    const email = normalizeEmail(body.email);
    if (!isValidEmail(email)) {
      json(res, 400, { error: "Enter a real email address." });
      return;
    }

    const existing = store.subscribers.find((subscriber) => subscriber.email === email);
    const now = new Date().toISOString();

    if (existing) {
      existing.status = "active";
      existing.updatedAt = now;
      existing.source = existing.source || body.source || "site";
      store.events.push({ type: "resubscribed", subscriberId: existing.id, at: now });
      await saveStore(store);
      json(res, 200, { ok: true, alreadySubscribed: true });
      return;
    }

    const subscriber = {
      id: crypto.randomUUID(),
      email,
      status: "active",
      source: String(body.source || "site").slice(0, 80),
      notes: "",
      tags: [],
      createdAt: now,
      updatedAt: now,
      lastContactedAt: null,
      ipHash: hashValue(req.socket.remoteAddress),
      userAgentHash: hashValue(req.headers["user-agent"]),
    };

    store.subscribers.unshift(subscriber);
    store.events.push({ type: "subscribed", subscriberId: subscriber.id, at: now });
    await saveStore(store);
    json(res, 201, { ok: true, alreadySubscribed: false });
    return;
  }

  if (req.method === "POST" && pathname === "/api/admin/login") {
    const body = await readBody(req);
    if (String(body.username || "").trim().toLowerCase() !== adminUsername.toLowerCase() || body.password !== adminPassword) {
      json(res, 401, { error: "Wrong username or password." });
      return;
    }
    createSession(res);
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && pathname === "/api/admin/logout") {
    clearSession(req, res);
    json(res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/admin/me") {
    json(res, isAuthed(req) ? 200 : 401, { authed: isAuthed(req) });
    return;
  }

  if (!requireAdmin(req, res)) return;

  if (req.method === "GET" && pathname === "/api/admin/subscribers") {
    const store = await loadStore();
    json(res, 200, {
      stats: subscriberStats(store.subscribers),
      subscribers: store.subscribers.map(publicSubscriber),
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/admin/messages") {
    const store = await loadStore();
    json(res, 200, { messages: store.inboundMessages });
    return;
  }

  const inboundMatch = pathname.match(/^\/api\/admin\/messages\/([^/]+)$/);
  if (inboundMatch) {
    const store = await loadStore();
    const message = store.inboundMessages.find((item) => item.id === inboundMatch[1]);
    if (!message) {
      json(res, 404, { error: "Message not found." });
      return;
    }

    if (req.method === "PATCH") {
      const body = await readBody(req);
      if (body.status && !["new", "read", "replied", "archived"].includes(body.status)) {
        json(res, 400, { error: "Invalid message status." });
        return;
      }
      if (body.status) message.status = body.status;
      message.updatedAt = new Date().toISOString();
      store.events.push({ type: "inbound_message_updated", messageId: message.id, at: message.updatedAt });
      await saveStore(store);
      json(res, 200, { message });
      return;
    }
  }

  if (req.method === "GET" && pathname === "/api/admin/events") {
    const store = await loadStore();
    const subscriberById = new Map(store.subscribers.map((subscriber) => [subscriber.id, subscriber]));
    json(res, 200, {
      events: store.events
        .slice(-100)
        .reverse()
        .map((event) => ({
          ...event,
          subscriberEmail: event.subscriberId ? subscriberById.get(event.subscriberId)?.email || null : null,
        })),
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/admin/field-notes") {
    const store = await loadStore();
    json(res, 200, {
      notes: store.fieldNotes
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
        .map(adminFieldNote),
      emailConfigured: isEmailConfigured(),
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/admin/backup") {
    const store = await loadStore();
    json(res, 200, exportStore(store));
    return;
  }

  if (req.method === "POST" && pathname === "/api/admin/restore") {
    const body = await readBody(req);
    if (body.confirmation !== "RESTORE") {
      json(res, 400, { error: "Type RESTORE to confirm." });
      return;
    }

    try {
      const currentStore = await loadStore();
      const restoredStore = normalizeRestoredStore(body.backup || body, currentStore);
      restoredStore.events.push({
        type: "backup_restored",
        at: new Date().toISOString(),
      });
      await saveStore(restoredStore);
      json(res, 200, {
        ok: true,
        subscribers: restoredStore.subscribers.length,
        fieldNotes: restoredStore.fieldNotes.length,
        messages: restoredStore.inboundMessages.length,
      });
    } catch (error) {
      json(res, 400, { error: error.message || "Could not restore backup." });
    }
    return;
  }

  if (req.method === "POST" && pathname === "/api/admin/field-notes") {
    const body = await readBody(req);
    const title = String(body.title || "").trim();
    if (!title) {
      json(res, 400, { error: "Title is required." });
      return;
    }

    const store = await loadStore();
    const now = new Date().toISOString();
    const status = body.status === "published" ? "published" : "draft";
    const note = {
      id: crypto.randomUUID(),
      title: title.slice(0, 160),
      category: String(body.category || "Field note").trim().slice(0, 80),
      summary: String(body.summary || "").trim().slice(0, 500),
      body: String(body.body || "").trim().slice(0, 20000),
      status,
      createdAt: now,
      updatedAt: now,
      publishedAt: status === "published" ? now : null,
      reactions: { up: 0, down: 0 },
      reactionVotes: {},
    };
    store.fieldNotes.unshift(note);
    store.events.push({ type: "field_note_created", noteId: note.id, at: now });
    await saveStore(store);
    json(res, 201, { note: adminFieldNote(note) });
    return;
  }

  const noteMatch = pathname.match(/^\/api\/admin\/field-notes\/([^/]+)$/);
  if (noteMatch) {
    const store = await loadStore();
    const note = store.fieldNotes.find((item) => item.id === noteMatch[1]);
    if (!note) {
      json(res, 404, { error: "Field note not found." });
      return;
    }

    const now = new Date().toISOString();

    if (req.method === "PATCH") {
      const body = await readBody(req);
      const previousStatus = note.status;
      if (typeof body.title === "string") note.title = body.title.trim().slice(0, 160);
      if (typeof body.category === "string") note.category = body.category.trim().slice(0, 80);
      if (typeof body.summary === "string") note.summary = body.summary.trim().slice(0, 500);
      if (typeof body.body === "string") note.body = body.body.trim().slice(0, 20000);
      if (body.status && ["draft", "published", "archived"].includes(body.status)) note.status = body.status;
      if (note.status === "published" && previousStatus !== "published") note.publishedAt = now;
      if (note.status !== "published") note.publishedAt = note.status === "draft" ? null : note.publishedAt;
      note.updatedAt = now;
      store.events.push({ type: "field_note_updated", noteId: note.id, at: now });
      await saveStore(store);
      json(res, 200, { note: adminFieldNote(note) });
      return;
    }

    if (req.method === "DELETE") {
      store.fieldNotes = store.fieldNotes.filter((item) => item.id !== note.id);
      store.events.push({ type: "field_note_deleted", noteId: note.id, at: now });
      await saveStore(store);
      json(res, 200, { ok: true });
      return;
    }
  }

  const noteEmailMatch = pathname.match(/^\/api\/admin\/field-notes\/([^/]+)\/email$/);
  if (req.method === "POST" && noteEmailMatch) {
    if (!isEmailConfigured()) {
      json(res, 400, { error: "Email is not configured. Add Gmail app password variables in Railway first." });
      return;
    }

    const store = await loadStore();
    const note = store.fieldNotes.find((item) => item.id === noteEmailMatch[1]);
    if (!note) {
      json(res, 404, { error: "Field note not found." });
      return;
    }

    if (note.status !== "published") {
      json(res, 400, { error: "Publish the note before emailing subscribers." });
      return;
    }

    const activeSubscribers = store.subscribers.filter((subscriber) => subscriber.status === "active" && isValidEmail(subscriber.email));
    if (!activeSubscribers.length) {
      json(res, 400, { error: "No active subscribers to email." });
      return;
    }

    const email = buildFieldNoteEmail(note);
    const failures = [];
    for (const subscriber of activeSubscribers) {
      try {
        await sendEmail({ to: subscriber.email, subject: email.subject, text: email.body, html: email.html });
      } catch (error) {
        failures.push({ email: subscriber.email, error: error.message });
      }
    }

    const sentCount = activeSubscribers.length - failures.length;
    const sentAt = new Date().toISOString();
    if (sentCount > 0) {
      note.emailSentAt = sentAt;
      note.emailSendCount = (note.emailSendCount || 0) + sentCount;
      note.updatedAt = sentAt;
    }
    store.events.push({
      type: sentCount > 0 ? "field_note_email_sent" : "field_note_email_failed",
      noteId: note.id,
      sentCount,
      failureCount: failures.length,
      failures,
      at: sentAt,
    });
    await saveStore(store);

    json(res, failures.length ? 207 : 200, {
      ok: failures.length === 0,
      sentCount,
      failureCount: failures.length,
      failures,
      note: adminFieldNote(note),
    });
    return;
  }

  const noteTestEmailMatch = pathname.match(/^\/api\/admin\/field-notes\/([^/]+)\/test-email$/);
  if (req.method === "POST" && noteTestEmailMatch) {
    if (!isEmailConfigured()) {
      json(res, 400, { error: "Email is not configured. Add Resend variables in Railway first." });
      return;
    }

    const body = await readBody(req);
    const testEmail = normalizeEmail(body.email || "georgesmonsif99@gmail.com");
    if (!isValidEmail(testEmail)) {
      json(res, 400, { error: "Enter a real test email address." });
      return;
    }

    const store = await loadStore();
    const note = store.fieldNotes.find((item) => item.id === noteTestEmailMatch[1]);
    if (!note) {
      json(res, 404, { error: "Field note not found." });
      return;
    }

    if (note.status !== "published") {
      json(res, 400, { error: "Publish the note before sending a test email." });
      return;
    }

    const email = buildFieldNoteEmail(note);
    await sendEmail({ to: testEmail, subject: `[Test] ${email.subject}`, text: email.body, html: email.html });

    store.events.push({
      type: "field_note_test_email_sent",
      noteId: note.id,
      email: testEmail,
      at: new Date().toISOString(),
    });
    await saveStore(store);

    json(res, 200, { ok: true, email: testEmail, note: adminFieldNote(note) });
    return;
  }

  if (pathname === "/api/admin/settings") {
    const store = await loadStore();

    if (req.method === "GET") {
      json(res, 200, { settings: store.settings });
      return;
    }

    if (req.method === "PATCH") {
      const body = await readBody(req);
      const now = new Date().toISOString();
      const allowed = ["brandEmail", "adminName", "newsletterCadence", "publicSignupEnabled", "dmMode"];
      allowed.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(body, key)) {
          store.settings[key] = body[key];
        }
      });
      store.events.push({ type: "settings_updated", at: now });
      await saveStore(store);
      json(res, 200, { settings: store.settings });
      return;
    }
  }

  const subscriberMatch = pathname.match(/^\/api\/admin\/subscribers\/([^/]+)(?:\/contact)?$/);
  if (subscriberMatch) {
    const store = await loadStore();
    const subscriber = store.subscribers.find((item) => item.id === subscriberMatch[1]);
    if (!subscriber) {
      json(res, 404, { error: "Subscriber not found." });
      return;
    }

    const now = new Date().toISOString();

    if (req.method === "PATCH" && !pathname.endsWith("/contact")) {
      const body = await readBody(req);
      if (body.status && !["active", "removed"].includes(body.status)) {
        json(res, 400, { error: "Invalid subscriber status." });
        return;
      }
      if (typeof body.notes === "string") subscriber.notes = body.notes.slice(0, 3000);
      if (typeof body.status === "string") subscriber.status = body.status;
      subscriber.updatedAt = now;
      store.events.push({ type: "updated", subscriberId: subscriber.id, at: now });
      await saveStore(store);
      json(res, 200, { subscriber: publicSubscriber(subscriber) });
      return;
    }

    if (req.method === "POST" && pathname.endsWith("/contact")) {
      const body = await readBody(req);
      const message = String(body.message || "").trim().slice(0, 5000);

      if (!message) {
        json(res, 400, { error: "Write a message first." });
        return;
      }

      subscriber.lastContactedAt = now;
      subscriber.updatedAt = now;
      subscriber.messages = subscriber.messages || [];
      subscriber.messages.unshift({
        id: crypto.randomUUID(),
        body: message,
        status: "drafted",
        createdAt: now,
      });
      store.events.push({ type: "direct_message_drafted", subscriberId: subscriber.id, at: now });
      await saveStore(store);
      json(res, 200, { subscriber: publicSubscriber(subscriber) });
      return;
    }
  }

  notFound(res);
}

async function serveStatic(req, res, pathname) {
  const route = pathname === "/"
    ? "/index.html"
    : pathname.startsWith("/field-notes/")
      ? "/index.html"
    : pathname === "/admin"
      ? "/admin.html"
      : pathname === "/privacy"
        ? "/privacy.html"
        : pathname === "/message"
          ? "/message.html"
        : pathname;
  const cleanRoute = path.normalize(route).replace(/^([/\\])+/, "");

  if (cleanRoute.startsWith("data" + path.sep) || cleanRoute.startsWith(".") || cleanRoute.includes(path.sep + ".")) {
    json(res, 403, { error: "Forbidden." });
    return;
  }

  const filePath = path.normalize(path.join(root, route));

  if (!filePath.startsWith(root)) {
    json(res, 403, { error: "Forbidden." });
    return;
  }

  try {
    const data = await fs.readFile(filePath);
    res.writeHead(200, { "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  } catch {
    notFound(res);
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url.pathname);
      return;
    }
    await serveStatic(req, res, url.pathname);
  } catch (error) {
    json(res, 500, { error: error.message || "Server error." });
  }
});

server.listen(port, host, () => {
  const localUrl = host === "0.0.0.0" ? `http://127.0.0.1:${port}` : `http://${host}:${port}`;
  console.log(`From Dirt to GPUs running at ${localUrl}/`);
  console.log(`Admin dashboard: ${localUrl}/admin`);
  console.log(`Admin username: ${adminUsername}`);
  console.log(`Admin password: ${adminPassword}`);
  console.log("Set FDTG_ADMIN_PASSWORD before launch. The current default is for local dev only.");
});
