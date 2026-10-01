/**
 * Mover eventos a otro día desde el calendario de la agenda: arrastrar no guarda; "Guardar
 * cambios" manda todos los movidos por la action `saveMany` (un commit), la misma de "Guardar N
 * filas" de la planilla, con los mismos permisos, la misma validación y la misma detección de
 * conflictos que la action `save` de una fila. Acá se prueban las dos con cambios de fecha.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const PATH = 'src/lib/posts/calendario/fiesta-de-prueba.md';
const RAW = `---
title: 'Fiesta de prueba'
tags:
  - español
  - AMBA
category: calendario
status: abierto
start: 2099-12-12T21:00-03:00
end: 2099-12-13T02:00-03:00
location_name: Lugar de prueba
---
Texto.
`;

/** Repo falso: un archivo y los commits que se hicieron. */
const repo = {
	/** @type {Record<string, string>} */
	files: {},
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
			commitFiles: async (/** @type {string} */ _t, /** @type {any} */ opts) => {
				repo.commits.push(opts);
				for (const f of opts.files) repo.files[f.path] = f.content;
				return { sha: 'abc', url: 'https://example.com/commit/abc' };
			}
		})
	};
});

import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth.js';
import { listAudit } from '$lib/server/admin/audit.js';
import { movedAgendaValues } from '$lib/utils/calendario.js';
import { pendingMovesReducer, pendingSavePayload } from '$lib/utils/pendingMoves.js';
import { actions } from './+page.server.js';

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
	repo.files = { [PATH]: RAW };
	repo.commits = [];
});

const admin = { user: { id: ADMINS[0].id, login: ADMINS[0].login }, user_token: 'prueba' };
const adminWithoutToken = { user: { id: ADMINS[0].id, login: ADMINS[0].login } };
const notAdmin = { user: { id: 1, login: 'persona-de-prueba' }, user_token: 'prueba' };

/** @type {import('$lib/utils/agenda.js').AgendaValues} */
const BEFORE = {
	date: '2099-12-12',
	startTime: '21:00',
	endTime: '02:00',
	title: 'Fiesta de prueba',
	locationName: 'Lugar de prueba',
	place: 'AMBA',
	state: 'publicado'
};

/**
 * Llama a la action como SvelteKit; si tira (redirect / error), devuelve `{ thrown }`.
 * @param {any} locals
 * @param {Record<string, unknown>} after
 * @param {{ before?: Record<string, unknown>, slug?: string }} [opts]
 */
async function move(locals, after, { before = BEFORE, slug = 'fiesta-de-prueba' } = {}) {
	const body = new FormData();
	body.set('slug', slug);
	body.set('before', JSON.stringify(before));
	body.set('after', JSON.stringify(after));
	/** @type {any} */
	const event = {
		platform: t.platform,
		locals,
		request: new Request('http://localhost/admin/eventos/agenda?/save', { method: 'POST', body }),
		url: new URL('http://localhost/admin/eventos/agenda?/save'),
		setHeaders: () => {}
	};
	try {
		return /** @type {any} */ (await actions.save(event));
	} catch (e) {
		return { thrown: /** @type {any} */ (e).status };
	}
}

