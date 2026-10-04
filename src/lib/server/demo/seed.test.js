import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { unstable_splitSqlQuery } from 'wrangler';
import { createTestDB } from '../db/testing.js';
import { parseTicketConfig } from '../tickets/config.js';
import { validateEventTags } from '../../utils/adminTags.js';
import { splitMarkdown } from '../../utils/eventDraft.js';
import { getTaken } from '../tickets/orders.js';
import { typeAvailability } from '../tickets/config.js';
import { listRoles } from '../personas/roles.js';
import { resolvePersonas } from '../personas/index.js';
import { publicVenueForEvent } from '../amigues/venues.js';
import { ANON } from '../objects/index.js';
import { hydrateContent } from '../contenido/relaciones.js';
import { eventToMeta } from '../contenido/eventos.js';
import { readFileSync } from 'node:fs';
import { DEMO_ACCOUNTS, DEMO_VENUES } from './seedProfiles.js';
import { DEMO_ACCOUNT_MARK, DEMO_PERSONAS } from './personasData.js';
import { ordersForAccount } from '../cuentas/orders.js';
import {
	N3_CUSTOM_ROLE,
	N3_FLAGS,
	PERSONA_ORDER_ID,
	SEED_BY,
	auditEntries,
	buildData,
	chunkSql,
	eventMarkdown,
	reloadDemoData,
	seedSql,
	todayInArgentina
} from './seed.js';

const today = '2026-09-30';
const now = Date.parse('2026-09-30T12:00:00Z');
const data = buildData({ today, now });

describe('demo seed', () => {
	/** @type {Awaited<ReturnType<typeof createTestDB>>} */
	let t;
	beforeAll(async () => {
		t = await createTestDB();
	});
	afterAll(async () => {
		await t?.dispose();
	});

	/** @param {string} text */
	async function apply(text) {
		for (const chunk of chunkSql(text)) {
			const statements = unstable_splitSqlQuery(chunk).filter((s) => s.trim());
			await t.db.batch(statements.map((s) => t.db.prepare(s)));
		}
	}
	async function counts() {
		/** @type {Record<string, number>} */
		const out = {};
		for (const table of [
			'orders',
			'tickets',
			'discount_codes',
			'ticket_settings',
			'reminder_sends',
			'stream_link_sends',
			'event_ticket_settings'
		]) {
			const r = /** @type {any} */ (
				await t.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()
			);
			out[table] = r.n;
		}
		return out;
	}

	it('satisfies every CHECK and is idempotent', async () => {
		// A row that isn't the seed's must survive.
		await t.db
			.prepare(
				"INSERT INTO discount_codes (code, kind, value, created_at, created_by) VALUES ('REAL', 'percent', 5, 1, 'GorroRojo')"
			)
			.run();
		await apply(seedSql(data));
		const first = await counts();
		expect(first.orders).toBe(data.orders.length);
		expect(first.tickets).toBe(data.tickets.length);
		expect(first.reminder_sends).toBe(data.reminderSends.length);
		expect(first.stream_link_sends).toBe(data.streamSends.length);
		await apply(seedSql(buildData({ today, now })));
		expect(await counts()).toEqual(first);
		expect(
			await t.db.prepare("SELECT code FROM discount_codes WHERE code = 'REAL'").first()
		).toBeTruthy();
		const demoFiles = await t.db
			.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'demo_files'")
			.first();
		expect(demoFiles).toBeTruthy();
	}, 60000);

	it('covers every order state the panel shows', () => {
		const states = new Set(data.orders.map((o) => o.status));
		for (const s of [
			'approved',
			'awaiting_transfer',
			'pending',
			'refunded',
			'expired',
			'rejected',
			'cancelled'
		])
			expect(states).toContain(s);
		const methods = new Set(
			data.orders.filter((o) => o.status === 'approved').map((o) => o.payment_method)
		);
		expect(methods).toEqual(new Set(['mercadopago', 'transferencia', 'gratis']));
		expect(data.orders.some((o) => o.needs_review === 'late_payment')).toBe(true);
		expect(data.orders.some((o) => o.needs_review === 'duplicate_payment')).toBe(true);
		expect(data.orders.some((o) => o.status === 'approved' && o.email_sent_at === null)).toBe(true);
		// A transfer that expires within a few hours of "now", still in the future.
		expect(
			data.orders.some(
				(o) =>
					o.status === 'awaiting_transfer' &&
					Number(o.expires_at) > now &&
					Number(o.expires_at) < now + 6 * 3600e3
			)
		).toBe(true);
	});

	it('has one event tonight with check-ins, repeat and first-time attendees', () => {
		const tonight = data.events.filter((e) => e.offset === 0);
		expect(tonight).toHaveLength(1);
		const slug = tonight[0].slug;
		expect(data.tickets.some((x) => x.event_slug === slug && x.checked_in_at)).toBe(true);
		const series = data.events
			.filter((e) => e.series === tonight[0].series && e.offset < 0)
			.map((e) => e.slug);
		const before = new Set(
			data.orders.filter((o) => series.includes(String(o.event_slug))).map((o) => o.buyer_email)
		);
		const tonightBuyers = data.orders
			.filter((o) => o.event_slug === slug && o.status === 'approved')
			.map((o) => o.buyer_email);
		expect(tonightBuyers.some((e) => before.has(e))).toBe(true);
		expect(tonightBuyers.some((e) => !before.has(e))).toBe(true);
	});

	it('only uses invented data', () => {
		for (const o of data.orders) expect(String(o.buyer_email)).toMatch(/@example\.invalid$/);
		for (const e of data.events) expect(e.title).toMatch(/\(demo\)$/);
	});

	it('writes events the ticket system and the editor accept', () => {
		for (const e of data.events) {
			const meta = parse(splitMarkdown(eventMarkdown(e)).frontmatter);
			expect(validateEventTags(meta.tags)).toEqual([]);
			expect(parseTicketConfig(meta, { fondoPercent: 20 })).not.toBeNull();
		}
	});
});

