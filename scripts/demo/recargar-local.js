#!/usr/bin/env node
/**
 * «Recargar datos de prueba» en la base D1 LOCAL (la de `npm run dev`, en .wrangler/state), lo
 * mismo que el botón del modo demo en un preview (docs/demo.md). Nunca se conecta a Cloudflare:
 * abre la base con scripts/local-d1.js (miniflare, `remoteBindings: false`).
 *
 *   npm run demo:local              # con copias de los eventos del sitio público (solo GET)
 *   npm run demo:local -- --sin-red # solo los eventos inventados (como sin conexión)
 *
 * Si el sitio público no responde, sigue sin copias (no falla).
 */
import process from 'node:process';
import { openLocalD1 } from '../local-d1.js';
import { reloadDemoData } from '../../src/lib/server/demo/seed.js';

const offline = process.argv.includes('--sin-red');
const { db, dispose } = await openLocalD1();
try {
	const r = await reloadDemoData(db, { where: 'local', fetch: offline ? null : fetch });
	const copies = r.realEvents.fallback
		? `sin copias (${r.realEvents.fallback})`
		: `${r.realEvents.copied} copias de ${r.realEvents.source}`;
	console.log(
		`demo local: hoy ${r.today} · ${r.eventObjects} eventos guardados (${copies}) · ` +
			`${r.orders} órdenes · ${r.tickets} entradas`
	);
} finally {
	await dispose();
}
