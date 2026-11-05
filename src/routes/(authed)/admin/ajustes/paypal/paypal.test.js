/**
 * Ajustes › PayPal (interruptor `paypal`): apagado no se carga y las actions
 * dan 404; prendido, el ajuste y los retiros se guardan, se validan y quedan en Actividad. D1 de
 * miniflare; datos inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth';
import { clearFlagCache } from '$lib/server/flags.js';
import { getAdjustment, listWithdrawals } from '$lib/server/paypal/index.js';
import * as page from './+page.server.js';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const env = vi.hoisted(() => /** @type {Record<string, string>} */ ({}));
vi.mock('$env/dynamic/private', () => ({ env }));

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
	clearFlagCache();
	env.PAYPAL_ENABLED = '1';
});

const admin = { id: ADMINS[0].id, login: ADMINS[0].login };

/**
 * @param {Record<string, string>} [fields]
 * @param {any} [user]
 * @returns {any}
 */
function fakeEvent(fields, user = admin) {
	const url = new URL('/admin/ajustes/paypal', 'https://kinkyvibe.ar');
	const body = fields ? new URLSearchParams(fields) : undefined;
	return {
		url,
		params: {},
		platform: t.platform,
		locals: { user, user_token: user ? 't' : '' },
		setHeaders: () => {},
		request: new Request(url, body ? { method: 'POST', body } : {})
	};
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

async function audit() {
	const { results } = await t.db
		.prepare('SELECT action, target_id, summary, detail FROM admin_audit ORDER BY id')
		.all();
	return results;
}

describe('apagado', () => {
	it('no carga la parte de PayPal y sus actions dan 404', async () => {
		env.PAYPAL_ENABLED = '0';
		const data = /** @type {any} */ (await page.load(fakeEvent()));
		expect(data.paypal).toBeNull();
		for (const name of /** @type {const} */ (['ajuste', 'retiro', 'borrarRetiro'])) {
			const e = await thrown(() => page.actions[name](fakeEvent({ adjustment: '-4' })));
			expect(e?.status, name).toBe(404);
		}
		expect(await audit()).toEqual([]);
	});
});

describe('prendido', () => {
	it('carga la cotización, el reparto por mes y los retiros', async () => {
		const data = /** @type {any} */ (await page.load(fakeEvent()));
		expect(data.paypal).toMatchObject({ error: false, quote: null, withdrawals: [] });
		expect(data.paypal.split).toHaveLength(6);
	});

	it('solo admins', async () => {
		const e = await thrown(() =>
			page.actions.ajuste(fakeEvent({ adjustment: '-4' }, { id: 1, login: 'cualquiera' }))
		);
		expect(e?.status).toBe(403);
	});

	it('el ajuste se valida, se guarda y queda en Actividad', async () => {
		const bad = /** @type {any} */ (await page.actions.ajuste(fakeEvent({ adjustment: '-80' })));
		expect(bad.status).toBe(400);
		expect((await getAdjustment(t.db)).pct).toBe(0);

		const ok = /** @type {any} */ (await page.actions.ajuste(fakeEvent({ adjustment: '-3,5' })));
		expect(ok).toMatchObject({ form: 'ajuste', ok: true });
		expect(await getAdjustment(t.db)).toMatchObject({ pct: -3.5, updatedBy: admin.login });
		const [row] = await audit();
		expect(row).toMatchObject({
			action: 'settings.save',
			target_id: 'paypal_rate_adjustment_pct',
			summary: 'Cambió el ajuste de la cotización de PayPal de 0 % a -3,5 %'
		});
		expect(JSON.parse(String(row.detail))).toEqual({ from: 0, to: -3.5 });
	});

	it('los retiros se validan, se guardan, se borran y quedan en Actividad (sin la nota)', async () => {
		const bad = /** @type {any} */ (
			await page.actions.retiro(fakeEvent({ day: '2026-11-01', usd: '0', ars: 'x' }))
		);
		expect(bad.status).toBe(400);
		expect(Object.keys(bad.data.errors).sort()).toEqual(['ars', 'usd']);

		const ok = /** @type {any} */ (
			await page.actions.retiro(
				fakeEvent({ day: '2026-11-01', usd: '100', ars: '113.000', note: 'nota privada de prueba' })
			)
		);
		expect(ok).toMatchObject({ form: 'retiro', ok: true });
		const [w] = await listWithdrawals(t.db, { adjustmentPct: 0 });
		expect(w).toMatchObject({ day: '2026-11-01', usdCents: 10_000, ars: 113_000 });

		const del = /** @type {any} */ (
			await page.actions.borrarRetiro(fakeEvent({ id: String(w.id) }))
		);
		expect(del).toMatchObject({ form: 'borrar', ok: true });
		expect(await listWithdrawals(t.db, { adjustmentPct: 0 })).toEqual([]);
		const again = /** @type {any} */ (
			await page.actions.borrarRetiro(fakeEvent({ id: String(w.id) }))
		);
		expect(again.status).toBe(404);

		const rows = await audit();
		expect(rows.map((r) => r.action)).toEqual([
			'paypal.withdrawal.add',
			'paypal.withdrawal.delete'
		]);
		expect(JSON.stringify(rows)).not.toContain('nota privada');
	});
});
