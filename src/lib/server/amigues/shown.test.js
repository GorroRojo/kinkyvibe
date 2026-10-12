/**
 * «Se muestra al público» es UNA regla para los perfiles y los lugares (./profiles.js):
 * `shownProfileWhere` (SQL: las listas de /amigues, las listas del sitio y el contador de no
 * listadas) e `isShownProfile` (con el objeto ya leído: el lugar de un evento y los integrantes de
 * un proyecto). Esta prueba arma todas las combinaciones (visibilidad × aprobado × borrado) para
 * cada quien mira y compara las dos formas entre sí y con la regla escrita a mano, como estaba en
 * cada lugar antes de juntarla. D1 de miniflare; perfiles inventados.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDB } from '$lib/server/db/testing.js';
import { saveObject } from '$lib/server/objects/save.js';
import { ANON, canSee, visibleWhere } from '$lib/server/objects/visibility.js';
import { makeProfile } from './testing.js';
import {
	isShownProfile,
	listPublicProfiles,
	shownProfileSql,
	shownProfileWhere
} from './profiles.js';

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;

/** @type {import('$lib/server/objects/visibility.js').Viewer[]} */
const VIEWERS = [
	ANON,
	{ role: 'member', id: 'cuenta-inventada' },
	// Quien creó los perfiles (como cuenta): en un perfil, haberlo creado no da acceso a lo oculto.
	{ role: 'member', id: 'admin-de-prueba' },
	{ role: 'admin', id: 'admin-inventade' }
];

/** @type {{ id: number, visibility: string, approved: boolean, deleted: boolean }[]} */
const made = [];

beforeAll(async () => {
	t = await createTestDB();
	let n = 0;
	for (const visibility of /** @type {const} */ (['public', 'members', 'hidden'])) {
		for (const approved of [true, false]) {
			for (const deleted of [false, true]) {
				const saved = await makeProfile(t.db, {
					title: `Perfil Inventado ${++n}`,
					kind: n % 3 === 0 ? 'lugar' : n % 3 === 1 ? 'persona' : 'proyecto',
					visibility,
					approved
				});
				if (deleted) {
					await saveObject(
						t.db,
						{ id: saved.id, type: 'perfil', version: saved.version, deleted: true },
						{ actor: 'admin-de-prueba' }
					);
				}
				made.push({ id: saved.id, visibility, approved, deleted });
			}
		}
	}
}, 120_000);
afterAll(async () => {
	await t?.dispose();
});

/**
 * Los ids que deja pasar una condición SQL sobre los perfiles inventados.
 * @param {{ sql: string, params: string[] }} where
 */
async function idsWhere(where) {
	const { results } = await t.db
		.prepare(`SELECT o.id FROM objects o WHERE o.type = 'perfil' AND ${where.sql} ORDER BY o.id`)
		.bind(...where.params)
		.all();
	return results.map((r) => Number(r.id));
}

describe('una sola regla de «se muestra al público» para perfiles y lugares', () => {
	it('las 12 combinaciones existen', () => {
		expect(made).toHaveLength(12);
	});

	for (const viewer of VIEWERS) {
		const who = `${viewer.role}${'id' in viewer ? ` (${viewer.id})` : ''}`;

		it(`SQL y JS dicen lo mismo para ${who}`, async () => {
			const sql = await idsWhere(shownProfileWhere(viewer, 'o'));
			const { results } = await t.db
				.prepare(
					`SELECT o.id, o.type, o.visibility, o.deleted_at, o.created_by,
						EXISTS (SELECT 1 FROM profile_approvals a WHERE a.profile_id = o.id) AS approved
					FROM objects o WHERE o.type = 'perfil' ORDER BY o.id`
				)
				.all();
			const js = results
				.filter((r) => {
					const o = /** @type {any} */ (r);
					return isShownProfile(canSee(o, viewer) ? o : null, Boolean(o.approved));
				})
				.map((r) => Number(r.id));
			expect(sql).toEqual(js);
		});

		it(`es la regla que estaba escrita en cada lugar para ${who}`, async () => {
			const visible = visibleWhere(viewer, 'o');
			// Como estaba en listPublicProfiles y en el contador de no listadas (JOIN con las
			// aprobaciones) y en las listas del sitio (EXISTS).
			const before = await idsWhere({
				sql: `${visible.sql} AND o.visibility != 'hidden'
					AND EXISTS (SELECT 1 FROM profile_approvals pa WHERE pa.profile_id = o.id)`,
				params: visible.params
			});
			expect(await idsWhere(shownProfileWhere(viewer, 'o'))).toEqual(before);
			// Y lo mismo en JS (como estaba en el lugar de un evento: `linkedVenueView`).
			const expected = made
				.filter((m) => {
					const seen = canSee(
						{
							type: 'perfil',
							visibility: m.visibility,
							deleted_at: m.deleted ? 1 : null,
							created_by: 'admin-de-prueba'
						},
						viewer
					);
					return seen && m.visibility !== 'hidden' && m.approved;
				})
				.map((m) => m.id);
			expect(before).toEqual(expected);
		});
	}

	it('nadie ve un perfil oculto, sin aprobar o borrado en lo público (tampoco admins)', async () => {
		const shown = new Set(await idsWhere(shownProfileWhere({ role: 'admin', id: 'x' }, 'o')));
		for (const m of made) {
			const ok = m.visibility !== 'hidden' && m.approved && !m.deleted;
			expect(shown.has(m.id), JSON.stringify(m)).toBe(ok);
		}
	});

	it('la parte sin quien mira es la misma con cualquier alias', async () => {
		const { results } = await t.db
			.prepare(`SELECT p.id FROM objects p WHERE p.type = 'perfil' AND ${shownProfileSql('p')}`)
			.all();
		const ids = results.map((r) => Number(r.id)).sort((a, b) => a - b);
		expect(ids).toEqual(
			made.filter((m) => m.visibility !== 'hidden' && m.approved).map((m) => m.id)
		);
		expect(() => shownProfileSql('o; DROP TABLE objects')).toThrow();
	});

	it('listPublicProfiles lista lo que deja pasar la regla (no listados aparte)', async () => {
		for (const viewer of VIEWERS) {
			const listed = (await listPublicProfiles(t.db, viewer)).map((p) => p.object.id);
			const shown = await idsWhere(shownProfileWhere(viewer, 'o'));
			expect([...listed].sort((a, b) => a - b)).toEqual(shown);
		}
	});

	it('isShownProfile: sin objeto o sin aprobación, no', () => {
		expect(isShownProfile(null, true)).toBe(false);
		expect(isShownProfile(undefined, true)).toBe(false);
		expect(isShownProfile({ visibility: 'public' }, false)).toBe(false);
		expect(isShownProfile({ visibility: 'hidden' }, true)).toBe(false);
		expect(isShownProfile({ visibility: 'members' }, true)).toBe(true);
		expect(isShownProfile({ visibility: 'public' }, true)).toBe(true);
	});
});
