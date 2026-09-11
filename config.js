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
     Files go in assets/ named by base name only:

       assets/logo.<ext>              the circular logo
       assets/plain-sourdough.<ext>   the Plain Sourdough photo

     The extension does not matter. The page tries each of these in
     turn and uses the first that loads, so a phone export lands
     correctly whether it saves as .jpg, .jpeg, .png or .webp, and
     whether the camera capitalised it.

     Black Olive Sourdough deliberately has no image slot; it keeps
     its own card until there is a real photograph of that loaf. */
  imageExtensions: ["jpg", "jpeg", "png", "webp", "JPG", "JPEG", "PNG"],

  /* ── Products ──────────────────────────────────────────────── */
  products: {
    plain: { name: "Plain Sourdough", price: 230 },
    olive: { name: "Black Olive Sourdough", price: 250 }
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

     REMEMBER: add the live site's address under Account → Security →
     allowed origins in EmailJS, or sends from the deployed site are
     rejected. */
  emailjs: {
    publicKey: "",
    serviceId: "",
    customerTemplateId: "",
    ownerTemplateId: "",

    /* How long to wait for both emails before letting the customer
       through to their confirmation. The order is already saved, so
       this is a courtesy cap, not a deadline. */
    timeoutMs: 8000
  }
};


/* ═══════════════════════════════════════════════════════════════
   Internal helper — not a setting. Leave this alone.

   Points an <img> at the first file that actually exists, trying
   each extension in turn, and calls onMissing() if none load.
   ═══════════════════════════════════════════════════════════════ */
window.cozyImage = function (img, base, onMissing) {
  const exts = (window.COZY_CONFIG.imageExtensions || ["jpg", "png"]).slice();
  let i = 0;
  function next() {
    if (i >= exts.length) { if (onMissing) onMissing(); return; }
    img.src = base + "." + exts[i++];
  }
  img.addEventListener("error", next);
  img.addEventListener("load", function () { if (img.naturalWidth === 0) next(); });
  next();
};
