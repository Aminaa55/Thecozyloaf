# The Cozy Loaf

Website for The Cozy Loaf, a sourdough bakery delivering in Cairo.

Static files only — no build step, no server, no database. Open `index.html` in
a browser and the whole site works.

## Approved baselines

Several commits are signed off, and they mean different things.

- **`aa38acd` — the approved original visual baseline.** The design the owners
  approved: composition, palette, typography, illustration use, crops, spacing
  and responsive behaviour.
- **`ac73a72` — historical.** `aa38acd` plus the Black Olive Sourdough product.
  Styling is byte-identical to `aa38acd`; the difference is one product and the
  data wiring behind it.
- **`f26b577` — the current approved baseline.** `ac73a72` plus two changes:
  Olive Sourdough renamed to Green Olive Sourdough, and the Black Olive product
  pointed at its dark-background image. Styling is still byte-identical to
  `aa38acd`.
- **`99820a9` — documentation only.** Records the provenance of the two Black
  Olive image files in `assets/README.md`. Every website file, asset, template
  and config is byte-identical to `f26b577`, so the deployed site is unchanged
  by it.

**Start future work from `f26b577`** unless the owners say otherwise. The
earlier commits are kept on record to show what was frozen when, not as places
to branch from.

Do not change styling, layout, spacing, typography, illustrations, image crops,
buttons, the footer, product presentation or responsive behaviour unless the
owners explicitly ask for that change. This holds for incidental tidying too: a
change nobody requested is out of scope even if it looks like an improvement.

Two brand upgrades are expected and welcome when the assets arrive:

1. **The logo.** Put the file in `assets/` and name it in `config.js` under
   `images.logo`. Five slots already wait for it — the header and the sign-off
   label on the home page, three on the confirmation page — and each hides
   itself until the file exists, so nothing shows a gap in the meantime. Do not
   substitute a drawn mark, a wheat or bread icon, or any other stand-in.
2. **More photography.** Only authentic Cozy Loaf photographs. No stock, no
   generated imagery.

Functional work — ordering, email delivery, config, copy supplied by the
owners — is not covered by the freeze and proceeds as normal.

## Palette

| | |
|---|---|
| Espresso `#542916` | All text, every outline and shadow; the marquee band; the footer |
| Porcelain blue `#88B8CE` | Hero ground, the basket, social section |
| Golden yellow `#F1C166` | Nav, ordering section, price badges |
| Terracotta `#A13A1E` | Ticker, buttons, price sticker, errors |
| Milky off-white `#FEFAF0` | Page ground and the breathing space between loud sections |
| Olive `#B79858` | Detail only — the outlined numerals. Never a ground. |

## Typography

**Itim** for the name, the product names, prices and every handwritten
annotation; **Figtree** for descriptions, delivery information, form labels and
inputs — anything a thumb has to hit or an eye has to scan quickly.

## Pages

| | |
|---|---|
| `index.html` | The shop — hero, loaves, ordering, checkout |
| `confirm.html` | Order confirmation. A separate page, reached only by placing an order |
| `emails/customer-confirmation.html` | Customer email template |
| `emails/owner-notification.html` | Owner email template |
| `config.js` | Every setting the site has — products, prices, delivery areas and rules. Shared by both pages. |
| `build-preview.py` | Folds both pages into one file, for review surfaces that host a single page. Not used by the live site. |

## Ordering and checkout

The three delivery rules sit directly above the basket, where a customer reads
them before choosing:

- Your order will be delivered within 48 hours.
- Delivery fee will be confirmed separately.

No delivery fee is calculated anywhere on the site. There is no pickup option,
and no bakery address or phone number appears on the page.

Basket → **Continue to delivery details** → `confirm.html`.

Checkout collects full name, mobile, email, delivery address and area. There is
no delivery date: every order is delivered within 48 hours, and the site says so
on the ordering page, in checkout, on the confirmation page and in the customer
email.

**Area is a dropdown**, not free text, built from `deliveryAreas` in
`config.js` — 34 areas grouped by part of the city so the list stays scannable.
That list is the site's statement of where the bakery delivers. Delivery address
stays a separate required field for street, building and apartment.

Checkout collects full name, mobile, **email**, delivery address, area,
preferred delivery date and optional notes. The date input's `min` is set from
`SETTINGS.minNoticeHours`, so dates inside the 48-hour window cannot be picked,
and the same rule is re-checked on submit.

On submit the basket empties and the customer lands on `confirm.html`, which
shows the order number, loaves and quantities, subtotal, **Delivery fee: To be
confirmed**, name, address, area and requested delivery date — and carries no
quantity controls, add-to-basket buttons or editable fields at all. "Order
again" always starts a fresh basket. No delivery fee is ever invented.

The order travels between the two pages in `sessionStorage`, keyed by its
reference, which the URL names. Opening `confirm.html` directly shows a plain
"we could not find that order" state.

### After the order is placed

The customer lands on `confirm.html` and is finished — nothing more is asked of
them. The page shows the order number, "Your order will be delivered within 48
hours", the loaves and quantities, subtotal, delivery fee to be confirmed,
total before delivery, name, address and area, and a single **Back to home**
button.

Nothing technical ever appears there. If a notification fails to reach the
bakery, that is logged to the console for a developer and the customer, who has
successfully placed an order and can do nothing about it, sees a normal
confirmation.

### Emails

Placing an order sends two messages through **EmailJS**, which relays them from
a connected Gmail account — no domain, no server, no secret key.

