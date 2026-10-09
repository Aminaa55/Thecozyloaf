"use strict";

/* ═══════════════════════════════════════════════════════════════
   POST /api/order  —  append one placed order to the bakery's sheet.

   The browser cannot be trusted with a Google credential, so it posts
   the order here and this function, running on Vercel with the service
   account in its environment, writes the row.

   Three things this deliberately is not:

   · It is not the order. The order is the email. If this endpoint is
     down, misconfigured or slow, the customer still gets their
     confirmation and the bakery still gets its email — the browser
     treats a failure here as nothing more than a missing row.
   · It is not a source of truth for prices. config.js is. This checks
     that the figures it is handed are internally consistent and within
     sane bounds, rather than keeping a second price list that could
     drift out of step with the one the website actually charges.
   · It is not authenticated. A public static site has no secret to
     prove it is the site, and putting one in index.html would be
     theatre. What protects the sheet instead: strict validation, an
     Origin check, a quantity ceiling, a per-container rate limit, and
     a de-duplicating read. The worst a stranger achieves is a junk row
     the owners can delete — no credential is exposed either way.
   ═══════════════════════════════════════════════════════════════ */

const { sheets } = require("./_google.js");

const TAB = (process.env.ORDER_SHEET_TAB || "Orders").trim();
const TIMEZONE = (process.env.ORDER_TIMEZONE || "Africa/Cairo").trim();

/* Which quantity column each loaf is counted in. The keys are the
   product keys in config.js; the numbers are zero-based positions in
   the fifteen-column row below.

   Adding a fourth loaf to config.js means adding a column to the
   Orders sheet and an entry here. Until that happens an unknown loaf
   is not dropped — it still counts towards Total Loaves and Revenue,
   and the order is still logged. A missing column is a reporting gap;
   a missing order would be a lost sale. */
const QTY_COLUMN = { plain: 8, olive: 9, blackOlive: 10 };

const COLUMNS = 15;                 /* A … O */
const MAX_QUANTITY = 20;            /* mirrors maxPerLoaf in config.js */

/* Bounds, not a price list. A loaf has never cost less than 200 EGP or
   anything like 5000, so this range can hold while config.js raises or
   lowers prices freely — which is the point: the website's prices stay
   defined in exactly one place.

   What this cannot do is tell a real 230 from a crafted 250. No public
   endpoint on a static site can: there is no secret the browser could
   hold to prove it is the website, and putting one in index.html would
   only publish it. The bounds stop a stranger writing an absurd figure;
   they do not stop a plausible one. That residue is a junk row the
   owners can delete, which is the worst outcome available here, and no
   credential is exposed on any path. */
const MIN_UNIT_PRICE = 50;
const MAX_UNIT_PRICE = 5000;
const REFERENCE = /^CL-\d{6}-[A-Z0-9]{4}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* ── A rate limit that is honest about what it is ──────────────
   Serverless functions share no memory, so this only limits one
   container. That still blunts a naive flood from a single source,
   costs nothing, and cannot wrongly reject a real customer at the
   volumes this bakery sees. Durable limiting would need a store, and
   a store is not worth adding to protect a spreadsheet. */
const WINDOW_MS = 60000;
const MAX_PER_WINDOW = 12;
const seen = new Map();

function rateLimited(ip) {
  const now = Date.now();
  for (const [key, hits] of seen) {
    const live = hits.filter(t => now - t < WINDOW_MS);
    if (live.length) seen.set(key, live); else seen.delete(key);
  }
  const hits = seen.get(ip) || [];
  if (hits.length >= MAX_PER_WINDOW) return true;
  hits.push(now);
  seen.set(ip, hits);
  return false;
}

/* ── Helpers ──────────────────────────────────────────────────── */

function clean(value, max) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function isWhole(n, min, max) {
  return typeof n === "number" && Number.isFinite(n) && Number.isInteger(n) && n >= min && n <= max;
}

/* The customer's clock produced placedAt, and a customer's clock can be
   wrong, or in another country. Date and Time are stamped here instead,
   in the bakery's own timezone, so the sheet can never show an order
   placed tomorrow.

   The date is written as plain ISO text rather than a Sheets serial
   number: it is readable the moment it lands, with no column to format,
   and ISO text sorts and compares chronologically, so the Dashboard's
   today / this week / this month formulas work on it directly. */
function stamp() {
  let parts;
  try {
    parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: TIMEZONE, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit"
    }).formatToParts(new Date());
  } catch (e) {
    parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "UTC", hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit"
    }).formatToParts(new Date());
  }
  const p = {};
  parts.forEach(part => { p[part.type] = part.value; });
  return { date: p.year + "-" + p.month + "-" + p.day, time: p.hour + ":" + p.minute };
}

/* Vercel pre-parses a JSON body; the stream is the fallback. Either
   way a parse failure reports itself in our own words rather than
   quoting the body back into the response. */
async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;

  let raw;
  if (typeof req.body === "string") {
    raw = req.body;
  } else {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    raw = Buffer.concat(chunks).toString("utf8");
  }
  if (!raw) return {};

  try { return JSON.parse(raw); }
  catch (e) { throw new Error("the request body is not valid JSON"); }
}

/* ── Validation ───────────────────────────────────────────────
   Returns the row to append, or throws a message fit to log. */
