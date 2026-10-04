/**
 * Ficha de una persona (Comunidad › Personas › <persona> y Comunidad › Cuentas › <cuenta>, la
 * misma ficha): junta todo por mail (sin mayúsculas ni espacios) y por cuenta, anda para una
 * cuenta sin compras y para quien compró sin cuenta, el DNI sale solo con «Mostrar» y cada vez
 * queda en Actividad (sin el DNI), solo admins, las direcciones viejas siguen andando y nada
 * secreto (hash de la contraseña, tokens, id del chat de Telegram) llega a la página.
 * D1 de miniflare; datos inventados (example.com).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth';
import { deleteAccount, emailHash, upsertVerifiedAccount } from '$lib/server/cuentas/accounts.js';
import { createSession } from '$lib/server/cuentas/session.js';
import { createProfile } from '$lib/server/cuentas/perfiles.js';
import { setSavedBuyer } from '$lib/server/cuentas/savedBuyer.js';
import { insertOrder, insertTicket } from '$lib/server/admin/testRows.js';
import { personId } from '$lib/server/admin/people.js';
import { loadFicha } from '$lib/server/admin/ficha.js';
import { seedPosts } from '$lib/server/contenido/testing.js';
import { addManager, makeProfile } from '$lib/server/amigues/testing.js';
import { setEventVenue } from '$lib/server/amigues/venues.js';
import { personHref } from '$lib/admin/links.js';
import Ficha from '$lib/components/admin/personas/Ficha.svelte';
import * as personas from './+page.server.js';
import * as persona from './[id]/+page.server.js';
import * as cuenta from '../cuentas/[id]/+page.server.js';

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

const admin = { id: ADMINS[0].id, login: ADMINS[0].login };
const NOW = Date.parse('2026-09-30T12:00:00Z');

// Secretos de mentira: nada de esto puede aparecer en la página.
const PASSWORD_HASH = 'pbkdf2-sha256$100000$c2FsLWRlLXBydWViYQ$aGFzaC1kZS1wcnVlYmEtbm8tcmVhbA';
const CALENDAR_HASH = 'ca1e'.repeat(16);
const CHAT_ID = '987654321012';
const DNI_ORDER = '30111222';
const DNI_SAVED = '40999888';

/**
 * Evento de SvelteKit de mentira.
 * @param {{ path?: string, params?: Record<string, string>, form?: Record<string, string>, user?: any }} [o]
 */
function fakeEvent({ path = '/admin/comunidad/personas', params = {}, form, user } = {}) {
	const url = new URL(path, 'https://kinkyvibe.ar');
	/** @type {any} */
	const event = {
		url,
		params,
		platform: t.platform,
		locals: { user: user === undefined ? admin : user, user_token: user === null ? null : 'tk' },
		setHeaders: () => {},
		request: new Request(url, {
			method: form ? 'POST' : 'GET',
			body: form ? new URLSearchParams(form) : undefined
		})
	};
	return event;
}

/** @param {() => unknown} fn @returns {Promise<any>} */
async function thrown(fn) {
	try {
		await fn();
		return null;
	} catch (e) {
		return e;
	}
}

/** @param {string} sql @param {...unknown} params */
const run = (sql, ...params) =>
	t.db
		.prepare(sql)
		.bind(...params)
		.run();

/** @param {string} action */
const auditRows = async (action) =>
	(
		await t.db
			.prepare(
				'SELECT actor_login, action, target_type, target_id, summary, detail FROM admin_audit WHERE action = ?1 ORDER BY id'
			)
			.bind(action)
			.all()
	).results;

/**
 * Sol: cuenta (con contraseña, sesión, calendario, Telegram, «Mis datos» con DNI, un perfil, un
 * pedido «Es mi perfil», una invitación, lo que sigue y avisos), compras con la cuenta (otro mail)
 * y sin cuenta (el mail con otras mayúsculas y espacios), notas y un aviso de serie de antes de
 * tener cuenta. Y otra persona, que no tiene que aparecer.
 */
