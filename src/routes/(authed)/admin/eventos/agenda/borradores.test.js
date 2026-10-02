/**
 * Borradores desde la agenda: la carga rápida (action `crearBorrador`: duplicar un evento en un
 * día o empezar de cero, sin salir de la agenda) y «Confirmar» (action `confirmar` de la agenda y
 * de la ficha). Mismo repo falso que reschedule.test.js; datos inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const DIR = 'src/lib/posts/calendario';
const SOURCE = `${DIR}/fiesta-de-prueba-2099-11.md`;
const RAW = `---
title: 'Fiesta de prueba (4ª Edición)'
summary: 'Una fiesta inventada.'
tags:
  - español
  - pago
  - AMBA
category: calendario
authors:
  - KinkyVibe
featured: 1
status: abierto
start: 2099-11-14T21:00-03:00
end: 2099-11-15T02:00-03:00
location_name: Lugar de prueba
link: https://example.com/inscripcion
---
Texto de la fiesta.
`;
const DRAFT = `${DIR}/borrador-de-prueba.md`;
const DRAFT_RAW = `---
title: 'Borrador de prueba'
tags:
  - español
  - AMBA
category: calendario
status: anunciado
force_unlisted: true
borrador: true
start: 2099-12-20T20:00-03:00
---
`;
/** Un evento no listado a propósito (privado): sin la marca de borrador. */
const PRIVATE = `${DIR}/evento-privado-de-prueba.md`;
const PRIVATE_RAW = DRAFT_RAW.replace('borrador: true\n', '').replace(
	'Borrador de prueba',
	'Evento privado de prueba'
);

/** Repo falso: archivos, imágenes y los commits que se hicieron. */
const repo = {
	/** @type {Record<string, string>} */
	files: {},
	/** @type {Record<string, string>} ruta → sha */
	media: {},
	/** @type {any[]} */
	commits: []
};

vi.mock('$lib/server/eventos', async (importOriginal) => {
	const actual = /** @type {any} */ (await importOriginal());
	return {
		...actual,
		getRepoClient: async () => ({
			getFile: async (/** @type {string} */ _t, /** @type {string} */ path) =>
				repo.files[path] ?? null,
			listTree: async (
				/** @type {string} */ _t,
				/** @type {string} */ path,
				/** @type {any} */ opts = {}
			) => {
				if (path === DIR)
					return Object.keys(repo.files)
						.filter((p) => p.startsWith(DIR + '/') && !p.slice(DIR.length + 1).includes('/'))
						.map((p) => ({ path: p.slice(DIR.length + 1), sha: 'x', type: 'blob' }));
				const media = Object.entries(repo.media).map(([p, sha]) => ({
					path: p.slice(path.length + 1),
					sha,
					type: 'blob'
				}));
				if (opts.recursive) return media;
				return [...new Set(media.map((m) => m.path.split('/')[0]))].map((p) => ({
					path: p,
					sha: 'd',
					type: 'tree'
				}));
			},
			commitFiles: async (/** @type {string} */ _t, /** @type {any} */ opts) => {
				repo.commits.push(opts);
				for (const f of opts.files) if (f.content) repo.files[f.path] = f.content;
				return { sha: 'abc', url: 'https://example.com/commit/abc' };
			}
		})
	};
});

import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth.js';
import { listAudit } from '$lib/server/admin/audit.js';
import { actions } from './+page.server.js';
import { actions as fichaActions } from '../[slug]/+page.server.js';

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
});
afterAll(async () => {
	await t?.dispose();
});
beforeEach(async () => {
	await resetDB(t.db);
	repo.files = { [SOURCE]: RAW, [DRAFT]: DRAFT_RAW, [PRIVATE]: PRIVATE_RAW };
	repo.media = { [`${DIR}/media/fiesta-de-prueba-2099-11/1.jpg`]: 'sha-de-la-imagen' };
	repo.commits = [];
});

const admin = { user: { id: ADMINS[0].id, login: ADMINS[0].login }, user_token: 'prueba' };
const notAdmin = { user: { id: 1, login: 'persona-de-prueba' }, user_token: 'prueba' };

/**
 * Llama a una action como SvelteKit; si tira (redirect / error), devuelve `{ thrown }`.
 * @param {(event: any) => any} action
 * @param {any} locals
 * @param {Record<string, string>} fields
 * @param {Record<string, string>} [params]
 */
