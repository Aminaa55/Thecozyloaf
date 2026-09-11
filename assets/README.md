# Image files

| Base name | What it is | Status |
|---|---|---|
| `plain-sourdough` | The Plain Sourdough photo — hero medallion and the Loaf 01 frame | **in** (`.jpg`, 896 × 1195) |
| `logo` | The Cozy Loaf circular logo — nav, hero, olive card, social section | still needed |

**The extension does not matter.** The page tries `.jpg`, `.jpeg`, `.png`,
`.webp` and their capitalised forms in turn and uses the first that exists, so
whatever your phone or laptop exports will work. Only the base name has to
match, exactly, in lower case.

If a file is not there the page shows a branded placeholder in that slot. It
never shows a broken image.

## Uploading straight from your phone or laptop

You do not need any tools. On GitHub:

**https://github.com/Aminaa55/Thecozyloaf/upload/main/assets**

Drag the file in, rename it to `plain-sourdough` plus whatever extension it
already has, and press **Commit changes**. Same for `logo`.

## How the sourdough photo is cropped

The shot is on a black background, and there is no black in this palette, so
neither crop shows much of it. The hero medallion rides the bottom of the frame
so the loaf fills the circle, keeping just enough of the flour bowl above it to
read as a bakery photo. The Loaf 01 frame is anchored to the bottom edge and
zoomed to 1.6, which fills it with crust and drops the background entirely.

Both are set in `index.html` on `.medallion__disc img` and `.frame img`.

It will look considerably better as either a cut-out PNG on transparency, or a
re-shoot on one of the brand grounds — porcelain blue, golden yellow or the
milky off-white. A cut-out would also let the loaf overlap the type and float
free of its frame.

## Black Olive Sourdough

Deliberately has **no** image slot. Until there is a real photograph of that
loaf it keeps its own branded card. It never borrows the Plain Sourdough photo.
