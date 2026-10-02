import { describe, expect, it } from 'vitest';
import {
	cleanSavedBuyer,
	editSavedBuyer,
	isSavedBuyerField,
	maskDni,
	purchasePrefill,
	savedAfterPurchase,
	withoutSavedField
} from './savedBuyer.js';

// Datos inventados.
const BUYER = { name: 'Persona Prueba', pronouns: 'elle', dni: '30111222' };

describe('purchasePrefill', () => {
	it('completa lo guardado y el mail de la cuenta; «Guardar mis datos» arranca marcada', () => {
		expect(purchasePrefill(BUYER, 'cuenta@example.com')).toEqual({
			name: 'Persona Prueba',
			pronouns: 'elle',
			email: 'cuenta@example.com',
			dni: '30111222',
			remember: true,
			rememberDni: true
		});
	});

	it('sin DNI guardado, «Recordar mi DNI» arranca sin marcar', () => {
		expect(purchasePrefill({ name: 'Persona Prueba' }, 'cuenta@example.com')).toEqual({
			name: 'Persona Prueba',
			pronouns: '',
			email: 'cuenta@example.com',
			dni: '',
			remember: true,
			rememberDni: false
		});
	});
});

describe('savedAfterPurchase', () => {
	it('con las dos casillas guarda nombre, pronombres y DNI', () => {
		expect(savedAfterPurchase({}, BUYER, { remember: true, rememberDni: true })).toEqual(BUYER);
	});

	it('solo «Guardar mis datos»: nombre y pronombres, sin DNI', () => {
		expect(savedAfterPurchase({}, BUYER, { remember: true, rememberDni: false })).toEqual({
			name: 'Persona Prueba',
			pronouns: 'elle'
		});
	});

	it('solo «Recordar mi DNI»: el DNI, y saca el nombre y los pronombres guardados', () => {
		const current = { name: 'Nombre Viejo', pronouns: 'ella' };
		expect(savedAfterPurchase(current, BUYER, { remember: false, rememberDni: true })).toEqual({
			dni: '30111222'
		});
	});

	it('desmarcar las dos saca todo lo guardado', () => {
		expect(savedAfterPurchase(BUYER, BUYER, { remember: false, rememberDni: false })).toEqual({});
	});

	it('desmarcar el DNI en una compra posterior lo saca y deja lo demás actualizado', () => {
		const next = savedAfterPurchase(
			BUYER,
			{ name: 'Otro Nombre', pronouns: 'él', dni: '40999888' },
			{ remember: true, rememberDni: false }
		);
		expect(next).toEqual({ name: 'Otro Nombre', pronouns: 'él' });
	});
});

describe('editSavedBuyer (Mi rincón)', () => {
	it('valida con las reglas de la compra', () => {
		const r = editSavedBuyer({}, { name: 'x', pronouns: 'a'.repeat(41), dni: '12' });
		expect(r).toEqual({
			ok: false,
			errors: {
				name: 'Poné tu nombre (entre 2 y 80 letras) o dejalo vacío.',
				pronouns: 'Hasta 40 letras.',
				dni: 'Revisá el DNI: tiene que tener entre 7 y 9 números.'
			}
		});
		expect(editSavedBuyer({}, { name: 'www.ejemplo.com' })).toMatchObject({
			ok: false,
			errors: { name: 'El nombre no puede tener links.' }
		});
	});

	it('limpia y guarda; el DNI con puntos queda solo con números', () => {
		expect(
			editSavedBuyer({}, { name: '  Persona   Prueba ', pronouns: 'elle', dni: '30.111.222' })
		).toEqual({ ok: true, saved: BUYER });
	});

	it('nombre y pronombres vacíos se sacan; el DNI vacío no cambia', () => {
		expect(editSavedBuyer(BUYER, { name: '', pronouns: '', dni: '' })).toEqual({
			ok: true,
			saved: { dni: '30111222' }
		});
		expect(editSavedBuyer({ name: 'Persona Prueba' }, { name: 'Persona Prueba' })).toEqual({
			ok: true,
			saved: { name: 'Persona Prueba' }
		});
	});
});

describe('cleanSavedBuyer', () => {
	it('ignora lo desconocido y lo que no pasa las reglas', () => {
		expect(
			cleanSavedBuyer({ name: 'Persona Prueba', pronouns: '', dni: 'abc', otra: 'cosa' })
		).toEqual({ name: 'Persona Prueba' });
		expect(cleanSavedBuyer(JSON.stringify(BUYER))).toEqual(BUYER);
		expect(cleanSavedBuyer('no es json')).toEqual({});
		expect(cleanSavedBuyer(null)).toEqual({});
		expect(cleanSavedBuyer([1, 2])).toEqual({});
	});
});

describe('withoutSavedField / isSavedBuyerField', () => {
	it('saca un campo y deja los demás', () => {
		expect(withoutSavedField(BUYER, 'dni')).toEqual({ name: 'Persona Prueba', pronouns: 'elle' });
		expect(BUYER.dni).toBe('30111222');
	});

	it('solo los tres campos conocidos', () => {
		expect(['name', 'pronouns', 'dni'].every(isSavedBuyerField)).toBe(true);
		expect(isSavedBuyerField('email')).toBe(false);
		expect(isSavedBuyerField('__proto__')).toBe(false);
	});
});

describe('maskDni', () => {
	it('tapa todo salvo los últimos 3 números', () => {
		expect(maskDni('30111222')).toBe('•••••222');
		expect(maskDni('1234567')).toBe('••••567');
		expect(maskDni('')).toBe('');
		expect(maskDni(null)).toBe('');
	});
});
