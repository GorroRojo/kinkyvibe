// Pasa a edges `enlaza` los `[[…]]`, `@` y `#` de los cuerpos que ya estaban guardados antes de
// que el guardado los calculara (docs/enlaces.md, src/lib/server/objects/enlaces.js). Una sola vez.
//
// SOLO la base D1 LOCAL (scripts/local-d1.js: nunca se conecta a Cloudflare). Para preview o
// producción no hay opción a propósito: eso lo decide gorrite, con otro camino.
//
//   node scripts/enlaces-backfill.js            # vista previa: cuenta qué cambiaría, no escribe
//   node scripts/enlaces-backfill.js --apply    # vuelve a guardar los objetos que cambian
//
// Por cada evento, material, perfil y etiqueta vivo, resuelve su cuerpo como lo haría un guardado y
// lo compara con los edges `enlaza` que tiene. Con --apply, vuelve a guardar con saveObject() (el
// único camino de escritura) solo los que cambian, sin tocar sus datos: la versión sube, el
// historial suma una fila «migracion», `updated_at` queda como estaba (no se ven «actualizados») y,
// si se importó y nadie lo había editado, sigue contando como no editado (content_sources,
// profile_sources, tag_sources). Lo que no se resuelve («falta») no se guarda: se cuenta.
import process from 'node:process';
import {
	resolveBodyLinks,
	ENLAZA_EDGE,
	ENLAZA_TARGETS
} from '../src/lib/server/objects/enlaces.js';
import { saveObject } from '../src/lib/server/objects/save.js';
import { revisionStatement } from '../src/lib/server/contenido/revisions.js';
import { openLocalD1 } from './local-d1.js';

const ACTOR = 'script:enlaces-backfill';
const apply = process.argv.includes('--apply');

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{ id: number, type: string, version: number, updated_at: number }} o
 */
async function resave(db, o) {
	await saveObject(
		db,
		{ id: o.id, type: o.type, version: o.version },
		{
			actor: ACTOR,
			now: o.updated_at,
			also: (self) => [
				...[
					['content_sources', 'object_id'],
					['profile_sources', 'profile_id'],
					['tag_sources', 'tag_id']
				].map(([table, col]) =>
					db
						.prepare(
							`UPDATE ${table} SET imported_version = ?3 WHERE ${col} = ?1 AND imported_version = ?2`
						)
						.bind(o.id, o.version, o.version + 1)
				),
				revisionStatement(db, self, 'migracion')
			]
		}
	);
}

async function main() {
	const { db, dispose } = await openLocalD1();
	try {
		const { results: objects } = await db
			.prepare(
				`SELECT id, type, version, updated_at, json_extract(data, '$.body') AS body FROM objects
				WHERE deleted_at IS NULL AND type IN (SELECT value FROM json_each(?1)) ORDER BY id`
			)
			.bind(JSON.stringify(ENLAZA_TARGETS))
			.all();
		const { results: edgeRows } = await db
			.prepare('SELECT from_id, to_id FROM edges WHERE kind = ?1 ORDER BY from_id, position, id')
			.bind(ENLAZA_EDGE)
			.all();
		/** @type {Map<number, number[]>} */
		const stored = new Map();
		for (const e of edgeRows) {
			const list = stored.get(Number(e.from_id)) ?? [];
			list.push(Number(e.to_id));
			stored.set(Number(e.from_id), list);
		}
		const n = { objects: 0, withLinks: 0, resolved: 0, missing: 0, add: 0, remove: 0 };
		/** @type {Map<string, Map<number, number>>} */
		const byType = new Map();
		/** @type {Map<string, number>} */
		const missingNames = new Map();
		/** @type {typeof objects} */
		const toSave = [];
		for (const o of objects) {
			n.objects++;
			const { ids, missing } = await resolveBodyLinks(db, o.body, Number(o.id));
			if (ids.length || missing.length) n.withLinks++;
			n.resolved += ids.length;
			n.missing += missing.length;
			for (const m of missing) {
				const key = `${m.form === 'mencion' ? '@' : m.form === 'etiqueta' ? '#' : ''}${m.target}`;
				missingNames.set(key, (missingNames.get(key) ?? 0) + 1);
			}
			const have = stored.get(Number(o.id)) ?? [];
			const add = ids.filter((id) => !have.includes(id)).length;
			const remove = have.filter((id) => !ids.includes(id)).length;
			n.add += add;
			n.remove += remove;
			if (add || remove || ids.join() !== have.join()) {
				toSave.push(o);
				const t = byType.get(String(o.type)) ?? new Map();
				byType.set(String(o.type), t.set(Number(o.id), add - remove));
			}
		}
		console.log(apply ? 'Aplicando (base local).' : 'Vista previa (base local; --apply escribe).');
		console.log(
			`${n.objects} objetos con cuerpo posible, ${n.withLinks} nombran algo: ` +
				`${n.resolved} enlaces resueltos, ${n.missing} que faltan.`
		);
		console.log(
			`Edges «${ENLAZA_EDGE}»: ${edgeRows.length} guardados, ${n.add} para sumar, ${n.remove} para sacar; ` +
				`${toSave.length} objetos para volver a guardar.`
		);
		for (const [type, m] of byType) console.log(`  ${type}: ${m.size}`);
		const top = [...missingNames].sort((a, b) => b[1] - a[1]).slice(0, 15);
		if (top.length) {
			console.log('Lo que más falta:');
			for (const [name, count] of top) console.log(`  ${count} × ${name}`);
		}
		if (!apply) return;
		let saved = 0;
		let failed = 0;
		for (const o of toSave) {
			try {
				await resave(db, /** @type {any} */ (o));
				saved++;
			} catch (e) {
				failed++;
				console.log(`error en el objeto ${o.id}: ${e instanceof Error ? e.message : e}`);
			}
		}
		console.log(`Guardados ${saved}, con error ${failed}.`);
		if (failed) process.exitCode = 1;
	} finally {
		await dispose();
	}
}

await main();
