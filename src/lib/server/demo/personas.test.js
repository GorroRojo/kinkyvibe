/**
 * «Entrar como persona de prueba» (personas.js) y su seed (scripts/demo/n3-cuentas.sql): solo
 * en previews, solo las cuentas que crea el seed (mismo id, mismo mail @example.invalid, con la
 * marca) y con la sesión de siempre. D1 de miniflare; datos inventados.
 */
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { unstable_splitSqlQuery } from 'wrangler';
import { createTestDB, resetDB } from '../db/testing.js';
import { isPreviewDeploy } from '../deploy.js';
import { upsertVerifiedAccount, deleteAccount } from '../cuentas/accounts.js';
import { ordersForAccount } from '../cuentas/orders.js';
import { SESSION_COOKIE, getSessionAccount } from '../cuentas/session.js';
import { listFollows } from '../sigo/follows.js';
import {
	DEMO_EMAIL_DOMAIN,
	DEMO_PERSONAS,
	demoPersona,
	isSeededDemoAccount,
	listDemoPersonas,
	startDemoPersonaSession
} from './personas.js';

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;

/** @param {string} file */
async function runSeed(file) {
	const sql = await readFile(new URL(`../../../../scripts/demo/${file}`, import.meta.url), 'utf8');
	const statements = unstable_splitSqlQuery(sql).filter((s) => s.trim());
	await t.db.batch(statements.map((s) => t.db.prepare(s)));
}

async function seed() {
	// Dos veces: el seed se puede volver a correr.
	for (let i = 0; i < 2; i++) {
		await runSeed('n3-personas.sql');
		await runSeed('n3-cuentas.sql');
	}
}

beforeAll(async () => {
	t = await createTestDB();
}, 30_000);
afterAll(async () => {
	await t?.dispose();
});
beforeEach(async () => {
	await resetDB(t.db);
	await seed();
});

/** Evento de SvelteKit de mentira (solo lo que usa startSession). */
function fakeEvent() {
	/** @type {Record<string, string>} */
	const jar = {};
	const event = /** @type {any} */ ({
		url: new URL('https://demo.kinkyvibe.workers.dev/ingresar/demo'),
		cookies: {
			get: (/** @type {string} */ k) => jar[k],
			set: (/** @type {string} */ k, /** @type {string} */ v) => {
				jar[k] = v;
			},
			delete: (/** @type {string} */ k) => {
				delete jar[k];
			}
		}
	});
	return { event, jar };
}

const sessionCount = async () =>
	Number((await t.db.prepare('SELECT COUNT(*) AS n FROM account_sessions').first())?.n);

describe('las personas de prueba', () => {
	it('son solo mails @example.invalid, con ids y claves distintos', () => {
		expect(DEMO_PERSONAS.length).toBeGreaterThanOrEqual(2);
		for (const p of DEMO_PERSONAS) {
			expect(p.email.endsWith(DEMO_EMAIL_DOMAIN)).toBe(true);
			expect(p.id).toHaveLength(36);
		}
		expect(new Set(DEMO_PERSONAS.map((p) => p.id)).size).toBe(DEMO_PERSONAS.length);
		expect(new Set(DEMO_PERSONAS.map((p) => p.key)).size).toBe(DEMO_PERSONAS.length);
		expect(demoPersona('nada')).toBeNull();
		expect(demoPersona(DEMO_PERSONAS[0].id)).toBeNull();
		expect(demoPersona(DEMO_PERSONAS[0].email)).toBeNull();
		expect(demoPersona(undefined)).toBeNull();
	});

	it('el seed crea exactamente esas cuentas, marcadas, y lo que promete', async () => {
		const { results } = await t.db.prepare('SELECT id, email FROM accounts ORDER BY id').all();
		expect(results).toEqual(
			DEMO_PERSONAS.map((p) => ({ id: p.id, email: p.email })).sort((a, b) =>
				a.id.localeCompare(b.id)
			)
		);
		expect((await listDemoPersonas(t.db)).every((p) => p.ready)).toBe(true);

		const [conEntradas, gestiona, nueva] = ['con-entradas', 'gestiona-perfil', 'nueva'].map(
			(k) => /** @type {NonNullable<ReturnType<typeof demoPersona>>} */ (demoPersona(k))
		);
		const orders = await ordersForAccount(t.db, conEntradas.id);
		expect(orders.map((o) => [o.event_slug, o.status])).toEqual([
			['demo-personas-2026-12', 'approved']
		]);
		const follows = await listFollows(t.db, conEntradas.id);
		expect(follows.map((f) => f.kind).sort()).toEqual(['etiqueta', 'etiqueta', 'perfil']);
		const managed = await t.db
			.prepare(
				`SELECT o.slug, m.role FROM profile_managers m JOIN objects o ON o.id = m.profile_id
				WHERE m.account_id = ?1`
			)
			.bind(gestiona.id)
			.all();
		expect(managed.results).toEqual([{ slug: 'persona-de-prueba', role: 'owner' }]);
		expect(await ordersForAccount(t.db, nueva.id)).toEqual([]);
		expect(await listFollows(t.db, nueva.id)).toEqual([]);
	});
});

