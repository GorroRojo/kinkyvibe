import { beforeEach, describe, expect, it, vi } from 'vitest';

// Como en un deploy de preview: PREVIEW_BUILD encendido y una capa demo inventada.
vi.mock('$lib/server/deploy.js', () => ({ PREVIEW_BUILD: true }));
const overlay = vi.hoisted(() => ({
	/** @type {Array<{category: string, slug: string, meta: Record<string, any> | null}>} */
	rows: []
}));
vi.mock('../demo/index.js', () => ({ overlayPostMetas: async () => overlay.rows }));

const { getEventTickets, listTicketedEvents } = await import('./events.js');

const meta = {
	title: 'Noche de prueba (demo)',
	tags: ['KinkyVibe'],
	status: 'abierto',
	start: '2026-10-01T22:00-03:00',
	end: '2026-10-02T04:00-03:00',
	tickets: [{ id: 'general', name: 'General', price: 12000, capacity: 50 }],
	payment_methods: ['mercadopago', 'transferencia']
};

describe('entradas en modo demo (capa demo_files)', () => {
	beforeEach(() => {
		overlay.rows = [];
	});

	it('un evento que solo existe en la capa vende entradas', async () => {
		overlay.rows = [{ category: 'calendario', slug: 'demo-noche-2026-10-01', meta }];
		const config = await getEventTickets('demo-noche-2026-10-01', { fondoPercent: 20 });
		expect(config).not.toBeNull();
		expect(JSON.stringify(config)).toContain('General');
	});

	it('un evento de la capa se lista con los del deploy', async () => {
		overlay.rows = [{ category: 'calendario', slug: 'demo-noche-2026-10-01', meta }];
		const list = await listTicketedEvents({ fondoPercent: 20 });
		expect(list.some((e) => e.slug === 'demo-noche-2026-10-01')).toBe(true);
	}, 60_000);

	it('un evento del deploy borrado en la capa ya no existe', async () => {
		// Evento de prueba del repo (en vitest, como en `vite dev`, vende entradas).
		const slug = 'prueba-entradas-2026-12';
		expect(await getEventTickets(slug)).not.toBeNull();
		overlay.rows = [{ category: 'calendario', slug, meta: null }];
		expect(await getEventTickets(slug)).toBeNull();
	}, 60_000);
});
