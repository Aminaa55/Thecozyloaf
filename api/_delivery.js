"use strict";

/* ═══════════════════════════════════════════════════════════════
   Delivery dates, server side.

   The browser already refused anything invalid twice over: the
   calendar makes the notice period unselectable, and the submit
   check re-derives the rule from the clock rather than reading the
   min attribute, so editing the markup achieves nothing. This is the
   third pass, and it exists for one reason — a row in the order
   sheet must never claim a delivery date the bakery could not have
   accepted, whatever was posted at the endpoint.

   The blocked-date list is not duplicated here. It is read out of
   config.js, which is the one file the owners edit, so a date
   blocked for the checkout is blocked for the sheet by the same
   keystroke.
   ═══════════════════════════════════════════════════════════════ */

const fs = require("node:fs");
const path = require("node:path");

const TIMEZONE = (process.env.ORDER_TIMEZONE || "Africa/Cairo").trim();

/* ── Calendar arithmetic ──────────────────────────────────────
   Dates are handled as ISO text and stepped through Date.UTC, never
   as local dates. Egypt still moves its clocks in April and October,
   and adding days across one of those boundaries with a local date
   lands an hour out, which is all it takes to slip a day. */

function isoInZone(when) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(when);
  } catch (e) {
    parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(when);
  }
  const p = {};
  parts.forEach(x => { p[x.type] = x.value; });
  return p.year + "-" + p.month + "-" + p.day;
}

function today() {
  return isoInZone(new Date());
}

function addDays(iso, days) {
  const p = iso.split("-").map(Number);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2] + days)).toISOString().slice(0, 10);
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/* ── The owners' settings, read from config.js ────────────────
   vercel.json tells Vercel to ship config.js alongside this
   function. The file is only ever read as text and scanned with a
   regular expression — never evaluated — so nothing in it can run
   here.

   Block comments are stripped first. config.js documents the list
   with a worked example inside a comment, and matching the first
   occurrence of the key would otherwise pick up the example's dates
   and quietly block two days nobody asked to block. */
let settings = null;

function readSettings() {
  if (settings) return settings;

  const candidates = [
    path.join(process.cwd(), "config.js"),
    path.join(__dirname, "..", "config.js"),
    path.join(__dirname, "config.js"),
    "/var/task/config.js"
  ];

  let source = null, found = null;
  for (const candidate of candidates) {
    try {
      source = fs.readFileSync(candidate, "utf8");
      found = candidate;
      break;
    } catch (e) { /* try the next one */ }
  }

  if (source === null) {
    /* The notice period needs no list and is unaffected. Only the
       blocked dates are lost, and the browser still refuses them, so
       this degrades rather than breaks — but it is worth shouting
       about, because it means includeFiles is not doing its job. */
    console.warn("[delivery] config.js not found in " + candidates.join(", ") +
      " — blocked delivery dates will come from UNAVAILABLE_DELIVERY_DATES only");
    settings = { notice: 4, maxAhead: 60, blocked: fromEnv(), source: null };
    return settings;
  }

  const bare = source.replace(/\/\*[\s\S]*?\*\//g, " ");
  const block = bare.match(/unavailableDeliveryDates\s*:\s*\[([\s\S]*?)\]/);
  const listed = block ? (block[1].match(/\d{4}-\d{2}-\d{2}/g) || []) : [];

  const notice = Number((bare.match(/noticeDays\s*:\s*(\d+)/) || [])[1]) || 4;
  const maxAhead = Number((bare.match(/maxDaysAhead\s*:\s*(\d+)/) || [])[1]) || 60;

  /* Both sources are honoured, so a date can be blocked in a hurry
     from the Vercel dashboard without a commit. */
  const blocked = Array.from(new Set(listed.concat(fromEnv())));

  settings = { notice: notice, maxAhead: maxAhead, blocked: blocked, source: found };
  console.log("[delivery] " + found + ": " + notice + " days' notice, " +
    maxAhead + " days ahead, " + blocked.length + " blocked date(s)");
  return settings;
}

function fromEnv() {
  return String(process.env.UNAVAILABLE_DELIVERY_DATES || "").match(/\d{4}-\d{2}-\d{2}/g) || [];
}

/* ── The check ────────────────────────────────────────────────
   Measured from the day the order was placed, not from the day this
   runs. A row that failed to write and is retried two days later was
   perfectly valid when the customer placed it, and re-checking it
   against today would throw away a real order for being old.

   placedAt comes from the customer's browser and so cannot be
   trusted on its own. It is only ever allowed to move the notice
   period earlier, and never past the separate rule that a delivery
   date may not already be in the past — so the most a forged
   timestamp can buy is a date one day out, which is a junk row the
   owners can delete, not a credential or a lost order. */
function problem(deliveryDate, placedAt) {
  const cfg = readSettings();
  if (!ISO.test(String(deliveryDate || ""))) return "no delivery date";

  const now = today();

  let placed = now;
  if (placedAt) {
    const when = new Date(placedAt);
    if (!isNaN(when.getTime()) && when.getTime() <= Date.now() + 86400000) {
      const asIso = isoInZone(when);
      if (ISO.test(asIso) && asIso < placed) placed = asIso;
    }
  }

  if (deliveryDate < now) {
    return "delivery date " + deliveryDate + " is in the past (today is " + now + ")";
  }
  const earliest = addDays(placed, cfg.notice - 1);
  if (deliveryDate < earliest) {
    return "delivery date " + deliveryDate + " does not allow " + cfg.notice +
      " days' notice from " + placed + " (earliest " + earliest + ")";
  }
  if (cfg.blocked.indexOf(deliveryDate) !== -1) {
    return "the bakery is not delivering on " + deliveryDate;
  }
  const latest = addDays(placed, cfg.maxAhead);
  if (deliveryDate > latest) {
    return "delivery date " + deliveryDate + " is further ahead than " + cfg.maxAhead + " days";
  }
  return "";
}

/* Exposed so the order endpoint can stamp Date and Time from the
   same clock and the same timezone the check uses. */
function stamp() {
  let parts;
  try {
    parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: TIMEZONE, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
    }).formatToParts(new Date());
  } catch (e) {
    parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "UTC", hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
    }).formatToParts(new Date());
  }
  const p = {};
  parts.forEach(x => { p[x.type] = x.value; });
  return { date: p.year + "-" + p.month + "-" + p.day, time: p.hour + ":" + p.minute };
}

module.exports = { problem, stamp, today, addDays, isoInZone, readSettings, ISO };

/* For the local test harness; Vercel ignores extra keys. */
module.exports.__reset = () => { settings = null; };