async function call(action, locals, fields, params = {}) {
	const body = new FormData();
	for (const [k, v] of Object.entries(fields)) body.set(k, v);
	/** @type {any} */
	const event = {
		platform: t.platform,
		locals,
		params,
		request: new Request('http://localhost/admin/eventos/agenda', { method: 'POST', body }),
		url: new URL('http://localhost/admin/eventos/agenda'),
		setHeaders: () => {}
	};
	try {
		return /** @type {any} */ (await action(event));
	} catch (e) {
		return { thrown: /** @type {any} */ (e).status };
	}
}

describe('carga rápida (action crearBorrador)', () => {
	it('duplica un evento en el día elegido: borrador no listado y anunciado, con la imagen', async () => {
		const r = await call(actions.crearBorrador, admin, {
			source: 'fiesta-de-prueba-2099-11',
			date: '2099-12-12'
		});
		expect(r.draft).toMatchObject({
			ok: true,
			slug: 'fiesta-de-prueba-2099-12',
			title: 'Fiesta de prueba (5ª Edición)'
		});
		expect(repo.commits).toHaveLength(1);
		const made = repo.files[`${DIR}/fiesta-de-prueba-2099-12.md`];
		expect(made).toContain('force_unlisted: true');
		expect(made).toContain('borrador: true');
		expect(made).toContain('status: anunciado');
		expect(made).toContain('start: 2099-12-12T21:00-03:00');
		expect(made).toContain('end: 2099-12-13T02:00-03:00');
		expect(made).toContain('location_name: Lugar de prueba');
		expect(made).toContain('Texto de la fiesta.');
		// la imagen del original, copiada (mismo blob)
		expect(repo.commits[0].files).toContainEqual({
			path: `${DIR}/media/fiesta-de-prueba-2099-12/1.jpg`,
			sha: 'sha-de-la-imagen'
		});
		// la fila para el calendario, con lo que le falta (anunciado: el link no se muestra)
		expect(r.draft.row).toMatchObject({
			slug: 'fiesta-de-prueba-2099-12',
			date: '2099-12-12',
			state: 'no-listado',
			draft: true
		});
		expect(r.draft.row.missing.map((/** @type {any} */ m) => m.id)).toEqual(['inscripcion']);
		const audit = (await listAudit(t.db)).filter((e) => e.action === 'event.draft');
		expect(audit).toHaveLength(1);
		expect(audit[0].targetId).toBe('fiesta-de-prueba-2099-12');
	});

	it('si la dirección está ocupada, elige otra', async () => {
		repo.files[`${DIR}/fiesta-de-prueba-2099-12.md`] = RAW;
		const r = await call(actions.crearBorrador, admin, {
			source: 'fiesta-de-prueba-2099-11',
			date: '2099-12-12'
		});
		expect(r.draft.slug).toBe('fiesta-de-prueba-2099-12-2');
	});

	it('de cero: con el título, desde la plantilla', async () => {
		const r = await call(actions.crearBorrador, admin, {
			title: 'Charla inventada',
			date: '2099-12-12',
			startTime: '19:00'
		});
		expect(r.draft).toMatchObject({ ok: true, slug: 'charla-inventada-2099-12' });
		const made = repo.files[`${DIR}/charla-inventada-2099-12.md`];
		expect(made).toContain('force_unlisted: true');
		expect(made).toContain('borrador: true');
		expect(made).toContain('start: 2099-12-12T19:00-03:00');
	});

	it('de cero sin título, o sin día: 400 y no toca el repo', async () => {
		const a = await call(actions.crearBorrador, admin, { date: '2099-12-12' });
		expect(a.status).toBe(400);
		const b = await call(actions.crearBorrador, admin, { source: 'fiesta-de-prueba-2099-11' });
		expect(b.status).toBe(400);
		expect(repo.commits).toHaveLength(0);
	});

	it('un evento que no existe: 404', async () => {
		const r = await call(actions.crearBorrador, admin, { source: 'no-existe', date: '2099-12-12' });
		expect(r.status).toBe(404);
		expect(repo.commits).toHaveLength(0);
	});

	it('sin sesión va al login; si no es admin, 403; ninguno toca el repo', async () => {
		const fields = { source: 'fiesta-de-prueba-2099-11', date: '2099-12-12' };
		expect(await call(actions.crearBorrador, {}, fields)).toEqual({ thrown: 303 });
		expect(await call(actions.crearBorrador, notAdmin, fields)).toEqual({ thrown: 403 });
		expect(repo.commits).toHaveLength(0);
	});
});

