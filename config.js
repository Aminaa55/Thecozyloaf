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
     Customers do not pick a date. Every order is delivered within
     this window, and the site says so wherever it matters. */
  deliveryPromise: "Your order will be delivered within 48 hours.",
  deliveryFeeNote: "Delivery fee will be confirmed separately.",
  maxPerLoaf: 20,

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
    oliveSourdough: "olive-sourdough.jpg"
  },

  /* ── Products ──────────────────────────────────────────────── */
  products: {
    plain: { name: "Plain Sourdough", price: 230 },
    olive: { name: "Olive Sourdough", price: 250 }
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

    /* How long to wait for both emails before letting the customer
       through to their confirmation. The order is already saved, so
       this is a courtesy cap, not a deadline. */
    timeoutMs: 8000
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
