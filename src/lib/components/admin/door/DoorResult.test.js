/**
 * DoorResult y los avisos de puerta (decisión 0053): con `card.notice`, el cartel dice solo
 * «Avisá a la organización antes de dejar pasar» y el resultado no cambia (no frena el ingreso).
 * Datos inventados.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import DoorResult from './DoorResult.svelte';
import { DOOR_NOTICE_TEXT } from '$lib/utils/doorNotices.js';

const card = {
	ticketId: 't1',
	orderId: 'o1',
	orderRef: 'KV-O1',
	holder: 'Persona Inventada',
	pronouns: 'elle',
	type: 'General',
	buyer: 'Persona Inventada',
	email: 'persona@example.com',
	dniTail: '456',
	code: 'ABC234',
	at: 1,
	by: 'admin-de-prueba',
	firstTime: null
};

/** @param {any} scan */
const html = (scan) => render(DoorResult, { props: { scan } }).body;

describe('DoorResult: aviso de puerta', () => {
	it('con aviso: el texto genérico y el mismo «Adelante»', () => {
		const out = html({ result: 'ok', card: { ...card, notice: true }, stamp: 1 });
		expect(out).toContain(DOOR_NOTICE_TEXT);
		expect(out).toContain('Adelante');
	});

	it('sin aviso: no aparece', () => {
		expect(html({ result: 'ok', card, stamp: 1 })).not.toContain(DOOR_NOTICE_TEXT);
		expect(html({ result: 'ok', card: { ...card, notice: false }, stamp: 1 })).not.toContain(
			DOOR_NOTICE_TEXT
		);
	});
});
