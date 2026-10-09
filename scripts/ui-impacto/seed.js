#!/usr/bin/env node
// Prepara la base D1 LOCAL de un lado del informe de impacto visual (docs/ui-impacto.md). Se corre
// con el directorio de trabajo en la copia de ese lado (una carpeta temporal con su propio
// .wrangler/state, nunca la base de `npm run dev`) y con el reloj corrido de ./clock.js:
//
//   UI_IMPACTO_NOW=<ms> node --import <ruta>/clock.js <ruta>/seed.js --out=<ctx.json>
//
// Usa el código de ESE lado (sus migraciones, su importación de contenido y su seed del modo
// demo), así cada lado tiene los datos que tendría con su versión. Lo que ese lado todavía no
// tiene se saltea y queda anotado en `skipped`. Nunca toca una base remota: todo pasa por
// `--local` / scripts/local-d1.js (miniflare).
//
// Escribe en --out lo que las páginas necesitan saber (direcciones de los eventos de prueba, la
// sesión de la persona de prueba para Mi rincón...). Todo inventado.
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const outArg = process.argv.find((a) => a.startsWith('--out='));
if (!outArg) throw new Error('Falta --out=<archivo.json>');
const OUT = outArg.slice('--out='.length);
/** Cuenta de prueba de scripts/demo/n3-cuentas.sql (dominio reservado, no existe). */
const MEMBER_EMAIL = 'demo.entradas@example.invalid';

/** @type {string[]} */
const skipped = [];
/** @type {Record<string, any>} */
const ctx = { now: Date.now(), skipped };

/** @param {string} rel */
const has = (rel) => existsSync(path.join(ROOT, rel));
/** @param {string} rel */
const load = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

/**
 * @param {string} cmd
 * @param {string[]} args
 */
function run(cmd, args) {
	const r = spawnSync(cmd, args, {
		cwd: ROOT,
		stdio: ['ignore', 'inherit', 'inherit'],
		env: { ...process.env, CI: 'true' }
	});
	if (r.status !== 0) throw new Error(`Falló: ${cmd} ${args.join(' ')}`);
}

/** Abre la base local de este lado con su propio scripts/local-d1.js. */
async function openDB() {
	const { openLocalD1 } = await load('scripts/local-d1.js');
	return /** @type {{ db: import('@cloudflare/workers-types').D1Database, dispose: () => Promise<void> }} */ (
		await openLocalD1({ migrate: false })
	);
}

// 1. Migraciones + eventos, material, amigues y etiquetas de los .md (como las pruebas E2E).
if (has('scripts/import-content.js')) run('node', ['scripts/import-content.js', '--quiet']);
else {
	run('npx', ['wrangler', 'd1', 'migrations', 'apply', 'kinkyvibe', '--local']);
	skipped.push('import-content');
}

// 2. Los datos de prueba del modo demo, con el «ahora» corrido (como «Recargar datos de prueba»).
if (has('src/lib/server/demo/seed.js') && has('scripts/local-d1.js')) {
	const seed = await load('src/lib/server/demo/seed.js');
	if (typeof seed.reloadDemoData === 'function') {
		const { db, dispose } = await openDB();
		try {
			// Base local y sin `fetch`: solo los eventos inventados (las capturas no dependen de la red).
			const result = await seed.reloadDemoData(db, { where: 'local', now: ctx.now });
			ctx.today = result.today;
			ctx.tonight = result.tonight?.slug ?? null;
			/** @type {{ slug: string, series: string, offset: number, start: string | number, end?: string | number }[]} */
			const events = seed.buildData({ today: result.today, now: ctx.now }).events;
			const workshop = events.find((e) => e.series === 'taller-cuerdas-1' && e.offset > 0);
			ctx.workshop = workshop?.slug ?? null;
			ctx.workshopStart = workshop?.start ?? null;
			ctx.workshopEnd = workshop?.end ?? null;
		} finally {
			await dispose();
		}
	} else skipped.push('demo-seed');
} else skipped.push('demo-seed');

// 3. Personas y cuentas de prueba (para Mi rincón y la ficha de una persona).
for (const f of ['scripts/demo/n3-personas.sql', 'scripts/demo/n3-cuentas.sql']) {
	if (has(f)) run('npx', ['wrangler', 'd1', 'execute', 'kinkyvibe', '--local', '--file', f]);
	else skipped.push(path.basename(f));
}

if (has('scripts/local-d1.js')) {
	const { db, dispose } = await openDB();
	try {
		// 4. Un taller en dos partes: el taller de prueba que viene, con una parte una semana después.
		// La parte la crea el servidor (`?/partes_crear` del editor, como une admin: ver
		// ./setup.js), porque ese código no se puede cargar fuera de SvelteKit. Acá solo las fechas,
		// en el formato del campo del editor («2026-10-21T15:00», hora de Argentina).
		if (ctx.workshop) {
			const week = 7 * 24 * 60 * 60 * 1000;
			const ar = 3 * 60 * 60 * 1000;
			const shift = (/** @type {string | number | null} */ v) => {
				const ms = typeof v === 'number' ? v : v ? Date.parse(v) : NaN;
				return Number.isFinite(ms) ? new Date(ms + week - ar).toISOString().slice(0, 16) : null;
			};
			ctx.workshopPartStart = shift(ctx.workshopStart);
			ctx.workshopPartEnd = shift(ctx.workshopEnd);
		}

		// 5. Una sesión de la persona de prueba con entradas (cookie de Mi rincón). El token es al azar
		// y vive solo en esta base temporal.
		const account = await db
			.prepare('SELECT id FROM accounts WHERE email = ?1')
			.bind(MEMBER_EMAIL)
			.first()
			.catch(() => null);
		if (account) {
			const token = randomBytes(32).toString('base64url');
			const hash = createHash('sha256').update(token).digest('hex');
			await db
				.prepare(
					`INSERT INTO account_sessions (token_hash, account_id, method, created_at, last_seen_at)
					VALUES (?1, ?2, 'code', ?3, ?3)`
				)
				.bind(hash, account.id, ctx.now)
				.run();
			ctx.memberToken = token;
		} else skipped.push('sesión de Mi rincón');
	} finally {
		await dispose();
	}
}

writeFileSync(OUT, JSON.stringify(ctx, null, 2));
console.log(`ui-impacto: base lista${skipped.length ? ` (salteado: ${skipped.join(', ')})` : ''}`);