function buildRow(order) {
  if (!order || typeof order !== "object") throw new Error("no order in the request body");

  const reference = clean(order.reference, 32);
  if (!REFERENCE.test(reference)) throw new Error("reference is not in the CL-YYMMDD-XXXX form");

  const c = order.customer && typeof order.customer === "object" ? order.customer : {};
  const fullName = clean(c.fullName, 120);
  const mobile = clean(c.mobile, 25);
  const email = clean(c.email, 180);
  const address = clean(c.address, 400);
  const area = clean(c.area, 80);

  if (fullName.length < 2) throw new Error("customer name is missing");
  if (mobile.replace(/\D/g, "").length < 10) throw new Error("mobile number is too short");
  if (!EMAIL.test(email)) throw new Error("email address is not valid");
  if (address.length < 6) throw new Error("delivery address is missing");
  if (!area) throw new Error("delivery area is missing");

  const items = Array.isArray(order.items) ? order.items : [];
  if (!items.length) throw new Error("the order has no loaves in it");
  if (items.length > 12) throw new Error("too many line items");

  /* Prices come from config.js by way of the browser. They are not
     re-derived here — they are checked for internal consistency, so a
     tampered payload cannot invent revenue, while a genuine price
     change in config.js needs no matching edit in this file. */
  const quantities = new Array(COLUMNS).fill(0);
  let loaves = 0;
  let revenue = 0;
  const unmapped = [];

  for (const item of items) {
    if (!item || typeof item !== "object") throw new Error("a line item is malformed");
    const id = clean(item.id, 40);
    if (!id) throw new Error("a line item has no product id");
    if (!isWhole(item.quantity, 1, MAX_QUANTITY)) throw new Error("quantity for " + id + " is out of range");
    if (!isWhole(item.unitPrice, MIN_UNIT_PRICE, MAX_UNIT_PRICE)) throw new Error("unit price for " + id + " is out of range");

    const expected = item.unitPrice * item.quantity;
    if (isWhole(item.lineTotal, 0, MAX_UNIT_PRICE * MAX_QUANTITY) && item.lineTotal !== expected) {
      throw new Error("line total for " + id + " does not match its quantity and price");
    }

    const column = QTY_COLUMN[id];
    if (column === undefined) unmapped.push(id);
    else quantities[column] += item.quantity;

    loaves += item.quantity;
    revenue += expected;
  }

  if (typeof order.subtotal === "number" && Number.isFinite(order.subtotal) && order.subtotal !== revenue) {
    throw new Error("subtotal does not match the line items");
  }

  const when = stamp();
  const row = new Array(COLUMNS).fill("");
  row[0] = reference;
  row[1] = when.date;
  row[2] = when.time;
  row[3] = fullName;
  /* Left as text, with no parsing, so an Egyptian 01… number keeps
     its leading zero instead of becoming a number. */
  row[4] = mobile;
  row[5] = email;
  row[6] = address;
  row[7] = area;
  row[8] = quantities[8];
  row[9] = quantities[9];
  row[10] = quantities[10];
  row[11] = loaves;
  row[12] = revenue;
  row[13] = clean(order.notes, 1000);
  row[14] = "New";

  return { reference: reference, row: row, unmapped: unmapped };
}

/* ── De-duplication ───────────────────────────────────────────
   The order reference is the idempotency key. A keepalive request that
   lands twice, or a queued retry for a row that actually did arrive,
   must not produce a second line. */
async function alreadyLogged(reference) {
  const range = encodeURIComponent(TAB + "!A2:A");
  const res = await sheets("GET", "/values/" + range + "?majorDimension=COLUMNS");
  const column = (res.values && res.values[0]) || [];
  return column.some(cell => String(cell).trim() === reference);
}

/* ── Handler ─────────────────────────────────────────────────── */
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method not allowed" });
  }

  /* A request from another site is refused; a request with no Origin at
     all is not. Browsers may omit Origin on a same-origin post, and
     losing a real order to a header technicality would be a far worse
     outcome than accepting one that has no Origin to check. */
  const origin = req.headers.origin;
  if (origin) {
    let host = "";
    try { host = new URL(origin).host; } catch (e) { host = ""; }
    const allowed = (process.env.ALLOWED_ORIGIN_HOST || "").trim();
    const ok = host && (
      host === req.headers.host ||
      host === allowed ||
      /(^|\.)vercel\.app$/.test(host) ||
      /^localhost(:\d+)?$/.test(host) ||
      /^127\.0\.0\.1(:\d+)?$/.test(host)
    );
    if (!ok) return res.status(403).json({ ok: false, error: "origin not allowed" });
  }

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (rateLimited(ip)) return res.status(429).json({ ok: false, error: "too many orders too quickly" });

  let prepared;
  try {
    prepared = buildRow(await readBody(req));
  } catch (err) {
    /* A rejected payload will never become valid, so the browser is
       told not to keep retrying it. */
    console.warn("[order] rejected: " + err.message);
    return res.status(400).json({ ok: false, error: err.message, retry: false });
  }

  if (prepared.unmapped.length) {
    console.warn("[order] " + prepared.reference + " contains loaves with no quantity column: " +
      prepared.unmapped.join(", ") + " — counted in Total Loaves and Revenue only");
  }

  try {
    if (await alreadyLogged(prepared.reference)) {
      console.log("[order] " + prepared.reference + " is already in the sheet; nothing appended");
      return res.status(200).json({ ok: true, duplicate: true, reference: prepared.reference });
    }

    await sheets(
      "POST",
      "/values/" + encodeURIComponent(TAB + "!A:O") +
        ":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS",
      { values: [prepared.row] }
    );

    console.log("[order] " + prepared.reference + " appended to " + TAB);
    return res.status(200).json({ ok: true, reference: prepared.reference });
  } catch (err) {
    /* Google is unhappy, or unreachable. The order is already emailed
       and confirmed; this row can be retried later. */
    console.error("[order] " + prepared.reference + " could not be written: " + err.message);
    return res.status(502).json({ ok: false, error: "the order sheet is unavailable", retry: true });
  }
};

/* Exported for the local test harness only; Vercel ignores extra keys. */
module.exports.__test = { buildRow: buildRow, stamp: stamp, rateLimited: rateLimited };