async function seedSol() {
	const acc = await upsertVerifiedAccount(t.db, 'sol@example.com', { now: NOW - 1000 });
	await run(
		'UPDATE accounts SET password_hash = ?2, password_updated_at = ?3, can_have_profiles = 1 WHERE id = ?1',
		acc.id,
		PASSWORD_HASH,
		NOW - 500
	);
	await setSavedBuyer(t.db, acc.id, { name: 'Sol Ejemplo', pronouns: 'ella', dni: DNI_SAVED });
	const sessionToken = await createSession(t.db, acc.id, 'code', { now: NOW - 400 });
	await createSession(t.db, acc.id, 'password', { now: NOW - 300 });
	await run(
		'INSERT INTO calendar_feeds (token_hash, account_id, created_at, last_used_at) VALUES (?1, ?2, ?3, ?4)',
		CALENDAR_HASH,
		acc.id,
		NOW - 200,
		NOW - 100
	);
	await run(
		'INSERT INTO telegram_chats (account_id, chat_id, linked_at, muted, updated_at) VALUES (?1, ?2, ?3, 1, ?3)',
		acc.id,
		CHAT_ID,
		NOW - 90
	);
	const prof = await createProfile(t.db, acc.id, { kind: 'persona', title: 'Sol Inventade' });
	if (!prof.ok) throw new Error(prof.message);
	await run(
		"INSERT INTO profile_claims (profile_id, account_id, message, status, created_at, decided_at, decided_by) VALUES (?1, ?2, 'soy yo', 'approved', ?3, ?4, 'admin-de-prueba')",
		prof.profile.id,
		acc.id,
		NOW - 80,
		NOW - 70
	);
	await run(
		'INSERT INTO profile_invites (id, profile_id, email_hash, invited_by, created_at, expires_at) VALUES (?1, ?2, ?3, NULL, ?4, ?5)',
		crypto.randomUUID(),
		prof.profile.id,
		await emailHash('sol@example.com'),
		NOW - 60,
		Date.now() + 86_400_000
	);
	await run(
		"INSERT INTO follows (account_id, target_kind, target_key, in_calendar, mail_new, tg_reminder, created_at, updated_at) VALUES (?1, 'etiqueta', 'picantearla', 1, 1, 1, ?2, ?2)",
		acc.id,
		NOW - 50
	);
	await run(
		"INSERT INTO follow_notifications (account_id, event_slug, kind, channel, sent_at) VALUES (?1, 'evento-de-prueba', 'nuevo', 'telegram', ?2)",
		acc.id,
		NOW - 40
	);
	// «Avisame si se repite» de antes de tener cuenta: por mail.
	await run(
		"INSERT INTO series_subscriptions (id, series_tag, email, subscriber_key, created_at, confirmed_at) VALUES (?1, 'picantearla', 'sol@example.com', 'e:prueba', ?2, ?2)",
		crypto.randomUUID(),
		NOW - 2000
	);

	// Con la cuenta, aunque con otro mail.
	const withAccount = await insertOrder(t.db, {
		email: 'otro-mail@example.com',
		name: 'Sol E.',
		dni: DNI_ORDER,
		created: NOW - 30
	});
	await run('UPDATE orders SET account_id = ?2 WHERE id = ?1', withAccount, acc.id);
	await insertTicket(t.db, {
		orderId: withAccount,
		name: 'Sol E.',
		code: 'ABC234',
		checkedInAt: NOW - 20
	});
	await run(
		'INSERT INTO order_answers (order_id, answers, created_at) VALUES (?1, ?2, ?3)',
		withAccount,
		JSON.stringify([{ id: 1, label: '¿Venís con alguien?', value: 'Sí' }]),
		NOW - 30
	);
	await run(
		"INSERT INTO reminder_sends (order_id, reminder_id, sent_at, status) VALUES (?1, 'h48', ?2, 'sent')",
		withAccount,
		NOW - 25
	);
	// Sin cuenta, con el mail en otras mayúsculas y con espacios; reembolsada.
	const noAccount = await insertOrder(t.db, {
		email: '  SOL@Example.COM ',
		name: 'Sol Ejemplo',
		status: 'refunded',
		method: 'transferencia',
		created: NOW - 3000
	});
	await run(
		"UPDATE orders SET confirmed_by = 'admin-de-prueba', refunded_at = ?2, refunded_by = 'admin-de-prueba' WHERE id = ?1",
		noAccount,
		NOW - 2500
	);
	await run(
		"INSERT INTO event_mail_sends (id, event_slug, subject, body, created_by, created_at) VALUES ('envio-1', 'evento-de-prueba', 'Cambio de horario', 'texto', 'admin-de-prueba', ?1)",
		NOW - 10
	);
	await run(
		"INSERT INTO event_mail_recipients (send_id, email, status, at) VALUES ('envio-1', 'Sol@Example.com', 'sent', ?1)",
		NOW - 10
	);
	// Nota vieja guardada con mayúsculas.
	await run(
		"INSERT INTO person_notes (email, body, created_at, created_by) VALUES ('Sol@Example.com', 'Prefiere que la saluden por su nombre', ?1, 'admin-de-prueba')",
		NOW - 5
	);
	await run(
		"INSERT INTO admin_audit (at, actor_login, action, target_type, target_id, summary) VALUES (?1, 'admin-de-prueba', 'transfer.confirm', 'order', ?2, 'Confirmó una transferencia')",
		NOW - 2900,
		noAccount
	);

	// Otra persona: nada de ella en la ficha de Sol.
	const other = await insertOrder(t.db, {
		email: 'luna@example.com',
		name: 'Luna Ejemplo',
		dni: '20333444'
	});
	await run(
		"INSERT INTO admin_audit (at, actor_login, action, target_type, target_id, summary) VALUES (?1, 'admin-de-prueba', 'order.note', 'order', ?2, 'Otra cosa')",
		NOW,
		other
	);
	return { acc, withAccount, noAccount, other, sessionToken, profile: prof.profile };
}