describe('startDemoPersonaSession', () => {
	it('este build (como producción) no es un preview', () => {
		expect(isPreviewDeploy()).toBe(false);
	});

	it('fuera de un preview no hace nada', async () => {
		for (const preview of [
			false,
			isPreviewDeploy(),
			/** @type {any} */ (1),
			/** @type {any} */ ('true')
		]) {
			const { event, jar } = fakeEvent();
			expect(await startDemoPersonaSession({ preview, event, db: t.db, key: 'con-entradas' })).toBe(
				false
			);
			expect(jar).toEqual({});
		}
		expect(await sessionCount()).toBe(0);
	});

	it('en un preview entra con la sesión normal de las cuentas', async () => {
		const { event, jar } = fakeEvent();
		expect(
			await startDemoPersonaSession({ preview: true, event, db: t.db, key: 'con-entradas' })
		).toBe(true);
		const found = await getSessionAccount(t.db, jar[SESSION_COOKIE]);
		expect(found?.id).toBe(demoPersona('con-entradas')?.id);
		expect(found?.email).toBe('demo.entradas@example.invalid');
		const row = await t.db.prepare('SELECT method FROM account_sessions').first();
		expect(row?.method).toBe('code');
	});

	it('nunca entra a una cuenta que no creó el seed', async () => {
		const real = await upsertVerifiedAccount(t.db, 'persona.real@example.com');
		const tries = [real.id, 'persona.real@example.com', 'nada', '', null];
		for (const key of tries) {
			const { event, jar } = fakeEvent();
			expect(await startDemoPersonaSession({ preview: true, event, db: t.db, key })).toBe(false);
			expect(jar).toEqual({});
		}
		expect(await sessionCount()).toBe(0);
	});

	it('sin la marca, con otro mail o borrada, la cuenta no vale', async () => {
		const p = /** @type {NonNullable<ReturnType<typeof demoPersona>>} */ (demoPersona('nueva'));
		const tryIt = async () => {
			const { event } = fakeEvent();
			return startDemoPersonaSession({ preview: true, event, db: t.db, key: 'nueva' });
		};
		// Sin la marca del seed.
		await t.db.prepare("UPDATE accounts SET preferences = '{}' WHERE id = ?1").bind(p.id).run();
		expect(await isSeededDemoAccount(t.db, p)).toBe(false);
		expect(await tryIt()).toBe(false);
		// Con la marca pero otro mail (no es la cuenta del seed).
		await t.db
			.prepare(
				`UPDATE accounts SET email = 'otra.persona@example.com', preferences = '{"datos_de_prueba":true}'
				WHERE id = ?1`
			)
			.bind(p.id)
			.run();
		expect(await tryIt()).toBe(false);
		// Borrada.
		await t.db.prepare('UPDATE accounts SET email = ?2 WHERE id = ?1').bind(p.id, p.email).run();
		expect(await tryIt()).toBe(true);
		await deleteAccount(t.db, p.id);
		expect(await tryIt()).toBe(false);
		// Sin el seed no hay a quién entrar.
		await resetDB(t.db);
		expect((await listDemoPersonas(t.db)).some((x) => x.ready)).toBe(false);
		expect(await tryIt()).toBe(false);
	});

	it('una persona con un mail que no es @example.invalid no se acepta nunca', async () => {
		const fake = { id: '5eed0000-0000-4000-8000-0000000000ff', email: 'alguien@example.com' };
		await t.db
			.prepare(
				`INSERT INTO accounts (id, email, email_verified_at, preferences, created_at, updated_at)
				VALUES (?1, ?2, 1, '{"datos_de_prueba":true}', 1, 1)`
			)
			.bind(fake.id, fake.email)
			.run();
		expect(await isSeededDemoAccount(t.db, fake)).toBe(false);
	});
});