const HOUR = 3600e3;
const DAY = 24 * HOUR;

/**
 * The metadata the site builds for an event of the database (the same as `toMeta` in
 * ../contenido/posts.js), or `null`.
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} slug
 */
async function eventMeta(db, slug) {
	const row = /** @type {any} */ (
		await db
			.prepare(
				"SELECT id, type, slug, title, data, visibility FROM objects WHERE type = 'evento' AND slug = ?1 AND deleted_at IS NULL"
			)
			.bind(slug)
			.first()
	);
	if (!row) return null;
	const [object] = await hydrateContent(db, [
		{ ...row, id: Number(row.id), data: JSON.parse(String(row.data)) }
	]);
	return eventToMeta(object);
}

describe('demo seed: dates relative to "now"', () => {
	it('moving "now" by whole days moves every instant by the same amount, and nothing else', () => {
		const nowA = Date.parse('2026-09-30T15:00:00Z');
		const k = 37;
		const nowB = nowA + k * DAY;
		const a = buildData({ today: todayInArgentina(nowA), now: nowA });
		const b = buildData({ today: todayInArgentina(nowB), now: nowB });
		expect(b.today).toBe('2026-11-06');
		expect(b.events.map((e) => [e.start, e.end])).toEqual(
			a.events.map((e) => [e.start + k * DAY, e.end + k * DAY])
		);
		const slugs = a.events.map((e, i) => [e.slug, b.events[i].slug]);
		expect(slugs.every(([x, y]) => x !== y)).toBe(true);
		/** @param {unknown} v */
		const shift = (v) => {
			if (typeof v === 'number' && v > 1e12) return v + k * DAY;
			if (typeof v === 'string') return slugs.reduce((s, [x, y]) => s.replaceAll(x, y), v);
			return v;
		};
		/** @param {Record<string, unknown>[]} rows */
		const moved = (rows) =>
			rows.map((r) => Object.fromEntries(Object.entries(r).map(([key, v]) => [key, shift(v)])));
		expect(b.orders).toEqual(moved(a.orders));
		expect(b.tickets).toEqual(moved(a.tickets));
		expect(b.discountCodes).toEqual(moved(a.discountCodes));
		expect(b.reminderSends).toEqual(moved(a.reminderSends));
		expect(auditEntries(b)).toEqual(moved(auditEntries(a)));
		// Deterministic: same "now", same data.
		expect(buildData({ today: a.today, now: nowA }).orders).toEqual(a.orders);
	});

	// Argentina is UTC-3: 00:30, 09:00, 16:00, 23:30 (the party is on) and 03:00 of the next day.
	for (const iso of [
		'2026-10-01T03:30:00Z',
		'2026-10-01T12:00:00Z',
		'2026-10-01T19:00:00Z',
		'2026-10-02T02:30:00Z',
		'2026-10-02T06:00:00Z'
	]) {
		it(`keeps the story when loaded at ${iso}`, () => {
			const now = Date.parse(iso);
			const d = buildData({ today: todayInArgentina(now), now });
			const today = d.events.filter((e) => e.offset === 0);
			expect(today).toHaveLength(1);
			expect(today[0].slug).toBe(`demo-noche-latex-${todayInArgentina(now)}`);
			expect(today[0].end).toBeGreaterThan(now);
			expect(d.events.filter((e) => e.start > now).length).toBeGreaterThanOrEqual(8);
			const past = d.events.filter((e) => e.end < now).map((e) => e.slug);
			const pastCheckedIn = new Set(
				d.tickets
					.filter((x) => x.checked_in_at && past.includes(String(x.event_slug)))
					.map((x) => x.event_slug)
			);
			expect(pastCheckedIn.size).toBeGreaterThanOrEqual(5);
			// Tonight's door already has someone in.
			expect(d.tickets.some((x) => x.event_slug === today[0].slug && x.checked_in_at)).toBe(true);
			// A transfer that expires in a few hours.
			expect(
				d.orders.some(
					(o) =>
						o.status === 'awaiting_transfer' &&
						Number(o.expires_at) > now &&
						Number(o.expires_at) <= now + 6 * HOUR
				)
			).toBe(true);
			// Nothing already happened in the future.
			for (const o of d.orders) {
				for (const key of ['created_at', 'updated_at', 'email_sent_at', 'refunded_at'])
					if (o[key] !== null)
						expect(Number(o[key]), `${key} ${o.status}`).toBeLessThanOrEqual(now);
			}
			for (const x of d.tickets)
				if (x.checked_in_at !== null) expect(Number(x.checked_in_at)).toBeLessThanOrEqual(now);
			for (const r of d.reminderSends) expect(Number(r.sent_at)).toBeLessThan(now);
			for (const a of auditEntries(d)) expect(a.at).toBeLessThanOrEqual(now);
			expect(auditEntries(d).length).toBeGreaterThanOrEqual(4);
		});
	}
});