describe('ficha de una persona', () => {
	it('junta todo por mail (sin mayúsculas ni espacios) y por cuenta, en las dos direcciones', async () => {
		const s = await seedSol();
		const id = await personId('sol@example.com');
		const byPerson = /** @type {any} */ (await persona.load(fakeEvent({ params: { id } })));
		const byAccount = /** @type {any} */ (
			await cuenta.load(fakeEvent({ params: { id: s.acc.id } }))
		);

		for (const data of [byPerson, byAccount]) {
			expect(data.key).toMatchObject({
				email: 'sol@example.com',
				accountId: s.acc.id,
				personId: id
			});
			expect(data.orders.map((/** @type {any} */ o) => o.id)).toEqual([s.withAccount, s.noAccount]);
			expect(data.orders.map((/** @type {any} */ o) => o.id)).not.toContain(s.other);
			const [first, second] = data.orders;
			expect(first).toMatchObject({
				byAccount: true,
				hasDni: true,
				name: 'Sol E.',
				tickets: [
					expect.objectContaining({ name: 'Sol E.', code: 'ABC234', checkedInAt: NOW - 20 })
				],
				answers: [{ label: '¿Venís con alguien?', value: 'Sí' }],
				reminders: [expect.objectContaining({ id: 'h48', status: 'sent' })]
			});
			expect(second).toMatchObject({
				status: 'refunded',
				byAccount: false,
				hasDni: false,
				confirmedBy: 'admin-de-prueba',
				refundedBy: 'admin-de-prueba'
			});
			expect(data.summary).toMatchObject({ orders: 2, refunded: 1, attended: 1 });
			expect(data.account).toMatchObject({
				id: s.acc.id,
				email: 'sol@example.com',
				verified: true,
				hasPassword: true,
				passwordUpdatedAt: NOW - 500,
				canHaveProfiles: true,
				saved: { name: 'Sol Ejemplo', pronouns: 'ella', hasDni: true }
			});
			expect(data.sessions.total).toBe(2);
			expect(data.sessions.methods.map((/** @type {any} */ m) => m.method)).toEqual([
				'code',
				'password'
			]);
			expect(data.profiles).toEqual([
				expect.objectContaining({ id: s.profile.id, title: 'Sol Inventade', role: 'owner' })
			]);
			expect(data.liveProfiles).toBe(1);
			expect(data.claims).toEqual([
				expect.objectContaining({ status: 'approved', decidedBy: 'admin-de-prueba' })
			]);
			expect(data.invites).toEqual([
				expect.objectContaining({ title: 'Sol Inventade', expired: false })
			]);
			expect(data.follows).toEqual([
				expect.objectContaining({
					kind: 'etiqueta',
					key: 'picantearla',
					mailNew: true,
					tgReminder: true
				})
			]);
			expect(data.followNotifications).toEqual([
				expect.objectContaining({ kind: 'nuevo', channel: 'telegram' })
			]);
			expect(data.series).toEqual([
				expect.objectContaining({ tag: 'picantearla', byAccount: false, sent: 0 })
			]);
			expect(data.calendar).toEqual({ links: 1, lastUsed: NOW - 100, createdAt: NOW - 200 });
			expect(data.telegram).toEqual({ linkedAt: NOW - 90, muted: true });
			expect(data.mails).toEqual([
				expect.objectContaining({ subject: 'Cambio de horario', status: 'sent' })
			]);
			expect(data.notes.map((/** @type {any} */ n) => n.body)).toEqual([
				'Prefiere que la saluden por su nombre'
			]);
			// Lo de su cuenta (la novedad «cuenta nueva») y lo de sus órdenes; nada de otra persona.
			const summaries = data.activity.map((/** @type {any} */ e) => e.summary);
			expect(summaries).toHaveLength(2);
			expect(summaries).toEqual(
				expect.arrayContaining(['Se creó una cuenta nueva', 'Confirmó una transferencia'])
			);
		}
	});

	it('una cuenta sin compras y una compra sin cuenta tienen ficha; lo desconocido da 404', async () => {
		const acc = await upsertVerifiedAccount(t.db, 'solo-cuenta@example.com');
		const onlyAccount = /** @type {any} */ (
			await persona.load(fakeEvent({ params: { id: await personId('solo-cuenta@example.com') } }))
		);
		expect(onlyAccount.account.id).toBe(acc.id);
		expect(onlyAccount.orders).toEqual([]);
		expect(onlyAccount.summary).toBeNull();

		await insertOrder(t.db, { email: 'Sin-Cuenta@Example.com', name: 'Sin Cuenta' });
		const onlyBuyer = /** @type {any} */ (
			await persona.load(fakeEvent({ params: { id: await personId('sin-cuenta@example.com') } }))
		);
		expect(onlyBuyer.account).toBeNull();
		expect(onlyBuyer.orders).toHaveLength(1);
		expect(onlyBuyer.summary.names).toEqual(['Sin Cuenta']);

		for (const id of ['0123456789abcdef', 'no-es-un-id', '']) {
			expect((await thrown(() => persona.load(fakeEvent({ params: { id } }))))?.status).toBe(404);
		}
		for (const id of [crypto.randomUUID(), 'no-es-un-id']) {
			expect((await thrown(() => cuenta.load(fakeEvent({ params: { id } }))))?.status).toBe(404);
		}
	});

	it('las direcciones viejas siguen andando: el link de Personas y la cuenta (también borrada)', async () => {
		const s = await seedSol();
		const list = /** @type {any} */ (await personas.load(fakeEvent()));
		const sol = list.people.find((/** @type {any} */ p) => p.email === 'sol@example.com');
		// El link de la lista (y los que ya se mandaron) usan el mismo id corto de siempre.
		expect(sol.id).toBe(await personId('sol@example.com'));
		expect(personHref(sol.id)).toBe(`/admin/comunidad/personas/${sol.id}`);
		const data = /** @type {any} */ (await persona.load(fakeEvent({ params: { id: sol.id } })));
		expect(data.account.id).toBe(s.acc.id);

		await deleteAccount(t.db, s.acc.id);
		const gone = /** @type {any} */ (await cuenta.load(fakeEvent({ params: { id: s.acc.id } })));
		expect(gone.account).toMatchObject({ id: s.acc.id, email: null });
		expect(gone.account.deletedAt).toBeTypeOf('number');
		// La orden quedó desvinculada al borrar la cuenta, y sin mail no se puede atar: no aparece.
		expect(gone.orders).toEqual([]);
		// Por el mail, la persona sigue (como compradora sin cuenta).
		const byEmail = /** @type {any} */ (await persona.load(fakeEvent({ params: { id: sol.id } })));
		expect(byEmail.account).toBeNull();
		expect(byEmail.orders.map((/** @type {any} */ o) => o.id)).toContain(s.noAccount);
	});

	it('Personas agrupa sin mayúsculas ni espacios y cuenta las notas igual', async () => {
		await insertOrder(t.db, { email: 'Mar@Example.com', name: 'Mar' });
		await insertOrder(t.db, { email: ' mar@example.com ', name: 'Mar' });
		await run(
			"INSERT INTO person_notes (email, body, created_at, created_by) VALUES ('MAR@example.com', 'una', 1, 'x'), ('mar@example.com', 'dos', 2, 'x')"
		);
		const list = /** @type {any} */ (await personas.load(fakeEvent()));
		expect(list.people).toHaveLength(1);
		expect(list.people[0]).toMatchObject({ email: 'mar@example.com', notes: 2 });
		const data = /** @type {any} */ (
			await persona.load(fakeEvent({ params: { id: list.people[0].id } }))
		);
		expect(data.orders).toHaveLength(2);
		expect(data.notes.map((/** @type {any} */ n) => n.body)).toEqual(['dos', 'una']);
		// Borrar una nota guardada con mayúsculas también anda.
		const del = await persona.actions.deleteNote(
			fakeEvent({ params: { id: list.people[0].id }, form: { id: String(data.notes[1].id) } })
		);
		expect(del).toMatchObject({ note: { ok: true } });
	});

	it('los eventos donde participan sus perfiles (por los edges `persona` y `lugar`)', async () => {
		const s = await seedSol();
		// Los eventos, en la base: la importación pasa cada perfil de `personas` a un edge `persona`
		// (un perfil que no existe queda como texto en el evento, sin edge).
		await seedPosts(t.db, [
			{
				category: 'calendario',
				postID: 'taller-inventado',
				title: 'Taller inventado',
				start: '2026-10-10T20:00:00-03:00',
				personas: [{ perfil: s.profile.slug, rol: 'Facilita' }]
			},
			{
				category: 'calendario',
				postID: 'otro-evento',
				title: 'Otro',
				start: '2026-10-11T20:00:00-03:00',
				personas: [{ perfil: 'otra', rol: 'Facilita' }]
			}
		]);
		const data = await loadFicha(
			t.db,
			{ email: 'sol@example.com', accountId: '' },
			{
				now: NOW,
				eventInfo: async (slug) => ({ title: `Título de ${slug}`, start: null })
			}
		);
		expect(data?.profileEvents).toEqual([
			expect.objectContaining({
				slug: 'taller-inventado',
				title: 'Taller inventado',
				profile: 'Sol Inventade',
				rol: 'Facilita'
			})
		]);
	});
	it('los eventos de sus lugares (edge `lugar` del evento)', async () => {
		const s = await seedSol();
		const venue = await makeProfile(t.db, { title: 'Sala Inventada', kind: 'lugar' });
		await addManager(t.db, venue.id, s.acc.id);
		await seedPosts(t.db, [
			{
				category: 'calendario',
				postID: 'fiesta-inventada',
				title: 'Fiesta inventada',
				start: '2026-11-01T22:00:00-03:00'
			},
			{
				category: 'calendario',
				postID: 'sin-lugar',
				title: 'Sin lugar',
				start: '2026-11-02T22:00:00-03:00'
			}
		]);
		const linked = await setEventVenue(t.db, {
			eventSlug: 'fiesta-inventada',
			venueId: venue.id,
			privacy: null,
			by: 'admin-de-prueba'
		});
		expect(linked).toMatchObject({ ok: true });
		const data = await loadFicha(
			t.db,
			{ email: 'sol@example.com', accountId: '' },
			{ now: NOW, eventInfo: async (slug) => ({ title: `Título de ${slug}`, start: null }) }
		);
		expect(data?.profileEvents).toEqual([
			expect.objectContaining({
				slug: 'fiesta-inventada',
				title: 'Fiesta inventada',
				start: '2026-11-01T22:00:00-03:00',
				profile: 'Sala Inventada',
				rol: 'Lugar'
			})
		]);
	});
});

