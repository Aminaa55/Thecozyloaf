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
| `order.js` | `POST /api/order` — validates one order and appends one row. |
| `setup-sheet.js` | `GET /api/setup-sheet?token=…` — builds both tabs, the dropdown and the charts. Run once; safe to re-run. |

No npm dependencies, and deliberately so: there is no `package.json` in
this repository, and adding one would change the deploy from a plain
static upload into a build. Node's own `crypto` and `fetch` are enough.

## Environment variables (Vercel → Settings → Environment Variables)

| Variable | Required | |
|---|---|---|
| `GOOGLE_SHEETS_SPREADSHEET_ID` | yes | The long id in the sheet's URL, between `/d/` and `/edit`. |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | yes | `client_email` from the service-account JSON key. |
| `GOOGLE_PRIVATE_KEY_B64` | yes | `private_key` from that JSON, base64-encoded. Base64 because a multi-line PEM pasted into a dashboard field is the usual cause of `PEM routines::no start line`. |
| `ORDER_SHEET_SETUP_TOKEN` | setup only | Any random string. Without it `/api/setup-sheet` returns 404, so the route is closed by default. Safe to delete once the sheet is built. |
| `ORDER_SHEET_TAB` | no | Defaults to `Orders`. |
| `ORDER_TIMEZONE` | no | Defaults to `Africa/Cairo`. |
| `ALLOWED_ORIGIN_HOST` | no | A custom domain, once there is one. `*.vercel.app` is already allowed. |

The service account must be given **Editor** access to the spreadsheet
by sharing it with `GOOGLE_SERVICE_ACCOUNT_EMAIL`. Forgetting this is
the one failure that looks like a bug and is not: it returns 403.

## The Orders tab

Fifteen columns, `A`–`O`: Order Number, Date, Time, Customer Name,
Mobile, Email, Address, Area, Plain Qty, Green Olive Qty, Black Olive
Qty, Total Loaves, Revenue, Notes, Status.

Rows are appended with `valueInputOption=RAW`, so nothing is re-parsed:
an Egyptian `01…` mobile keeps its leading zero, and a customer who
types `=1+1` into a field gets text, not a formula. The date is written
as ISO text, which is readable with no column to format and still sorts
and compares chronologically.

`Status` carries a six-option dropdown and is the owners' to edit. The
function only ever appends, and never reads or writes an existing row —
so editing a status, adding a column or re-ordering by hand cannot be
undone by the website.

## Adding a fourth loaf

`config.js` stays the single source of truth for names and prices —
nothing here duplicates them. But a new loaf needs its own quantity
column: add it to the Orders tab, add the product key to `QTY_COLUMN` in
`order.js`, and widen the append range. Until that is done an unknown
loaf still counts towards Total Loaves and Revenue and the order is
still logged — a reporting gap is survivable, a lost order is not.

## When it fails

Nothing the customer sees depends on this. A failed write leaves the
order emailed, confirmed and displayed exactly as before, and queues the
row in `localStorage` to retry on the next visit. Because the function
refuses to write the same order number twice, a retry can never
duplicate a row. `orderLog.enabled: false` in `config.js` switches the
whole thing off.
