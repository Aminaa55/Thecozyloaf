/* ═══════════════════════════════════════════════════════════════
   THE COZY LOAF — the one file you edit.

   Shared by index.html and confirm.html, so nothing below is
   repeated anywhere else in the site.
   ═══════════════════════════════════════════════════════════════ */
window.COZY_CONFIG = {

  brand: "The Cozy Loaf",
  city: "Cairo",
  instagram: "thecozyloaf_eg",

  /* ── Ordering rules ──────────────────────────────────────────
     Shown at the top of the checkout and again on the confirmation
     page, so it needs to read sensibly in both places. */
  deliveryPromise: "Every loaf is baked to order, so we ask for 4 days' notice.",
  deliveryFeeNote: "Delivery fee will be confirmed separately.",
  maxPerLoaf: 20,

  /* ── Delivery dates ─────────────────────────
     The customer picks a delivery date at checkout, and the bakery
     counts the day the order comes in as day one. Four days' notice
     therefore means the earliest delivery is three calendar days
     after today: order on Saturday, deliver on Tuesday.

     Today always means today in Cairo, never on the customer's own
     device. Someone ordering from London late in the evening is
     already on tomorrow's date at the bakery, and reading the date
     off their phone would quietly offer them a day the bakery
     cannot make. */
  noticeDays: 4,

  /* How far ahead the calendar will go, so it is not an endless
     scroll into next year. */
  maxDaysAhead: 60,

  /* ── Days the bakery is not delivering ──────────────
     Add a date here and the calendar will not accept it, even when
     it clears the four days' notice. Write them as "YYYY-MM-DD",
     one per line, in any order.

     This is the only list to edit. The checkout reads it, and so
     does the server that writes the order sheet, so a date blocked
     here is blocked in both places. Nothing else needs changing.

         unavailableDeliveryDates: [
           "2026-12-25",
           "2027-01-01"
         ],
  */
  unavailableDeliveryDates: [
  ],

  /* ── Delivery areas ──────────────────────────────────────────
     The checkout dropdown, grouped by part of the city so a long
     list stays scannable. Add or remove areas here and the form
     follows. This list is the site's statement of where the bakery
     delivers — there is no fee calculation anywhere. */
  deliveryAreas: [
    ["New Cairo & East", [
      "New Cairo", "First Settlement", "Third Settlement", "Fifth Settlement",
      "Rehab", "Madinaty", "Shorouk", "Badr", "Obour"
    ]],
    ["Heliopolis & Nasr City", [
      "Heliopolis", "Almaza", "Sheraton", "Nozha", "Nasr City", "Abbassia"
    ]],
    ["Central Cairo", [
      "Downtown Cairo", "Garden City", "Zamalek", "Manial"
    ]],
    ["Maadi & Mokattam", [
      "Maadi", "Degla Maadi", "New Maadi", "Zahraa El Maadi", "Mokattam"
    ]],
    ["Giza", [
      "Dokki", "Mohandessin", "Agouza", "Giza", "Haram", "Faisal"
    ]],
    ["6th of October & Zayed", [
      "Sheikh Zayed", "New Zayed", "6th of October", "Hadayek October"
    ]]
  ],

  /* ── Images ──────────────────────────────────────────────────
     Exact filenames inside assets/, or an empty string for a file
     that does not exist yet.

     An empty string means the page requests nothing at all and uses
     its built-in fallback — the wordmark "The Cozy Loaf" in place of
     the logo. Naming the file exactly is what keeps the console free
     of 404s; guessing at extensions is what filled it with them.

     When the logo lands in assets/, put its filename here. */
  images: {
    logo: "",
    plainSourdough: "plain-sourdough.jpg",
    oliveSourdough: "olive-sourdough.jpg",
    blackOliveSourdough: "black-olive-sourdough-dark.jpg",
    loafMark: "loaf-mark.png"
  },

  /* ── Products ──────────────────────────────────────────────── */
  products: {
    plain: { name: "Plain Sourdough", price: 230 },
    olive: { name: "Green Olive Sourdough", price: 250 },
    blackOlive: { name: "Black Olive Sourdough", price: 250 }
  },

  /* ── Email notifications, via EmailJS ────────────────────────
     Placing an order sends two emails: one to the customer and one
     to the bakery. Both go through EmailJS, which sends them from
     the connected Gmail account. No domain, no server, no key that
     needs hiding — see the four values below.

     Fill these in from the EmailJS dashboard:

       publicKey          Account → General → Public Key
       serviceId          Email Services → the Gmail service
       customerTemplateId Email Templates → customer confirmation
       ownerTemplateId    Email Templates → order notification
       ownerEmail         the inbox that receives every order

     ownerEmail only takes effect once the owner template's "To Email"
     field is set to {{to_email}} in the EmailJS dashboard. Leave that
     field as a literal address and the template keeps winning, whatever
     is written here.

     Until publicKey and serviceId are both set, no email is sent.
     Either way the customer sees a normal confirmation — sending is
     the bakery's problem, never theirs. Failures are logged to the
     console for a developer and never shown on screen.

     These four values are public by design — EmailJS is called from
     the browser, so anyone can read them in the deployed page. That
     is inherent to sending without a server, not an oversight.

     Origin restriction is a paid EmailJS feature and is deliberately
     not in use, so the only protection is the monthly send quota. If
     the quota ever drains without matching orders, rotate the public
     key in the EmailJS dashboard and update it here. */
  emailjs: {
    publicKey: "GKOYIUK2pM4YBI010",
    serviceId: "service_zhnqrif",
    customerTemplateId: "template_ouikh4b",
    ownerTemplateId: "template_k20t6sh",
    ownerEmail: "thecozyloaf87@gmail.com",

    /* How long to wait for both emails before letting the customer
       through to their confirmation. The order is already saved, so
       this is a courtesy cap, not a deadline. */
    timeoutMs: 8000
  },


  /* ── The order log ───────────────────────────────────────────
     Every placed order is also appended as one row to the bakery's
     Google Sheet, so the owners have a running list they can sort,
     filter and mark off without anyone building them an app.

     There is no credential here, and there must never be one. The
     browser posts the order to our own endpoint on the same domain,
     and that endpoint — running on Vercel, with the Google service
     account in its environment variables — writes the row. The key
     never reaches the page.

     This is strictly an addition to the emails, never a replacement.
     If it is switched off, or the endpoint is down, or Google is
     unreachable, the order is still emailed to the bakery, still
     confirmed to the customer, and still shown on the confirmation
     page. Nothing the customer sees depends on it. */
  orderLog: {
    /* Set to false to stop logging orders to the sheet. The website
       carries on exactly as it did before the sheet existed. */
    enabled: true,

    /* Our own serverless function, on our own domain. */
    endpoint: "/api/order",

    /* Shorter than the email timeout on purpose: the sheet runs
       alongside the emails, so it should never be the thing keeping
       a customer waiting. A slower write is not abandoned — it
       finishes in the background after the page has moved on. */
    timeoutMs: 4000,

    /* A write that fails for a reason that might pass later — the
       network, or Google being briefly unavailable — is kept and
       retried on the next visit, so an outage delays rows instead of
       losing them. The endpoint refuses to write the same order
       number twice, so a retry can never duplicate a row. */
    retryQueue: true
  }
};


/* ═══════════════════════════════════════════════════════════════
   Internal helper — not a setting. Leave this alone.

   Points an <img> at one named file in assets/, and calls onMissing()
   if the name is empty or the file fails to load. Exactly one request
   per image, and none at all for an image that does not exist yet.
   ═══════════════════════════════════════════════════════════════ */
window.cozyImage = function (img, file, onMissing) {
  if (!file) { if (onMissing) onMissing(); return; }   // nothing named, nothing requested
  img.addEventListener("error", function () { if (onMissing) onMissing(); });
  img.src = "assets/" + file;
};