describe('DNI', () => {
	it('no viene con la página; «Mostrar» lo da y queda en Actividad sin el DNI', async () => {
		const s = await seedSol();
		const id = await personId('sol@example.com');
		const data = await persona.load(fakeEvent({ params: { id } }));
		expect(JSON.stringify(data)).not.toContain(DNI_ORDER);
		expect(JSON.stringify(data)).not.toContain(DNI_SAVED);

		const order = await persona.actions.dni(
			fakeEvent({ params: { id }, form: { orden: s.withAccount } })
		);
		expect(order).toEqual({ dni: { ok: true, key: `orden:${s.withAccount}`, value: DNI_ORDER } });
		const saved = await cuenta.actions.dni(
			fakeEvent({ params: { id: s.acc.id }, form: { guardado: '1' } })
		);
		expect(saved).toEqual({ dni: { ok: true, key: 'guardado', value: DNI_SAVED } });

		const rows = await auditRows('person.dni.reveal');
		expect(rows).toEqual([
			{
				actor_login: admin.login,
				action: 'person.dni.reveal',
				target_type: 'order',
				target_id: s.withAccount,
				summary: `Miró el DNI de la compra KV-${s.withAccount.slice(0, 8).toUpperCase()}`,
				detail: null
			},
			{
				actor_login: admin.login,
				action: 'person.dni.reveal',
				target_type: 'account',
				target_id: s.acc.id,
				summary: 'Miró el DNI guardado en «Mis datos» de una cuenta',
				detail: null
			}
		]);
		expect(JSON.stringify(rows)).not.toContain(DNI_ORDER);
		expect(JSON.stringify(rows)).not.toContain(DNI_SAVED);
		expect(JSON.stringify(rows)).not.toContain('@example.com');

		// Se ve en la Actividad de la ficha.
		const after = /** @type {any} */ (await persona.load(fakeEvent({ params: { id } })));
		expect(after.activity.map((/** @type {any} */ e) => e.action)).toEqual(
			expect.arrayContaining(['person.dni.reveal', 'person.dni.reveal'])
		);
	});

	it('el DNI de una orden de otra persona no sale (404) ni se anota', async () => {
		const s = await seedSol();
		const id = await personId('sol@example.com');
		const r = /** @type {any} */ (
			await persona.actions.dni(fakeEvent({ params: { id }, form: { orden: s.other } }))
		);
		expect(r.status).toBe(404);
		expect(JSON.stringify(r)).not.toContain('20333444');
		const none = /** @type {any} */ (
			await persona.actions.dni(fakeEvent({ params: { id }, form: { orden: s.noAccount } }))
		);
		expect(none.status).toBe(404);
		expect(
			/** @type {any} */ (await persona.actions.dni(fakeEvent({ params: { id }, form: {} }))).status
		).toBe(400);
		expect(await auditRows('person.dni.reveal')).toEqual([]);
	});
});