/** Lo que ve la agenda del borrador. */
const SEEN = {
	date: '2099-12-20',
	startTime: '20:00',
	endTime: '',
	title: 'Borrador de prueba',
	locationName: '',
	place: 'AMBA',
	state: 'no-listado'
};

describe('Confirmar un borrador', () => {
	it('desde la agenda: pasa a publicado, pierde la marca (el estado no cambia) y queda en Actividad', async () => {
		const r = await call(actions.confirmar, admin, {
			slug: 'borrador-de-prueba',
			before: JSON.stringify(SEEN)
		});
		expect(r.confirm).toMatchObject({ ok: true, slug: 'borrador-de-prueba' });
		expect(r.confirm.message).toMatch(/^Confirmado/);
		expect(repo.files[DRAFT]).not.toContain('force_unlisted');
		expect(repo.files[DRAFT]).not.toContain('borrador');
		expect(repo.files[DRAFT]).toContain('status: anunciado');
		const audit = (await listAudit(t.db)).filter((e) => e.action === 'event.confirm');
		expect(audit).toHaveLength(1);
		expect(audit[0].targetId).toBe('borrador-de-prueba');
	});

	it('desde la ficha: lee el archivo y hace lo mismo', async () => {
		const r = await call(fichaActions.confirmar, admin, {}, { slug: 'borrador-de-prueba' });
		expect(r.confirm).toMatchObject({ ok: true });
		expect(repo.files[DRAFT]).not.toContain('force_unlisted');
		expect(repo.files[DRAFT]).not.toContain('borrador');
	});

	it('un no listado a propósito (sin la marca) no se confirma, ni desde la agenda ni desde la ficha', async () => {
		const seen = { ...SEEN, title: 'Evento privado de prueba' };
		const a = await call(actions.confirmar, admin, {
			slug: 'evento-privado-de-prueba',
			before: JSON.stringify(seen)
		});
		expect(a.status).toBe(409);
		const b = await call(fichaActions.confirmar, admin, {}, { slug: 'evento-privado-de-prueba' });
		expect(b.status).toBe(409);
		expect(repo.files[PRIVATE]).toBe(PRIVATE_RAW);
		expect(repo.commits).toHaveLength(0);
		expect((await listAudit(t.db)).filter((e) => e.action === 'event.confirm')).toHaveLength(0);
	});

	it('uno que ya está publicado: 409 y no toca el repo', async () => {
		const r = await call(fichaActions.confirmar, admin, {}, { slug: 'fiesta-de-prueba-2099-11' });
		expect(r.status).toBe(409);
		expect(repo.commits).toHaveLength(0);
	});

	it('si alguien ya lo publicó mientras tanto: solo le saca la marca', async () => {
		repo.files[DRAFT] = DRAFT_RAW.replace('force_unlisted: true\n', '');
		const r = await call(actions.confirmar, admin, {
			slug: 'borrador-de-prueba',
			before: JSON.stringify(SEEN)
		});
		expect(r.confirm).toMatchObject({ ok: true });
		expect(repo.commits).toHaveLength(1);
		expect(repo.files[DRAFT]).not.toContain('borrador');
	});

	it('si alguien lo canceló mientras tanto: conflicto (409) con lo último', async () => {
		repo.files[DRAFT] = DRAFT_RAW.replace('status: anunciado', 'status: cancelado');
		const r = await call(actions.confirmar, admin, {
			slug: 'borrador-de-prueba',
			before: JSON.stringify(SEEN)
		});
		expect(r.status).toBe(409);
		expect(r.data.confirm.current).toMatchObject({ state: 'cancelado' });
		expect(repo.commits).toHaveLength(0);
	});

	it('sin sesión va al login; si no es admin, 403; ninguno toca el repo', async () => {
		const fields = { slug: 'borrador-de-prueba', before: JSON.stringify(SEEN) };
		expect(await call(actions.confirmar, {}, fields)).toEqual({ thrown: 303 });
		expect(await call(actions.confirmar, notAdmin, fields)).toEqual({ thrown: 403 });
		expect(
			await call(fichaActions.confirmar, notAdmin, {}, { slug: 'borrador-de-prueba' })
		).toEqual({ thrown: 403 });
		expect(repo.commits).toHaveLength(0);
	});
});
