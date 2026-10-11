/**
 * Decisión 0033: las preguntas de inscripción, los roles agregados desde el panel y las notas
 * internas de una persona se borran suave (`deleted_at`, migración 0049) y se recuperan desde
 * «Recuperar» de Actividad (`undoDeletion`). Para cada una: borrar → no se ve → recuperar → se ve,
 * con lo que tiene atado (respuestas y lo que eligió cada evento, las publicaciones que usan el
 * rol, la cuenta de la nota). D1 de miniflare; datos inventados (example.com).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { deletionLabel, deletionLink } from '$lib/admin/deleteText.js';
import { deleteAccount, upsertVerifiedAccount } from '$lib/server/cuentas/accounts.js';
import { personasFileErrors, resolvePersonas } from '$lib/server/personas/index.js';
import { addRole, listCustomRoles, listRoles, removeRole } from '$lib/server/personas/roles.js';
import {
	answersByOrder,
	chosenGeneral,
	createField,
	deleteField,
	eventSignupFields,
	fieldsForEvent,
	listGeneralFields,
	listOwnFields,
	setChosenGeneral,
	updateField
} from '$lib/server/tickets/signupFields.js';
import { MAX_GENERAL_FIELDS, answerColumns } from '$lib/utils/signupFields.js';
import { loadFicha } from './ficha.js';
import { addNote, deleteNote, listNotes, noteCounts, personId } from './people.js';
import { insertOrder } from './testRows.js';
import { listAudit } from './audit.js';
import {
	UndoError,
	fieldIdOf,
	getDeletion,
	listRecoverable,
	noteIdOf,
	roleOf,
	undoDeletion
} from './deletions.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const ACTOR = 'admin-de-prueba';
const actor = { login: ACTOR, name: 'Admin de Prueba', token: 'tok', locals: {} };
const EVENT = 'taller-inventado';
const NOW = Date.parse('2026-10-11T12:00:00Z');

/** Un cliente del repo que no se tiene que usar nunca (todo esto vive en la base). */
const noRepo = /** @type {any} */ (
	new Proxy(
		{},
		{
			get(_target, key) {
				return () => {
					throw new Error(`no debería tocar el repo (${String(key)})`);
				};
			}
		}
	)
);

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

/** @param {string} label @param {Partial<import('$lib/utils/signupFields.js').SignupField>} [o] */
const def = (label, o = {}) => ({
	label,
	kind: /** @type {const} */ ('text'),
	required: false,
	options: [],
	...o
});

/** La única fila para recuperar. */
async function onlyRecoverable() {
	const rows = await listRecoverable(t.db);
	expect(rows).toHaveLength(1);
	return rows[0];
}

