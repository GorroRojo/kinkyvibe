#!/usr/bin/env node
/**
 * Datos de prueba del modo demo, como SQL (docs/demo.md). Nunca aplicar a la base `kinkyvibe`
 * (producción): solo a la de un preview o a la local.
 *
 * Lo normal es no usar esto: en el preview, el aviso del modo demo tiene «Recargar datos de
 * prueba» (POST /api/preview-seed), que genera lo mismo relativo al momento en que se aprieta.
 * El SQL no trae los eventos de prueba: son objetos `evento` que solo se escriben con saveObject()
 * (src/lib/server/demo/seedEvents.js), así que los carga solo ese botón.
 * Los datos y las reglas están en src/lib/server/demo/seed.js.
 *
 * Uso:
 *   node scripts/demo/seed.js [--today=2026-09-30] [--now=2026-09-30T12:00:00Z]
 *                             [--all] [--out=seed.sql] [--chunks=dir]
 *   --today         día de referencia (Argentina). Por defecto, hoy en Argentina.
 *   --now           instante para reservas "por vencer" e ingresos marcados. Por defecto, ahora.
 *   --all           suma las tablas de migraciones del panel (registro de actividad, notas...).
 *   --out           escribe el SQL en un archivo (si no, a stdout).
 *   --chunks        además, lo parte en archivos de ~18 KB (para la API/MCP de D1).
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	SECTIONS,
	buildData,
	chunkSql,
	seedSql,
	todayInArgentina
} from '../../src/lib/server/demo/seed.js';

export * from '../../src/lib/server/demo/seed.js';

function main() {
	const args = Object.fromEntries(
		process.argv.slice(2).map((a) => {
			const [k, ...v] = a.replace(/^--/, '').split('=');
			return [k, v.length ? v.join('=') : true];
		})
	);
	const now = args.now ? Date.parse(String(args.now)) : Date.now();
	if (!Number.isFinite(now)) throw new Error('--now inválido');
	const today = typeof args.today === 'string' ? args.today : todayInArgentina(now);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error('--today tiene que ser YYYY-MM-DD');
	const data = buildData({ today, now });
	const tables = args.all ? new Set(SECTIONS.flatMap((s) => s.requires ?? [s.table])) : null;
	const text = seedSql(data, { tables });
	if (typeof args.out === 'string') writeFileSync(args.out, text);
	else if (!args.chunks) process.stdout.write(text);
	if (typeof args.chunks === 'string') {
		rmSync(args.chunks, { recursive: true, force: true });
		mkdirSync(args.chunks, { recursive: true });
		chunkSql(text).forEach((c, i) =>
			writeFileSync(path.join(args.chunks, `${String(i + 1).padStart(2, '0')}.sql`), c)
		);
	}
	const count = (/** @type {string} */ s) => data.orders.filter((o) => o.status === s).length;
	console.error(
		`seed demo: hoy ${today} · ${data.events.length} eventos · ${data.orders.length} órdenes ` +
			`(${[
				'approved',
				'awaiting_transfer',
				'pending',
				'refunded',
				'expired',
				'rejected',
				'cancelled'
			]
				.map((s) => `${s} ${count(s)}`)
				.join(', ')}) · ${data.tickets.length} entradas ` +
			`(${data.tickets.filter((t) => t.checked_in_at).length} con ingreso) · ` +
			`${data.discountCodes.length} códigos · ${data.reminderSends.length} recordatorios`
	);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