| | |
|---|---|
| To the bakery | Order number, name, mobile, email, area, full address, loaves and quantities, subtotal, notes |
| To the customer | Confirmation, order number, loaves, subtotal, delivery within 48 hours, fee confirmed separately |

Both are sent independently: one failing never stops the other, and neither
failing is the customer's problem. The order is saved before either is
attempted, and a send that has not finished within `emailjs.timeoutMs` stops
holding the customer up — they go through to their confirmation regardless.

Failures are logged to the browser console for a developer. Nothing about
sending ever appears on screen.

Templates live in `emails/`. Paste each into the EmailJS template editor in
**Code view**. Merge fields are `{{double_braced}}`, which is EmailJS's own
syntax. The loaf list arrives as `{{items_text}}` — plain text, one line per
loaf — because EmailJS escapes markup inside variables, so a table built in a
variable would print its own tags.

Set the four IDs in `config.js` under `emailjs`. Until `publicKey` and
`serviceId` are both filled in, nothing is sent and the customer still sees a
normal confirmation.

**After deploying, add the live URL to EmailJS under Account → Security →
allowed origins**, or sends from the deployed site are rejected.

### Where orders go

Every placed order is built as a complete record and written to
`localStorage` under `cozyloaf.orders`, then sent onward according to
`SETTINGS` at the top of the script:

| Setting | Effect |
|---|---|
| `ownerEmail` | Opens the customer's email app with the whole order written out |
| `orderEndpoint` + `accessKey` | POSTs the order as JSON — orders arrive in the inbox by themselves (web3forms.com, free) |
| neither set | The order is saved in that browser only and the receipt says so |

**`localStorage` is not an order book.** It lives in the customer's own browser,
on that one device. The bakery cannot see it, cannot query it, and a customer on
a different phone has a different store entirely. It exists so an order is never
lost between the two pages — it is not storage the business can rely on.

Orders also go out by email the moment they are placed — see above. That is the
copy the bakery actually works from; `localStorage` is a safety net, not a
system of record.

## Deploying

Plain static files, nothing to build. On Vercel, add a **new project** from this
repository and accept every default:

| Setting | Value |
|---|---|
| Root Directory | `./` — the repository root |
| Framework Preset | Other |
| Build Command | leave empty |
| Output Directory | leave empty |
| Production Branch | `main` |

`vercel.json` handles the rest — clean URLs, so `/confirm` works as well as
`/confirm.html`, and cache headers that keep `config.js` fresh while letting the
photographs cache.

Every push to `main` redeploys.

**After the first deploy**, take the `*.vercel.app` URL and add it in EmailJS
under **Account → Security → allowed origins**, exactly as Vercel gives it,
`https://` included and no trailing slash. Without that, sends from the live
site are rejected.

## Email templates

Both live in `emails/` as table-layout HTML with inline styles and the brand
colours. Itim and Figtree do not render in most mail clients, so Georgia
takes the display role and Arial the text role.

Merge fields are `{{double_braced}}` so any sending service can fill them.
The customer template says the delivery fee is still to be confirmed and never
implies a final total.

Both are sent on every order through EmailJS, configured in `config.js` under
`emailjs`. The files here are the reference copies — the live content lives in
the EmailJS dashboard, so a change here must be pasted there to take effect.

The recipient of each message is set by the template's **To Email** field in the
dashboard, not by the site. The owner notification should use `{{to_email}}`,
which the site fills from `emailjs.ownerEmail`; the customer confirmation must
use `{{customer_email}}`. Note that `to_email` is sent to *both* templates, so
pointing the customer template at `{{to_email}}` would send every customer's
confirmation to the bakery instead.

## Images

Files live in `assets/`, named by base name only — `logo` and
`plain-sourdough`. The extension is worked out at load time from a list in
`config.js`, so a phone export lands correctly whether it saved as `.jpg`,
`.png` or `.webp`. A slot with no file behind it shows a branded placeholder,
never a broken image. See [`assets/README.md`](assets/README.md) for how to
upload them straight from GitHub.

## Still needed

Green Olive Sourdough description · the logo file · storage/care wording if that
section should return.

## The visual system

The Instagram is the brief. It has no containers: type and drawings sit on warm
paper with air around them, and the brown reads as ink rather than as panels.
So the site is one cream sheet from top to bottom. Nothing is in a card.

- **Cream is the ground**, `#FDF4E3`, sampled from the posts. There are no
  alternating colour sections; the only other field is `--paper`, a half-tone
  used for the order slip.
- **Brown is ink.** Lines, letters and marks — never a filled panel.
- **Edges are drawn, not ruled.** Every border takes an irregular radius
  (`--r-a`, `--r-b`, `--r-pill`), so no two corners of a box match.
- **Photographs lie on the paper**, tilted a degree or two, with a hairline ink
  edge and no shadow. Their black grounds read as prints pasted into a notebook.
- **Drawn marks carry the structure** the old design got from coloured bands:
  rules between chapters, an arrow at the price, a ring round a number, a lame
  beside the loaves, a heart at the end. They live as `<symbol>`s in one block
  at the top of `<body>`.

A note on those symbols: a `<use>` clones into a shadow tree that document CSS
cannot select into, but *inherited* properties do reach it. So the symbols
carry their own `fill` / `stroke` / `stroke-width` attributes and the CSS sets
only `color`. Setting `fill` or `stroke-width` on `.doodle` silently flattens
every drawing.
