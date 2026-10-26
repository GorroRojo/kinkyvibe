// Dibuja el ícono `maskable` del manifest (docs/seo.md, «Manifest y perfiles»):
// static/maskable-512x512.png, 512 × 512, a partir del ícono de siempre
// (static/android-chrome-512x512.png, el círculo rosa con «Kinky Vibe»).
//
// Android recorta los íconos `maskable` con la forma que elige el teléfono (círculo, cuadrado
// redondeado, gota…); lo único que nunca recorta es el círculo central de 80 % del lado (radio
// 0,4 × 512 = 204,8 px). Así que: el ícono de siempre achicado al 80 %, centrado, sobre un
// cuadrado lleno del mismo rosa del círculo (se lee del ícono, así el borde del círculo no se
// nota). Al final comprueba que todo lo blanco (las letras) quede adentro de esa zona segura.
//
// Uso: `node scripts/icono-maskable.js` (sharp, que ya es dependencia). Se commitea el PNG.
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const SIZE = 512;
/** El círculo que nunca se recorta: 80 % del lado (radio 40 %). */
const SAFE_RADIUS = SIZE * 0.4;
/** El ícono de siempre se achica a ese mismo 80 %. */
const SCALE = 0.8;

const source = fileURLToPath(new URL('../static/android-chrome-512x512.png', import.meta.url));
const target = fileURLToPath(new URL('../static/maskable-512x512.png', import.meta.url));

// El rosa del círculo: un punto adentro del círculo, arriba de las letras.
const { data: px } = await sharp(source)
	.extract({ left: SIZE / 2, top: 30, width: 1, height: 1 })
	.removeAlpha()
	.raw()
	.toBuffer({ resolveWithObject: true });
const background = { r: px[0], g: px[1], b: px[2], alpha: 1 };

const inner = Math.round(SIZE * SCALE);
// Sin el borde suavizado del círculo (el ícono achicado lo dejaba como un anillo apenas visible):
// del ícono achicado va solo lo de adentro del círculo, que es rosa liso alrededor de las letras.
const cut = Buffer.from(
	`<svg width="${inner}" height="${inner}"><circle cx="${inner / 2}" cy="${inner / 2}" r="${inner / 2 - 16}"/></svg>`
);
const logo = await sharp(source)
	.resize(inner, inner)
	.composite([{ input: cut, blend: 'dest-in' }])
	.png()
	.toBuffer();
const offset = Math.round((SIZE - inner) / 2);

await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background } })
	.composite([{ input: logo, left: offset, top: offset }])
	.removeAlpha()
	.png({ compressionLevel: 9, palette: true })
	.toFile(target);

// Comprobación: ningún píxel claro (las letras) fuera del círculo seguro.
const { data, info } = await sharp(target).raw().toBuffer({ resolveWithObject: true });
let farthest = 0;
for (let y = 0; y < info.height; y++) {
	for (let x = 0; x < info.width; x++) {
		const i = (y * info.width + x) * info.channels;
		if (data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240) {
			farthest = Math.max(farthest, Math.hypot(x + 0.5 - SIZE / 2, y + 0.5 - SIZE / 2));
		}
	}
}
if (farthest > SAFE_RADIUS) {
	console.error(`Las letras llegan a ${farthest.toFixed(1)} px del centro (máx. ${SAFE_RADIUS}).`);
	process.exit(1);
}
const hex = [px[0], px[1], px[2]].map((c) => c.toString(16).padStart(2, '0')).join('');
console.log(
	`static/maskable-512x512.png: fondo #${hex}, letras hasta ${farthest.toFixed(1)} px del centro (zona segura: ${SAFE_RADIUS}).`
);
