/**
 * Mi rincón → «Mis datos»: ver (DNI tapado; entero solo con «Mostrar»), cambiar, borrar cada
 * dato y «Borrar todo». Solo la propia cuenta. D1 de miniflare; datos inventados.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
	// La primera importación de la página tarda en transformarse: se paga acá, una vez.
	await modules('1');
}, 60_000);
afterAll(async () => {
	await t?.dispose();
});
beforeEach(async () => {
	await resetDB(t.db);
});
afterEach(() => {
	vi.doUnmock('$env/dynamic/private');
	vi.resetModules();
});

const EMAIL = 'persona.prueba@example.com';
const DNI = '30111222';

/** Módulos con la variable CUENTAS_ENABLED que se pida. */
async function modules(flag = '1') {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({ env: { CUENTAS_ENABLED: flag } }));
	return {
		rincon: await import('./+page.server.js'),
		accounts: await import('$lib/server/cuentas/accounts.js'),
		saved: await import('$lib/server/cuentas/savedBuyer.js')
	};
}

/**
 * Evento de SvelteKit de mentira, con la cuenta de la sesión.
 * @param {{ id: string, email: string } | undefined} member
 * @param {Record<string, string>} [form]
 */
function fakeEvent(member, form) {
	const url = new URL('/mi-rincon', 'https://kinkyvibe.ar');
	/** @type {any} */
	const event = {
		url,
		platform: t.platform,
		locals: { user: undefined, user_token: '', member },
		setHeaders: () => {},
		getClientAddress: () => '203.0.113.7',
		fetch,
		request: new Request(url, {
			method: form ? 'POST' : 'GET',
			body: form ? new URLSearchParams(form) : undefined
		}),
		cookies: { get: () => undefined, set: () => {}, delete: () => {} }
	};
	return event;
}

/** @param {() => unknown} fn */
async function thrown(fn) {
	try {
		await fn();
		return null;
	} catch (e) {
		return /** @type {any} */ (e);
	}
}

/** @param {Awaited<ReturnType<typeof modules>>} m */
async function signedIn(m) {
	const account = await m.accounts.upsertVerifiedAccount(t.db, EMAIL);
	const member = { id: account.id, email: account.email };
	/** @param {Record<string, string>} [form] */
	const ev = (form) => fakeEvent(member, form);
	return { account, member, ev };
}

