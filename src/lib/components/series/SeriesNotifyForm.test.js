/**
 * «Avisame si se repite», render del servidor: sin cuenta, el mail (igual con o sin «Lo que
 * sigo»); con cuenta y «Lo que sigo», dice que es seguir la serie y lleva a Mi rincón → Lo que
 * sigo; con cuenta sin «Lo que sigo», como siempre. Datos inventados.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import SeriesNotifyForm from './SeriesNotifyForm.svelte';

/** @param {Record<string, boolean>} props */
const html = (props) =>
	render(SeriesNotifyForm, {
		props: { seriesId: 'Picantearla', seriesName: 'Picantearla', ...props }
	}).body;

describe('SeriesNotifyForm', () => {
	it('sin cuenta: el mail con doble confirmación, con o sin «Lo que sigo»', () => {
		for (const sigo of [false, true]) {
			const h = html({ member: false, sigo });
			expect(h).toMatch(/<input[^>]*type="email"/);
			expect(h).not.toContain('/mi-rincon/sigo');
		}
	});

	it('con cuenta y «Lo que sigo», sin seguirla: «Avisame» es seguirla', () => {
		const h = html({ member: true, sigo: true });
		expect(h).toContain('Seguí Picantearla con tu cuenta');
		expect(h).toMatch(/<input[^>]*name="cuenta"[^>]*value="1"/);
		expect(h).not.toMatch(/<input[^>]*type="email"/);
	});

	it('con cuenta y «Lo que sigo», ya avisada: lo dice y lleva a Lo que sigo', () => {
		const h = html({ member: true, sigo: true, subscribed: true });
		expect(h).toContain('Seguís Picantearla');
		expect(h).toContain('href="/mi-rincon/sigo"');
		expect(h).toContain('Dejar de avisarme');
	});

	it('con cuenta sin «Lo que sigo»: como siempre', () => {
		expect(html({ member: true })).toContain(
			'Te mandamos un solo mail a tu cuenta cada vez que se anuncie una nueva edición.'
		);
		const h = html({ member: true, subscribed: true });
		expect(h).toContain('Te vamos a avisar por mail cuando haya una nueva edición de Picantearla.');
		expect(h).not.toContain('/mi-rincon/sigo');
	});
});
