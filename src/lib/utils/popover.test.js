import { describe, expect, it } from 'vitest';
import { placeMenu } from './popover.js';

// Los números salen de lo que hacía @floating-ui (con melt-ui) en el sitio: medidos en el build
// con la semilla pública, en una pantalla ancha y en un celu.
const menu = { width: 352, height: 288 };

describe('placeMenu', () => {
	it('entra abajo: debajo del campo, alineado a su izquierda, a 6 px', () => {
		const view = { x: 0, y: 0, width: 1280, height: 900 };
		const ref = { x: 276.8, y: 464.4, width: 755.2, height: 32 };
		expect(placeMenu(ref, menu, view)).toEqual({ x: 276.8, y: 502.4, placement: 'bottom-start' });
	});

	it('en un celu, si a la izquierda se sale por la derecha: alineado a la derecha del campo', () => {
		const view = { x: 0, y: 0, width: 390, height: 844 };
		const ref = { x: 51, y: 472, width: 316, height: 30 };
		const p = placeMenu(ref, menu, view);
		expect(p.placement).toBe('bottom-end');
		expect(p.x).toBe(51 + 316 - 352);
		expect(p.y).toBe(472 + 30 + 6);
	});

	it('si abajo no entra, arriba (a 6 px del campo)', () => {
		const view = { x: 0, y: 0, width: 1280, height: 560 };
		const ref = { x: 277, y: 443, width: 755, height: 32 };
		const p = placeMenu(ref, { width: 352, height: 280 }, view);
		expect(p).toEqual({ x: 277, y: 443 - 280 - 6, placement: 'top-start' });
	});

	it('si no entra en ninguna: la que menos se sale en total (la primera, si empatan), corrida a 8 px del borde', () => {
		const view = { x: 0, y: 0, width: 320, height: 568 };
		const ref = { x: 107, y: 269, width: 158, height: 30 };
		// no entra ni arriba ni abajo (23 px de más); alineado a la derecha se sale menos de costado
		expect(placeMenu(ref, { width: 288, height: 284 }, view)).toEqual({
			x: 8,
			y: 269 + 30 + 6,
			placement: 'bottom-end'
		});
	});

	it('el menú más ancho que la pantalla queda pegado al borde izquierdo (con 8 px)', () => {
		const view = { x: 0, y: 0, width: 300, height: 800 };
		const ref = { x: 40, y: 100, width: 200, height: 30 };
		expect(placeMenu(ref, { width: 400, height: 100 }, view).x).toBe(8);
	});
});
