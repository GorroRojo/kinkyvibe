import { describe, expect, it } from 'vitest';
import { contextHref, imageFieldValue, readImageChoice, searchHref } from './imageChoice.js';

describe('imageChoice', () => {
	it('el campo oculto: vacío si no se tocó, none si se sacó, el id si se eligió', () => {
		expect(imageFieldValue({ id: 5 }, false)).toBe('');
		expect(imageFieldValue(null, true)).toBe('none');
		expect(imageFieldValue({ id: 5 }, true)).toBe('5');
	});
	it('el servidor lee solo esas tres formas', () => {
		expect(readImageChoice('')).toEqual({ action: 'keep' });
		expect(readImageChoice(null)).toEqual({ action: 'keep' });
		expect(readImageChoice('none')).toEqual({ action: 'remove' });
		expect(readImageChoice('42')).toEqual({ action: 'set', id: 42 });
		expect(readImageChoice('0')).toEqual({ action: 'keep' });
		expect(readImageChoice('-1')).toEqual({ action: 'keep' });
		expect(readImageChoice('1; DROP')).toEqual({ action: 'keep' });
		expect(readImageChoice('99999999999999999999')).toEqual({ action: 'keep' });
	});
	it('las direcciones de búsqueda', () => {
		expect(searchHref(' flyer rojo ')).toBe('/imagenes?q=flyer%20rojo');
		expect(contextHref('evento:mi-fiesta')).toBe('/imagenes?para=evento%3Ami-fiesta');
	});
});
