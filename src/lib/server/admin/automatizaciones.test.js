/**
 * Ajustes → Automatizaciones: los crons en palabras y su próxima corrida, lo que se lee de la base
 * (último envío, fallidos, chequeo nocturno, chats de Telegram) y que nunca salga un secreto.
 * D1 de miniflare con datos inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '../db/testing.js';
import { BACKUP_CRON, REMINDERS_CRON } from '../scheduled.js';
import {
	describeCron,
	lastNightlyBackup,
	loadAutomations,
	nextCronRun,
	parseCron
} from './automatizaciones.js';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

describe('crons', () => {
	it('lee las dos formas que usamos y rechaza las demás', () => {
		expect(parseCron('*/15 * * * *')).toEqual({ kind: 'every', minutes: 15 });
		expect(parseCron('0 6 * * *')).toEqual({ kind: 'daily', hour: 6, minute: 0 });
		expect(parseCron('0 6 * * 1-5')).toBeNull();
		expect(parseCron('*/7 * * * *')).toBeNull();
		expect(parseCron('nada')).toBeNull();
	});

	it('los crons de wrangler.toml se entienden', () => {
		expect(parseCron(REMINDERS_CRON)).not.toBeNull();
		expect(parseCron(BACKUP_CRON)).not.toBeNull();
	});

	it('en palabras, con la hora de Argentina', () => {
		expect(describeCron('*/15 * * * *')).toBe('cada 15 minutos');
		expect(describeCron('0 6 * * *')).toBe('todos los días a las 03:00 (hora de Argentina)');
		expect(describeCron('30 1 * * *')).toBe('todos los días a las 22:30 (hora de Argentina)');
		expect(describeCron('0 6 * * 1')).toBe('0 6 * * 1');
	});

	it('próxima corrida: siempre después de ahora', () => {
		const now = Date.UTC(2026, 9, 4, 5, 7, 30);
		expect(nextCronRun('*/15 * * * *', now)).toBe(Date.UTC(2026, 9, 4, 5, 15));
		expect(nextCronRun('*/15 * * * *', Date.UTC(2026, 9, 4, 5, 15))).toBe(
			Date.UTC(2026, 9, 4, 5, 30)
		);
		expect(nextCronRun('0 6 * * *', now)).toBe(Date.UTC(2026, 9, 4, 6, 0));
		expect(nextCronRun('0 6 * * *', Date.UTC(2026, 9, 4, 6, 0))).toBe(Date.UTC(2026, 9, 5, 6, 0));
		expect(nextCronRun('0 6 * * 1', now)).toBeNull();
	});
});

describe('último backup en R2', () => {
	it('el más nuevo de d1/ (sin los manuales); sin bucket, null', async () => {
		/** @type {any} */
		const bucket = {
			list: vi.fn(async () => ({
				objects: [
					{ key: 'd1/2026-10-02.sql.gz', uploaded: new Date(Date.UTC(2026, 9, 2, 6)) },
					{ key: 'd1/2026-10-03.sql.gz', uploaded: new Date(Date.UTC(2026, 9, 3, 6)) }
				],
				truncated: false
			}))
		};
		expect(await lastNightlyBackup(bucket)).toEqual({
			key: 'd1/2026-10-03.sql.gz',
			at: Date.UTC(2026, 9, 3, 6)
		});
		expect(bucket.list).toHaveBeenCalledWith(expect.objectContaining({ delimiter: '/' }));
		expect(await lastNightlyBackup(null)).toBeNull();
		expect(
			await lastNightlyBackup(/** @type {any} */ ({ list: () => Promise.reject(new Error('x')) }))
		).toBeNull();
	});
});

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

const NOW = Date.UTC(2026, 9, 4, 12, 0);

/** @param {string} id */
async function seedOrder(id) {
	await t.db
		.prepare(
			`INSERT INTO orders (id, event_slug, ticket_type, quantity, unit_price, fondo_option,
				fondo_amount, fondo_contribution, subtotal, total, buyer_name, buyer_email,
				created_at, updated_at, expires_at)
			VALUES (?1, 'evento-de-prueba', 'g', 1, 10000, 'solidaria', 0, 0, 10000, 10000,
				'Persona de Prueba', 'prueba@example.com', 1, 1, 2)`
		)
		.bind(id)
		.run();
}

