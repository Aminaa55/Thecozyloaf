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

/* The key is a multi-line PEM. Pasting one of those into a dashboard
   field is the classic source of "PEM routines::no start line", so the
   base64 form is preferred — one opaque line that cannot be mangled.
   The raw form is accepted too, with the usual \n unescaping. */
function privateKey() {
  const packed = process.env.GOOGLE_PRIVATE_KEY_B64;
  if (packed) return Buffer.from(packed.trim(), "base64").toString("utf8");
  const raw = process.env.GOOGLE_PRIVATE_KEY;
  if (raw) return raw.replace(/\\n/g, "\n");
  throw new Error("GOOGLE_PRIVATE_KEY_B64 is not set");
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
