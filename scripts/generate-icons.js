const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const pngToIco = require('png-to-ico').default;

const src = path.join('public', 'icons', 'icon.svg');
const outDir = path.join('public', 'icons');
const sizes = [16, 32, 48, 180, 192, 512];

(async () => {
  for (const size of sizes) {
    const out = path.join(outDir, `icon-${size}x${size}.png`);
    await sharp(src).resize(size, size).png().toFile(out);
    console.log('wrote', out);
  }

  const inner = fs
    .readFileSync(src, 'utf8')
    .replace(/<svg[^>]*>/, '')
    .replace('</svg>', '');
  const padded = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#1B2A33"/><g transform="translate(56 56) scale(0.78)">${inner}</g></svg>`
  );
  const maskable = path.join(outDir, 'icon-maskable-512x512.png');
  await sharp(padded).resize(512, 512).png().toFile(maskable);
  console.log('wrote', maskable);

  const icoBuf = await pngToIco([
    path.join(outDir, 'icon-32x32.png'),
    path.join(outDir, 'icon-48x48.png'),
  ]);
  fs.writeFileSync(path.join('public', 'favicon.ico'), icoBuf);
  console.log('wrote favicon.ico');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