describe('preguntas de inscripción', () => {
	/** Una general elegida por el evento, una propia y una orden que respondió las dos. */
	async function seed() {
		const general = await createField(t.db, null, def('¿Cómo te enteraste?'), {
			by: ACTOR,
			now: 1
		});
		const own = await createField(t.db, EVENT, def('¿Alguna restricción alimentaria?'), {
			by: ACTOR,
			now: 1
		});
		if (!general.ok || !own.ok) throw new Error('no se pudo sembrar');
		await setChosenGeneral(t.db, EVENT, [general.id], { [general.id]: ['general'] });
		const order = await insertOrder(t.db, { slug: EVENT, email: 'compra@example.com' });
		await t.db
			.prepare('INSERT INTO order_answers (order_id, answers, created_at) VALUES (?1, ?2, 1)')
			.bind(
				order,
				JSON.stringify([
					{ id: general.id, label: '¿Cómo te enteraste?', value: 'Por una amistad' },
					{ id: own.id, label: '¿Alguna restricción alimentaria?', value: 'Ninguna' }
				])
			)
			.run();
		return { general: general.id, own: own.id, order };
	}

	/** Las columnas de respuestas que ve el panel (Órdenes y su CSV). */
	async function columns() {
		const answers = await answersByOrder(t.db, EVENT);
		return answerColumns([...answers.values()], await fieldsForEvent(t.db, EVENT));
	}

	it('una general: deja de preguntarse y vuelve con lo que eligió el evento y sus respuestas', async () => {
		const ids = await seed();
		expect(await deleteField(t.db, ids.general, null, { by: ACTOR, now: NOW })).toBe(
			'¿Cómo te enteraste?'
		);
		// No se ve en ningún lado: ni en la lista, ni en lo que eligió el evento, ni en la compra.
		expect(await listGeneralFields(t.db)).toEqual([]);
		expect(await chosenGeneral(t.db, EVENT)).toEqual([]);
		expect((await eventSignupFields(t.db, EVENT)).map((f) => f.id)).toEqual([ids.own]);
		// No se edita ni se borra dos veces.
		expect(await updateField(t.db, ids.general, null, def('Otra cosa'), { by: ACTOR })).toBeNull();
		expect(await deleteField(t.db, ids.general, null)).toBeNull();
		// Las respuestas siguen (con su columna, después de las preguntas actuales).
		const answers = await answersByOrder(t.db, EVENT);
		expect(answers.get(ids.order)?.map((a) => a.value)).toEqual(['Por una amistad', 'Ninguna']);
		expect((await columns()).map((c) => c.id)).toEqual([ids.own, ids.general]);
		// Volver a elegir las generales del evento no pierde lo elegido de la borrada.
		await setChosenGeneral(t.db, EVENT, []);

		const row = await onlyRecoverable();
		expect(row).toMatchObject({
			kind: 'calendario',
			slug: '',
			title: '¿Cómo te enteraste?',
			status: 'borrado',
			deletedBy: ACTOR,
			deletedAt: NOW
		});
		expect(fieldIdOf(row.path)).toBe(ids.general);
		expect(deletionLabel(row)).toEqual({ label: 'Pregunta de inscripción', library: false });
		expect(deletionLink(row)).toEqual({ href: '/admin/eventos/roles', text: 'pregunta general' });

		const r = await undoDeletion(noRepo, t.db, actor, row.id, { now: NOW + 1 });
		expect(r).toMatchObject({ mode: 'restored', immediate: true });
		expect((await listGeneralFields(t.db)).map((f) => f.id)).toEqual([ids.general]);
		// Vuelve en el evento, con los tipos de entrada que había elegido, primero como antes.
		expect(await chosenGeneral(t.db, EVENT)).toEqual([
			{ id: ids.general, ticketTypes: ['general'] }
		]);
		expect((await eventSignupFields(t.db, EVENT)).map((f) => f.id)).toEqual([ids.general, ids.own]);
		expect((await columns()).map((c) => c.id)).toEqual([ids.general, ids.own]);
		expect((await getDeletion(t.db, row.id))?.status).toBe('recuperado');
		expect(await listRecoverable(t.db)).toEqual([]);
		expect((await listAudit(t.db))[0]).toMatchObject({
			action: 'signup_field.restore',
			targetType: 'settings',
			targetId: 'signup_fields',
			summary: 'Recuperó la pregunta «¿Cómo te enteraste?» (general)'
		});
		await expect(undoDeletion(noRepo, t.db, actor, row.id)).rejects.toThrow(UndoError);
	});

	it('una propia de un evento: se recupera en ese evento', async () => {
		const ids = await seed();
		expect(await deleteField(t.db, ids.own, EVENT, { by: ACTOR, now: NOW })).toBe(
			'¿Alguna restricción alimentaria?'
		);
		expect(await listOwnFields(t.db, EVENT)).toEqual([]);
		expect((await fieldsForEvent(t.db, EVENT)).map((f) => f.id)).toEqual([ids.general]);
		const row = await onlyRecoverable();
		expect(row.slug).toBe(EVENT);
		expect(deletionLink(row)).toEqual({ href: `/admin/eventos/${EVENT}/preguntas`, text: EVENT });

		await undoDeletion(noRepo, t.db, actor, row.id, { now: NOW + 1 });
		expect((await listOwnFields(t.db, EVENT)).map((f) => f.id)).toEqual([ids.own]);
		expect((await fieldsForEvent(t.db, EVENT)).map((f) => f.id)).toEqual([ids.general, ids.own]);
		expect((await listAudit(t.db))[0]).toMatchObject({
			action: 'signup_field.restore',
			targetType: 'event',
			targetId: EVENT,
			summary: 'Recuperó la pregunta «¿Alguna restricción alimentaria?»'
		});
	});

	it('las borradas no ocupan el tope, pero recuperar una no lo pasa', async () => {
		const first = await createField(t.db, null, def('Pregunta 0'), { by: ACTOR });
		if (!first.ok) throw new Error('no se pudo sembrar');
		await deleteField(t.db, first.id, null, { by: ACTOR });
		for (let i = 1; i <= MAX_GENERAL_FIELDS; i++) {
			expect((await createField(t.db, null, def(`Pregunta ${i}`), { by: ACTOR })).ok).toBe(true);
		}
		const row = await onlyRecoverable();
		await expect(undoDeletion(noRepo, t.db, actor, row.id)).rejects.toThrow(
			`Ya hay ${MAX_GENERAL_FIELDS} preguntas generales: borrá una antes de recuperar esta.`
		);
		expect((await getDeletion(t.db, row.id))?.status).toBe('borrado');
	});
});

