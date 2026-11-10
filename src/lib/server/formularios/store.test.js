/**
 * Formularios contra un D1 de miniflare (migración 0079; docs/formularios.md): plantillas, copiar,
 * direcciones únicas, respuestas anónimas sin identidad (también «Que cada persona elija» con la
 * casilla marcada, y el CHECK de la tabla), el link personal que sirve una sola vez y la encuesta
 * de cada evento. Datos inventados (example.com).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { isAnonymousResponse } from '$lib/utils/formularios.js';
import {
	copyForm,
	createForm,
	ensureEventSurvey,
	getForm,
	getFormBySlug,
	inviteUsed,
	listForms,
	listResponses,
	saveForm,
	saveResponse,
	slugTaken
} from './store.js';
import { FORM_TEMPLATES, ensureTemplates } from './templates.js';
import { checkInviteToken, inviteToken } from './invite.js';

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
const ORDER = '11111111-2222-4333-8444-555555555555';
const OTHER = '11111111-2222-4333-8444-666666666666';

/** Las columnas de identidad de todas las respuestas. */
async function identityColumns() {
	const { results } = await t.db
		.prepare(
			'SELECT anonymous, name, email, account_id, order_id, created_at FROM form_responses ORDER BY id'
		)
		.all();
	return results;
}

describe('plantillas y copias', () => {
	it('ensureTemplates crea las 4 una vez y no pisa una editada', async () => {
		await ensureTemplates(t.db);
		const list = await listForms(t.db);
		expect(
			list
				.filter((f) => f.kind === 'template')
				.map((f) => f.slug)
				.sort()
		).toEqual(FORM_TEMPLATES.map((f) => f.slug).sort());
		await t.db.prepare("UPDATE forms SET title = 'Editada' WHERE slug = 'plantilla-beca'").run();
		await ensureTemplates(t.db);
		const beca = (await listForms(t.db)).find((f) => f.slug === 'plantilla-beca');
		expect(beca?.title).toBe('Editada');
	});

	it('copiar una plantilla da un formulario cerrado con su dirección', async () => {
		await ensureTemplates(t.db);
		const beca = (await listForms(t.db)).find((f) => f.slug === 'plantilla-beca');
		const id = /** @type {number} */ (await copyForm(t.db, /** @type {any} */ (beca).id, by));
		const copy = await getForm(t.db, id);
		expect(copy).toMatchObject({
			kind: 'form',
			slug: 'pedido-de-beca',
			open: false,
			privacy: 'named',
			audience: 'admins'
		});
		expect(copy?.questions).toEqual(beca?.questions);
		// Otra copia no repite la dirección.
		const id2 = /** @type {number} */ (await copyForm(t.db, /** @type {any} */ (beca).id, by));
		expect((await getForm(t.db, id2))?.slug).toBe('pedido-de-beca-2');
	});

	it('copiar un formulario de dirección larga no choca con el límite de LIKE de D1', async () => {
		await ensureTemplates(t.db);
		const beca = /** @type {any} */ (
			(await listForms(t.db)).find((f) => f.slug === 'plantilla-beca')
		);
		const long = 'formulario-de-inscripcion-para-el-taller-de-cuerdas-nivel-inicial';
		await t.db.prepare('UPDATE forms SET title = ?1 WHERE id = ?2').bind(long, beca.id).run();
		const id = /** @type {number} */ (await copyForm(t.db, beca.id, by));
		const id2 = /** @type {number} */ (await copyForm(t.db, beca.id, by));
		const slugs = [(await getForm(t.db, id))?.slug, (await getForm(t.db, id2))?.slug];
		expect(new Set(slugs).size).toBe(2);
	});
});

describe('direcciones únicas', () => {
	it('dos formularios con el mismo nombre no comparten dirección; guardar una usada falla', async () => {
		const a = await createForm(t.db, { title: 'Feedback' }, by);
		const b = await createForm(t.db, { title: 'Feedback' }, by);
		expect((await getForm(t.db, a))?.slug).toBe('feedback');
		expect((await getForm(t.db, b))?.slug).toBe('feedback-2');
		const form = /** @type {any} */ (await getForm(t.db, b));
		const r = await saveForm(t.db, b, { ...form, slug: 'feedback', questions: [] }, by);
		expect(r).toBe('slug');
		expect(await slugTaken(t.db, 'feedback', b)).toBe(true);
		expect(await saveForm(t.db, b, { ...form, slug: 'otro', questions: [] }, by)).toBe('ok');
		expect(await getFormBySlug(t.db, 'otro')).toMatchObject({ id: b });
	});
});

