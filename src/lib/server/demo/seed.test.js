import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { unstable_splitSqlQuery } from 'wrangler';
import { createTestDB } from '../db/testing.js';
import { parseTicketConfig } from '../tickets/config.js';
import { validateEventTags } from '../../utils/adminTags.js';
import { splitMarkdown } from '../../utils/eventDraft.js';
import {
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
		'event_mail_recipients'
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
		const bundledSlugs = ['demo-noche-latex-2026-09-30', 'demo-munch-martes-2026-10-14'];
		// A first load, so that there are "previous demo data" to wipe.
		await reloadDemoData(t.db, { now: day1 - 3 * DAY, bundledSlugs });

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

		const r1 = await reloadDemoData(t.db, { now: day1, bundledSlugs });
		const first = await snapshot();
		expect(r1.skipped).toEqual([]);
		expect(r1.events).toBe(17);
		expect(r1.tonight?.slug).toBe('demo-noche-latex-2026-10-01');
		expect(r1.orders).toBe(first.orders - 1); // all but the real one
		expect(r1.pendingTransfers).toBeGreaterThan(0);

		// Idempotent: reloading gives exactly the same tables.
		await reloadDemoData(t.db, { now: day1, bundledSlugs });
		expect(await snapshot()).toEqual(first);

		// Another day: same amount of data, now around the new "today".
		const r2 = await reloadDemoData(t.db, { now: day1 + DAY, bundledSlugs });
		expect(await snapshot()).toEqual(first);
		expect(r2.tonight?.slug).toBe('demo-noche-latex-2026-10-02');
		expect(await count("orders WHERE event_slug = 'demo-noche-latex-2026-10-01'")).toBe(0);
		expect(await count("orders WHERE event_slug = 'demo-noche-latex-2026-10-02'")).toBeGreaterThan(
			20
		);
		expect(
			await count(
				"demo_files WHERE path = 'src/lib/posts/calendario/demo-noche-latex-2026-10-02.md' AND deleted = 0"
			)
		).toBe(1);
		// The deploy's events of other dates are hidden in the demo layer.
		expect(
			await count(
				"demo_files WHERE path = 'src/lib/posts/calendario/demo-noche-latex-2026-09-30.md' AND deleted = 1"
			)
		).toBe(1);

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
