import { describe, expect, it } from 'vitest';
import { deletionLabel, undoneMessage } from './deleteText.js';

describe('undoneMessage', () => {
	it('says whether the delete was cancelled before publishing or restored after', () => {
		expect(undoneMessage({ mode: 'cancelled', title: 'Guía inventada' })).toContain('no se borró');
		expect(undoneMessage({ mode: 'restored', title: 'Guía inventada' })).toBe(
			'Listo: «Guía inventada» vuelve a estar. Se publica en unos minutos.'
		);
	});
	it('a profile that lives only in the database is back right away (nothing to publish)', () => {
		expect(undoneMessage({ mode: 'restored', title: 'Perfil inventado', immediate: true })).toBe(
			'Listo: «Perfil inventado» vuelve a estar.'
		);
	});
});

describe('deletionLabel', () => {
	it('names posts by kind and library rows as «Biblioteca · …» (without the file hash)', () => {
		expect(deletionLabel({ kind: 'calendario', path: 'src/lib/posts/calendario/x.md' })).toEqual({
			label: 'Evento',
			library: false
		});
		expect(deletionLabel({ kind: 'amigues', path: 'objeto:perfil:3' }).label).toBe('Amigues');
		expect(deletionLabel({ kind: 'material', path: 'objeto:imagen:12' })).toEqual({
			label: 'Biblioteca · imagen',
			library: true
		});
		expect(deletionLabel({ kind: 'material', path: 'objeto:archivo:7' }).label).toBe(
			'Biblioteca · archivo'
		);
	});
});
