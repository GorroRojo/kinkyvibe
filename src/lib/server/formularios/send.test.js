/**
 * El cron de los formularios (runFormsCron, docs/formularios.md): la encuesta sale un día después
 * del fin de cada evento a cada orden aprobada, una vez; no sale si el evento la apagó, si pasaron
 * más de 3 días o con el interruptor apagado; el link lleva la clave en el fragmento; un formulario
 * «quienes tenían entrada» sale cuando une admin lo pide. Lo que se le manda a Resend se captura.
 * D1 de miniflare; eventos y personas inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { clearFlagCache } from '$lib/server/flags.js';
import { applyPayment, reserveOrder } from '$lib/server/tickets/orders.js';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

const HOUR = 60 * 60 * 1000;
/** Fin del evento de prueba (hora argentina, 03:00 del 15/11/2099). */
const END = Date.parse('2099-11-15T03:00:00-03:00');

vi.mock('$lib/server/tickets/events.js', async () => {
	const { parseTicketConfig } = await import('$lib/server/tickets/config.js');
	const common = {
		start: '2099-11-14T22:00:00-03:00',
		end: '2099-11-15T03:00:00-03:00',
		status: 'abierto',
		payment_methods: ['mercadopago'],
		location: 'Calle Falsa 123',
		tickets: [{ id: 'general', name: 'General', price: 8000, capacity: 10 }]
	};
	/** @type {Record<string, Record<string, any>>} */
	const metas = {
		'evento-de-prueba': { ...common, title: 'Fiesta de prueba' },
		'evento-cancelado': { ...common, title: 'Cancelado', status: 'cancelado' }
	};
	return {
		isValidEventSlug: () => true,
		isTestEventSlug: () => false,
		getEventMeta: async (/** @type {string} */ slug) => metas[slug] ?? null,
		getEventTickets: async (/** @type {string} */ slug, /** @type {any} */ opts) =>
			metas[slug]?.tickets ? parseTicketConfig(metas[slug], opts) : null,
		listTicketedEvents: async () =>
			Object.entries(metas).map(([slug, meta]) => ({ slug, config: parseTicketConfig(meta, {}) }))
	};
});
const env = vi.hoisted(() => ({
	/** @type {Record<string, string>} */ value: { RESEND_API_KEY: 're_inventada' }
}));
vi.mock('$env/dynamic/private', () => ({ env: env.value }));

const { runFormsCron, surveyDueAt } = await import('./send.js');
const { checkInviteToken } = await import('./invite.js');
const { getEventSurvey, setFormOpen, createForm, saveForm, getForm, requestFormSend } =
	await import('./store.js');

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
	env.value.FORMULARIOS_ENABLED = '1';
	clearFlagCache();
});

let payment = 1;
/** @param {string} eventSlug @param {string} email */
async function order(eventSlug, email) {
	const r = /** @type {any} */ (
		await reserveOrder(t.db, {
			eventSlug,
			type: { id: 'general', price: 8000, capacity: 10 },
			quantity: 1,
			holders: [{ name: 'Persona Demo', pronouns: 'elle' }],
			buyer: { name: 'Persona Demo', pronouns: 'elle', email, dni: '30111222' }
		})
	);
	await applyPayment(t.db, {
		id: payment++,
		status: 'approved',
		external_reference: r.order.id,
		transaction_amount: 8000,
		currency_id: 'ARS'
	});
	return /** @type {string} */ (r.order.id);
}

function captureFetch() {
	/** @type {any[]} */
	const sent = [];
	const fetch = /** @type {any} */ (
		async (/** @type {string} */ _url, /** @type {RequestInit} */ init) => {
			sent.push(JSON.parse(String(init.body)));
			return new Response('{"id":"x"}', { status: 200 });
		}
	);
	return { sent, fetch };
}

const platform = () => /** @type {any} */ ({ env: { DB: t.db } });
const ORIGIN = 'https://kinkyvibe.example';

