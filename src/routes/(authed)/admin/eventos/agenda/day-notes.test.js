/**
 * Notas en los días de la agenda: actions `noteSave` y `noteDelete` de /admin/eventos/agenda
 * (D1, migración 0030). Solo admins (`requireAdmin`; no tocan el repo), cada cambio queda en el
 * registro de actividad, y el `load` las devuelve desde el mes pasado.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/eventos/panel.js', async (importOriginal) => {
	const actual = /** @type {any} */ (await importOriginal());
	// Sin leer los ~500 eventos del bundle (lento en vitest): la agenda y «duplicar» vacías.
	return { ...actual, agendaRows: async () => [], listPanelEvents: async () => [] };
});

import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth.js';
import { listAudit } from '$lib/server/admin/audit.js';
import { listDayNotes } from '$lib/server/admin/dayNotes.js';
import { actions, load } from './+page.server.js';

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
});

const admin = { user: { id: ADMINS[0].id, login: ADMINS[0].login }, user_token: 'prueba' };
const adminWithoutToken = { user: { id: ADMINS[0].id, login: ADMINS[0].login } };
const notAdmin = { user: { id: 1, login: 'persona-de-prueba' }, user_token: 'prueba' };

/**
 * Llama a una action como SvelteKit; si tira (redirect / error), devuelve `{ thrown }`.
 * @param {'noteSave' | 'noteDelete'} name
 * @param {any} locals
 * @param {Record<string, string>} fields
 * @param {{ platform?: any }} [opts]
 */
async function call(name, locals, fields, { platform = t.platform } = {}) {
	const body = new FormData();
	for (const [k, v] of Object.entries(fields)) body.set(k, v);
	/** @type {any} */
	const event = {
		platform,
		locals,
		request: new Request(`http://localhost/admin/eventos/agenda?/${name}`, {
			method: 'POST',
			body
		}),
		url: new URL(`http://localhost/admin/eventos/agenda?/${name}`)
	};
	try {
		return /** @type {any} */ (await actions[name](event));
	} catch (e) {
		return { thrown: /** @type {any} */ (e).status };
	}
}

const NOTE = { date: '2099-12-12', body: 'Feriado', color: 'rosa' };

describe('notas de los días (agenda)', () => {
	it('admin agrega una nota y queda en Actividad', async () => {
		const r = await call('noteSave', admin, NOTE);
		expect(r.note).toMatchObject({ ok: true, note: { ...NOTE, updatedBy: ADMINS[0].login } });
		expect(await listDayNotes(t.db)).toHaveLength(1);
		const audit = (await listAudit(t.db)).filter((e) => e.action === 'agenda.note.add');
		expect(audit).toHaveLength(1);
		expect(audit[0]).toMatchObject({ targetType: 'agenda-day', targetId: '2099-12-12' });
		expect(audit[0].summary).toContain('Feriado');
	});

	it('cambia una nota (día, texto y color) y registra antes y después', async () => {
		const { note } = (await call('noteSave', admin, NOTE)).note;
		const r = await call('noteSave', admin, {
			id: String(note.id),
			date: '2099-12-13',
			body: 'No reservar el lugar',
			color: 'gris'
		});
		expect(r.note).toMatchObject({
			ok: true,
			note: { id: note.id, date: '2099-12-13', body: 'No reservar el lugar', color: 'gris' }
		});
		expect(await listDayNotes(t.db)).toHaveLength(1);
		const [edit] = (await listAudit(t.db)).filter((e) => e.action === 'agenda.note.edit');
		expect(edit.detail).toMatchObject({
			before: { date: '2099-12-12', body: 'Feriado', color: 'rosa' },
			after: { date: '2099-12-13', body: 'No reservar el lugar', color: 'gris' }
		});
	});

	it('borra una nota y queda en Actividad; borrarla de nuevo da 404', async () => {
		const { note } = (await call('noteSave', admin, NOTE)).note;
		const r = await call('noteDelete', admin, { id: String(note.id) });
		expect(r.note).toMatchObject({ ok: true, id: note.id });
		expect(await listDayNotes(t.db)).toEqual([]);
		expect((await listAudit(t.db)).some((e) => e.action === 'agenda.note.delete')).toBe(true);
		const again = await call('noteDelete', admin, { id: String(note.id) });
		expect(again.status).toBe(404);
	});

	it('cambiar una nota que no existe: 404 y no crea nada', async () => {
		const r = await call('noteSave', admin, { ...NOTE, id: '999' });
		expect(r.status).toBe(404);
		expect(await listDayNotes(t.db)).toEqual([]);
	});

	it('valida: día, texto y color', async () => {
		const r = await call('noteSave', admin, { date: '2099-02-30', body: ' ', color: 'naranja' });
		expect(r.status).toBe(400);
		expect(Object.keys(r.data.note.errors).sort()).toEqual(['body', 'color', 'date']);
		expect(await listDayNotes(t.db)).toEqual([]);
		const badId = await call('noteSave', admin, { ...NOTE, id: 'abc' });
		expect(badId.status).toBe(400);
	});

	it('sin sesión va al login; una cuenta que no es admin: 403. Ninguna escribe', async () => {
		expect(await call('noteSave', {}, NOTE)).toEqual({ thrown: 303 });
		expect(await call('noteSave', notAdmin, NOTE)).toEqual({ thrown: 403 });
		// Como el resto del panel (`requireAdmin`): sin token de sesión, vuelve a iniciar sesión.
		expect(await call('noteSave', adminWithoutToken, NOTE)).toEqual({ thrown: 303 });
		const { note } = (await call('noteSave', admin, NOTE)).note;
		expect(await call('noteDelete', notAdmin, { id: String(note.id) })).toEqual({ thrown: 403 });
		expect(await listDayNotes(t.db)).toHaveLength(1);
		expect((await listAudit(t.db)).filter((e) => e.action.startsWith('agenda.note'))).toHaveLength(
			1
		);
	});

	it('sin base de datos: 503', async () => {
		const r = await call('noteSave', admin, NOTE, { platform: { env: {} } });
		expect(r.status).toBe(503);
	});

	it('el load devuelve las notas desde el mes pasado (las más viejas no)', async () => {
		await call('noteSave', admin, NOTE);
		await call('noteSave', admin, { ...NOTE, date: '2000-01-01', body: 'Muy vieja' });
		/** @type {any} */
		const data = await load(
			/** @type {any} */ ({
				locals: admin,
				url: new URL('http://localhost/admin/eventos/agenda'),
				setHeaders: () => {},
				platform: t.platform
			})
		);
		expect(data.notesEnabled).toBe(true);
		expect(data.notes.map((/** @type {any} */ n) => n.body)).toEqual(['Feriado']);
	});
});
