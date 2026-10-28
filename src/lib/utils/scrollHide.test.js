import { describe, expect, it } from 'vitest';
import { TOLERANCE, TOP_ZONE, scrollHide } from './scrollHide.js';

/** Corre una serie de posiciones de scroll y devuelve si quedó escondido después de cada una. */
function run(/** @type {number[]} */ ys) {
	let state = { hidden: false, lastY: 0 };
	return ys.map((y) => {
		state = scrollHide({ y, ...state });
		return state.hidden;
	});
}

describe('scrollHide', () => {
	it('se esconde al bajar y vuelve al subir', () => {
		expect(run([200, 400, 600, 550, 500])).toEqual([true, true, true, false, false]);
	});

	it('cerca de arriba siempre se ve, aunque se esté bajando', () => {
		expect(run([20, 50, TOP_ZONE])).toEqual([false, false, false]);
		expect(scrollHide({ y: 10, lastY: 900, hidden: true }).hidden).toBe(false);
		// el rebote de iOS (scroll negativo) cuenta como arriba
		expect(scrollHide({ y: -40, lastY: 300, hidden: true })).toEqual({ hidden: false, lastY: 0 });
	});

	it('un movimiento chico no lo cambia (ni mueve el punto desde donde se mide)', () => {
		const down = scrollHide({ y: 500, lastY: 300, hidden: false });
		expect(down).toEqual({ hidden: true, lastY: 500 });
		const jitter = scrollHide({ y: 500 - (TOLERANCE - 1), ...down });
		expect(jitter).toEqual({ hidden: true, lastY: 500 });
		// varios temblores chicos que suman más que la tolerancia, sí
		const up = scrollHide({ y: 500 - TOLERANCE, ...jitter });
		expect(up).toEqual({ hidden: false, lastY: 500 - TOLERANCE });
	});
});