describe('encuesta después del evento', () => {
	it('toca un día después del fin', () => {
		expect(
			surveyDueAt({ start: '2099-11-14T22:00:00-03:00', end: '2099-11-15T03:00:00-03:00' })
		).toBe(END + 24 * HOUR);
	});

	it('sale una vez a cada orden aprobada, con la clave en el fragmento', async () => {
		const a = await order('evento-de-prueba', 'a@example.com');
		await order('evento-de-prueba', 'b@example.com');
		await order('evento-cancelado', 'c@example.com');
		const { sent, fetch } = captureFetch();
		const now = END + 25 * HOUR;
		// Antes de tiempo, nada.
		expect(
			await runFormsCron({ db: t.db, platform: platform(), origin: ORIGIN, fetch, now: END + HOUR })
		).toMatchObject({ sent: 0 });
		const r = await runFormsCron({ db: t.db, platform: platform(), origin: ORIGIN, fetch, now });
		expect(r).toMatchObject({ sent: 2, failed: 0 });
		expect(
			sent
				.map((m) => m.to)
				.flat()
				.sort()
		).toEqual(['a@example.com', 'b@example.com']);
		const mail = sent.find((m) => [m.to].flat().includes('a@example.com'));
		expect(mail.subject).toBe('¿Cómo la pasaste? Contanos en un minuto');
		expect(mail.subject).not.toContain('Fiesta');
		const link = String(mail.text).match(/Contestar la encuesta: (\S+)/)?.[1] ?? '';
		const url = new URL(link);
		expect(url.pathname).toBe('/calendario/evento-de-prueba/encuesta');
		const survey = await getEventSurvey(t.db, 'evento-de-prueba');
		expect(await checkInviteToken(t.db, /** @type {any} */ (survey).id, url.hash.slice(1))).toBe(a);
		// La segunda corrida no repite.
		expect(
			await runFormsCron({ db: t.db, platform: platform(), origin: ORIGIN, fetch, now })
		).toMatchObject({
			sent: 0
		});
		expect(sent).toHaveLength(2);
	});

	// gorrite (5/11): la encuesta sale siempre, aunque sea tarde (antes había un corte de 3 días).
	it('sale aunque sea tarde (sin corte), pero no la de un evento que tocaba antes de prenderlo', async () => {
		await order('evento-de-prueba', 'a@example.com');
		const { sent, fetch } = captureFetch();
		// La primera vuelta del cron con el interruptor prendido, antes de que toque.
		await runFormsCron({ db: t.db, platform: platform(), origin: ORIGIN, fetch, now: END });
		// Diez días tarde: sale igual.
		const late = END + 24 * HOUR + 240 * HOUR;
		const r = await runFormsCron({
			db: t.db,
			platform: platform(),
			origin: ORIGIN,
			fetch,
			now: late
		});
		expect(r).toMatchObject({ sent: 1 });
		expect(sent).toHaveLength(1);
	});

	it('al prenderlo, no les llega la encuesta de los eventos que ya tocaban', async () => {
		await order('evento-de-prueba', 'a@example.com');
		const { sent, fetch } = captureFetch();
		// La primera vuelta del cron es después de que tocaba: queda anotada y no sale.
		await runFormsCron({
			db: t.db,
			platform: platform(),
			origin: ORIGIN,
			fetch,
			now: END + 24 * HOUR + 5 * HOUR
		});
		expect(sent).toHaveLength(0);
		expect(await getEventSurvey(t.db, 'evento-de-prueba')).toBeNull();
	});

	it('no sale si el evento la apagó, si la borraron o con el interruptor apagado', async () => {
		await order('evento-de-prueba', 'a@example.com');
		const { sent, fetch } = captureFetch();
		// Apagada en el evento.
		const now = END + 25 * HOUR;
		await runFormsCron({ db: t.db, platform: platform(), origin: ORIGIN, fetch, now: END });
		const { ensureEventSurvey } = await import('./store.js');
		const survey = /** @type {any} */ (
			await ensureEventSurvey(t.db, 'evento-de-prueba', { by: 'x' })
		);
		await setFormOpen(t.db, survey.id, false, { by: 'x' });
		await runFormsCron({ db: t.db, platform: platform(), origin: ORIGIN, fetch, now });
		expect(sent).toHaveLength(0);
		// Borrada (se recupera desde Actividad): no sale y no se vuelve a crear.
		const { deleteForm } = await import('./store.js');
		await deleteForm(t.db, survey, { by: 'x' });
		await runFormsCron({ db: t.db, platform: platform(), origin: ORIGIN, fetch, now });
		expect(sent).toHaveLength(0);
		expect(await getEventSurvey(t.db, 'evento-de-prueba')).toBeNull();
		await t.db.prepare('UPDATE forms SET deleted_at = NULL WHERE id = ?1').bind(survey.id).run();
		// Interruptor apagado.
		await setFormOpen(t.db, survey.id, true, { by: 'x' });
		env.value.FORMULARIOS_ENABLED = '0';
		clearFlagCache();
		expect(
			await runFormsCron({ db: t.db, platform: platform(), origin: ORIGIN, fetch, now })
		).toBeNull();
		expect(sent).toHaveLength(0);
	});
});