describe('loadAutomations', () => {
	it('sin base: todo vacío pero arma la página', async () => {
		const r = await loadAutomations({ now: NOW });
		expect(r.crons.map((c) => c.id)).toEqual(['cron-recordatorios', 'cron-backup']);
		expect(r.crons[0].lastRun).toBeNull();
		expect(r.crons[0].nextRun).toBe(Date.UTC(2026, 9, 4, 12, 15));
		expect(r.crons[1].nextRun).toBe(Date.UTC(2026, 9, 5, 6, 0));
		expect(r.mails.find((m) => m.id === 'mail-recordatorios')?.when).toBe(
			'2 días antes · el mismo día a las 9:00'
		);
		expect(r.telegram.state).toBe('off');
		expect(r.rules.soon).toBe(true);
	});

	it('lee de la base cuándo salió cada cosa y lo que falló', async () => {
		const [uno, dos, sub] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
		await seedOrder(uno);
		await seedOrder(dos);
		await t.db.batch([
			t.db.prepare(
				`INSERT INTO reminder_sends (order_id, reminder_id, sent_at, status) VALUES
					('${uno}', 'h48', ${NOW - 3_600_000}, 'sent'),
					('${dos}', 'h48', ${NOW - 60_000}, 'failed')`
			),
			t.db.prepare(
				`INSERT INTO integrity_runs (ran_at, problem_count, problems) VALUES (${NOW - 6 * 3_600_000}, 2, '[]')`
			),
			t.db.prepare(
				`INSERT INTO series_subscriptions (id, series_tag, email, subscriber_key, created_at, confirmed_at)
				VALUES ('${sub}', 'Serie de Prueba', 'aviso@example.com', 'e:x', 1, 1)`
			),
			t.db.prepare(
				`INSERT INTO series_notifications (subscription_id, event_slug, sent_at)
				VALUES ('${sub}', 'evento-de-prueba', ${NOW - 7_200_000})`
			)
		]);
		const r = await loadAutomations({
			db: t.db,
			flags: { series: true },
			salesSettings: {
				reminders: JSON.stringify([
					{ kind: 'hours_before', hours: 24, enabled: true },
					{ kind: 'day_at', days: 0, time: '10:00', enabled: false }
				])
			},
			now: NOW
		});
		const rem = r.mails.find((m) => m.id === 'mail-recordatorios');
		expect(rem).toMatchObject({
			when: '1 día antes',
			lastRun: NOW - 3_600_000,
			state: 'warn',
			stateLabel: '1 sin poder mandar'
		});
		expect(rem?.details).toContain('Desactivado: el mismo día a las 10:00');
		expect(r.mails.find((m) => m.id === 'mail-series')).toMatchObject({
			lastRun: NOW - 7_200_000,
			state: 'on',
			configHref: '/admin/eventos/series'
		});
		// «Lo que sigo» apagado: dice qué interruptor falta.
		expect(r.mails.find((m) => m.id === 'mail-sigo-nuevo')?.state).toBe('off');
		// La vuelta de mails: lo último que salió (el recordatorio de hace una hora).
		expect(r.crons[0].lastRun).toBe(NOW - 3_600_000);
		// Sin bucket (como en un preview): la última corrida sale del chequeo de integridad.
		expect(r.crons[1]).toMatchObject({
			lastRun: NOW - 6 * 3_600_000,
			state: 'warn'
		});
	});

	it('Telegram: dice si el secreto y el token están cargados, nunca su valor', async () => {
		const secret = 'secreto-del-webhook-de-prueba-123';
		const token = '123456:TOKEN-DE-PRUEBA-NUNCA-SE-MUESTRA';
		const r = await loadAutomations({
			db: t.db,
			flags: { telegram_bot: true },
			env: { TELEGRAM_WEBHOOK_SECRET: secret, TELEGRAM_BOT_TOKEN: token },
			now: NOW
		});
		expect(r.telegram.state).toBe('on');
		expect(r.telegram.details).toEqual(
			expect.arrayContaining([
				'Secreto del webhook: cargado',
				'Token para mandar avisos: cargado',
				'0 chats vinculados'
			])
		);
		const all = JSON.stringify(r);
		expect(all).not.toContain(secret);
		expect(all).not.toContain(token);

		const off = await loadAutomations({ flags: { telegram_bot: true }, env: {}, now: NOW });
		expect(off.telegram.state).toBe('warn');
		expect(off.telegram.details).toContain('Secreto del webhook: no cargado');
	});
});
