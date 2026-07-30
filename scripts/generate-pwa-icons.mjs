import { mkdirSync, readdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const out = join(root, 'public', 'icons');
const publicDir = join(root, 'public');
mkdirSync(out, { recursive: true });

/** Marca Cierres: ticket de cierre + check (escala bien de 16px a 512px). */
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">
  <defs>
    <linearGradient id="bg" x1="72" y1="24" x2="440" y2="488" gradientUnits="userSpaceOnUse">
      <stop stop-color="#1D7AC8"/>
      <stop offset="1" stop-color="#0E4F8C"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>
  <rect x="146" y="88" width="220" height="300" rx="32" fill="#FFFFFF"/>
  <path d="M146 132h220" stroke="#D7E6F4" stroke-width="14"/>
  <path d="M186 186h140" stroke="#1D65A0" stroke-width="20" stroke-linecap="round"/>
  <path d="M186 240h140" stroke="#1D65A0" stroke-width="20" stroke-linecap="round" opacity="0.75"/>
  <path d="M186 294h92" stroke="#1D65A0" stroke-width="20" stroke-linecap="round" opacity="0.55"/>
  <rect x="186" y="332" width="140" height="28" rx="14" fill="#E8F5E9"/>
  <circle cx="368" cy="372" r="78" fill="#2E7D32"/>
  <path d="M332 374l24 24 48-52" stroke="#FFFFFF" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">
  <defs>
    <linearGradient id="bg" x1="72" y1="24" x2="440" y2="488" gradientUnits="userSpaceOnUse">
      <stop stop-color="#1D7AC8"/>
      <stop offset="1" stop-color="#0E4F8C"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <g transform="translate(48 48) scale(0.8125)">
    <rect x="146" y="88" width="220" height="300" rx="32" fill="#FFFFFF"/>
    <path d="M146 132h220" stroke="#D7E6F4" stroke-width="14"/>
    <path d="M186 186h140" stroke="#1D65A0" stroke-width="20" stroke-linecap="round"/>
    <path d="M186 240h140" stroke="#1D65A0" stroke-width="20" stroke-linecap="round" opacity="0.75"/>
    <path d="M186 294h92" stroke="#1D65A0" stroke-width="20" stroke-linecap="round" opacity="0.55"/>
    <rect x="186" y="332" width="140" height="28" rx="14" fill="#E8F5E9"/>
    <circle cx="368" cy="372" r="78" fill="#2E7D32"/>
    <path d="M332 374l24 24 48-52" stroke="#FFFFFF" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;

const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <defs>
    <linearGradient id="bg" x1="8" y1="2" x2="56" y2="62" gradientUnits="userSpaceOnUse">
      <stop stop-color="#1D7AC8"/>
      <stop offset="1" stop-color="#0E4F8C"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="14" fill="url(#bg)"/>
  <rect x="18" y="10" width="28" height="38" rx="4" fill="#FFFFFF"/>
  <path d="M23 22h18M23 29h18M23 36h11" stroke="#1D65A0" stroke-width="2.5" stroke-linecap="round"/>
  <circle cx="46" cy="46" r="11" fill="#2E7D32"/>
  <path d="M41 46.5l3.2 3.2 6.5-7" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

for (const size of [16, 32, 48, 180, 192, 512]) {
  await sharp(Buffer.from(iconSvg))
    .resize(size, size)
    .png()
    .toFile(join(out, `icon-${size}x${size}.png`));
}

await sharp(Buffer.from(maskableSvg))
  .resize(512, 512)
  .png()
  .toFile(join(out, 'icon-maskable-512x512.png'));

writeFileSync(join(out, 'icon.svg'), iconSvg);
writeFileSync(join(publicDir, 'logo-app.svg'), iconSvg);
writeFileSync(join(publicDir, 'favicon.svg'), faviconSvg);

const png32 = await sharp(Buffer.from(iconSvg)).resize(32, 32).png().toBuffer();
const png16 = await sharp(Buffer.from(iconSvg)).resize(16, 16).png().toBuffer();
try {
  const pngToIco = (await import('png-to-ico')).default;
  const ico = await pngToIco([png16, png32]);
  writeFileSync(join(publicDir, 'favicon.ico'), ico);
} catch {
  copyFileSync(join(out, 'icon-32x32.png'), join(publicDir, 'favicon.ico'));
  console.warn('png-to-ico no disponible: se usó PNG 32x32 como favicon.ico');
}

console.log('Generated icons:', readdirSync(out).join(', '));
console.log('Updated favicon + logo-app.svg');
