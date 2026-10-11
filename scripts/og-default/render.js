// Dibuja las tarjetas de respaldo de la vista previa al compartir (docs/compartir.md): la por
// defecto y una por sección, cada una en static/<archivo>, 1200 × 630, con el mismo dibujo que las
// de `/og/…` (src/lib/utils/ogCollage.js, worker/og-render.js) pero sin portadas y con los textos
// originales (src/lib/utils/previewTexts.js). Se usan cuando no se puede dibujar la de verdad (sin
// base, en `vite dev`, o si falla). Uso: `node scripts/og-default/render.js`.
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createOgRenderer } from '../../worker/og-render.js';
import { OG_CARDS, OG_CARD_SIZE, ogCardText } from '../../src/lib/utils/ogCards.js';
import { COLLAGE_FONTS, COLLAGE_LOGO, collageTree } from '../../src/lib/utils/ogCollage.js';

/** Que cada imagen entre holgada en lo que WhatsApp muestra (unos 300 KB). */
const MAX_BYTES = 150 * 1024;

/** @param {string} specifier */
const fromPackage = (specifier) => readFileSync(fileURLToPath(import.meta.resolve(specifier)));
/** @param {string} path un archivo de static/ */
const fromStatic = (path) =>
	readFileSync(fileURLToPath(new URL(`../../static${path}`, import.meta.url)));

const render = createOgRenderer(
	fromPackage('satori/yoga.wasm'),
	fromPackage('@resvg/resvg-wasm/index_bg.wasm')
);
const fonts = COLLAGE_FONTS.map((f) => ({
	name: f.name,
	weight: f.weight,
	data: fromStatic(f.file)
}));
const logo = `data:image/png;base64,${fromStatic(COLLAGE_LOGO).toString('base64')}`;

let tooBig = false;
for (const [key, { file }] of Object.entries(OG_CARDS)) {
	const text = ogCardText(/** @type {keyof typeof OG_CARDS} */ (key));
	const bytes = await render(collageTree({ ...text, tiles: [], logo }), { ...OG_CARD_SIZE, fonts });
	const out = fileURLToPath(new URL(`../../static/${file}`, import.meta.url));
	writeFileSync(out, bytes);
	const size = statSync(out).size;
	console.log(`${file}: ${Math.round(size / 1024)} KB`);
	if (size > MAX_BYTES) tooBig = true;
}
if (tooBig) {
	console.error(`Alguna tarjeta pasa de ${MAX_BYTES / 1024} KB.`);
	process.exitCode = 1;
}
