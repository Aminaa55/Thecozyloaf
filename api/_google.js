"use strict";

/* ═══════════════════════════════════════════════════════════════
   Google service-account access, with no npm dependencies.

   A service account authenticates by signing a short-lived JWT with
   its private key and trading that for an access token. The official
   googleapis package does exactly this, in about fifteen lines of
   crypto — and pulling in that package would mean adding a
   package.json to a repository that has never needed one, which would
   change how Vercel builds the site. Node's own crypto and fetch do
   the job, so the deploy stays a plain static upload plus functions.

   Nothing in this file is reachable from the browser: files in api/
   whose names begin with an underscore are not routed by Vercel.
   The private key only ever exists in Vercel's environment.
   ═══════════════════════════════════════════════════════════════ */

const crypto = require("node:crypto");

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";

/* A warm Vercel container serves many requests in a row. Minting and
   exchanging a JWT costs a round trip to Google, so the token is kept
   until a minute before it expires; a cold container just mints one. */
let cachedToken = null;

/* The whole service-account JSON file, pasted as one value.

   This is by far the easiest thing for a person to get right: open the
   file, select all, copy, paste. The alternative is selecting a single
   two-thousand-character line out of that file without catching either
   quote mark, and getting it a character wrong produces a PEM error
   that explains nothing about what went wrong.

   Parsed once and remembered: a container serves many requests and the
   value cannot change under it. */
let serviceJson;

function fromJson() {
  if (serviceJson !== undefined) return serviceJson;

  /* GOOGLE_PRIVATE_KEY is checked too, because pasting the whole file
     into the variable named "private key" is an obvious thing to do and
     there is no reason to punish it. */
  let raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw || !raw.trim()) {
    const spill = (process.env.GOOGLE_PRIVATE_KEY || "").trim();
    if (spill.startsWith("{")) raw = spill;
  }
  if (!raw || !raw.trim()) { serviceJson = null; return null; }
  try {
    const parsed = JSON.parse(raw.trim());
    if (parsed && parsed.private_key) {
      serviceJson = parsed;
    } else {
      serviceJson = null;
      console.warn("[google] GOOGLE_SERVICE_ACCOUNT_JSON parsed, but has no private_key in it");
    }
  } catch (e) {
    serviceJson = null;
    console.warn("[google] GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON \u2014 paste the whole file, " +
      "from the opening { to the closing }");
  }
  return serviceJson;
}

function b64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/* The key is a multi-line PEM, and the service-account JSON file holds
   it as one long line with literal \n sequences in it. Copying that
   value straight into a dashboard field is by far the easiest thing for
   a person to do, and by far the most common thing to get subtly wrong:
   the quotes come along, or a trailing newline does, or the \n stay
   escaped — and every one of those surfaces as the same baffling
   "error:0909006C:PEM routines::no start line".

   So rather than insist on a tidy format, this accepts every form the
   key realistically arrives in and tidies it up: either variable, with
   or without wrapping quotes, escaped or real newlines. If it still
   cannot find a PEM, it says so in words that name the fix instead of
   leaving a crypto error to be decoded. */
function privateKey() {
  const packed = process.env.GOOGLE_PRIVATE_KEY_B64;
  const raw = process.env.GOOGLE_PRIVATE_KEY;
  const json = fromJson();

  /* A key pasted into the variable meant for the file, or a file
     pasted into the variable meant for the key: both are easy mistakes
     to make when the two sit next to each other, and neither is worth
     a failed deploy. Whichever variable it arrived in, if it carries a
     PEM it is used as one. */
  const spilled = (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "").trim();
  /* Starts with, not merely contains: half a JSON file carries a BEGIN
     marker somewhere inside it, and treating that as a key would answer
     a truncated paste by complaining about the key rather than about
     the truncation. */
  const spilledIsKey = !json && /^-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(spilled);
  const rawIsFile = (raw || "").trim().startsWith("{");

  if (!packed && !json && !raw && !spilledIsKey) {
    throw new Error(
      "no service-account credentials are set \u2014 paste the whole downloaded " +
      "JSON file into GOOGLE_SERVICE_ACCOUNT_JSON, or set GOOGLE_PRIVATE_KEY on its own"
    );
  }

  let key = packed
    ? Buffer.from(packed.trim().replace(/\s+/g, ""), "base64").toString("utf8")
    : ((rawIsFile ? null : raw) || (json && json.private_key) || (spilledIsKey ? spilled : null));

  key = key.trim();
  /* A value copied with its JSON quotes still attached. */
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }
  /* Literal backslash-n, as the JSON file writes them. */
  key = key.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\r\n/g, "\n").trim();

  if (!/^-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(key)) {
    throw new Error(
      "the private key is not readable — it must start with " +
      "-----BEGIN PRIVATE KEY----- . Copy the whole private_key value out of " +
      "the service-account JSON file, without the surrounding quotes."
    );
  }
  if (!/-----END [A-Z ]*PRIVATE KEY-----$/.test(key)) {
    throw new Error("the private key is cut off — it must end with -----END PRIVATE KEY-----");
  }
  return key + "\n";
}