describe('anonimato', () => {
	it('una respuesta anónima no escribe nombre, mail, cuenta, orden ni hora', async () => {
		const id = await createForm(t.db, { title: 'Anónimo' }, by);
		await saveResponse(t.db, {
			formId: id,
			answers: [{ id: 'p1', label: 'x', value: 'y' }],
			identity: null,
			now: Date.UTC(2099, 0, 2, 15)
		});
		expect(await identityColumns()).toEqual([
			{
				anonymous: 1,
				name: null,
				email: null,
				account_id: null,
				order_id: null,
				created_at: null
			}
		]);
		expect((await listResponses(t.db, id))[0].day).toBe('2099-01-02');
	});

	it('«Que cada persona elija» con la casilla marcada se guarda anónima', async () => {
		const id = await createForm(t.db, { title: 'Elegí' }, by);
		const anonymous = isAnonymousResponse('choose', 'on');
		await saveResponse(t.db, {
			formId: id,
			answers: [{ id: 'p1', label: 'x', value: 'y' }],
			identity: anonymous ? null : { name: 'Persona Demo', email: 'demo@example.com' }
		});
		await saveResponse(t.db, {
			formId: id,
			answers: [{ id: 'p1', label: 'x', value: 'z' }],
			identity: isAnonymousResponse('choose', null)
				? null
				: { name: 'Persona Demo', email: 'demo@example.com', accountId: 'acc_1' }
		});
		const rows = await identityColumns();
		expect(rows[0]).toMatchObject({ anonymous: 1, name: null, email: null, account_id: null });
		expect(rows[1]).toMatchObject({ anonymous: 0, name: 'Persona Demo', account_id: 'acc_1' });
	});

	it('la tabla no deja guardar identidad en una respuesta anónima', async () => {
		const id = await createForm(t.db, { title: 'Check' }, by);
		await expect(
			t.db
				.prepare(
					"INSERT INTO form_responses (form_id, answers, day, anonymous, email) VALUES (?1, '[]', '2099-01-01', 1, 'x@example.com')"
				)
				.bind(id)
				.run()
		).rejects.toThrow(/CHECK/);
	});
});

describe('link personal (quienes tenían entrada)', () => {
	it('la clave es de ese formulario y esa orden', async () => {
		const token = await inviteToken(t.db, 7, ORDER);
		expect(await checkInviteToken(t.db, 7, token)).toBe(ORDER);
		expect(await checkInviteToken(t.db, 8, token)).toBeNull();
		expect(await checkInviteToken(t.db, 7, `${ORDER}.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`)).toBeNull();
		expect(await checkInviteToken(t.db, 7, 'roto')).toBeNull();
	});

	it('sirve una sola vez, también con dos envíos a la vez', async () => {
		const id = await createForm(t.db, { title: 'Encuesta' }, by);
		await t.db
			.prepare(
				"INSERT INTO form_sends (order_id, form_id, sent_at, status, attempts) VALUES (?1, ?2, 1, 'sent', 1)"
			)
			.bind(ORDER, id)
			.run();
		expect(await inviteUsed(t.db, id, ORDER)).toBe(false);
		const answer = { formId: id, answers: [{ id: 'p1', label: 'x', value: 'y' }], identity: null };
		const results = await Promise.all([
			saveResponse(t.db, { ...answer, invite: { orderId: ORDER } }),
			saveResponse(t.db, { ...answer, invite: { orderId: ORDER } })
		]);
		expect(results.sort()).toEqual(['ok', 'used']);
		expect(await listResponses(t.db, id)).toHaveLength(1);
		expect(await inviteUsed(t.db, id, ORDER)).toBe(true);
		expect(await saveResponse(t.db, { ...answer, invite: { orderId: ORDER } })).toBe('used');
		// Sin link mandado (otra orden), no se guarda.
		expect(await saveResponse(t.db, { ...answer, invite: { orderId: OTHER } })).toBe('used');
		expect(await inviteUsed(t.db, id, OTHER)).toBeNull();
	});
});

describe('encuesta del evento', () => {
	it('se copia de la plantilla una sola vez, anónima y para quienes tenían entrada', async () => {
		const a = await ensureEventSurvey(t.db, '2099-01-01-fiesta', by);
		const b = await ensureEventSurvey(t.db, '2099-01-01-fiesta', by);
		expect(a?.id).toBe(b?.id);
		expect(a).toMatchObject({
			kind: 'survey',
			access: 'ticket',
			privacy: 'anonymous',
			eventSlug: '2099-01-01-fiesta',
			open: true
		});
		expect(a?.questions).toHaveLength(5);
		const off = await ensureEventSurvey(t.db, '2099-02-02-otra', { ...by, open: false });
		expect(off?.open).toBe(false);
	});
});