describe('mover un evento a otro día (action save de la agenda)', () => {
	it('admin: cambia solo la fecha (y conserva que termina al día siguiente) y queda registrado', async () => {
		const after = movedAgendaValues(BEFORE, { date: '2099-12-19', time: '21:00' });
		const r = await move(admin, after);
		expect(r.save).toMatchObject({ ok: true, changed: ['date'], slug: 'fiesta-de-prueba' });
		expect(repo.commits).toHaveLength(1);
		const saved = repo.files[PATH];
		expect(saved).toContain('start: 2099-12-19T21:00-03:00');
		expect(saved).toContain('end: 2099-12-20T02:00-03:00');
		expect(saved).toContain("title: 'Fiesta de prueba'");
		const audit = (await listAudit(t.db)).filter((e) => e.action === 'event.agenda');
		expect(audit).toHaveLength(1);
		expect(audit[0].targetId).toBe('fiesta-de-prueba');
	});

	it('en la vista semana mueve la hora y corre la de fin lo mismo', async () => {
		const after = movedAgendaValues(BEFORE, { date: '2099-12-13', time: '23:00' });
		const r = await move(admin, after);
		expect(r.save).toMatchObject({ ok: true });
		expect(repo.files[PATH]).toContain('start: 2099-12-13T23:00-03:00');
		expect(repo.files[PATH]).toContain('end: 2099-12-14T04:00-03:00');
	});

	it('sin sesión va al login y no toca el repo', async () => {
		const r = await move({}, { ...BEFORE, date: '2099-12-19' });
		expect(r).toEqual({ thrown: 303 });
		expect(repo.commits).toHaveLength(0);
	});

	it('una cuenta que no es admin: 403 y no toca el repo', async () => {
		const r = await move(notAdmin, { ...BEFORE, date: '2099-12-19' });
		expect(r).toEqual({ thrown: 403 });
		expect(repo.commits).toHaveLength(0);
	});

	it('admin sin token de GitHub: vuelve a iniciar sesión y no toca el repo', async () => {
		const r = await move(adminWithoutToken, { ...BEFORE, date: '2099-12-19' });
		expect(r).toEqual({ thrown: 303 });
		expect(repo.commits).toHaveLength(0);
	});

	it('una fecha inválida no se guarda (misma validación que la planilla)', async () => {
		const r = await move(admin, { ...BEFORE, date: '2099-02-30' });
		expect(r.status).toBe(400);
		expect(r.data.save).toMatchObject({ ok: false, errors: { date: 'Fecha inválida.' } });
		expect(repo.commits).toHaveLength(0);
	});

	it('un slug raro no se guarda', async () => {
		const r = await move(admin, { ...BEFORE, date: '2099-12-19' }, { slug: '../secreto' });
		expect(r.status).toBe(400);
		expect(repo.commits).toHaveLength(0);
	});

	it('si alguien cambió la fecha mientras tanto: conflicto (409) con lo último del archivo', async () => {
		repo.files[PATH] = RAW.replace('2099-12-12T21:00', '2099-12-15T21:00').replace(
			'2099-12-13T02:00',
			'2099-12-16T02:00'
		);
		const r = await move(admin, { ...BEFORE, date: '2099-12-19' });
		expect(r.status).toBe(409);
		expect(r.data.save.current).toMatchObject({ date: '2099-12-15', slug: 'fiesta-de-prueba' });
		expect(repo.commits).toHaveLength(0);
	});

	it('deshacer es otro guardado con before y after al revés', async () => {
		const after = { ...BEFORE, date: '2099-12-19' };
		expect((await move(admin, after)).save.ok).toBe(true);
		const r = await move(admin, BEFORE, { before: after });
		expect(r.save).toMatchObject({ ok: true, changed: ['date'] });
		expect(repo.files[PATH]).toContain('start: 2099-12-12T21:00-03:00');
		expect(repo.commits).toHaveLength(2);
	});
});

/* ---------- "Guardar cambios": varios eventos movidos, un commit (action saveMany) ---------- */

const PATH_B = 'src/lib/posts/calendario/otra-fiesta.md';
const RAW_B = RAW.replace("'Fiesta de prueba'", "'Otra fiesta'");
/** @type {import('$lib/utils/agenda.js').AgendaValues} */
const BEFORE_B = { ...BEFORE, title: 'Otra fiesta' };

/**
 * Llama a la action `saveMany` como SvelteKit; si tira (redirect / error), devuelve `{ thrown }`.
 * @param {any} locals
 * @param {unknown} rows lo que manda "Guardar cambios" (ver pendingSavePayload)
 */
async function saveMany(locals, rows) {
	const body = new FormData();
	body.set('rows', typeof rows === 'string' ? rows : JSON.stringify(rows));
	/** @type {any} */
	const event = {
		platform: t.platform,
		locals,
		request: new Request('http://localhost/admin/eventos/agenda?/saveMany', {
			method: 'POST',
			body
		}),
		url: new URL('http://localhost/admin/eventos/agenda?/saveMany'),
		setHeaders: () => {}
	};
	try {
		return /** @type {any} */ (await actions.saveMany(event));
	} catch (e) {
		return { thrown: /** @type {any} */ (e).status };
	}
}

/** Lo que arma la página con dos eventos movidos sin guardar. */
function twoMoves() {
	/** @type {import('$lib/utils/pendingMoves.js').PendingMoves} */
	let s = {};
	s = pendingMovesReducer(s, {
		type: 'move',
		slug: 'fiesta-de-prueba',
		title: 'Fiesta de prueba',
		saved: BEFORE,
		to: { date: '2099-12-19' }
	});
	s = pendingMovesReducer(s, {
		type: 'move',
		slug: 'otra-fiesta',
		title: 'Otra fiesta',
		saved: BEFORE_B,
		to: { date: '2099-12-26', time: '22:00' }
	});
	return pendingSavePayload(s);
}