async function accessToken() {
  if (cachedToken && cachedToken.expires > Date.now() + 60000) return cachedToken.token;

  /* The key is resolved first on purpose. When nothing at all has been
     configured, "paste the whole downloaded JSON file" is the useful
     thing to say; checking the address first would answer with a
     missing-variable name instead, which is true but unhelpful. */
  const key = privateKey();

  /* The address comes free with the pasted file, so it only needs
     setting separately when the key was supplied on its own. */
  const json = fromJson();
  const issuer = (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "").trim() ||
                 (json && json.client_email);
  if (!issuer) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_EMAIL is not set, and no client_email was found " +
      "in GOOGLE_SERVICE_ACCOUNT_JSON");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: issuer, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600
  }));
  const unsigned = header + "." + claims;
  const signature = b64url(crypto.createSign("RSA-SHA256").update(unsigned).sign(key));

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: unsigned + "." + signature
    })
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    throw new Error("Google refused the service account (" + res.status + "): " +
      (body.error_description || body.error || "no access token returned"));
  }

  cachedToken = { token: body.access_token, expires: Date.now() + (body.expires_in || 3600) * 1000 };
  return cachedToken.token;
}

function spreadsheetId() {
  const id = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!id) throw new Error("GOOGLE_SHEETS_SPREADSHEET_ID is not set");
  return id.trim();
}

/* One call into the Sheets REST API. Errors carry Google's own message,
   which is the difference between "403" and "the sheet has not been
   shared with the service account". */
async function sheets(method, path, body) {
  const token = await accessToken();
  const res = await fetch(SHEETS_API + "/" + encodeURIComponent(spreadsheetId()) + path, {
    method: method,
    headers: Object.assign(
      { Authorization: "Bearer " + token },
      body ? { "Content-Type": "application/json" } : {}
    ),
    body: body ? JSON.stringify(body) : undefined
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error("Google Sheets " + res.status + ": " +
      ((json.error && json.error.message) || res.statusText || "unknown error"));
    err.status = res.status;
    throw err;
  }
  return json;
}

/* ── What did we actually get? ─────────────────────────────────
   A value that is set but unusable, and a value that was never set at
   all, produce the same failure from the outside, and the console
   warning that tells them apart is not visible to whoever is doing the
   setting up. This reports the shape of each variable — whether it is
   present, how long it is, how it begins and ends — so the difference
   between "not saved", "pasted half", and "pasted something else" is
   visible on the page.

   No secret value is ever included: lengths and the first and last few
   characters of a JSON wrapper only, never any part of the key. */
function describe(name) {
  const raw = process.env[name];
  if (raw === undefined) return name + ": not set";
  const value = raw.trim();
  if (!value) return name + ": set but empty";

  const shape = value.length + " characters, starts " + JSON.stringify(value.slice(0, 1)) +
    ", ends " + JSON.stringify(value.slice(-1));

  if (value.startsWith("{")) {
    try {
      const parsed = JSON.parse(value);
      const has = [];
      if (parsed.private_key) has.push("private_key");
      if (parsed.client_email) has.push("client_email");
      if (parsed.project_id) has.push("project_id");
      return name + ": valid JSON, " + shape +
        (has.length ? ", contains " + has.join(" + ") : ", but none of the expected fields");
    } catch (e) {
      return name + ": starts like JSON but will not parse (" + e.message + "), " + shape +
        " — the whole file is needed, from the opening { to the closing }";
    }
  }
  if (/^-----BEGIN/.test(value)) return name + ": looks like a PEM key, " + shape;

  /* Not JSON and not a clean PEM. Report which landmarks are in there,
     so a clipped selection can be told from the wrong value entirely.
     Only whether each marker is present — never any surrounding text. */
  const marks = [
    ['"type": "service_account"', /"type"\s*:\s*"service_account"/],
    ["\"private_key\"", /"private_key"/],
    ["\"client_email\"", /"client_email"/],
    ["BEGIN PRIVATE KEY", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
    ["END PRIVATE KEY", /-----END [A-Z ]*PRIVATE KEY-----/]
  ].filter(m => m[1].test(value)).map(m => m[0]);

  return name + ": " + shape +
    (marks.length ? ", contains " + marks.join(" + ") : ", none of the expected landmarks in it") +
    " \u2014 the whole file is needed, from the opening { to the closing }";
}

function credentialReport() {
  return [
    "GOOGLE_SERVICE_ACCOUNT_JSON",
    "GOOGLE_PRIVATE_KEY",
    "GOOGLE_PRIVATE_KEY_B64",
    "GOOGLE_SERVICE_ACCOUNT_EMAIL",
    "GOOGLE_SHEETS_SPREADSHEET_ID",
    "ORDER_SHEET_TAB"
  ].map(describe);
}

module.exports = { accessToken, sheets, spreadsheetId, credentialReport };

/* For the local test harness; Vercel ignores extra keys. */
module.exports.__reset = () => { cachedToken = null; serviceJson = undefined; };
