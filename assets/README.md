# Image files

| Base name | What it is | Status |
|---|---|---|
| `plain-sourdough` | The Plain Sourdough photo — hero medallion and the Loaf 01 frame | **in** (`.jpg`, 896 × 1195) |
| `logo` | The Cozy Loaf circular logo — nav, hero, olive card, social section | still needed; the wordmark stands in and nothing is requested |

**Name the file in `config.js`.** Under `images` there is one entry per slot
holding the exact filename, or an empty string when the file does not exist
yet:

```js
images: {
  logo: "",                            // no file yet — the wordmark stands in
  plainSourdough: "plain-sourdough.jpg"
}
```

An empty string means the page requests nothing at all, so the browser console
stays clean. Any extension works — just write the real one.

If a named file fails to load the page falls back to a branded placeholder in
that slot. It never shows a broken image.

## Uploading straight from your phone or laptop

You do not need any tools. On GitHub:

**https://github.com/Aminaa55/Thecozyloaf/upload/main/assets**

Drag the file in and press **Commit changes** — keep whatever name and
extension it already has. Then tell me the filename and I will put it in
`config.js`.

## How the sourdough photo is fitted

The loaf runs off the left edge of the photograph — 154 of its 741 rows reach
x=0 — so `cover` can never leave a margin on that side at any zoom.

The **hero medallion** uses `cover` anchored to the bottom, which is the largest
the loaf can be in a circle while staying whole.

The **product frame** uses `contain` at a 0.92 inset, so the whole photograph
fits with room around the loaf on all four sides. Its background is set to the
photograph's own corner tone, which makes the margins that `contain` leaves read
as part of the shot rather than as pale slivers. The branded placeholder keeps
the gold background.

Both are set in `index.html` on `.medallion__disc img` and `.frame img`.

It will look considerably better as either a cut-out PNG on transparency, or a
re-shoot on one of the brand grounds — porcelain blue, golden yellow or the
milky off-white. A cut-out would also let the loaf overlap the type and float
free of its frame.

## Black Olive Sourdough

Deliberately has **no** image slot. Until there is a real photograph of that
loaf it keeps its own branded card. It never borrows the Plain Sourdough photo.
