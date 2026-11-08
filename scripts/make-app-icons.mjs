import sharp from "sharp";

const SRC = "web1.jpeg";
const BRAND_BG = "#064e3b"; // emerald-950-ish, matches header/footer brand green

// The source logo is a wide lockup: icon mark on the left, wordmark on the right.
// Crop just the icon-mark region (left ~40% of width), trim its whitespace, then
// compose it centered on a square brand-colored canvas for app icons.
const { width, height } = await sharp(SRC).metadata();
if (!width || !height) throw new Error("Logo dimensions unavailable.");
const iconRegionWidth = Math.round(width * 0.42);

const markBuffer = await sharp(SRC)
  .resize({ width, height, fit: "fill" }) // no-op resize works around a sharp extract quirk on this image
  .extract({ left: 0, top: 0, width: iconRegionWidth, height })
  .trim({ background: "#ffffff", threshold: 10 })
  .toBuffer();

async function makeIcon(size, outPath, { padPct = 0.14, background = BRAND_BG } = {}) {
  const inner = Math.round(size * (1 - padPct * 2));
  const resizedMark = await sharp(markBuffer)
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background },
  })
    .composite([{ input: resizedMark, gravity: "center" }])
    .png()
    .toFile(outPath);
}

await makeIcon(512, "public/icon-512.png");
await makeIcon(192, "public/icon-192.png");
await makeIcon(180, "public/apple-icon.png", { padPct: 0.12 }); // iOS wants minimal transparency margin, opaque bg is fine
// Maskable icon needs a larger safe-zone padding (~20%) so Android's mask doesn't clip the mark.
await makeIcon(512, "public/icon-maskable.png", { padPct: 0.22 });

console.log("icons written");
