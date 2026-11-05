/**
 * Formularios, segunda parte (migración 0080; respuestas de gorrite del 5/11), contra un D1 de
 * miniflare: el pronombre (con nombre se guarda; anónimo, nunca, y el CHECK lo impide), el borrado
 * suave que se recupera desde Actividad con sus respuestas (una encuesta borrada apaga la del
 * evento), los links que fallaron en «Para revisar» con «Reintentar», los formularios nuevos con
 * lo de «Cómo salen por defecto», y lo que copia un evento duplicado (encuesta y preguntas de
 * inscripción, con su orden). Datos inventados (example.com).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { listRecoverable, undoDeletion } from '$lib/server/admin/deletions.js';
import { deletionLabel, deletionLink } from '$lib/admin/deleteText.js';
import { formSendsFailedItems } from '$lib/server/admin/review.js';
import {
	copyEventSignupFields,
	createField,
	listOwnFields,
	chosenGeneral,
	setChosenGeneral
} from '$lib/server/tickets/signupFields.js';
import { FORM_DEFAULTS, saveFormDefaults } from './defaults.js';
import {
	copyEventSurvey,
	createForm,
	deleteForm,
	ensureEventSurvey,
	eventSurveyDeleted,
	failedFormSendsStatement,
	getEventSurvey,
	getForm,
	listForms,
	listResponses,
	readFailedFormSends,
	retryFailedFormSends,
	saveFormMail,
	saveResponse,
	setFormOpen
} from './store.js';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

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

const by = { by: 'admin-de-prueba' };
const actor = {
	login: 'admin-de-prueba',
	name: 'admin-de-prueba',
	token: 'tok',
	locals: { user: { id: 1, login: 'admin-de-prueba' } }
};

describe('pronombre', () => {
	it('con nombre se guarda y se ve; anónima no guarda nombre, pronombre ni mail', async () => {
		const id = await createForm(t.db, { title: 'Con nombre' }, by);
		const answers = [{ id: 'p1', label: 'x', value: 'y' }];
		await saveResponse(t.db, {
			formId: id,
			answers,
			identity: { name: 'Persona Demo', pronouns: 'elle', email: 'demo@example.com' }
		});
		await saveResponse(t.db, { formId: id, answers, identity: null });
		const [named, anon] = await listResponses(t.db, id);
		expect(named).toMatchObject({ name: 'Persona Demo', pronouns: 'elle', anonymous: false });
		expect(anon).toMatchObject({ name: null, pronouns: null, email: null, anonymous: true });
	});

	it('la tabla no deja guardar un pronombre en una respuesta anónima', async () => {
		const id = await createForm(t.db, { title: 'Check' }, by);
		await expect(
			t.db
				.prepare(
					"INSERT INTO form_responses (form_id, answers, day, anonymous, pronouns) VALUES (?1, '[]', '2099-01-01', 1, 'elle')"
				)
				.bind(id)
				.run()
		).rejects.toThrow(/CHECK/);
	});
});

describe('formularios nuevos con «Cómo salen por defecto»', () => {
	it('sin nada guardado, con el link y con nombre; si no, lo elegido', async () => {
		const a = await createForm(t.db, { title: 'Uno' }, by);
		expect(await getForm(t.db, a)).toMatchObject({ access: 'link', privacy: 'named' });
		await saveFormDefaults(
			t.db,
			{ ...FORM_DEFAULTS, formAccess: 'account', formPrivacy: 'anonymous' },
			by
		);
		const b = await createForm(t.db, { title: 'Dos' }, by);
		expect(await getForm(t.db, b)).toMatchObject({ access: 'account', privacy: 'anonymous' });
	});
});

describe('borrar y recuperar', () => {
	it('un formulario borrado sale de la lista y vuelve desde Actividad con sus respuestas', async () => {
		const id = await createForm(t.db, { title: 'Pedido de beca' }, by);
		await saveResponse(t.db, {
			formId: id,
			answers: [{ id: 'p1', label: 'x', value: 'y' }],
			identity: null
		});
		const form = /** @type {any} */ (await getForm(t.db, id));
		expect(await deleteForm(t.db, form, by)).toBe(true);
		expect(await getForm(t.db, id)).toBeNull();
		expect((await listForms(t.db)).some((f) => f.id === id)).toBe(false);
		const [row] = await listRecoverable(t.db);
		expect(row).toMatchObject({ title: 'Pedido de beca', path: `formulario:${id}` });
		expect(deletionLabel(row).label).toBe('Formulario');
		expect(deletionLink(row)?.href).toBe('/admin/comunidad/formularios');
		const r = await undoDeletion(/** @type {any} */ ({}), t.db, actor, row.id);
		expect(r.mode).toBe('restored');
		expect(await getForm(t.db, id)).toMatchObject({ title: 'Pedido de beca', open: false });
		expect(await listResponses(t.db, id)).toHaveLength(1);
		const audit = await t.db
			.prepare("SELECT summary FROM admin_audit WHERE action = 'form.restore'")
			.first();
		expect(audit?.summary).toBe('Recuperó el formulario «Pedido de beca»');
	});

	it('borrar la encuesta de un evento la apaga para ese evento (no se vuelve a crear)', async () => {
		const survey = /** @type {any} */ (await ensureEventSurvey(t.db, 'evento-de-prueba', by));
		expect(survey.open).toBe(true);
		await deleteForm(t.db, survey, by);
		expect(await getEventSurvey(t.db, 'evento-de-prueba')).toBeNull();
		expect(await eventSurveyDeleted(t.db, 'evento-de-prueba')).toBe(survey.id);
		expect(await ensureEventSurvey(t.db, 'evento-de-prueba', by)).toBeNull();
		const [row] = await listRecoverable(t.db);
		expect(deletionLink(row)?.href).toBe('/admin/eventos/evento-de-prueba/encuesta');
		await undoDeletion(/** @type {any} */ ({}), t.db, actor, row.id);
		// Vuelve apagada: se prende desde la ficha del evento.
		expect(await getEventSurvey(t.db, 'evento-de-prueba')).toMatchObject({
			id: survey.id,
			open: false
		});
	});
});

