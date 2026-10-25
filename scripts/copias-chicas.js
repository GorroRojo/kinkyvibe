// Hace las copias chicas para las tarjetas (WEBP, lado más corto de 360 y 720 px) de las imágenes
// que ya estaban en la biblioteca antes de que la subida las hiciera (docs/imagenes.md, «Copias
// chicas para las tarjetas»; src/lib/server/media/copias.js). Se corre una vez después del deploy.
//
// SOLO SUMA: escribe únicamente `img/<hash>-360.webp` e `img/<hash>-720.webp` que no existan.
// Nunca borra ni pisa nada (ni los originales ni otra copia) y no toca la base. Idempotente.
//
// Sin --yes NO escribe: muestra qué escribiría. Producción la corre gorrite (pide escribir
// «produccion»).
//
//   node scripts/copias-chicas.js                                # local: solo muestra qué haría
//   node scripts/copias-chicas.js --yes                          # local (.wrangler/state)
//   node scripts/copias-chicas.js --target=preview               # preview: solo muestra qué haría
//   node scripts/copias-chicas.js --target=preview --yes         # preview (necesita `wrangler login`)
//   node scripts/copias-chicas.js --target=production            # producción: solo muestra qué haría
//   node scripts/copias-chicas.js --target=production --yes      # producción: pide escribir «produccion»
//
// Achica con sharp (devDependency, la misma versión que ya instalaba wrangler por miniflare).
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { getPlatformProxy, unstable_readConfig } from 'wrangler';
import { backfillCopies } from '../src/lib/server/media/copias.js';
import { COPY_QUALITY, copySize } from '../src/lib/utils/mediaCopies.js';

const args = process.argv.slice(2);
const write = args.includes('--yes');
const target = (args.find((a) => a.startsWith('--target=')) ?? '--target=local').slice(9);

/** Lo que hay que escribir para confirmar que se escribe en producción. */
export const PRODUCTION_WORD = 'produccion';

/** Pide escribir {@link PRODUCTION_WORD} antes de tocar producción; si no, corta. */
async function confirmProduction() {
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	const answer = await rl.question(
		`Vas a escribir copias nuevas en el bucket de PRODUCCIÓN (solo suma, no pisa nada). Escribí «${PRODUCTION_WORD}» para seguir: `
	);
	rl.close();
	if (answer.trim().toLowerCase() !== PRODUCTION_WORD)
		throw new Error('Cancelado: no se escribió nada.');
}

/**
 * La copia WEBP de `side` px de un original (como la del navegador: con la orientación de la foto
 * aplicada, el lado más corto en `side`, nunca agrandada).
 * @param {Uint8Array} bytes
 * @param {number} side
 */
export async function resizeWithSharp(bytes, side) {
	const { default: sharp } = await import('sharp');
	const meta = await sharp(bytes).metadata();
	// Orientación EXIF 5 a 8: la foto se ve girada 90°, el ancho y el alto se cambian.
	const turned = (meta.orientation ?? 1) >= 5;
	const w = Number(turned ? meta.height : meta.width);
	const h = Number(turned ? meta.width : meta.height);
	const size = copySize(w, h, side);
	const out = await sharp(bytes)
		.rotate()
		.resize(size.width, size.height, { fit: 'fill' })
		.webp({ quality: Math.round(COPY_QUALITY * 100) })
		.toBuffer();
	return new Uint8Array(out);
}

/**
 * La binding MEDIA de local (miniflare, .wrangler/state) o de preview o producción (remota).
 * @returns {Promise<{ bucket: any, dispose: () => Promise<void> }>}
 */
async function openTarget() {
	if (target === 'local') {
		const proxy = await getPlatformProxy({ persist: true, remoteBindings: false, envFiles: [] });
		return { bucket: proxy.env.MEDIA, dispose: () => proxy.dispose() };
	}
	if (target === 'preview' || target === 'production') {
		const prod = target === 'production';
		if (prod && write) await confirmProduction();
		// El bucket tal cual está en wrangler.toml (arriba para producción, en [previews] para
		// preview; el nombre se lee del archivo, nunca se escribe a mano), marcado como remoto.
		const config = unstable_readConfig({ config: 'wrangler.toml' });
		const section = prod ? config : /** @type {any} */ (config.previews ?? {});
		const r2 = (section.r2_buckets ?? []).find((/** @type {any} */ b) => b.binding === 'MEDIA');
		if (!r2) throw new Error(`wrangler.toml no tiene MEDIA ${prod ? 'arriba' : 'en [previews]'}.`);
		console.log(`${target}: bucket ${r2.bucket_name}.`);
		const dir = await mkdtemp(path.join(tmpdir(), 'kv-copias-'));
		const file = path.join(dir, 'wrangler.json');
		await writeFile(
			file,
			JSON.stringify({
				name: 'kinkyvibe-copias-chicas',
				compatibility_date: config.compatibility_date,
				r2_buckets: [{ ...r2, remote: true }]
			})
		);
		const proxy = await getPlatformProxy({ configPath: file, remoteBindings: true, envFiles: [] });
		return {
			bucket: proxy.env.MEDIA,
			dispose: async () => {
				await proxy.dispose();
				await rm(dir, { recursive: true, force: true });
			}
		};
	}
	throw new Error(`--target tiene que ser local, preview o production (no «${target}»).`);
}

async function main() {
	const { bucket, dispose } = await openTarget();
	try {
		if (!bucket) throw new Error('No hay binding MEDIA (bucket de la biblioteca).');
		const tag = write ? '' : '[vista previa] ';
		const r = await backfillCopies(bucket, {
			dryRun: !write,
			resize: resizeWithSharp,
			log: (line) => console.log(line)
		});
		if (!write) {
			for (const p of r.planned) console.log(`${tag}escribiría ${p.key} (de ${p.original})`);
		}
		console.log(
			`${tag}${target}: ${r.planned.length} copias que faltan, de ${r.originals} imágenes.` +
				(write ? ` Escritas: ${r.written.length}.` : ' Para escribirlas, agregá --yes.')
		);
		for (const e of r.errors) console.log(`error ${e.key} (de ${e.original}): ${e.error}`);
		if (r.errors.length) process.exitCode = 1;
	} finally {
		await dispose();
	}
}

// pathToFileURL: en Windows la ruta trae `C:\` y barras invertidas, y `file://${…}` no coincide.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
