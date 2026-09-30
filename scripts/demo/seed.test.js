import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { unstable_splitSqlQuery } from 'wrangler';
import { createTestDB } from '../../src/lib/server/db/testing.js';
import { parseTicketConfig } from '../../src/lib/server/tickets/config.js';
import { validateEventTags } from '../../src/lib/utils/adminTags.js';
import { splitMarkdown } from '../../src/lib/utils/eventDraft.js';
import { buildData, chunkSql, eventMarkdown, seedSql } from './seed.js';

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