describe('cómo salen por defecto y el mail', () => {
	it('sin nada guardado, lo de siempre; con «Cómo salen por defecto», lo nuevo', async () => {
		const { getFormDefaults, saveFormDefaults, FORM_DEFAULTS } = await import('./defaults.js');
		expect(await getFormDefaults(t.db)).toMatchObject(FORM_DEFAULTS);
		await order('evento-de-prueba', 'a@example.com');
		await saveFormDefaults(
			t.db,
			{
				...FORM_DEFAULTS,
				surveyDelayDays: 3,
				surveyPrivacy: 'choose',
				surveyAudience: 'admins',
				surveyMailSubject: 'Contanos de {{evento}}',
				surveyMailBody: 'Gracias por venir. Tu link: [acá]({{link}})'
			},
			{ by: 'x' }
		);
		const { sent, fetch } = captureFetch();
		await runFormsCron({ db: t.db, platform: platform(), origin: ORIGIN, fetch, now: END });
		// Un día después ya no toca: ahora son 3.
		await runFormsCron({
			db: t.db,
			platform: platform(),
			origin: ORIGIN,
			fetch,
			now: END + 25 * HOUR
		});
		expect(sent).toHaveLength(0);
		await runFormsCron({
			db: t.db,
			platform: platform(),
			origin: ORIGIN,
			fetch,
			now: END + 73 * HOUR
		});
		expect(sent).toHaveLength(1);
		expect(sent[0].subject).toBe('Contanos de Fiesta de prueba');
		expect(String(sent[0].text)).toMatch(/Tu link: acá \(https:\/\/kinkyvibe\.example\/calendario/);
		const survey = /** @type {any} */ (await getEventSurvey(t.db, 'evento-de-prueba'));
		expect(survey).toMatchObject({ privacy: 'choose', audience: 'admins' });
	});

	it('la encuesta no sale sola si así se eligió; sí la que un evento prendió', async () => {
		const { saveFormDefaults, FORM_DEFAULTS } = await import('./defaults.js');
		await saveFormDefaults(t.db, { ...FORM_DEFAULTS, surveyAuto: false }, { by: 'x' });
		await order('evento-de-prueba', 'a@example.com');
		const { sent, fetch } = captureFetch();
		await runFormsCron({ db: t.db, platform: platform(), origin: ORIGIN, fetch, now: END });
		const now = END + 25 * HOUR;
		await runFormsCron({ db: t.db, platform: platform(), origin: ORIGIN, fetch, now });
		expect(sent).toHaveLength(0);
		const { ensureEventSurvey } = await import('./store.js');
		const survey = /** @type {any} */ (
			await ensureEventSurvey(t.db, 'evento-de-prueba', { by: 'x' })
		);
		expect(survey.open).toBe(false);
		await setFormOpen(t.db, survey.id, true, { by: 'x' });
		await runFormsCron({ db: t.db, platform: platform(), origin: ORIGIN, fetch, now: now + 1000 });
		expect(sent).toHaveLength(1);
	});

	it('el mail propio de una encuesta manda sobre el de por defecto', async () => {
		const { saveFormDefaults, FORM_DEFAULTS } = await import('./defaults.js');
		const { ensureEventSurvey, saveFormMail } = await import('./store.js');
		await saveFormDefaults(
			t.db,
			{ ...FORM_DEFAULTS, surveyMailSubject: 'El de por defecto' },
			{ by: 'x' }
		);
		await order('evento-de-prueba', 'a@example.com');
		const survey = /** @type {any} */ (
			await ensureEventSurvey(t.db, 'evento-de-prueba', { by: 'x' })
		);
		await saveFormMail(t.db, survey.id, { subject: 'El de este evento', body: '' }, { by: 'x' });
		const { sent, fetch } = captureFetch();
		await runFormsCron({ db: t.db, platform: platform(), origin: ORIGIN, fetch, now: END });
		await runFormsCron({
			db: t.db,
			platform: platform(),
			origin: ORIGIN,
			fetch,
			now: END + 25 * HOUR
		});
		expect(sent.map((m) => m.subject)).toEqual(['El de este evento']);
		// El texto vacío: el de siempre.
		expect(String(sent[0].text)).toContain('¡Gracias por venir a Fiesta de prueba!');
	});
});

describe('formulario para quienes tienen entrada', () => {
	it('sale cuando une admin lo pide, con su título de asunto', async () => {
		await order('evento-de-prueba', 'a@example.com');
		const id = await createForm(t.db, { title: 'Qué música querés' }, { by: 'x' });
		const form = /** @type {any} */ (await getForm(t.db, id));
		await saveForm(
			t.db,
			id,
			{ ...form, access: 'ticket', eventSlug: 'evento-de-prueba' },
			{ by: 'x' }
		);
		const { sent, fetch } = captureFetch();
		const now = Date.parse('2099-11-10T12:00:00-03:00');
		await runFormsCron({ db: t.db, platform: platform(), origin: ORIGIN, fetch, now });
		expect(sent).toHaveLength(0);
		await requestFormSend(t.db, id, { by: 'x', now });
		await runFormsCron({ db: t.db, platform: platform(), origin: ORIGIN, fetch, now: now + 1000 });
		expect(sent).toHaveLength(1);
		expect(sent[0].subject).toBe('Qué música querés');
		expect(String(sent[0].text)).toMatch(/\/formularios\/que-musica-queres#/);
	});
});
