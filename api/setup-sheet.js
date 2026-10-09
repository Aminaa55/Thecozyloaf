"use strict";

/* ═══════════════════════════════════════════════════════════════
   GET /api/setup-sheet?token=…  —  build the two tabs, once.

   Everything this does could be done by hand in the Sheets UI, but it
   is twenty formulas, a dropdown, a frozen row, two number formats and
   two charts: a long afternoon of clicking, and every one of those
   clicks a chance to mistype a range. Doing it from here means the
   owners only ever create an empty spreadsheet and share it.

   It is safe to run more than once. Tabs and charts that already exist
   are left alone; the header row, the formulas and the formatting are
   simply written again with the same values. It never touches order
   rows — nothing here writes below row 1 of the Orders tab.

   Reaching it needs ORDER_SHEET_SETUP_TOKEN, which lives only in
   Vercel's environment. Without that variable set the route refuses
   outright, so it is closed by default.
   ═══════════════════════════════════════════════════════════════ */

const crypto = require("node:crypto");
const { sheets } = require("./_google.js");

const ORDERS = (process.env.ORDER_SHEET_TAB || "Orders").trim();
const DASH = "Dashboard";

/* Quoted so a tab renamed to something with a space still works. */
const SRC = "'" + ORDERS.replace(/'/g, "''") + "'";

const HEADERS = [
  "Order Number", "Date", "Time", "Customer Name", "Mobile", "Email",
  "Address", "Area", "Plain Qty", "Green Olive Qty", "Black Olive Qty",
  "Total Loaves", "Revenue", "Notes", "Status"
];

const STATUSES = ["New", "Confirmed", "Baking", "Out for Delivery", "Delivered", "Cancelled"];

/* The window figures compare ISO date text, which sorts chronologically,
   so no date parsing is needed anywhere. SUMPRODUCT is used rather than
   SUMIFS because SUMIFS criteria that look like dates can be coerced to
   real dates, and would then silently match nothing against a text
   column. The bound of 20000 rows is far beyond any plausible order
   count and keeps the comparison explicit. */
const LAST = 20000;
const B = SRC + "!$B$2:$B$" + LAST;
const M = SRC + "!$M$2:$M$" + LAST;
const MONTH_START = 'TEXT(EOMONTH(TODAY(),-1)+1,"yyyy-mm-dd")';
const WEEK_START = 'TEXT(TODAY()-WEEKDAY(TODAY(),2)+1,"yyyy-mm-dd")';

function rgb(hex) {
  return {
    red: parseInt(hex.slice(1, 3), 16) / 255,
    green: parseInt(hex.slice(3, 5), 16) / 255,
    blue: parseInt(hex.slice(5, 7), 16) / 255
  };
}
const PAPER = rgb("#F8EBD4");
const INK = rgb("#924A23");

function tokenOk(given) {
  const want = process.env.ORDER_SHEET_SETUP_TOKEN || "";
  if (!want) return false;
  const a = Buffer.from(String(given || ""));
  const b = Buffer.from(want);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ── The Dashboard, as cell ranges ───────────────────────────── */
function dashboardValues() {
  return [
    { range: DASH + "!A1", values: [["The Cozy Loaf — Orders Dashboard"]] },

    { range: DASH + "!A3:B6", values: [
      ["Total Revenue (EGP)", "=SUM(" + SRC + "!M2:M)"],
      ["Total Orders", "=COUNTA(" + SRC + "!A2:A)"],
      ["Total Loaves Sold", "=SUM(" + SRC + "!L2:L)"],
      ["Average Order Value (EGP)", "=IFERROR(ROUND(B3/B4,2),0)"]
    ]},

    { range: DASH + "!A8:B11", values: [
      ["Plain Sourdough — loaves sold", "=SUM(" + SRC + "!I2:I)"],
      ["Green Olive Sourdough — loaves sold", "=SUM(" + SRC + "!J2:J)"],
      ["Black Olive Sourdough — loaves sold", "=SUM(" + SRC + "!K2:K)"],
      ["Best-Selling Product", '=IF(SUM(B8:B10)=0,"—",INDEX($H$3:$H$5,MATCH(MAX(B8:B10),B8:B10,0)))']
    ]},

    { range: DASH + "!A13:B16", values: [
      ["Revenue Today (EGP)", '=SUMPRODUCT((' + B + '=TEXT(TODAY(),"yyyy-mm-dd"))*' + M + ")"],
      ["Revenue This Week (EGP)", "=SUMPRODUCT((" + B + ">=" + WEEK_START + ")*" + M + ")"],
      ["Revenue This Month (EGP)", "=SUMPRODUCT((" + B + ">=" + MONTH_START + ")*" + M + ")"],
      ["Orders This Month", "=SUMPRODUCT(--(" + B + ">=" + MONTH_START + "))"]
    ]},

    { range: DASH + "!A18:B24", values: [["Orders by status", ""]].concat(
      STATUSES.map((s, i) => [s, "=COUNTIF(" + SRC + "!$O$2:$O,$A" + (19 + i) + ")"])
    )},

    /* The feed behind the "Revenue over time" chart. Each formula
       returns exactly one row per day with an order in it — no padding,
       so the chart has no phantom zero points to draw. */
    { range: DASH + "!D2:F3", values: [
      ["Date", "Revenue (EGP)", "Orders"],
      [
        '=IFERROR(SORT(UNIQUE(FILTER(' + SRC + "!B2:B," + SRC + '!B2:B<>""))),"")',
        '=IFERROR(ARRAYFORMULA(SUMIF(' + SRC + "!$B$2:$B,FILTER($D$3:$D,$D$3:$D<>\"\")," + SRC + '!$M$2:$M)),"")',
        '=IFERROR(ARRAYFORMULA(COUNTIF(' + SRC + '!$B$2:$B,FILTER($D$3:$D,$D$3:$D<>""))),"")'
      ]
    ]},

    /* The feed behind the "Loaves sold by product" chart. Unit Price is
       typed, not derived: the Orders sheet records what each order was
       worth in total, not per loaf, so a per-product revenue split needs
       the price stated somewhere. Total Revenue above never depends on
       it, so a stale price here cannot distort the real takings. */
    { range: DASH + "!H2:K5", values: [
      ["Product", "Loaves Sold", "Unit Price (EGP) — edit if prices change", "Revenue (EGP)"],
      ["Plain Sourdough", "=B8", 230, "=I3*J3"],
      ["Green Olive Sourdough", "=B9", 250, "=I4*J4"],
      ["Black Olive Sourdough", "=B10", 250, "=I5*J5"]
    ]}
  ];
}

/* ── Formatting and charts ───────────────────────────────────── */
function formatRequests(ordersId, dashId, existingCharts) {
  const req = [];

  /* Orders: a frozen, branded header the owners can scroll under. */
  req.push({ updateSheetProperties: {
    properties: { sheetId: ordersId, gridProperties: { frozenRowCount: 1 } },
    fields: "gridProperties.frozenRowCount"
  }});
  req.push({ repeatCell: {
    range: { sheetId: ordersId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 15 },
    cell: { userEnteredFormat: {
      backgroundColor: PAPER,
      textFormat: { bold: true, foregroundColor: INK },
      verticalAlignment: "MIDDLE"
    }},
    fields: "userEnteredFormat(backgroundColor,textFormat,verticalAlignment)"
  }});

  /* Mobile numbers are plain text, so neither the API nor a later edit
     by hand can turn 01012345678 into 1012345678. */
  req.push({ repeatCell: {
    range: { sheetId: ordersId, startRowIndex: 1, startColumnIndex: 4, endColumnIndex: 5 },
    cell: { userEnteredFormat: { numberFormat: { type: "TEXT" } } },
    fields: "userEnteredFormat.numberFormat"
  }});

  /* Revenue reads as money without a currency symbol fighting the
     column of plain loaf counts beside it. */
  req.push({ repeatCell: {
    range: { sheetId: ordersId, startRowIndex: 1, startColumnIndex: 12, endColumnIndex: 13 },
    cell: { userEnteredFormat: { numberFormat: { type: "NUMBER", pattern: "#,##0" } } },
    fields: "userEnteredFormat.numberFormat"
  }});

  /* Address and Notes hold sentences; everything else holds a word. */
  req.push({ updateDimensionProperties: {
    range: { sheetId: ordersId, dimension: "COLUMNS", startIndex: 6, endIndex: 7 },
    properties: { pixelSize: 260 }, fields: "pixelSize"
  }});
  req.push({ updateDimensionProperties: {
    range: { sheetId: ordersId, dimension: "COLUMNS", startIndex: 13, endIndex: 14 },
    properties: { pixelSize: 220 }, fields: "pixelSize"
  }});

  /* The editable status. An unbounded range means every future row
     inherits the dropdown the moment it is appended. */
  req.push({ setDataValidation: {
    range: { sheetId: ordersId, startRowIndex: 1, startColumnIndex: 14, endColumnIndex: 15 },
    rule: {
      condition: { type: "ONE_OF_LIST", values: STATUSES.map(s => ({ userEnteredValue: s })) },
      strict: true,
      showCustomUi: true
    }
  }});

  /* Dashboard: the labels bold, the title larger. */
  req.push({ repeatCell: {
    range: { sheetId: dashId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 },
    cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 14, foregroundColor: INK } } },
    fields: "userEnteredFormat.textFormat"
  }});
  req.push({ repeatCell: {
    range: { sheetId: dashId, startRowIndex: 2, endRowIndex: 24, startColumnIndex: 0, endColumnIndex: 1 },
    cell: { userEnteredFormat: { textFormat: { bold: true } } },
    fields: "userEnteredFormat.textFormat"
  }});
  req.push({ updateDimensionProperties: {
    range: { sheetId: dashId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 },
    properties: { pixelSize: 300 }, fields: "pixelSize"
  }});
  req.push({ updateDimensionProperties: {
    range: { sheetId: dashId, dimension: "COLUMNS", startIndex: 9, endIndex: 10 },
    properties: { pixelSize: 240 }, fields: "pixelSize"
  }});

  /* Charts are added only once. Re-running setup must not stack a
     second copy on top of a chart the owners have since moved. */
  const have = new Set(existingCharts);
  if (!have.has("Revenue over time")) {
    req.push({ addChart: { chart: {
      spec: {
        title: "Revenue over time",
        basicChart: {
          chartType: "LINE",
          legendPosition: "NO_LEGEND",
          headerCount: 1,
          axis: [
            { position: "BOTTOM_AXIS", title: "Date" },
            { position: "LEFT_AXIS", title: "Revenue (EGP)" }
          ],
          domains: [{ domain: { sourceRange: { sources: [
            { sheetId: dashId, startRowIndex: 1, endRowIndex: 400, startColumnIndex: 3, endColumnIndex: 4 }
          ]}}}],
          series: [{ targetAxis: "LEFT_AXIS", series: { sourceRange: { sources: [
            { sheetId: dashId, startRowIndex: 1, endRowIndex: 400, startColumnIndex: 4, endColumnIndex: 5 }
          ]}}}]
        }
      },
      position: { overlayPosition: {
        anchorCell: { sheetId: dashId, rowIndex: 1, columnIndex: 12 },
        widthPixels: 620, heightPixels: 320
      }}
    }}});
  }

  if (!have.has("Loaves sold by product")) {
    req.push({ addChart: { chart: {
      spec: {
        title: "Loaves sold by product",
        pieChart: {
          legendPosition: "RIGHT_LEGEND",
          domain: { sourceRange: { sources: [
            { sheetId: dashId, startRowIndex: 2, endRowIndex: 5, startColumnIndex: 7, endColumnIndex: 8 }
          ]}},
          series: { sourceRange: { sources: [
            { sheetId: dashId, startRowIndex: 2, endRowIndex: 5, startColumnIndex: 8, endColumnIndex: 9 }
          ]}}
        }
      },
      position: { overlayPosition: {
        anchorCell: { sheetId: dashId, rowIndex: 19, columnIndex: 12 },
        widthPixels: 620, heightPixels: 320
      }}
    }}});
  }

  return req;
}

