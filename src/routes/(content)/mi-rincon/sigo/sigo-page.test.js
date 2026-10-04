/**
 * Mi rincón → Lo que sigo, render del servidor (lo que se ve sin JavaScript): sin nada seguido,
 * la invitación a seguir; con cosas seguidas, los grupos, cada tarjeta con su emoji o imagen, su
 * próximo evento y la grilla de avisos (Mail andando, Telegram «Próximamente»); «Agregar» como
 * campo de texto con «Seguir». Datos inventados.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import Page from './+page.svelte';
import FollowOptions from '$lib/components/sigo/FollowOptions.svelte';
import FollowAdd from '$lib/components/sigo/FollowAdd.svelte';
import ChipCombobox from '$lib/components/admin/ChipCombobox.svelte';
import { NOTIFY_CHANNELS } from '$lib/utils/sigo.js';

const OPTIONS = { calendario: true, mail_nuevo: true, recordatorio: false };

/** @param {Record<string, any>} extra */
const follow = (extra) => ({
	kind: 'etiqueta',
	key: 'shibari',
	title: '🪢 shibari',
	name: 'shibari',
	icon: '🪢',
	color: 'red',
	href: '/wiki/shibari',
	label: 'Etiqueta',
	available: true,
	series: false,
	profileKind: null,
	image: null,
	next: null,
	options: OPTIONS,
	createdAt: 0,
	...extra
});

/** @param {{ follows?: any[], profiles?: any[], form?: any, extra?: Record<string, any> }} [o] */
const page = ({ follows = [], profiles = [], form = null, extra = {} } = {}) =>
	render(Page, {
		props: /** @type {any} */ ({
			data: {
				...extra,
				follows,
				calendar: { entradas: true, participo: false },
				add: {
					tags: [
						{ id: 'shibari', name: 'shibari', icon: '🪢', group: 'cuerdas', aliases: [] },
						{ id: 'cine', name: 'cine', icon: '🎬', group: '', aliases: [] }
					],
					profiles
				}
			},
			form
		})
	}).body;

