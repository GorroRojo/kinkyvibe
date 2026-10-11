/**
 * Aviso «Online con lugar» (pedido de gorrite): el editor del evento (PostEditor) y la ficha del
 * panel avisan en amarillo, sin bloquear, cuando el evento tiene la etiqueta «Online» y además un
 * lugar (vinculado o en texto libre). Datos inventados.
 */
import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { readable } from 'svelte/store';
import { ONLINE_MISMATCH_TEXT } from '$lib/utils/onlineTagMismatch.js';

vi.mock('$app/stores', () => ({
	page: readable({ url: new URL('http://localhost/admin/eventos/fiesta-de-prueba'), data: {} })
}));

const { default: PostEditor } = await import('$lib/components/admin/PostEditor.svelte');
const { default: Ficha } =
	await import('../../../../routes/(authed)/admin/eventos/[slug]/+page.svelte');

/** @param {{ tags: string[], where?: string[] }} o */
const eventMd = ({ tags, where = [] }) =>
	[
		'---',
		'title: Charla de prueba',
		'summary: Una charla inventada para las pruebas',
		'published_date: 2031-09-01Z-03:00',
		'category: calendario',
		'layout: calendario',
		'status: abierto',
		'start: 2031-12-19T20:00-03:00',
		...where,
		'tags:',
		...tags.map((t) => `  - ${t}`),
		'---',
		'',
		'Texto de prueba.',
		''
	].join('\n');

const common = { tagUsage: {}, profiles: [], authorUsage: {}, maxImageBytes: 5 * 1024 * 1024 };
const VENUE = {
	id: 7,
	slug: 'sala-inventada',
	title: 'Sala Inventada',
	visibility: 'public',
	unlisted: false,
	approved: true,
	privacy: 'name',
	address: 'Calle Inventada 123',
	area: '',
	city: '',
	version: 1
};

/**
 * @param {string} raw
 * @param {{ venueId: number | null, privacy: any } | null} [current]
 */
const editor = (raw, current = null) =>
	render(PostEditor, {
		props: {
			data: {
				...common,
				post: { raw, sha: 'sha-de-prueba', path: 'src/lib/posts/calendario/charla.md' },
				image: null,
				sales: null,
				venuePicker: current ? { venues: [VENUE], current } : null
			},
			form: null,
			category: 'calendario',
			postID: 'charla-de-prueba',
			embedded: true
		}
	}).body;

const WARN_ID = 'id="edit-online-mismatch"';

describe('editor del evento: aviso «Online con lugar»', () => {
	it('Online + nombre del lugar en texto libre: aviso amarillo en «Etiquetas»', () => {
		const body = editor(
			eventMd({
				tags: ['español', 'Online'],
				where: ["location_name: 'Zona Inventada | Casa Ficticia'"]
			})
		);
		expect(body).toContain(WARN_ID);
		expect(body).toContain(ONLINE_MISMATCH_TEXT);
		// El aviso amarillo compartido (Notice `tone="warn"`, con su ícono: sin «⚠️» en el texto).
		expect(body).toMatch(/class="kv-notice warn\b/);
		expect(body).not.toContain('⚠️');
		// Dentro de «Etiquetas» (después de su comienzo y antes del buscador de etiquetas).
		const at = body.indexOf(WARN_ID);
		expect(at).toBeGreaterThan(body.indexOf('id="sec-etiquetas"'));
		// No bloquea guardar: no es un problema de «Antes de guardar».
		expect(body).not.toContain('id="save-problems"');
	});

	it('Online + un lugar elegido (sin texto libre): también avisa', () => {
		const body = editor(eventMd({ tags: ['español', 'Online'] }), { venueId: 7, privacy: null });
		expect(body).toContain(WARN_ID);
	});

	it('online sin lugar, o un «Dónde» que dice Zoom: sin aviso', () => {
		expect(editor(eventMd({ tags: ['español', 'Online'] }))).not.toContain(WARN_ID);
		expect(
			editor(eventMd({ tags: ['español', 'Online'], where: ['location_name: Zoom'] }))
		).not.toContain(WARN_ID);
	});

	it('presencial con lugar: sin aviso', () => {
		const body = editor(
			eventMd({ tags: ['español', 'AMBA'], where: ['location: Calle Falsa 123'] }),
			{ venueId: 7, privacy: null }
		);
		expect(body).not.toContain(WARN_ID);
	});
});

describe('ficha del evento: aviso «Online con lugar»', () => {
	const event = {
		slug: 'charla-de-prueba',
		title: 'Charla de prueba',
		start: '2031-12-19T20:00-03:00',
		end: '',
		location: '',
		locationName: 'Zona Inventada | Casa Ficticia',
		place: 'Online',
		authors: [],
		tags: ['español', 'Online'],
		sellsTickets: true
	};
	const base = {
		event,
		checklist: [],
		stream: null,
		sale: null,
		online: true,
		draft: false,
		missing: [],
		venue: null
	};
	/** @param {Record<string, any>} data */
	const ficha = (data) =>
		render(Ficha, { props: { data: /** @type {any} */ (data), form: /** @type {any} */ (null) } })
			.body;

	it('con el aviso: el texto, cómo lo tratan hoy las entradas y el link a Editar', () => {
		const body = ficha({ ...base, onlineMismatch: true });
		expect(body).toContain('id="online-mismatch"');
		expect(body).toContain(ONLINE_MISMATCH_TEXT);
		expect(body).toContain('Hoy las entradas lo tratan como online');
		expect(body).toContain('href="/admin/eventos/charla-de-prueba/editar#sec-etiquetas"');
	});

	it('sin el aviso, nada', () => {
		expect(ficha({ ...base, onlineMismatch: false })).not.toContain('id="online-mismatch"');
	});
});