/* ── Handler ─────────────────────────────────────────────────── */
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");

  if (!process.env.ORDER_SHEET_SETUP_TOKEN) {
    return res.status(404).send("Not found.\n");
  }
  const given = (req.query && req.query.token) || "";
  if (!tokenOk(given)) {
    return res.status(403).send("Wrong or missing setup token.\n");
  }

  const done = [];
  try {
    /* What is already there? */
    let meta = await sheets("GET", "?fields=" +
      encodeURIComponent("sheets(properties(sheetId,title),charts(chartId,spec.title))"));
    let tabs = {};
    (meta.sheets || []).forEach(s => { tabs[s.properties.title] = s; });

    /* Create whichever tabs are missing. */
    const missing = [ORDERS, DASH].filter(t => !tabs[t]);
    if (missing.length) {
      await sheets("POST", ":batchUpdate", {
        requests: missing.map(title => ({ addSheet: { properties: { title: title } } }))
      });
      done.push("Created the " + missing.join(" and ") + " tab" + (missing.length > 1 ? "s" : ""));
      meta = await sheets("GET", "?fields=" +
        encodeURIComponent("sheets(properties(sheetId,title),charts(chartId,spec.title))"));
      tabs = {};
      (meta.sheets || []).forEach(s => { tabs[s.properties.title] = s; });
    } else {
      done.push("Both tabs were already there");
    }

    const ordersId = tabs[ORDERS].properties.sheetId;
    const dashId = tabs[DASH].properties.sheetId;
    const charts = (tabs[DASH].charts || []).map(c => (c.spec || {}).title).filter(Boolean);

    /* Headers. Row 1 only — order rows are never touched. */
    await sheets("PUT", "/values/" + encodeURIComponent(ORDERS + "!A1:O1") +
      "?valueInputOption=RAW", { values: [HEADERS] });
    done.push("Wrote the 15 column headers on " + ORDERS);

    /* Formulas. USER_ENTERED so Sheets parses them as formulas. */
    await sheets("POST", "/values:batchUpdate", {
      valueInputOption: "USER_ENTERED",
      data: dashboardValues()
    });
    done.push("Wrote the Dashboard figures, the status counts and both chart feeds");

    await sheets("POST", ":batchUpdate", { requests: formatRequests(ordersId, dashId, charts) });
    done.push("Froze and styled the header row, set Mobile to text and Revenue to a number");
    done.push("Put the six-option Status dropdown on column O");
    done.push(charts.length >= 2
      ? "Left the two existing charts alone"
      : "Added the Revenue over time and Loaves sold by product charts");

    return res.status(200).send(
      "The Cozy Loaf order sheet is ready.\n\n" +
      done.map(d => "  ✓ " + d).join("\n") +
      "\n\nYou can close this page. Place a test order on the website and a\n" +
      "row will appear on the " + ORDERS + " tab within a few seconds.\n"
    );
  } catch (err) {
    console.error("[setup-sheet] " + err.message);
    return res.status(500).send(
      "Setup did not finish.\n\n" +
      (done.length ? done.map(d => "  ✓ " + d).join("\n") + "\n\n" : "") +
      "  ✗ " + err.message + "\n\n" +
      "Nothing was lost — fix the problem and open this link again.\n"
    );
  }
};

module.exports.__test = { dashboardValues: dashboardValues, formatRequests: formatRequests, HEADERS: HEADERS, STATUSES: STATUSES };