describe('solo admins', () => {
	it('sin sesión redirige al login y sin permiso da 403, en cada load y cada action, sin cambiar nada', async () => {
		const s = await seedSol();
		const id = await personId('sol@example.com');
		const routes = [
			{ mod: persona, params: { id } },
			{ mod: cuenta, params: { id: s.acc.id } }
		];
		const forms = { valor: '0', body: 'nota', id: '1', orden: s.withAccount, guardado: '1' };
		for (const r of routes) {
			const anon = await thrown(() => r.mod.load(fakeEvent({ params: r.params, user: null })));
			expect(anon?.status).toBe(303);
			expect(anon?.location).toContain('/login');
			const nope = { id: 1, login: 'no-admin' };
			expect(
				(await thrown(() => r.mod.load(fakeEvent({ params: r.params, user: nope }))))?.status
			).toBe(403);
			for (const [name, action] of Object.entries(r.mod.actions)) {
				const a = await thrown(() =>
					action(fakeEvent({ params: r.params, form: forms, user: null }))
				);
				expect(a?.status, name).toBe(303);
				const b = await thrown(() =>
					action(fakeEvent({ params: r.params, form: forms, user: nope }))
				);
				expect(b?.status, name).toBe(403);
			}
		}
		const n = await t.db
			.prepare('SELECT COUNT(*) AS n FROM admin_audit WHERE actor_login = ?1')
			.bind('no-admin')
			.first();
		expect(n?.n).toBe(0);
		const notes = await t.db
			.prepare("SELECT COUNT(*) AS n FROM person_notes WHERE body = 'nota'")
			.first();
		expect(notes?.n).toBe(0);
	});
});