describe('roles agregados desde el panel', () => {
	const POST = [
		'---',
		'title: Evento inventado',
		'personas:',
		'  - nombre: Persona Inventada',
		'    rol: Cuida la puerta',
		'---',
		''
	].join('\n');
	const raw = [{ nombre: 'Persona Inventada', rol: 'Cuida la puerta' }];

	it('sacar no rompe a quienes lo tienen; recuperar lo vuelve a poner en la lista', async () => {
		await addRole(t.db, 'Cuida la puerta', { by: ACTOR, now: 1 });
		expect(personasFileErrors(POST, await listRoles(t.db))).toEqual([]);

		expect(await removeRole(t.db, 'cuida la puerta', { by: ACTOR, now: NOW })).toEqual({
			ok: true,
			name: 'cuida la puerta'
		});
		expect(await listCustomRoles(t.db)).toEqual([]);
		expect(await listRoles(t.db)).not.toContain('Cuida la puerta');
		// Las publicaciones que lo usan lo siguen mostrando como está escrito…
		expect(await resolvePersonas(t.db, raw, await listRoles(t.db))).toEqual([
			{
				rol: 'Cuida la puerta',
				items: [{ slug: '', title: 'Persona Inventada', kind: 'persona', href: '' }]
			}
		]);
		// …y el editor avisa al guardarlas (como antes de esta decisión).
		expect(personasFileErrors(POST, await listRoles(t.db))).toHaveLength(1);
		expect(await removeRole(t.db, 'Cuida la puerta', { by: ACTOR })).toMatchObject({
			ok: false,
			status: 404
		});

		const row = await onlyRecoverable();
		// El nombre como estaba guardado, no como se escribió al sacarlo.
		expect(row).toMatchObject({ title: 'Cuida la puerta', slug: '', deletedBy: ACTOR });
		expect(roleOf(row.path)).toBe('Cuida la puerta');
		expect(deletionLabel(row)).toEqual({ label: 'Rol', library: false });

		await undoDeletion(noRepo, t.db, actor, row.id, { now: NOW + 1 });
		expect(await listCustomRoles(t.db)).toEqual([
			{ name: 'Cuida la puerta', createdAt: 1, createdBy: ACTOR }
		]);
		expect(personasFileErrors(POST, await listRoles(t.db))).toEqual([]);
		expect(await listRecoverable(t.db)).toEqual([]);
		expect((await listAudit(t.db))[0]).toMatchObject({
			action: 'persona_role.restore',
			summary: 'Recuperó el rol «Cuida la puerta»'
		});
	});

	it('agregarlo de nuevo con el mismo nombre también lo vuelve y cierra su borrado', async () => {
		await addRole(t.db, 'Cuida la puerta', { by: ACTOR, now: 1 });
		await removeRole(t.db, 'Cuida la puerta', { by: ACTOR, now: 2 });
		const row = await onlyRecoverable();
		expect(await addRole(t.db, 'cuida la puerta', { by: 'otre-admin', now: 3 })).toEqual({
			ok: true,
			name: 'Cuida la puerta'
		});
		expect(await listCustomRoles(t.db)).toEqual([
			{ name: 'Cuida la puerta', createdAt: 3, createdBy: 'otre-admin' }
		]);
		expect(await listRecoverable(t.db)).toEqual([]);
		expect((await getDeletion(t.db, row.id))?.status).toBe('recuperado');
		// Y sigue sin repetirse.
		expect(await addRole(t.db, 'Cuida la puerta', { by: ACTOR })).toMatchObject({
			ok: false,
			status: 409
		});
	});
});

