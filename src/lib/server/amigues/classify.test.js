import { describe, expect, it } from 'vitest';
import { ADDRESS } from './classify.js';

describe('ADDRESS (¿el resumen parece una dirección?)', () => {
	it.each([
		'Estamos en Av. Corrientes 1234, CABA',
		'calle Falsa 123',
		'avenida San Juan Bautista 4500',
		'pasaje del Ángel 77',
		'Nos vemos en Humberto 1520, San Telmo'
	])('reconoce «%s»', (text) => {
		expect(ADDRESS.test(text)).toBe(true);
	});

	it.each(['Hacemos talleres de cuerdas', 'calle sin número', 'Somos un grupo de 12 personas'])(
		'no confunde «%s»',
		(text) => {
			expect(ADDRESS.test(text)).toBe(false);
		}
	);

	// Con la expresión vieja, 50.000 espacios tardaban segundos (crecía al cuadrado); con la
	// nueva, menos de un milisegundo. El margen de 1 s no depende de la velocidad de la máquina.
	it('no se traba con un texto largo de espacios (ReDoS)', () => {
		const hostile = 'calle' + ' '.repeat(50000) + 'x';
		const start = performance.now();
		ADDRESS.test(hostile);
		expect(performance.now() - start).toBeLessThan(1000);
	});
});