describe('guardar varios eventos movidos (action saveMany)', () => {
	beforeEach(() => {
		repo.files[PATH_B] = RAW_B;
	});

	it('admin: los dos en un solo commit, y cada uno queda en el registro', async () => {
		const r = await saveMany(admin, twoMoves());
		expect(r.saveMany).toMatchObject({ ok: true });
		expect(r.saveMany.results.map((/** @type {any} */ x) => [x.slug, x.ok])).toEqual([
			['fiesta-de-prueba', true],
			['otra-fiesta', true]
		]);
		expect(repo.commits).toHaveLength(1);
		expect(repo.commits[0].files).toHaveLength(2);
		expect(repo.files[PATH]).toContain('start: 2099-12-19T21:00-03:00');
		expect(repo.files[PATH]).toContain('end: 2099-12-20T02:00-03:00');
		expect(repo.files[PATH_B]).toContain('start: 2099-12-26T22:00-03:00');
		expect(repo.files[PATH_B]).toContain('end: 2099-12-27T03:00-03:00');
		const audit = (await listAudit(t.db)).filter((e) => e.action === 'event.agenda');
		expect(audit.map((e) => e.targetId).sort()).toEqual(['fiesta-de-prueba', 'otra-fiesta']);
	});

	it('sin sesión va al login y no toca el repo', async () => {
		expect(await saveMany({}, twoMoves())).toEqual({ thrown: 303 });
		expect(repo.commits).toHaveLength(0);
	});

	it('una cuenta que no es admin: 403 y no toca el repo', async () => {
		expect(await saveMany(notAdmin, twoMoves())).toEqual({ thrown: 403 });
		expect(repo.commits).toHaveLength(0);
	});

	it('admin sin token de GitHub: vuelve a iniciar sesión y no toca el repo', async () => {
		expect(await saveMany(adminWithoutToken, twoMoves())).toEqual({ thrown: 303 });
		expect(repo.commits).toHaveLength(0);
	});

	it('si alguien movió uno mientras tanto: ese da conflicto con lo último, el otro se guarda', async () => {
		repo.files[PATH] = RAW.replace('2099-12-12T21:00', '2099-12-15T21:00').replace(
			'2099-12-13T02:00',
			'2099-12-16T02:00'
		);
		const r = await saveMany(admin, twoMoves());
		expect(r.status).toBe(409);
		const [a, b] = r.data.saveMany.results;
		expect(a).toMatchObject({ slug: 'fiesta-de-prueba', ok: false, status: 409 });
		expect(a.current).toMatchObject({ date: '2099-12-15', slug: 'fiesta-de-prueba' });
		expect(b).toMatchObject({ slug: 'otra-fiesta', ok: true });
		expect(repo.commits).toHaveLength(1);
		expect(repo.commits[0].files.map((/** @type {any} */ f) => f.path)).toEqual([PATH_B]);
		expect(repo.files[PATH]).toContain('start: 2099-12-15T21:00-03:00');
		const audit = (await listAudit(t.db)).filter((e) => e.action === 'event.agenda');
		expect(audit.map((e) => e.targetId)).toEqual(['otra-fiesta']);
	});

	it('una fecha inválida no se guarda (misma validación que la planilla)', async () => {
		const r = await saveMany(admin, [
			{ slug: 'fiesta-de-prueba', before: BEFORE, after: { ...BEFORE, date: '2099-02-30' } }
		]);
		expect(r.status).toBe(400);
		expect(r.data.saveMany.results[0]).toMatchObject({
			ok: false,
			errors: { date: 'Fecha inválida.' }
		});
		expect(repo.commits).toHaveLength(0);
	});

	it('un pedido roto: 400 sin tocar el repo', async () => {
		const r = await saveMany(admin, 'esto no es JSON');
		expect(r.status).toBe(400);
		expect(r.data.saveMany).toMatchObject({ ok: false, results: [] });
		const notArray = await saveMany(admin, { slug: 'fiesta-de-prueba' });
		expect(notArray.status).toBe(400);
		expect(repo.commits).toHaveLength(0);
	});
});
