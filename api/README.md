# The order log

Every placed order is appended as one row to the bakery's Google Sheet,
on top of the two EmailJS emails that were already being sent. The
emails remain the record of the order; the sheet is the working list the
owners sort, filter and mark off.

## Why there is a server at all

A Google service account authenticates with a private key. A private key
in `index.html` or `config.js` would be published to every visitor, so
the browser never sees one. It posts the order to `/api/order` on our own
domain, and that function — running on Vercel, with the key in its
environment variables — writes the row.

## Files

| File | |
|---|---|
| `_google.js` | Signs the service-account JWT and calls the Sheets REST API. The leading underscore keeps Vercel from routing it. |
| `_delivery.js` | Cairo dates, the four days' notice rule, and the owners' blocked dates. |
| `order.js` | `POST /api/order` — validates one order and appends one row. |
| `setup-sheet.js` | `GET /api/setup-sheet?token=…` — builds both tabs, the dropdown and the charts. Run once; safe to re-run. |

No npm dependencies, and deliberately so: there is no `package.json` in
this repository, and adding one would change the deploy from a plain
static upload into a build. Node's own `crypto` and `fetch` are enough.

## Environment variables (Vercel → Settings → Environment Variables)

| Variable | Required | |
|---|---|---|
| `GOOGLE_SHEETS_SPREADSHEET_ID` | yes | The long id in the sheet's URL, between `/d/` and `/edit`. |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | yes | The whole downloaded service-account file: open it, select all, paste. Both the key and the address are read out of it, so nothing else is needed. Picking the key out of that file by hand means selecting a two-thousand-character line without catching either quote mark — and one character wrong produces a PEM error that explains nothing. |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | only if the key is supplied alone | `client_email`. Overrides the file's own value when both are present. |
| `GOOGLE_PRIVATE_KEY` | only without the file | `private_key` on its own. Wrapping quotes, escaped or real newlines, CRLF and stray whitespace are all tolerated; pasting the whole file in here by mistake is read as the file. |
| `GOOGLE_PRIVATE_KEY_B64` | alternative | The same key base64-encoded. Takes precedence over the other two. |
| `ORDER_SHEET_SETUP_TOKEN` | setup only | Any random string. Without it `/api/setup-sheet` returns 404, so the route is closed by default. Safe to delete once the sheet is built. |
| `ORDER_SHEET_TAB` | no | Defaults to `Orders`. |
| `ORDER_TIMEZONE` | no | Defaults to `Africa/Cairo`. |
| `ALLOWED_ORIGIN_HOST` | no | A custom domain, once there is one. `*.vercel.app` is already allowed. |
| `UNAVAILABLE_DELIVERY_DATES` | no | Extra blocked dates, comma separated, merged with the list in `config.js`. For blocking a day in a hurry without a commit. |

The service account must be given **Editor** access to the spreadsheet
by sharing it with `GOOGLE_SERVICE_ACCOUNT_EMAIL`. Forgetting this is
the one failure that looks like a bug and is not: it returns 403.

## The Orders tab

Sixteen columns, `A`–`P`: Order Number, Order Date, Order Time,
Preferred Delivery Date, Customer Name, Mobile, Email, Address, Area,
Plain Qty, Green Olive Qty, Black Olive Qty, Total Loaves, Product
Subtotal, Notes, Status.

Product Subtotal is the loaves only. Delivery is quoted separately and
is not part of any figure here.

Rows are appended with `valueInputOption=RAW`, so nothing is re-parsed:
an Egyptian `01…` mobile keeps its leading zero, and a customer who
types `=1+1` into a field gets text, not a formula. The date is written
as ISO text, which is readable with no column to format and still sorts
and compares chronologically.

`Status` carries a six-option dropdown and is the owners' to edit. The
function only ever appends, and never reads or writes an existing row —
so editing a status, adding a column or re-ordering by hand cannot be
undone by the website.

## Delivery dates

The bakery counts the day an order arrives as day one, so four days'
notice means the earliest delivery is three calendar days later: order
on Saturday, deliver on Tuesday. Today is always today in Cairo, taken
from the timezone and never from the customer's device — someone
ordering from London late in the evening is already on tomorrow's date
at the bakery.

The date is checked three times, and the second of those is the one
that matters:

1. The calendar's `min` and `max` make the notice period unselectable,
   on an iPhone included. A native date input has no way to grey out
   individual days, so a blocked date stays selectable and is answered
   the moment it is chosen.
2. On submit, `deliveryProblem()` re-derives the rule **from the clock,
   never from the `min` attribute**. Editing the markup in a browser
   inspector therefore changes nothing about what the form accepts.
3. `_delivery.js` checks it again here, so no row can claim a date the
   bakery could not have accepted.

What none of this can stop is someone rewriting the page's JavaScript
outright. No static site can: there is no secret the browser could hold
to prove it is the site. The order would still carry a visible delivery
date in the bakery's email, and the row would still be refused here.

Blocked dates live in `unavailableDeliveryDates` in `config.js` — one
list, edited in one place, read by both the checkout and this function.
`vercel.json` ships `config.js` alongside the function so it can be
read; the file is only ever scanned as text, never evaluated. Block
comments are stripped first, because `config.js` documents the list
with a worked example and matching the first occurrence of the key
would otherwise block two days nobody asked to block.

A row that failed to write and is retried days later is judged against
the day it was **placed**, not the day the retry runs — otherwise a
genuine order would be thrown away for being old. `placedAt` comes from
the browser, so it may only ever relax the notice period, never defeat
the separate rule that a delivery date cannot already be in the past.

## Adding a fourth loaf

`config.js` stays the single source of truth for names and prices —
nothing here duplicates them. But a new loaf needs its own quantity
column: add it to the Orders tab, add the product key to `QTY_COLUMN` in
`order.js`, widen `COLUMNS` and the append range, and shift the Dashboard
formulas in `setup-sheet.js`. Until that is done an unknown
loaf still counts towards Total Loaves and Revenue and the order is
still logged — a reporting gap is survivable, a lost order is not.

## When it fails

Nothing the customer sees depends on this. A failed write leaves the
order emailed, confirmed and displayed exactly as before, and queues the
row in `localStorage` to retry on the next visit. Because the function
refuses to write the same order number twice, a retry can never
duplicate a row. `orderLog.enabled: false` in `config.js` switches the
whole thing off.