describe('Mi rincón → Mis datos', () => {
	it('la página muestra lo guardado con el DNI tapado (nunca entero)', async () => {
		const m = await modules();
		const { account, ev } = await signedIn(m);
		let page = /** @type {any} */ (await m.rincon.load(ev()));
		expect(page.saved).toEqual({ name: '', pronouns: '', hasDni: false, dniMasked: '' });
		await m.saved.setSavedBuyer(t.db, account.id, {
			name: 'Persona Prueba',
			pronouns: 'elle',
			dni: DNI
		});
		page = /** @type {any} */ (await m.rincon.load(ev()));
		expect(page.saved).toEqual({
			name: 'Persona Prueba',
			pronouns: 'elle',
			hasDni: true,
			dniMasked: '•••••222'
		});
		expect(JSON.stringify(page)).not.toContain(DNI);
	});

	it('«Mostrar» devuelve el DNI entero solo a la propia cuenta', async () => {
		const m = await modules();
		const { account, ev } = await signedIn(m);
		await m.saved.setSavedBuyer(t.db, account.id, { dni: DNI });
		expect(await m.rincon.actions.mostrarDni(ev({}))).toEqual({ action: 'datos', dni: DNI });
		// Otra cuenta no ve el de esta.
		const other = await m.accounts.upsertVerifiedAccount(t.db, 'otra.persona@example.com');
		const otherEv = fakeEvent({ id: other.id, email: other.email }, {});
		expect(await m.rincon.actions.mostrarDni(otherEv)).toEqual({ action: 'datos', dni: '' });
		// Sin sesión, a /ingresar.
		const r = await thrown(() => m.rincon.actions.mostrarDni(fakeEvent(undefined, {})));
		expect(r).toMatchObject({ status: 303 });
	});

	it('cambiar: valida con las reglas de la compra y no devuelve el DNI en un error', async () => {
		const m = await modules();
		const { account, ev } = await signedIn(m);
		const bad = await m.rincon.actions.datos(
			ev({ name: 'x', pronouns: 'elle', dni: '30111222999' })
		);
		expect(bad).toMatchObject({
			status: 400,
			data: { action: 'datos', errors: { name: expect.any(String), dni: expect.any(String) } }
		});
		expect(JSON.stringify(bad)).not.toContain('30111222999');
		expect(await m.saved.getSavedBuyer(t.db, account.id)).toEqual({});

		expect(
			await m.rincon.actions.datos(
				ev({ name: ' Persona  Prueba ', pronouns: 'elle', dni: '30.111.222' })
			)
		).toEqual({ action: 'datos', message: 'Tus datos quedaron guardados.' });
		expect(await m.saved.getSavedBuyer(t.db, account.id)).toEqual({
			name: 'Persona Prueba',
			pronouns: 'elle',
			dni: DNI
		});

		// DNI vacío: queda el que estaba; nombre vacío: se saca.
		await m.rincon.actions.datos(ev({ name: '', pronouns: 'ella', dni: '' }));
		expect(await m.saved.getSavedBuyer(t.db, account.id)).toEqual({
			pronouns: 'ella',
			dni: DNI
		});
	});

	it('borrar un dato: solo ese; uno desconocido, nada', async () => {
		const m = await modules();
		const { account, ev } = await signedIn(m);
		await m.saved.setSavedBuyer(t.db, account.id, {
			name: 'Persona Prueba',
			pronouns: 'elle',
			dni: DNI
		});
		expect(await m.rincon.actions.borrarDato(ev({ campo: 'dni' }))).toEqual({
			action: 'datos',
			message: 'Tu DNI: borrado.'
		});
		expect(await m.saved.getSavedBuyer(t.db, account.id)).toEqual({
			name: 'Persona Prueba',
			pronouns: 'elle'
		});
		expect(await m.rincon.actions.borrarDato(ev({ campo: 'email' }))).toMatchObject({
			status: 400
		});
		expect(await m.saved.getSavedBuyer(t.db, account.id)).toEqual({
			name: 'Persona Prueba',
			pronouns: 'elle'
		});
	});

	it('«Borrar todo» saca la clave entera y no toca otras preferencias ni otras cuentas', async () => {
		const m = await modules();
		const { account, ev } = await signedIn(m);
		await m.accounts.setNoGroupInvites(t.db, account.id, true);
		await m.saved.setSavedBuyer(t.db, account.id, { name: 'Persona Prueba', dni: DNI });
		const other = await m.accounts.upsertVerifiedAccount(t.db, 'otra.persona@example.com');
		await m.saved.setSavedBuyer(t.db, other.id, { name: 'Otra Persona' });

		expect(await m.rincon.actions.borrarDatos(ev({}))).toEqual({
			action: 'datos',
			message: 'Listo: borramos todos tus datos guardados.'
		});
		expect(await m.saved.getSavedBuyer(t.db, account.id)).toEqual({});
		expect(await m.accounts.getNoGroupInvites(t.db, account.id)).toBe(true);
		const row = await t.db
			.prepare('SELECT preferences FROM accounts WHERE id = ?1')
			.bind(account.id)
			.first();
		expect(row?.preferences).not.toContain('savedBuyer');
		expect(await m.saved.getSavedBuyer(t.db, other.id)).toEqual({ name: 'Otra Persona' });
	});

	it('con el interruptor apagado, las acciones dan 404', async () => {
		const m = await modules('0');
		const member = { id: crypto.randomUUID(), email: EMAIL };
		for (const action of ['datos', 'borrarDato', 'borrarDatos', 'mostrarDni']) {
			const r = await thrown(() =>
				/** @type {any} */ (m.rincon.actions)[action](fakeEvent(member, { campo: 'dni' }))
			);
			expect(r?.status).toBe(404);
		}
	});
});
