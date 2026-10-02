/**
 * Inicio del panel: «N cosas para revisar» y el número de la tarjeta "Para revisar" son el mismo
 * que el del botón "Para revisar" de arriba (`panelCounts.review`, ver `reviewCountOf`), aunque la
 * tarjeta tenga más filas (los avisos que el botón no cuenta). Datos inventados.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import Page from './+page.svelte';

/** @param {number} n */
const rows = (n) =>
	Array.from({ length: n }, (_, i) => ({
		kind: 'item',
		id: `aviso-${i}`,
		tone: 'info',
		icon: 'image',
		title: `Evento inventado ${i} no tiene imagen`,
		text: 'Sin imagen no se ve bien',
		action: 'Agregar',
		href: `/admin/eventos/evento-inventado-${i}/editar`
	}));

/** @param {{ review?: number, todo?: number }} opts */
function inicio({ review, todo = 0 }) {
	const data = /** @type {any} */ ({
		user: { name: 'Persona Inventada', login: 'persona-inventada' },
		now: Date.parse('2026-10-02T15:00:00Z'),
		panelCounts: review === undefined ? {} : { review },
		todo: rows(todo),
		todayEvents: [],
		upcoming: [],
		agenda: [],
		sales: null,
		money: null,
		fondo: null,
		activity: [],
		since: null,
		dbAvailable: true
	});
	return render(Page, { props: { data, form: null } }).body;
}

/** @param {string} body el saludo de arriba */
const hello = (body) => body.match(/<header class="hello[\s\S]*?<\/header>/)?.[0] ?? '';

describe('Inicio: la cuenta de "Para revisar"', () => {
	it('10 filas en la tarjeta y 7 en el botón de arriba: el Inicio dice 7', () => {
		const body = inicio({ review: 7, todo: 10 });
		expect(hello(body)).toContain('7 cosas para revisar');
		expect(body).not.toContain('10 cosas para revisar');
		// La tarjeta muestra el mismo número.
		const card = body.slice(body.indexOf('id="para-revisar"'));
		expect(card).toMatch(/>\s*7\s*</);
		expect(card).not.toMatch(/>\s*10\s*</);
	});

	it('sin nada que el botón cuente pero con avisos: «N avisos», no «todo al día»', () => {
		const body = hello(inicio({ review: 0, todo: 2 }));
		expect(body).toContain('2 avisos');
		expect(body).not.toContain('cosas para revisar');
		expect(body).not.toContain('todo al día');
	});

	it('nada de nada: «todo al día»', () => {
		expect(hello(inicio({ review: 0, todo: 0 }))).toContain('todo al día');
	});
});