/** Los nombres de los grupos, en orden. @param {string} html */
const groups = (html) =>
	[...html.matchAll(/<h3 id="grupo-[^"]+"[^>]*>\s*([^<]+?)\s*</g)].map((m) => m[1]);

describe('sin nada seguido', () => {
	it('invita a seguir: buscador, links a la Kinkipedia y a amigues; sin CSV ni grupos', () => {
		const html = page();
		expect(html).toContain('Todavía no seguís nada');
		expect(html).toContain('href="/wiki"');
		expect(html).toContain('href="/amigues"');
		expect(html).not.toContain('Bajar CSV');
		expect(groups(html)).toEqual([]);
		// «Agregar» sin JavaScript: campo de texto que manda a ?/seguir.
		expect(html).toMatch(/<form[^>]*action="\?\/seguir"/);
		expect(html).toMatch(/<input[^>]*name="clave"[^>]*required/);
		expect(html).toMatch(/<input[^>]*name="tipo"[^>]*value="etiqueta"/);
		expect(html).toContain('Una etiqueta o una serie.');
		// Tu calendario sigue estando.
		expect(html).toContain('Mis entradas');
	});

	it('con perfiles públicos, el buscador ofrece también amigues y lugares', () => {
		const html = page({ profiles: [{ key: '7', name: 'Lugar Inventado', kind: 'lugar' }] });
		expect(html).toContain('Una etiqueta, una serie, une amigue o un lugar.');
		// La lista de perfiles no se imprime en la página (se busca al escribir).
		expect(html).not.toContain('Lugar Inventado');
	});
});

describe('con cosas seguidas', () => {
	const follows = [
		follow({
			next: {
				title: 'Taller inventado de cuerdas',
				href: '/calendario/taller-inventado',
				start: '2099-03-12T20:00-03:00'
			}
		}),
		follow({
			key: 'Serie Inventada',
			title: 'Serie Inventada',
			name: 'Serie Inventada',
			icon: '',
			series: true,
			image: '/imagenes/serie-inventada.webp',
			href: '/wiki/Serie-Inventada',
			options: { calendario: false, mail_nuevo: false, recordatorio: true }
		}),
		follow({
			kind: 'perfil',
			key: '12',
			title: 'Lugar Inventado',
			name: 'Lugar Inventado',
			icon: undefined,
			color: undefined,
			label: 'Lugar',
			profileKind: 'lugar',
			href: '/amigues/lugar-inventado'
		}),
		follow({
			kind: 'perfil',
			key: '13',
			title: 'Ya no está disponible',
			name: undefined,
			icon: undefined,
			label: 'Perfil',
			href: null,
			available: false
		})
	];

	it('agrupa: etiquetas y series · perfiles · lugares, con cuántas hay', () => {
		const html = page({ follows });
		expect(groups(html)).toEqual(['Etiquetas y series', 'Perfiles', 'Lugares']);
		expect(html).toContain('Bajar CSV');
		expect(html).not.toContain('Todavía no seguís nada');
	});

	it('cada tarjeta: emoji o imagen, nombre con link, qué es y el próximo evento', () => {
		const html = page({ follows });
		expect(html).toContain('🪢');
		expect(html).toMatch(/<a href="\/wiki\/shibari"[^>]*>shibari<\/a>/);
		expect(html).toContain('Taller inventado de cuerdas');
		expect(html).toContain('href="/calendario/taller-inventado"');
		expect(html).toContain('12 mar 2099');
		// La serie, con su imagen y «Serie»; sin eventos anunciados, lo dice.
		expect(html).toContain('src="/imagenes/serie-inventada.webp"');
		expect(html).toMatch(/<span class="kind[^"]*">Serie<\/span>/);
		expect(html).toContain('Sin eventos anunciados por ahora.');
		// El lugar, con el emoji de lugar.
		expect(html).toContain('📍');
		expect(html).toMatch(/<span class="kind[^"]*">Lugar<\/span>/);
	});

	it('la grilla: En mi calendario aparte; Mail con sus interruptores; Telegram apagado no se dibuja', () => {
		const html = page({ follows: [follows[0]] });
		const inputs = [...html.matchAll(/<input[^>]*role="switch"[^>]*>/g)].map((m) => m[0]);
		const named = (/** @type {string} */ n) => inputs.filter((i) => i.includes(`name="${n}"`));
		expect(named('calendario')).toHaveLength(1);
		expect(named('calendario')[0]).toContain('checked');
		expect(named('mail_nuevo')[0]).toContain('checked');
		expect(named('recordatorio')[0]).not.toContain('checked');
		// Telegram apagado: sin columna repetida en cada cosa seguida (antes, dos celdas apagadas y
		// «Próximamente» en cada una); lo explica una sola nota arriba.
		const off = inputs.filter((i) => !i.includes('name='));
		expect(off).toHaveLength(0);
		expect(html).not.toContain('data-channel="telegram"');
		expect(html).not.toContain('name="canal" value="telegram"');
		expect(
			html.match(/Vas a poder recibir esto por Telegram cuando conectes tu cuenta/g)
		).toHaveLength(1);
		expect(html).toContain('Algo nuevo');
		expect(html).toContain('Recordatorio el día antes');
		expect(html).toMatch(/<form[^>]*action="\?\/opciones"/);
	});

	it('lo que ya no está disponible: sin interruptores, solo «Dejar de seguir»', () => {
		const html = page({ follows: [follows[3]] });
		expect(html).toContain('Ya no está disponible');
		expect(html).toContain('Ya no existe o no se puede ver.');
		expect(html).not.toMatch(/action="\?\/opciones"/);
		expect(html).toMatch(/<form[^>]*action="\?\/dejar"/);
		expect(html).toContain('Dejar de seguir');
	});
});

describe('respuestas de las acciones', () => {
	it('«Agregar» que salió bien, y el error de seguir, junto al buscador', () => {
		let html = page({ form: { action: 'seguir', ok: true, title: '🎬 cine' } });
		expect(html).toContain('Listo: ahora seguís 🎬 cine.');
		html = page({ form: { action: 'seguir', error: 'No encontramos eso para seguir.' } });
		expect(html).toMatch(/role="alert"[^>]*>No encontramos eso para seguir\./);
	});
	it('dejar de seguir', () => {
		expect(page({ form: { action: 'dejar', ok: true } })).toContain('Listo: dejaste de seguirlo.');
	});
});

describe('FollowOptions: sumar un canal es solo configurarlo', () => {
	it('con Telegram prendido y sus casillas, la misma grilla los muestra andando', () => {
		const channels = NOTIFY_CHANNELS.map((c) =>
			c.id === 'telegram'
				? {
						...c,
						enabled: true,
						fields: /** @type {any} */ ({ nuevo: 'mail_nuevo', recordatorio: 'recordatorio' })
					}
				: c
		);
		const html = render(FollowOptions, {
			props: { options: OPTIONS, name: 'shibari', channels }
		}).body;
		expect(html).not.toContain('Próximamente');
		const inputs = [...html.matchAll(/<input[^>]*role="switch"[^>]*>/g)].map((m) => m[0]);
		expect(inputs.filter((i) => i.includes('disabled'))).toEqual([]);
		expect(inputs.filter((i) => i.includes('name="recordatorio"'))).toHaveLength(2);
	});
});

describe('tu calendario: en esta misma página (antes, Mi rincón → Calendario)', () => {
	/** La sección «Tu calendario». @param {string} html */
	const section = (html) => {
		const m = html.match(/<section[^>]*id="calendario"[\s\S]*?<\/section>/);
		return m ? m[0] : '';
	};

	it('explica qué entra: lo seguido, tus entradas y donde participás', () => {
		const cal = section(page());
		expect(cal).toContain('Tu calendario');
		expect(cal).toContain('lo que seguís con «En mi calendario»');
		expect(cal).toContain('tus entradas');
		expect(cal).toContain('los eventos donde participás');
		expect(cal).toMatch(/<form[^>]*action="\?\/calendario"/);
		// Ya no manda a otra página para el link.
		expect(cal).not.toContain('href="/mi-rincon/calendario"');
	});

	it('el intro de la página lleva a la sección', () => {
		expect(page()).toContain('href="#calendario"');
	});

	it('con `series` y sin link: «Crear mi link», sin revocar', () => {
		const cal = section(page({ extra: { feed: null } }));
		expect(cal).toContain('Tu link para suscribirte');
		expect(cal).toMatch(/<form[^>]*action="\?\/crearLink"[\s\S]*Crear mi link/);
		expect(cal).not.toContain('?/revocarLink');
	});

	it('con un link activo: desde cuándo, generar uno nuevo o revocarlo (el link no se muestra)', () => {
		const cal = section(
			page({
				extra: { feed: { createdAt: Date.UTC(2026, 5, 10, 15), lastUsedAt: null } }
			})
		);
		expect(cal).toContain('Tenés un link activo desde el 10 de junio de 2026');
		expect(cal).toContain('Generar un link nuevo');
		expect(cal).toMatch(/<form[^>]*action="\?\/revocarLink"/);
		expect(cal).not.toContain('/ics/mio/');
	});

	it('recién creado: el link una sola vez, con los botones para suscribirse', () => {
		const url = 'https://kinkyvibe.ar/ics/mio/token-inventado.ics';
		const cal = section(
			page({
				extra: { feed: { createdAt: 0, lastUsedAt: null } },
				form: { action: 'link', ok: true, url }
			})
		);
		expect(cal).toContain('no lo vamos a mostrar de nuevo');
		expect(cal).toContain(`<code class="feed-link`);
		expect(cal).toContain(url);
		expect(cal).toContain('Google Calendar');
		expect(cal).toContain('webcal://kinkyvibe.ar/ics/mio/token-inventado.ics');
		expect(cal).not.toContain('Tenés un link activo');
	});

	it('revocado: lo dice y ofrece crear otro', () => {
		const cal = section(
			page({
				extra: { feed: null },
				form: { action: 'revocarLink', ok: true }
			})
		);
		expect(cal).toContain('Listo: el link dejó de andar.');
		expect(cal).toContain('Crear mi link');
		expect(cal).not.toContain('?/revocarLink');
	});
});

describe('«Agregar»: el buscador del sitio, con estilo', () => {
	const TAGS = [
		{
			id: 'shibari',
			name: 'shibari',
			icon: '🪢',
			group: 'cuerdas',
			aliases: [],
			count: 1,
			inTree: true
		}
	];

	it('usa el selector de etiquetas (ChipCombobox) con el aspecto del buscador público', () => {
		const html = render(FollowAdd, { props: { tags: TAGS } }).body;
		expect(html).toMatch(/class="chip-combobox[^"]*\bsearch\b/);
		expect(html).toContain('lucide-search');
		expect(html).toMatch(/<input[^>]*role="combobox"/);
		// Sin JavaScript, el mismo campo manda lo escrito, con «Seguir».
		expect(html).toMatch(/<input[^>]*name="clave"[^>]*required[^>]*role="combobox"/);
		expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Seguir<\/button>/);
		// Ya no hay un segundo campo suelto, sin estilo.
		expect([...html.matchAll(/<input[^>]*type="text"/g)]).toHaveLength(1);
	});

	it('ChipCombobox: sin `look`, el del panel (sin lupa ni la clase del buscador)', () => {
		const html = render(ChipCombobox, { props: { search: () => [] } }).body;
		expect(html).toMatch(/class="chip-combobox(?: svelte-[a-z0-9]+)?"/);
		expect(html).not.toContain('lucide-search');
		const pill = render(ChipCombobox, { props: { search: () => [], look: 'search' } }).body;
		expect(pill).toMatch(/class="chip-combobox[^"]*\bsearch\b/);
		expect(pill).toContain('lucide-search');
	});
});