describe('nada secreto en la página', () => {
	it('ni el hash de la contraseña, ni tokens, ni el chat de Telegram, ni el DNI', async () => {
		const s = await seedSol();
		const id = await personId('sol@example.com');
		const data = await persona.load(fakeEvent({ params: { id } }));
		const { body } = render(Ficha, { props: { data, form: null } });
		const tokens = (await t.db.prepare('SELECT token FROM tickets').all()).results.map((r) =>
			String(r.token)
		);
		const sessionHashes = (
			await t.db.prepare('SELECT token_hash FROM account_sessions').all()
		).results.map((r) => String(r.token_hash));
		const json = JSON.stringify(data);
		for (const secret of [
			PASSWORD_HASH,
			'pbkdf2',
			CALENDAR_HASH,
			CHAT_ID,
			DNI_ORDER,
			DNI_SAVED,
			s.sessionToken,
			...sessionHashes,
			...tokens,
			await emailHash('sol@example.com')
		]) {
			expect(body, secret).not.toContain(secret);
			expect(json, secret).not.toContain(secret);
		}
		// Y sí muestra lo que tiene que mostrar.
		expect(body).toContain('Sol Inventade');
		expect(body).toContain('ABC234');
		expect(body).toContain('Mostrar');
		expect(body).toContain('silenciado');
		expect(body).toContain('Prefiere que la saluden por su nombre');
	});
});
