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
  if (!packed && !raw) {
    throw new Error("neither GOOGLE_PRIVATE_KEY nor GOOGLE_PRIVATE_KEY_B64 is set");
  }

  let key = packed
    ? Buffer.from(packed.trim().replace(/\s+/g, ""), "base64").toString("utf8")
    : raw;

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

  const issuer = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  if (!issuer) throw new Error("GOOGLE_SERVICE_ACCOUNT_EMAIL is not set");

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: issuer, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600
  }));
  const unsigned = header + "." + claims;
  const signature = b64url(crypto.createSign("RSA-SHA256").update(unsigned).sign(privateKey()));

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

module.exports = { accessToken, sheets, spreadsheetId };