describe('links que no salieron («Para revisar»)', () => {
	it('una fila por formulario con «Reintentar», que los vuelve a la cola', async () => {
		const survey = /** @type {any} */ (await ensureEventSurvey(t.db, 'evento-de-prueba', by));
		for (const order of ['o-1', 'o-2']) {
			await t.db
				.prepare(
					"INSERT INTO form_sends (order_id, form_id, sent_at, status, attempts) VALUES (?1, ?2, 1, 'failed', 3)"
				)
				.bind(order, survey.id)
				.run();
		}
		const failed = readFailedFormSends((await failedFormSendsStatement(t.db).all()).results);
		expect(failed).toEqual([
			{
				id: survey.id,
				kind: 'survey',
				title: survey.title,
				eventSlug: 'evento-de-prueba',
				count: 2
			}
		]);
		const [item] = formSendsFailedItems(
			failed,
			new Map([['evento-de-prueba', 'Fiesta de prueba']])
		);
		expect(item).toMatchObject({
			title: 'La encuesta no le llegó a todes: Fiesta de prueba',
			action: 'Reintentar',
			retryFormSends: { formId: survey.id }
		});
		expect(await retryFailedFormSends(t.db, survey.id)).toBe(2);
		expect((await failedFormSendsStatement(t.db).all()).results).toEqual([]);
	});
});

describe('duplicar un evento', () => {
	it('copia la encuesta como estaba (prendida o no, preguntas, privacidad y mail), sin respuestas', async () => {
		const survey = /** @type {any} */ (await ensureEventSurvey(t.db, 'original', by));
		await setFormOpen(t.db, survey.id, false, by);
		await saveFormMail(t.db, survey.id, { subject: 'Asunto propio', body: '' }, by);
		await t.db
			.prepare("UPDATE forms SET privacy = 'choose', audience = 'admins' WHERE id = ?1")
			.bind(survey.id)
			.run();
		await saveResponse(t.db, {
			formId: survey.id,
			answers: [{ id: 'p1', label: 'x', value: '5' }],
			identity: null
		});
		const id = await copyEventSurvey(t.db, 'original', 'copia', by);
		const copy = /** @type {any} */ (await getEventSurvey(t.db, 'copia'));
		expect(copy.id).toBe(id);
		expect(copy).toMatchObject({
			kind: 'survey',
			eventSlug: 'copia',
			open: false,
			privacy: 'choose',
			audience: 'admins',
			mailSubject: 'Asunto propio'
		});
		expect(copy.questions).toEqual(survey.questions);
		expect(await listResponses(t.db, copy.id)).toEqual([]);
		// Si la copia ya tiene encuesta, no se toca.
		expect(await copyEventSurvey(t.db, 'original', 'copia', by)).toBeNull();
		// Sin encuesta en el original, nada.
		expect(await copyEventSurvey(t.db, 'sin-encuesta', 'otra', by)).toBeNull();
	});

	it('copia las preguntas de inscripción en su orden y la elección de generales', async () => {
		/** @param {string} label */
		const def = (label) => ({
			label,
			kind: /** @type {const} */ ('text'),
			required: false,
			options: [],
			perTicket: false,
			ticketTypes: /** @type {string[]} */ ([])
		});
		const general = await createField(t.db, null, def('¿Cómo te enteraste?'), by);
		const b = await createField(t.db, 'original', def('Segunda'), by);
		await createField(t.db, 'original', def('Primera'), by);
		const borrada = await createField(t.db, 'original', def('Borrada'), by);
		await t.db
			.prepare('UPDATE signup_fields SET deleted_at = 1 WHERE id = ?1')
			.bind(/** @type {any} */ (borrada).id)
			.run();
		await t.db
			.prepare('UPDATE signup_fields SET position = 9 WHERE id = ?1')
			.bind(/** @type {any} */ (b).id)
			.run();
		await setChosenGeneral(t.db, 'original', [/** @type {any} */ (general).id], {
			[/** @type {any} */ (general).id]: ['vip']
		});
		expect(await copyEventSignupFields(t.db, 'original', 'copia', by)).toBe(2);
		expect((await listOwnFields(t.db, 'copia')).map((f) => f.label)).toEqual([
			'Primera',
			'Segunda'
		]);
		expect(await chosenGeneral(t.db, 'copia')).toEqual([
			{ id: /** @type {any} */ (general).id, ticketTypes: ['vip'] }
		]);
		// Las del original no se tocan, y copiar otra vez no duplica.
		expect(await listOwnFields(t.db, 'original')).toHaveLength(2);
		expect(await copyEventSignupFields(t.db, 'original', 'copia', by)).toBe(0);
		expect(await listOwnFields(t.db, 'copia')).toHaveLength(2);
	});
});