describe('reloadDemoData (D1): wipes only demo rows and is idempotent', () => {
	/** @type {Awaited<ReturnType<typeof createTestDB>>} */
	let t;
	beforeAll(async () => {
		t = await createTestDB();
		// Tables of later migrations (panel). Same shape; no-ops where the migrations exist.
		await t.db.batch(
			[
				'CREATE TABLE IF NOT EXISTS admin_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, actor_id INTEGER, actor_login TEXT NOT NULL, action TEXT NOT NULL, target_type TEXT, target_id TEXT, summary TEXT NOT NULL, detail TEXT)',
				'CREATE TABLE IF NOT EXISTS admin_last_seen (admin_id INTEGER PRIMARY KEY NOT NULL, seen_at INTEGER NOT NULL, last_at INTEGER NOT NULL)',
				'CREATE TABLE IF NOT EXISTS person_notes (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL, created_by TEXT NOT NULL)',
				'CREATE TABLE IF NOT EXISTS email_templates (id TEXT PRIMARY KEY NOT NULL, subject TEXT NOT NULL, heading TEXT NOT NULL, body TEXT NOT NULL, updated_at INTEGER NOT NULL, updated_by TEXT NOT NULL)',
				'CREATE TABLE IF NOT EXISTS event_mail_sends (id TEXT PRIMARY KEY, event_slug TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, created_by TEXT NOT NULL, created_at INTEGER NOT NULL, finished_at INTEGER)',
				'CREATE TABLE IF NOT EXISTS event_mail_recipients (send_id TEXT NOT NULL, email TEXT NOT NULL, status TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (send_id, email))'
			].map((s) => t.db.prepare(s))
		);
	});
	afterAll(async () => {
		await t?.dispose();
	});

	/**
	 * @param {string} table
	 * @param {Record<string, unknown>} row
	 */
	const insertRow = (table, row) => {
		const cols = Object.keys(row);
		return t.db
			.prepare(
				`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
			)
			.bind(...cols.map((c) => row[c] ?? null));
	};

	const TABLES = [
		'orders',
		'tickets',
		'reminder_sends',
		'stream_link_sends',
		'discount_codes',
		'ticket_settings',
		'event_ticket_settings',
		'demo_files',
		'admin_audit',
		'admin_last_seen',
		'person_notes',
		'email_templates',
		'event_mail_sends',
		'event_mail_recipients',
		// Noche 3.
		'feature_flags',
		'tips',
		'persona_roles',
		'signup_fields',
		'event_signup_general',
		'order_answers',
		'event_venues',
		'profile_claims',
		'series_subscriptions',
		'objects',
		'edges',
		'profile_approvals',
		'profile_managers',
		'accounts'
	];
	async function snapshot() {
		/** @type {Record<string, number>} */
		const out = {};
		for (const table of TABLES) {
			const r = /** @type {any} */ (
				await t.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()
			);
			out[table] = r.n;
		}
		return out;
	}
	/** @param {string} q */
	const count = async (q) =>
		Number(/** @type {any} */ (await t.db.prepare(`SELECT COUNT(*) AS n FROM ${q}`).first()).n);

	it('keeps everything else and gives the same result every time', async () => {
		const day1 = Date.parse('2026-10-01T15:00:00Z');
		// A first load, so that there are "previous demo data" to wipe.
		await reloadDemoData(t.db, { now: day1 - 3 * DAY });

		// Rows that are not demo data (must survive), and rows made "in the demo" on demo events
		// (must go).
		const sample = /** @type {Record<string, unknown>} */ (
			data.orders.find((o) => o.status === 'approved' && o.quantity === 1)
		);
		await t.db.batch([
			insertRow('orders', { ...sample, id: 'real-order', event_slug: 'evento-real-2026-10' }),
			insertRow('tickets', {
				id: 'real-ticket',
				order_id: 'real-order',
				event_slug: 'evento-real-2026-10',
				ticket_type: 'general',
				holder_name: 'Persona Real Inventada',
				token: 'x'.repeat(43),
				code: 'ABC234'
			}),
			insertRow('reminder_sends', { order_id: 'real-order', reminder_id: 'h48', sent_at: 1 }),
			insertRow('orders', { ...sample, id: 'demo-made', event_slug: 'demo-creado-en-la-demo' }),
			insertRow('discount_codes', {
				code: 'REAL',
				kind: 'percent',
				value: 5,
				created_at: 1,
				created_by: 'GorroRojo'
			}),
			insertRow('ticket_settings', {
				key: 'reminders',
				value: '[]',
				updated_at: 1,
				updated_by: 'x'
			}),
			// A setting the seed also sets, saved again by someone: the seed doesn't overwrite it.
			t.db.prepare(
				"UPDATE ticket_settings SET value = 'Banco Guardado A Mano', updated_by = 'demo' WHERE key = 'transfer_bank'"
			),
			insertRow('demo_files', {
				path: 'src/lib/posts/calendario/evento-real-2026-10.md',
				content: 'editado en la demo',
				author: 'demo'
			}),
			// A demo event left as .md by an older seed (the site no longer reads them): it goes.
			insertRow('demo_files', {
				path: 'src/lib/posts/calendario/demo-noche-latex-2026-09-30.md',
				content: '---\ntitle: x\n---\n',
				author: SEED_BY
			}),
			insertRow('demo_files', {
				path: 'src/lib/posts/calendario/demo-creado-en-la-demo.md',
				content: '---\ntitle: x\n---\n',
				author: 'demo'
			}),
			insertRow('admin_audit', {
				at: 1,
				actor_login: 'GorroRojo',
				action: 'event.publish',
				target_type: 'event',
				target_id: 'evento-real-2026-10',
				summary: 'real'
			}),
			insertRow('admin_audit', {
				at: 2,
				actor_login: 'demo',
				action: 'event.publish',
				target_type: 'event',
				target_id: 'demo-creado-en-la-demo',
				summary: 'en la demo'
			}),
			insertRow('admin_last_seen', { admin_id: 12345, seen_at: 1, last_at: 1 }),
			insertRow('person_notes', {
				email: 'a@example.invalid',
				body: 'real',
				created_at: 1,
				created_by: 'GorroRojo'
			}),
			insertRow('event_mail_sends', {
				id: 'mail-demo',
				event_slug: 'demo-creado-en-la-demo',
				subject: 's',
				body: 'b',
				created_by: 'demo',
				created_at: 1
			}),
			insertRow('event_mail_recipients', {
				send_id: 'mail-demo',
				email: 'a@example.invalid',
				status: 'sent',
				at: 1
			})
		]);

		const r1 = await reloadDemoData(t.db, { now: day1 });
		const first = await snapshot();
		expect(r1.skipped).toEqual([]);
		// 17 + «Fiesta con preventas (demo)» (Noche 3 · C, #134).
		expect(r1.events).toBe(18);
		expect(r1.tonight?.slug).toBe('demo-noche-latex-2026-10-01');
		expect(r1.orders).toBe(first.orders - 1); // all but the real one
		expect(r1.pendingTransfers).toBeGreaterThan(0);

		// Idempotent: reloading gives exactly the same tables.
		await reloadDemoData(t.db, { now: day1 });
		expect(await snapshot()).toEqual(first);

		// Another day: same amount of data, now around the new "today".
		const r2 = await reloadDemoData(t.db, { now: day1 + DAY });
		expect(await snapshot()).toEqual(first);
		expect(r2.tonight?.slug).toBe('demo-noche-latex-2026-10-02');
		expect(await count("orders WHERE event_slug = 'demo-noche-latex-2026-10-01'")).toBe(0);
		expect(await count("orders WHERE event_slug = 'demo-noche-latex-2026-10-02'")).toBeGreaterThan(
			20
		);
		// The events are objects (reused from one day to the next), not .md in the demo layer.
		expect(r2.eventObjects).toBe(18);
		expect(
			await count(
				"objects WHERE type = 'evento' AND slug = 'demo-noche-latex-2026-10-02' AND deleted_at IS NULL"
			)
		).toBe(1);
		expect(
			await count("objects WHERE type = 'evento' AND slug = 'demo-noche-latex-2026-10-01'")
		).toBe(0);
		expect(await count("demo_files WHERE path LIKE 'src/lib/posts/calendario/demo-%'")).toBe(0);

		// What isn't demo data is untouched.
		expect(await count("orders WHERE id = 'real-order'")).toBe(1);
		expect(await count("tickets WHERE id = 'real-ticket'")).toBe(1);
		expect(await count("reminder_sends WHERE order_id = 'real-order'")).toBe(1);
		expect(await count("discount_codes WHERE code = 'REAL'")).toBe(1);
		expect(await count("ticket_settings WHERE key = 'reminders'")).toBe(1);
		expect(await count("ticket_settings WHERE value = 'Banco Guardado A Mano'")).toBe(1);
		expect(
			await count("demo_files WHERE path = 'src/lib/posts/calendario/evento-real-2026-10.md'")
		).toBe(1);
		expect(await count("admin_audit WHERE summary = 'real'")).toBe(1);
		expect(await count('admin_last_seen WHERE admin_id = 12345')).toBe(1);
		expect(await count("person_notes WHERE created_by = 'GorroRojo'")).toBe(1);
		// What was made in the demo on demo events is gone.
		expect(await count("orders WHERE event_slug = 'demo-creado-en-la-demo'")).toBe(0);
		expect(await count("demo_files WHERE path LIKE '%demo-creado-en-la-demo%'")).toBe(0);
		expect(await count("admin_audit WHERE target_id = 'demo-creado-en-la-demo'")).toBe(0);
		expect(await count('event_mail_sends')).toBe(0);
		expect(await count('event_mail_recipients')).toBe(0);
		// The seed's own rows, once.
		expect(await count(`person_notes WHERE created_by = '${SEED_BY}'`)).toBe(2);
		expect(await count('admin_last_seen WHERE admin_id = -1')).toBe(1);
	}, 60000);

	it('Noche 3: switches, presales, tips, venues, personas, questions and series', async () => {
		const day1 = Date.parse('2026-10-01T15:00:00Z');
		// Not demo data: survives.
		await t.db.batch([
			insertRow('tips', {
				id: '00000000-0000-4000-8000-00000000aaaa',
				amount: 777,
				status: 'approved',
				post_category: 'material',
				post_slug: 'otra-publicacion',
				mp_preference_id: 'pref-real',
				created_at: 1,
				updated_at: 1
			}),
			insertRow('signup_fields', {
				id: 5,
				event_slug: null,
				label: 'Pregunta real',
				kind: 'text',
				required: 0,
				options: '[]',
				position: 1,
				created_at: 1,
				updated_at: 1,
				updated_by: 'GorroRojo'
			})
		]);
		// «Sucede en» is the event's `lugar` edge (migration 0035): the seed writes the demo events
		// as objects, with the venue on the next date of each venue's series.
		const r = await reloadDemoData(t.db, { now: day1 });
		expect(r.skipped).toEqual([]);
		expect(r.venuesLinked).toBe(DEMO_VENUES.length);
		const again = await snapshot();
		await reloadDemoData(t.db, { now: day1 });
		expect(await snapshot()).toEqual(again);
		expect(await count("tips WHERE mp_preference_id = 'pref-real'")).toBe(1);
		expect(await count("signup_fields WHERE label = 'Pregunta real'")).toBe(1);

		// Switches on.
		for (const key of N3_FLAGS)
			expect(await count(`feature_flags WHERE key = '${key}' AND enabled = 1`)).toBe(1);

		// Presales: «Preventa 1» full, «Preventa 2» current, «Última tanda» waiting.
		const presale = /** @type {any} */ (
			await t.db
				.prepare(
					"SELECT slug FROM objects WHERE type = 'evento' AND slug LIKE 'demo-fiesta-preventas-%' AND deleted_at IS NULL"
				)
				.first()
		);
		const slug = String(presale.slug);
		const config = /** @type {any} */ (
			parseTicketConfig(/** @type {any} */ (await eventMeta(t.db, slug)), { fondoPercent: 20 })
		);
		const taken = await getTaken(t.db, slug, day1);
		expect(taken.types.get('general')).toBe(9);
		const general = typeAvailability(config, config.types[0], taken, day1);
		expect(general.tier?.tier.name).toBe('Preventa 2');
		expect(typeAvailability(config, config.types[1], taken, day1).state).toBe('waiting');
		expect(config.door?.on).toBe(true);
		expect(await count(`orders WHERE event_slug = '${slug}' AND ticket_tier = 'preventa-1'`)).toBe(
			3
		);

		// Pay what you want with a minimum (the recommended minimum was removed in #150).
		const talk = data.events.find((e) => e.series === 'charla-consentimiento');
		const talkConfig = /** @type {any} */ (
			parseTicketConfig(parse(splitMarkdown(eventMarkdown(/** @type {any} */ (talk))).frontmatter))
		);
		expect(talkConfig.types[0].gorra).toEqual({ min: 1000, suggested: 4000 });

		// Tips: invented, on real posts and tonight's party.
		expect(await count(`tips WHERE mp_preference_id = '${SEED_BY}'`)).toBe(7);
		expect(await count(`tips WHERE mp_preference_id = '${SEED_BY}' AND status = 'approved'`)).toBe(
			4
		);

		// Venues: one per privacy level, each on a demo event; the hidden one shows nothing.
		expect(
			await count(`edges WHERE kind = 'lugar' AND created_by = '${SEED_BY}'
				AND to_id IN (SELECT id FROM objects WHERE slug IN (${DEMO_VENUES.map((v) => `'${v.slug}'`).join(', ')}))`)
		).toBe(DEMO_VENUES.length);
		const hidden = /** @type {any} */ (
			await t.db
				.prepare(
					`SELECT coalesce(cs.legacy_slug, ev.slug) AS event_slug FROM edges e
					JOIN objects ev ON ev.id = e.from_id
					LEFT JOIN content_sources cs ON cs.object_id = ev.id AND cs.category = 'calendario'
					JOIN objects o ON o.id = e.to_id
					WHERE e.kind = 'lugar' AND o.slug = 'refugio-demo-oculto'`
				)
				.first()
		);
		expect(hidden.event_slug).toBe(slug);
		expect(await publicVenueForEvent(t.db, slug, ANON)).toEqual({ level: 'hidden' });
		const tonight = String(r.tonight?.slug);
		const open = await publicVenueForEvent(t.db, tonight, ANON);
		expect(open).toMatchObject({ level: 'public', name: 'Casa Demo Pública' });

		// «Es mi perfil» pending, and the account-made profile waits for approval.
		expect(
			await count(
				`profile_claims WHERE account_id = '${DEMO_ACCOUNTS.claimer.id}' AND status = 'pending'`
			)
		).toBe(1);
		expect(
			await count(
				"profile_approvals WHERE profile_id = (SELECT id FROM objects WHERE slug = 'perfil-demo-nuevo')"
			)
		).toBe(0);

		// Personas: the party's people, with the custom role; both profiles are public.
		const roles = await listRoles(t.db);
		expect(roles).toContain(N3_CUSTOM_ROLE);
		const party = /** @type {any} */ (await eventMeta(t.db, tonight));
		const groups = await resolvePersonas(t.db, party.personas, roles);
		expect(groups.map((g) => [g.rol, g.items.map((i) => i.slug)])).toEqual([
			['Organiza', ['colectivo-demo']],
			[N3_CUSTOM_ROLE, ['persona-demo-integrante']]
		]);

		// Questions: a general one chosen by the next workshop, with two answered orders.
		expect(await count(`signup_fields WHERE updated_by = '${SEED_BY}'`)).toBe(2);
		expect(await count('order_answers')).toBe(2);

		// Series: confirmed subscriptions with the app's key format.
		const subs = /** @type {any[]} */ (
			(await t.db.prepare('SELECT subscriber_key, confirmed_at FROM series_subscriptions').all())
				.results
		);
		expect(subs).toHaveLength(3);
		for (const x of subs) {
			expect(x.subscriber_key).toMatch(/^e:[0-9a-f]{64}$/);
			expect(x.confirmed_at).toBeTruthy();
		}
	}, 60000);

	it('skips the tables of migrations the database does not have', async () => {
		const bare = await createTestDB();
		try {
			await bare.db.prepare('DROP TABLE IF EXISTS admin_audit').run();
			const r = await reloadDemoData(bare.db, { now: Date.parse('2026-10-01T15:00:00Z') });
			expect(r.skipped).toContain('admin_audit');
			expect(r.orders).toBeGreaterThan(100);
		} finally {
			await bare.dispose();
		}
	}, 60000);
});

describe('demo events as objects (D1): reused from one day to the next', () => {
	/** @type {Awaited<ReturnType<typeof createTestDB>>} */
	let t;
	beforeAll(async () => {
		t = await createTestDB();
	});
	afterAll(async () => {
		await t?.dispose();
	});

	const day1 = Date.parse('2026-10-01T15:00:00Z');
	/** @param {string} q */
	const count = async (q) =>
		Number(/** @type {any} */ (await t.db.prepare(`SELECT COUNT(*) AS n FROM ${q}`).first()).n);
	async function counts() {
		/** @type {Record<string, number>} */
		const out = {};
		for (const q of [
			"objects WHERE type = 'evento'",
			"objects WHERE type = 'evento' AND deleted_at IS NULL",
			'objects',
			'edges',
			"edges WHERE kind = 'lugar'",
			"edges WHERE kind = 'persona'",
			'content_sources'
		])
			out[q] = await count(q);
		return out;
	}
	/** slot → id of the live demo event objects. */
	async function slotIds() {
		const { results } = await t.db
			.prepare(
				`SELECT id, slug, json_extract(data, '$.extra.demo_slot') AS slot FROM objects
				WHERE type = 'evento' AND deleted_at IS NULL AND json_extract(data, '$.extra.demo_slot') IS NOT NULL`
			)
			.all();
		return Object.fromEntries(results.map((r) => [String(r.slot), Number(r.id)]));
	}
	/** @param {number} id */
	const rowOf = (id) =>
		t.db
			.prepare(
				'SELECT slug, version, updated_at, updated_by, data, deleted_at FROM objects WHERE id = ?1'
			)
			.bind(id)
			.first();
	/** @param {number} at */
	async function listedSlugs(at) {
		const posts = await import('../contenido/posts.js');
		const listed = await posts.sitePosts(t.platform);
		const unlisted = await posts.sitePosts(t.platform, false, true);
		const plan = buildData({ today: todayInArgentina(at), now: at });
		return {
			plan,
			listed: new Set(listed.map((p) => String(p.meta.postID))),
			unlisted: new Set(unlisted.map((p) => String(p.meta.postID)))
		};
	}
	/**
	 * The demo .md of some events, as Contenido → Importar would read them from a deploy.
	 * @param {ReturnType<typeof buildData>['events']} evs
	 */
	const mdFiles = (evs) =>
		evs.map((e) => {
			const raw = eventMarkdown(e);
			return {
				legacySlug: e.slug,
				raw,
				meta: JSON.parse(JSON.stringify(parse(splitMarkdown(raw).frontmatter)))
			};
		});

	it('keeps the same objects and edges every day, visible in the public lists and with their venues', async () => {
		const { saveObject } = await import('../objects/save.js');
		// Not demo data: never touched.
		const real = await saveObject(
			t.db,
			{
				type: 'evento',
				slug: 'evento-real-2026-10',
				title: 'Evento real inventado',
				data: { summary: 'No es de prueba.', start: '2026-10-20T20:00-03:00' }
			},
			{ actor: 'admin-inventade', now: 1 }
		);
		const realBefore = await rowOf(real.id);

		const r1 = await reloadDemoData(t.db, { now: day1 });
		expect(r1.eventObjects).toBe(18);
		expect(r1.eventsSkipped).toEqual([]);
		expect(r1.venuesLinked).toBe(DEMO_VENUES.length);
		const first = await counts();
		expect(first["edges WHERE kind = 'persona'"]).toBeGreaterThan(0);
		const ids = await slotIds();
		expect(Object.keys(ids)).toHaveLength(18);
		const revisions1 = await count("object_revisions WHERE source = 'demo'");
		expect(revisions1).toBe(18);

		// The public list reader shows them (the draft, unlisted).
		const s1 = await listedSlugs(day1);
		for (const e of s1.plan.events) {
			expect(e.draft ? s1.unlisted : s1.listed).toContain(e.slug);
		}
		expect(s1.listed).toContain('evento-real-2026-10');

		// Another day, and a month later (each date of a series takes the slug another one had).
		for (const at of [day1 + DAY, day1 + 28 * DAY, day1 + 29 * DAY]) {
			const r = await reloadDemoData(t.db, { now: at });
			expect(r.eventObjects).toBe(18);
			expect(r.eventsSkipped).toEqual([]);
			expect(r.venuesLinked).toBe(DEMO_VENUES.length);
			expect(await counts()).toEqual(first);
			expect(await slotIds()).toEqual(ids);
			const s = await listedSlugs(at);
			for (const e of s.plan.events) {
				expect(e.draft ? s.unlisted : s.listed).toContain(e.slug);
				expect(await count(`objects WHERE type = 'evento' AND slug = '${e.slug}'`)).toBe(1);
			}
			// Yesterday's slugs are gone (not left behind as other objects).
			expect(
				await count(
					`objects WHERE type = 'evento' AND slug = 'demo-noche-latex-${todayInArgentina(at - DAY)}'`
				)
			).toBe(0);
			const tonight = String(r.tonight?.slug);
			expect(await publicVenueForEvent(t.db, tonight, ANON)).toMatchObject({
				level: 'public',
				name: 'Casa Demo Pública'
			});
		}
		// One revision per event and reload (the history is never pruned).
		expect(await count("object_revisions WHERE source = 'demo'")).toBe(18 * 4);
		// Venues: one `lugar` edge per demo venue, on the next date of its series.
		expect(
			await count(`edges WHERE kind = 'lugar'
				AND to_id IN (SELECT id FROM objects WHERE slug IN (${DEMO_VENUES.map((v) => `'${v.slug}'`).join(', ')}))`)
		).toBe(DEMO_VENUES.length);
		expect(await rowOf(real.id)).toEqual(realBefore);
	}, 120000);

	it('adopts a demo event imported from a .md, retires stale ones and never touches other events', async () => {
		const fresh = await createTestDB();
		const prev = t;
		t = fresh;
		try {
			const { saveObject } = await import('../objects/save.js');
			const { runImport } = await import('../contenido/importer.js');
			const plan1 = buildData({ today: todayInArgentina(day1), now: day1 });
			// Contenido → Importar on a deploy that has the demo .md of day 1 (the `demo` branch).
			const latex = plan1.events.filter((e) => e.series === 'noche-latex');
			const imported = await runImport(t.db, 'calendario', mdFiles(latex), { actor: 'demo' });
			expect(imported.results.map((r) => r.action)).toEqual(latex.map(() => 'created'));
			const importedIds = imported.results.map((r) => Number(r.objectId));
			// An event that isn't demo data but whose old .md had the slug of a demo date.
			const munch = /** @type {any} */ (plan1.events.find((e) => e.slot === 'munch-martes-4'));
			const other = await saveObject(
				t.db,
				{
					type: 'evento',
					slug: 'evento-ajeno',
					title: 'Evento ajeno inventado',
					data: { summary: 'No es de prueba.', start: '2026-10-20T20:00-03:00' }
				},
				{ actor: 'admin-inventade', now: 1 }
			);
			await t.db
				.prepare(
					`INSERT INTO content_sources (object_id, category, legacy_slug, source_hash,
						imported_version, imported_at, updated_at) VALUES (?1, 'calendario', ?2, ?3, 1, 1, 1)`
				)
				.bind(other.id, munch.slug, 'a'.repeat(64))
				.run();
			const otherBefore = await rowOf(other.id);

			const r1 = await reloadDemoData(t.db, { now: day1 });
			// The imported ones became the demo events of their dates (same objects).
			const ids = await slotIds();
			expect(latex.map((e) => ids[e.slot])).toEqual(importedIds);
			expect(await count(`content_sources WHERE object_id IN (${importedIds.join(', ')})`)).toBe(0);
			// The other event is never touched: that demo date is skipped.
			expect(r1.eventsSkipped).toEqual([munch.slug]);
			expect(r1.eventObjects).toBe(17);
			expect(await rowOf(other.id)).toEqual(otherBefore);
			expect(await count(`content_sources WHERE object_id = ${other.id}`)).toBe(1);

			// A month later, the deploy's .md of that day get imported too: only the last party has
			// a slug no demo event has yet, so it's created; the seed retires it to take its slug.
			const at = day1 + 28 * DAY;
			const plan2 = buildData({ today: todayInArgentina(at), now: at });
			const latex2 = plan2.events.filter((e) => e.series === 'noche-latex');
			const again = await runImport(t.db, 'calendario', mdFiles(latex2), { actor: 'demo' });
			const created = again.results.filter((r) => r.action === 'created');
			expect(created).toHaveLength(1);
			const stale = Number(created[0].objectId);
			const r2 = await reloadDemoData(t.db, { now: at });
			expect(r2.eventsSkipped).toEqual([]);
			expect(r2.eventObjects).toBe(18);
			const gone = /** @type {any} */ (await rowOf(stale));
			expect(gone.deleted_at).not.toBeNull();
			expect(gone.slug).not.toBe(created[0].slug);
			expect(await count(`content_sources WHERE object_id = ${stale}`)).toBe(0);
			expect((await slotIds())['noche-latex-6']).toBe(ids['noche-latex-6']);
			const s = await listedSlugs(at);
			for (const e of plan2.events) expect(e.draft ? s.unlisted : s.listed).toContain(e.slug);
			expect(await rowOf(other.id)).toEqual(otherBefore);

			// From then on, nothing else changes in size.
			const settled = await counts();
			await reloadDemoData(t.db, { now: at + DAY });
			expect(await counts()).toEqual(settled);
		} finally {
			t = prev;
			await fresh.dispose();
		}
	}, 120000);
});

describe('reloadDemoData (D1): the purchase of «Persona con entradas» survives a reload', () => {
	/** @type {Awaited<ReturnType<typeof createTestDB>>} */
	let t;
	beforeAll(async () => {
		t = await createTestDB();
	});
	afterAll(async () => {
		await t?.dispose();
	});

	/** @param {string} file */
	async function applyFile(file) {
		const text = readFileSync(new URL(file, import.meta.url), 'utf8');
		const statements = unstable_splitSqlQuery(text).filter((s) => s.trim());
		for (const s of statements) await t.db.prepare(s).run();
	}
	const persona = /** @type {(typeof DEMO_PERSONAS)[number]} */ (
		DEMO_PERSONAS.find((p) => p.key === 'con-entradas')
	);

	it('Mi rincón lists an approved ticket for tonight after every reload', async () => {
		// The account comes from scripts/demo/n3-cuentas.sql, as in the preview database.
		await applyFile('../../../../scripts/demo/n3-cuentas.sql');
		const before = await ordersForAccount(t.db, persona.id);
		expect(before).toHaveLength(1);

		const day1 = Date.parse('2026-10-01T15:00:00Z');
		const r1 = await reloadDemoData(t.db, { now: day1 });
		// Before the fix the reset of the `demo-*` orders wiped it: «Todavía no hay compras».
		const after = await ordersForAccount(t.db, persona.id);
		expect(after).toHaveLength(1);
		expect(after[0]).toMatchObject({
			id: PERSONA_ORDER_ID,
			event_slug: r1.tonight?.slug,
			status: 'approved',
			quantity: 1
		});
		const tickets = await t.db
			.prepare('SELECT COUNT(*) AS n FROM tickets WHERE order_id = ?1')
			.bind(PERSONA_ORDER_ID)
			.first();
		expect(Number(/** @type {any} */ (tickets).n)).toBe(1);

		// Another reload (and another day): still exactly one, around the new "today".
		const r2 = await reloadDemoData(t.db, { now: day1 + DAY });
		const again = await ordersForAccount(t.db, persona.id);
		expect(again).toHaveLength(1);
		expect(again[0].event_slug).toBe(r2.tonight?.slug);
		const n = await t.db
			.prepare('SELECT COUNT(*) AS n FROM tickets WHERE order_id = ?1')
			.bind(PERSONA_ORDER_ID)
			.first();
		expect(Number(/** @type {any} */ (n).n)).toBe(1);
	}, 60000);

	it('loads nothing for an account without the demo mark', async () => {
		await t.db
			.prepare(
				`UPDATE accounts SET preferences = json_remove(preferences, '$.${DEMO_ACCOUNT_MARK}') WHERE id = ?1`
			)
			.bind(persona.id)
			.run();
		await reloadDemoData(t.db, { now: Date.parse('2026-10-03T15:00:00Z') });
		expect(await ordersForAccount(t.db, persona.id)).toHaveLength(0);
	}, 60000);
});
