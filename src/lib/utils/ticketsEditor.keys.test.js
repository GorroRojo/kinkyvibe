/**
 * Las `key` locales de los tipos y los tramos (las del `{#each}` keyed del editor) no chocan con
 * las de un borrador recuperado, que se armó en otra carga de la página (gorrite, 12/10: con un
 * borrador recuperado, agregar un tipo repetía una key, el `{#each}` tiraba `each_key_duplicate`
 * y el editor quedaba colgado: «Sacar» no hacía nada y una tarjeta quedaba vacía).
 */
import { describe, expect, it, vi } from 'vitest';

/** Una «carga de la página» nueva: el módulo se vuelve a evaluar, como en el navegador. */
async function freshLoad() {
	vi.resetModules();
	return import('./ticketsEditor.js');
}

const meta = {
	tickets: [
		{ id: 'general', name: 'General', price: 15000, capacity: 12 },
		{ id: 'anticipada', name: 'Anticipada', price: 12000 }
	]
};

describe('ticketsEditor: keys locales', () => {
	it('las de un borrador de otra carga no se repiten al agregar tipos o tramos', async () => {
		// Carga 1 (como PostEditor: el formulario inicial y el que se edita): se agrega un tipo, se
		// saca el segundo y queda el borrador en JSON.
		const first = await freshLoad();
		first.readTicketsForm(meta);
		const form = first.readTicketsForm(meta);
		form.types = [form.types[0], first.emptyTicketType()];
		form.types[1].tiers = first.tiersForMode(form.types[1]);
		const draft = JSON.parse(JSON.stringify(form));

		// Carga 2: se arma el formulario del archivo (como PostEditor), se recupera el borrador y se
		// agregan tipos y tramos.
		const second = await freshLoad();
		second.readTicketsForm(meta);
		second.readTicketsForm(meta);
		const types = [...draft.types, second.emptyTicketType(), second.emptyTicketType()];
		const typeKeys = types.map((t) => t.key);
		expect(new Set(typeKeys).size).toBe(typeKeys.length);

		const tiers = [...draft.types[1].tiers, second.emptyTier(2), second.emptyTier(3)];
		const tierKeys = tiers.map((t) => t.key);
		expect(new Set(tierKeys).size).toBe(tierKeys.length);
	});

	it('dentro de una misma carga, todas distintas', async () => {
		const { emptyTicketType, emptyTier, readTicketsForm } = await freshLoad();
		const keys = [
			...readTicketsForm(meta).types.map((t) => t.key),
			emptyTicketType().key,
			emptyTier(0).key,
			emptyTier(1).key
		];
		expect(new Set(keys).size).toBe(keys.length);
	});
});
