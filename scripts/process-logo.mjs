import sharp from "sharp";

const src = "web1.jpeg";
const out = "public/kawan-panen-logo.png";

const img = sharp(src).ensureAlpha();
const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;

// Make near-white pixels transparent.
for (let i = 0; i < data.length; i += channels) {
  const r = data[i], g = data[i + 1], b = data[i + 2];
  if (r > 240 && g > 240 && b > 240) {
    data[i + 3] = 0;
  }
}

await sharp(data, { raw: { width, height, channels } })
  .trim()
  .png()
  .toFile(out);

const meta = await sharp(out).metadata();
console.log("done", meta.width, meta.height);