describe('notas internas', () => {
	it('de una persona: deja de verse y de contarse, y vuelve a su ficha', async () => {
		const email = 'sol@example.com';
		const id = await addNote(t.db, { email, body: 'Nota inventada', by: ACTOR, now: 1 });
		await addNote(t.db, { email, body: 'Otra nota', by: ACTOR, now: 2 });
		expect(await deleteNote(t.db, { email: 'otra@example.com', id, by: ACTOR })).toBe(false);
		expect(await listRecoverable(t.db)).toEqual([]);
		expect(await deleteNote(t.db, { email, id, by: ACTOR, now: NOW })).toBe(true);
		expect((await listNotes(t.db, email)).map((n) => n.body)).toEqual(['Otra nota']);
		expect(Object.fromEntries(await noteCounts(t.db))).toEqual({ [email]: 1 });
		expect(await deleteNote(t.db, { email, id, by: ACTOR })).toBe(false);

		const row = await onlyRecoverable();
		const pid = await personId(email);
		// Sin el texto de la nota ni el mail: el id corto de la persona, como en su URL.
		expect(row).toMatchObject({ kind: 'amigues', slug: pid, title: 'Nota interna de una persona' });
		expect(JSON.stringify(row)).not.toContain('Nota inventada');
		expect(JSON.stringify(row)).not.toContain(email);
		expect(noteIdOf(row.path)).toBe(id);
		expect(deletionLabel(row)).toEqual({ label: 'Nota interna', library: false });
		expect(deletionLink(row)).toEqual({
			href: `/admin/comunidad/personas/${pid}`,
			text: 'ver la ficha'
		});

		await undoDeletion(noRepo, t.db, actor, row.id, { now: NOW + 1 });
		expect((await listNotes(t.db, email)).map((n) => n.body)).toEqual([
			'Otra nota',
			'Nota inventada'
		]);
		expect(Object.fromEntries(await noteCounts(t.db))).toEqual({ [email]: 2 });
		const [restore] = await listAudit(t.db);
		expect(restore).toMatchObject({
			action: 'person.note.restore',
			targetType: 'person',
			targetId: pid,
			summary: 'Recuperó una nota de una persona'
		});
		expect(JSON.stringify(restore)).not.toContain('Nota inventada');
		expect(JSON.stringify(restore)).not.toContain(email);
	});

	it('de una cuenta borrada: vuelve atada a la misma cuenta', async () => {
		const acc = await upsertVerifiedAccount(t.db, 'mar@example.com', { now: 1 });
		await deleteAccount(t.db, acc.id, { now: 2 });
		const key = { email: '', accountId: acc.id };
		const id = await addNote(t.db, {
			accountId: acc.id,
			body: 'Nota inventada',
			by: ACTOR,
			now: 3
		});
		const ficha = async () => /** @type {any} */ (await loadFicha(t.db, key, { now: NOW }));
		expect((await ficha()).notes.map((/** @type {any} */ n) => n.id)).toEqual([id]);

		expect(await deleteNote(t.db, { accountId: acc.id, id, by: ACTOR, now: NOW })).toBe(true);
		expect((await ficha()).notes).toEqual([]);

		const row = await onlyRecoverable();
		expect(row).toMatchObject({
			slug: `cuenta:${acc.id}`,
			title: 'Nota interna de una cuenta borrada'
		});
		expect(deletionLink(row)?.href).toBe(`/admin/comunidad/cuentas/${acc.id}`);

		await undoDeletion(noRepo, t.db, actor, row.id, { now: NOW + 1 });
		expect((await ficha()).notes.map((/** @type {any} */ n) => n.id)).toEqual([id]);
		const stored = await t.db
			.prepare('SELECT email, account_id, deleted_at FROM person_notes WHERE id = ?1')
			.bind(id)
			.first();
		expect(stored).toEqual({ email: '', account_id: acc.id, deleted_at: null });
		expect((await listAudit(t.db))[0]).toMatchObject({
			action: 'person.note.restore',
			targetType: 'account',
			targetId: acc.id,
			summary: 'Recuperó una nota de una cuenta borrada'
		});
	});
});
