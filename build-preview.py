#!/usr/bin/env python3
"""Fold index.html and confirm.html into one file for single-page preview hosts.

The live site is two real pages. Some review surfaces can only host one file,
so this inlines the confirmation page as a second screen and swaps the
navigation for an in-page transition. Nothing here changes the real site.

    python3 build-preview.py [output.html]
"""
import base64, mimetypes, pathlib, re, sys

here = pathlib.Path(__file__).parent
shop = (here / "index.html").read_text()
conf = (here / "confirm.html").read_text()
cfg  = (here / "config.js").read_text()

# The confirmation page's own styles, minus everything it shares with the shop.
conf_css = conf[conf.index("/* ── Confirmation"):conf.index("/* ── Reveal")]

# Its markup, wrapped as a hidden screen.
conf_body = conf[conf.index("<body>") + 6:conf.index("</body>")]
conf_body = conf_body[:conf_body.index("<script>")]

# Its renderer.
conf_js = conf[conf.rindex("<script>") + 8:conf.rindex("</script>")]

shim = """
/* ── Preview only: the two pages share one document ──────────── */
(function () {
  const shop = ["#top", ".ticker", ".nav", ".foot"].map(s => document.querySelector(s)).filter(Boolean);
  const screen = document.getElementById("confirm-screen");

  function show(el, on) { el.hidden = !on; }

  window.__inlineConfirm = function () {
    shop.forEach(el => show(el, false));
    show(screen, true);
    window.renderConfirmation();
    window.scrollTo(0, 0);
  };

  function backToShop(hash) {
    show(screen, false);
    shop.forEach(el => show(el, true));
    try { sessionStorage.removeItem("cozyloaf.lastOrder"); } catch (e) {}
    const t = hash && document.querySelector(hash);
    window.scrollTo(0, 0);
    if (t) t.scrollIntoView({ block: "start" });
  }

  screen.addEventListener("click", function (e) {
    const a = e.target.closest('a[href^="index.html"]');
    if (!a) return;
    e.preventDefault();
    backToShop(a.getAttribute("href").slice("index.html".length) || null);
  });
})();
"""

# Assets are relative files on the real site. A single-file preview has no
# directory to read them from, so each one rides along as a data URI and a thin
# wrapper hands them to the image loader before it tries the network.
assets = {}
for base in ("logo", "plain-sourdough"):
    for f in sorted((here / "assets").glob(base + ".*")):
        if f.suffix.lower() in (".md", ".txt"):
            continue
        mime = mimetypes.guess_type(f.name)[0] or "image/jpeg"
        assets["assets/" + base] = "data:%s;base64,%s" % (mime, base64.b64encode(f.read_bytes()).decode())
        break

asset_shim = """
/* Preview only: assets travel with the file instead of sitting beside it. */
window.COZY_PREVIEW_IMAGES = %s;
(function () {
  const real = window.cozyImage;
  window.cozyImage = function (img, base, onMissing) {
    const data = window.COZY_PREVIEW_IMAGES[base];
    if (!data) return real(img, base, onMissing);
    img.addEventListener("error", function () { if (onMissing) onMissing(); });
    img.src = data;
  };
})();
""" % ("{" + ",".join('%r:%r' % (k, v) for k, v in assets.items()) + "}")

# config.js is an external file on the real site; a single-file preview inlines it.
out = shop.replace('<script src="config.js"></script>',
                   "<script>" + cfg + asset_shim + "</script>", 1)
out = out.replace("</style>", conf_css + "\n</style>", 1)
out = out.replace("</body>",
                  '<div id="confirm-screen" hidden>' + conf_body + "</div>\n"
                  "<script>" + conf_js + shim + "</script>\n</body>", 1)

dest = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else here / "preview.html"
dest.write_text(out)
print("wrote", dest, "—", len(out.splitlines()), "lines")
