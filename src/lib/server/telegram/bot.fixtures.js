/**
 * Casos para `bot.golden.json`: todo lo que el bot dice (pantallas, respuestas, avisos, comandos)
 * con datos inventados. La golden se sacó del código de antes de «Textos del bot» y no se toca a
 * mano: sin nada cambiado en el panel, cada caso tiene que salir igual, byte a byte
 * (`texts-golden.test.js`). Para regenerarla (solo si un cambio de texto en el código es a
 * propósito): `UPDATE_BOT_GOLDEN=1 npx vitest run src/lib/server/telegram/texts-golden.test.js`.
 */
import { commandPayloads } from './commands.js';
import { deliverScreen } from './deliver.js';
import {
	ACCOUNTS_OFF_TEXT,
	ADMIN_LINK_INVALID_TEXT,
	ADMIN_LINK_OFF_TEXT,
	ERROR_TEXT,
	FOLLOW_ALREADY_TEXT,
	FOLLOW_FULL_TEXT,
	FOLLOW_GONE_TEXT,
	FOLLOW_TOO_MANY_TEXT,
	LINK_ASK_CODE_TEXT,
	LINK_INVALID_TEXT,
	LINK_TOO_MANY_TEXT,
	MUTED_TEXT,
	NOT_FOUND_TEXT,
	NOT_LINKED_TEXT,
	PICK_EVENT_TEXT,
	PRIVATE_ONLY_TEXT,
	UNAVAILABLE_TEXT,
	UNKNOWN_TEXT,
	UNLINKED_TEXT,
	UNMUTED_TEXT,
	followedText,
	formatAdminLinked,
	formatFollowNotice,
	formatLinked
} from './format.js';
import { inlineArticle, inlineCard, inlineDescription } from './inline.js';
import {
	ticketScreen,
	ticketsForView,
	ticketsScreen,
	ticketsUnlinkedScreen
} from './misEntradas.js';
import { makeInlineSource } from './inlineSource.js';
import { shortHash } from './nav.js';
import { planUpdate } from './router.js';
import { runPlan } from './run.js';
import { docHash, docScreen, siteResultsScreen } from './siteScreens.js';
import {
	eventScreen,
	followScreen,
	fondoScreen,
	helpScreen,
	homeScreen,
	listScreen,
	noticeScreen,
	privateOnlyScreen,
	searchResultsScreen,
	searchScreen,
	sigoScreen,
	unlinkedScreen
} from './screens.js';

export const ORIGIN = 'https://ejemplo.test';
export const NOW = Date.parse('2031-01-08T12:00:00-03:00');

/** Eventos inventados (dos en el finde del 10/1, para que haya hoy/semana/finde). */
export const EVENTS = [
	{ slug: 'hoy-inventado', title: 'Juntada inventada', start: '2031-01-08T20:00:00-03:00' },
	{ slug: 'taller-de-cuerdas', title: 'Taller de cuerdas', start: '2031-01-10T21:00:00-03:00' },
	{
		slug: 'fiesta-inventada',
		title: 'Fiesta <inventada> & "más"',
		start: '2031-01-11T23:00:00-03:00'
	},
	{ slug: 'taller-de-teatro', title: 'Taller de teatro', start: '2031-01-20T18:00:00-03:00' },
	{ slug: 'charla-inventada', title: 'Charla inventada', start: '2031-02-01T18:00:00-03:00' },
	{
		slug: 'jam-inventada',
		title: 'Jam inventada con un título bastante largo',
		start: '2031-02-05T19:00:00-03:00'
	},
	{ slug: 'otra-fiesta', title: 'Otra fiesta', start: '2031-03-01T23:00:00-03:00' }
];

/** El índice público de la búsqueda, inventado (buscar en todo el sitio y el modo inline). */
const SITE_IMG = `https://kinkyvibe.ar/media/img/${'c'.repeat(64)}.webp`;
/** @type {import('$lib/utils/search').SearchDoc[]} */
const SITE_DOCS = [
	{
		c: 'calendario',
		h: '/calendario/taller-de-cuerdas',
		t: 'Taller de cuerdas',
		d: '2031-01-11T00:00:00.000Z',
		g: ['cuerdas', 'noche-de-cuerdas']
	},
	{
		c: 'calendario',
		h: '/calendario/cuerdas-pasadas',
		t: 'Cuerdas pasadas',
		d: '2030-01-11T00:00:00.000Z',
		g: ['cuerdas']
	},
	{
		c: 'material',
		h: '/material/guia-de-cuerdas',
		t: 'Guía de cuerdas',
		s: 'Cómo atar <sin apuro> & con "cuidado"',
		g: ['cuerdas', 'cuidados']
	},
	{ c: 'material', h: '/material/cuerdas-sin-resumen', t: 'Cuerdas sin resumen', g: ['cuerdas'] },
	{ c: 'wiki', h: '/wiki/cuerdas', t: 'Cuerdas', s: 'Atar con cuerdas', i: '🪢', g: ['cuerdas'] },
	{ c: 'wiki', h: '/wiki/cuerdas-sin-resumen', t: 'Nudos de cuerdas', g: ['cuerdas'] },
	{
		c: 'amigues',
		h: '/amigues/persona-de-cuerdas',
		t: 'Persona de cuerdas',
		s: 'Da talleres',
		g: ['cuerdas']
	},
	{
		c: 'serie',
		h: '/wiki/noche-de-cuerdas',
		t: 'Noche de cuerdas',
		i: '🌙',
		g: ['noche-de-cuerdas']
	}
];
const SITE_SOURCE = makeInlineSource(
	{
		raw: {
			v: 1,
			docs: SITE_DOCS,
			tags: {
				cuerdas: ['Cuerdas'],
				cuidados: ['Cuidados'],
				'noche-de-cuerdas': ['Noche de cuerdas']
			}
		},
		posts: [
			/** @type {any} */ ({
				path: '/material/guia-de-cuerdas',
				meta: { category: 'material', featured: SITE_IMG, published_date: '2030-05-01' }
			}),
			/** @type {any} */ ({
				path: '/material/cuerdas-sin-resumen',
				meta: { category: 'material', published_date: '2030-04-01' }
			})
		],
		wikiPosts: [],
		profiles: [
			{
				object: {
					id: 3,
					slug: 'persona-de-cuerdas',
					title: 'Persona de cuerdas',
					data: { kind: 'proyecto' }
				},
				legacySlug: null
			}
		]
	},
	{}
);
const EMPTY_SOURCE = makeInlineSource({
	raw: { v: 1, docs: [], tags: {} },
	posts: [],
	wikiPosts: [],
	profiles: []
});

const TARGETS = [
	{ key: 'Serie Inventada', title: 'Serie Inventada', series: true, hash: 'abc12' },
	{ key: 'cuerdas', title: '🪢 Cuerdas', series: false, hash: 'def34' }
];

/**
 * Entradas inventadas de una cuenta inventada (Mis entradas): dos para el taller (una ya usada),
 * una online, una de un evento que ya pasó y siete para que la lista tenga dos páginas.
 * @type {import('./tickets.js').BotTicket[]}
 */
export const TICKETS = [
	{
		id: 'tk1',
		token: 'A'.repeat(43),
		code: 'ABC234',
		holder: 'Persona Inventada',
		pronouns: 'elle',
		type: 'General',
		slug: 'taller-de-cuerdas',
		title: 'Taller de cuerdas',
		start: '2031-01-10T21:00:00-03:00',
		end: null,
		online: false,
		checkedInAt: null
	},
	{
		id: 'tk2',
		token: 'B'.repeat(43),
		code: 'DEF567',
		holder: 'Otra <Persona> Inventada',
		pronouns: '',
		type: 'Anticipada',
		slug: 'taller-de-cuerdas',
		title: 'Taller de cuerdas',
		start: '2031-01-10T21:00:00-03:00',
		end: null,
		online: false,
		checkedInAt: Date.parse('2031-01-10T21:30:00-03:00')
	},
	{
		id: 'tk3',
		token: 'C'.repeat(43),
		code: null,
		holder: 'Persona Inventada',
		pronouns: '',
		type: 'A la gorra',
		slug: 'charla-inventada',
		title: 'Charla inventada',
		start: '2031-02-01T18:00:00-03:00',
		end: null,
		online: true,
		checkedInAt: null
	},
	{
		id: 'tk4',
		token: 'D'.repeat(43),
		code: 'GHJ234',
		holder: 'Persona Inventada',
		pronouns: '',
		type: 'General',
		slug: 'fiesta-pasada',
		title: 'Fiesta pasada',
		start: '2030-12-01T23:00:00-03:00',
		end: '2030-12-02T05:00:00-03:00',
		online: false,
		checkedInAt: null
	}
];
/** Muchas entradas para un mismo evento (dos páginas). */
const MANY_TICKETS = Array.from({ length: 7 }, (_, i) => ({
	...TICKETS[0],
	id: `m${i}`,
	token: String(i).repeat(43),
	holder: `Persona ${i}`
}));

/** @param {any} [o] */
export function fakeTickets({ linked = true, tickets = TICKETS } = {}) {
	return {
		accountFor: async () => (linked ? 'cuenta-inventada' : null),
		list: async () => tickets
	};
}

/** @param {'private' | 'group'} chat @param {boolean} [sigo] */
const ctx = (chat, sigo = true) => ({
	origin: ORIGIN,
	chat,
	now: NOW,
	botUsername: 'BotDePrueba',
	sigo
});

/** @param {any} [o] */
function fakeFollows({
	linked = true,
	followResult = 'created',
	titles = ['Serie', '🪢 Cuerdas']
} = {}) {
	return {
		accountFor: async () => (linked ? 'cuenta-inventada' : null),
		targets: async () => TARGETS,
		following: async () => new Set(['cuerdas']),
		follow: async () => followResult,
		titles: async () => titles
	};
}

/** @param {any} [o] */
function deps({
	accounts = null,
	follows = null,
	tickets = null,
	adminLink = null,
	media = false
} = {}) {
	return {
		listUpcoming: async () => EVENTS,
		origin: ORIGIN,
		now: () => NOW,
		botUsername: 'BotDePrueba',
		card: async () => ({
			image: 'https://ejemplo.test/foto.jpg',
			place: 'Lugar inventado',
			mapUrl: 'https://maps.example/x',
			ticket: { kind: 'buy', href: '/calendario/x/entradas', text: 'Entradas' }
		}),
		fondo: async () => ({ percent: 10, collected: 150000, goal: 300000, step: 5, updatedAt: NOW }),
		accounts: async () =>
			accounts || follows || tickets
				? {
						link: async () => accounts?.link ?? 'linked',
						unlink: async () => accounts?.linked ?? true,
						setMuted: async () => accounts?.linked ?? true,
						...(follows ? { follows } : {}),
						...(tickets ? { tickets } : {})
					}
				: null,
		adminLink,
		media
	};
}

/** Con el índice público (buscar en todo el sitio, el modo inline). @param {any} [o] @param {any} [source] */
const siteDeps = (o = {}, source = SITE_SOURCE) => ({
	...deps(o),
	inline: {
		source: async () => source,
		events: async () =>
			new Map([
				[
					'taller-de-cuerdas',
					{
						place: 'Lugar <x>',
						area: 'Barrio',
						ticket: {
							kind: 'buy',
							href: '/calendario/taller-de-cuerdas/entradas',
							text: 'Entradas'
						}
					}
				]
			])
	}
});

const PRIVATE = { id: 42, type: 'private' };
const GROUP = { id: -100, type: 'supergroup' };
/** @param {string} text @param {any} [chat] */
const msg = (text, chat = PRIVATE) => ({
	update_id: 1,
	message: { chat, from: { id: 77 }, text, message_id: 5 }
});
/** @param {string} data @param {any} [chat] */
const cb = (data, chat = PRIVATE) => ({
	update_id: 1,
	callback_query: { id: 'cb', from: { id: 77 }, data, message: { message_id: 9, chat } }
});

/**
 * `[nombre, () => salida]`. La salida es JSON (texto, botones, métodos de la API).
 * @returns {Array<[string, () => unknown]>}
 */
export function botCases() {
	/** @type {Array<[string, () => unknown]>} */
	const cases = [];
	/** @param {string} name @param {() => unknown} fn */
	const add = (name, fn) => cases.push([name, fn]);

	// Constantes y textos sueltos de format.js.
	add('constantes', () => ({
		ACCOUNTS_OFF_TEXT,
		ADMIN_LINK_INVALID_TEXT,
		ADMIN_LINK_OFF_TEXT,
		ERROR_TEXT,
		FOLLOW_ALREADY_TEXT,
		FOLLOW_FULL_TEXT,
		FOLLOW_GONE_TEXT,
		FOLLOW_TOO_MANY_TEXT,
		LINK_ASK_CODE_TEXT,
		LINK_INVALID_TEXT,
		LINK_TOO_MANY_TEXT,
		MUTED_TEXT,
		NOT_FOUND_TEXT,
		NOT_LINKED_TEXT,
		PICK_EVENT_TEXT,
		PRIVATE_ONLY_TEXT,
		UNAVAILABLE_TEXT,
		UNKNOWN_TEXT,
		UNLINKED_TEXT,
		UNMUTED_TEXT
	}));
	add('seguido corto', () => followedText('🪢 Cuerdas'));
	add('seguido con telegram', () => followedText('🪢 Cuerdas', { telegram: true }));
	add('seguido largo con telegram', () => followedText('x'.repeat(250), { telegram: true }));
	add('seguido largo', () => followedText('y'.repeat(250)));
	add('vinculado', () => formatLinked(ORIGIN));
	add('admin vinculade', () => formatAdminLinked('admin-<inventade>'));
	add('aviso nuevo', () =>
		formatFollowNotice({
			kind: 'nuevo',
			title: 'Fiesta <x>',
			start: EVENTS[2].start,
			url: `${ORIGIN}/calendario/x?a=1&b=2`
		})
	);
	add('aviso recordatorio', () =>
		formatFollowNotice({
			kind: 'recordatorio',
			title: 'Taller',
			start: EVENTS[1].start,
			url: `${ORIGIN}/calendario/y`
		})
	);
	add('comandos sin cuentas', () => commandPayloads({ accounts: false }));
	add('comandos con cuentas', () => commandPayloads({ accounts: true }));

	// Pantallas.
	add('inicio privado', () => homeScreen(ctx('private')));
	add('inicio privado sin sigo', () => homeScreen(ctx('private', false)));
	add('inicio grupo', () => homeScreen(ctx('group')));
	add('inicio sin https', () => homeScreen({ ...ctx('private'), origin: 'http://localhost:5173' }));
	for (const view of /** @type {const} */ (['d', 'w', 'f', 'p'])) {
		add(`lista ${view} vacía`, () => listScreen(view, [], 0, ctx('private')));
		add(`lista ${view} pag 0`, () => listScreen(view, EVENTS, 0, ctx('private')));
	}
	add('lista p pag 1', () => listScreen('p', EVENTS, 1, ctx('private')));
	add('lista con intro', () =>
		listScreen('p', EVENTS, 0, ctx('private'), { intro: PICK_EVENT_TEXT })
	);
	add('búsqueda sin nada', () => searchResultsScreen('algo <raro>', [], ctx('private')));
	add('búsqueda uno', () => searchResultsScreen('cuerdas', [EVENTS[1]], ctx('private')));
	add('búsqueda varios', () => searchResultsScreen('taller', EVENTS, ctx('private')));
	add('búsqueda varios con head', () =>
		searchResultsScreen('taller', EVENTS.slice(0, 2), ctx('private'), { head: 'Otra cabeza' })
	);
	const follow = { text: '⭐ Seguir', callback_data: 'f:x' };
	add('tarjeta comprar', () =>
		eventScreen(
			EVENTS[1],
			{
				image: 'https://ejemplo.test/a.jpg',
				place: 'Lugar <x>',
				mapUrl: 'https://maps.example/a',
				ticket: { kind: 'buy', href: '/calendario/taller-de-cuerdas/entradas', text: 'Entradas' }
			},
			{ back: 'w', list: EVENTS.slice(0, 4) },
			ctx('private'),
			{ follow }
		)
	);
	add('tarjeta nota', () =>
		eventScreen(
			EVENTS[2],
			{ place: 'Lugar a confirmar', ticket: { kind: 'note', text: 'Agotadas' } },
			{ back: 'n' },
			ctx('private')
		)
	);
	add('tarjeta sin entradas', () =>
		eventScreen(EVENTS[3], {}, { back: 'p', list: EVENTS }, ctx('group'))
	);
	add('tarjeta sin https', () =>
		eventScreen(
			EVENTS[3],
			{ ticket: { kind: 'buy', href: '/x', text: 'Entradas' } },
			{ back: 'n' },
			{ ...ctx('private'), origin: 'http://localhost' }
		)
	);
	add('buscar privado', () => searchScreen(ctx('private')));
	add('buscar grupo', () => searchScreen(ctx('group')));
	add('fondo sin números', () => fondoScreen(null, ctx('private')));
	add('fondo', () =>
		fondoScreen(
			{ percent: 12, collected: 123456, goal: 400000, step: 5, updatedAt: NOW },
			ctx('private')
		)
	);
	add('fondo viejo', () =>
		fondoScreen(
			{ percent: 8, collected: 0, goal: 0, step: 5, updatedAt: null, stale: true },
			ctx('private')
		)
	);
	add('ayuda', () => helpScreen(ctx('private')));
	add('ayuda con cuentas', () => helpScreen(ctx('private'), { accounts: true }));
	add('aviso', () => noticeScreen(UNAVAILABLE_TEXT));
	add('solo privado con link', () => privateOnlyScreen('https://t.me/BotDePrueba?start=sigo'));
	add('solo privado sin link', () => privateOnlyScreen(null));
	add('sin vincular', () => unlinkedScreen(ctx('private')));
	add('lo que sigo vacío', () => sigoScreen([], ctx('private')));
	add('lo que sigo', () => sigoScreen(['Serie <x>', '🪢 Cuerdas'], ctx('private')));
	add('lo que sigo largo', () =>
		sigoScreen(
			Array.from({ length: 18 }, (_, i) => `Cosa ${i}`),
			ctx('private')
		)
	);
	add('seguir opciones', () =>
		followScreen(
			EVENTS[2],
			TARGETS.map((t, i) => ({ ...t, following: i === 1 })),
			ctx('private')
		)
	);
	add('seguir sin opciones', () => followScreen(EVENTS[1], [], ctx('private')));
	// Buscar en todo el sitio y el modo inline (#298).
	const sctx = { ...ctx('private'), site: true };
	add('sitio: inicio privado', () => homeScreen(sctx));
	add('sitio: inicio grupo', () => homeScreen({ ...ctx('group'), site: true }));
	add('sitio: buscar privado', () => searchScreen(sctx));
	add('sitio: buscar grupo', () => searchScreen({ ...ctx('group'), site: true }));
	add('sitio: resultados vacío', () => siteResultsScreen('algo <raro>', [], 0, sctx));
	add('sitio: resultados uno', () =>
		siteResultsScreen('guía', [SITE_DOCS[2]], 0, sctx, SITE_SOURCE.extras)
	);
	add('sitio: resultados pag 0', () =>
		siteResultsScreen('cuerdas', SITE_DOCS, 0, sctx, SITE_SOURCE.extras)
	);
	add('sitio: resultados pag 1', () =>
		siteResultsScreen('cuerdas', SITE_DOCS, 1, sctx, SITE_SOURCE.extras)
	);
	SITE_DOCS.forEach((doc, i) => {
		const back = { text: '‹ Volver', callback_data: 'q:0:cuerdas' };
		add(`sitio: tarjeta ${i} ${doc.c}`, () =>
			docScreen(doc, SITE_SOURCE.extras.get(doc.h), sctx, { back })
		);
		add(`sitio: tarjeta ${i} sin https`, () =>
			docScreen(doc, SITE_SOURCE.extras.get(doc.h), { ...sctx, origin: 'http://localhost' })
		);
		add(`inline: descripción ${i}`, () =>
			inlineDescription(doc, SITE_SOURCE.extras.get(doc.h), undefined, NOW)
		);
		add(`inline: artículo ${i}`, () =>
			inlineArticle(String(i), doc, SITE_SOURCE.extras.get(doc.h), undefined, {
				origin: 'https://kinkyvibe.ar',
				now: NOW
			})
		);
	});
	add('inline: tarjeta evento con venta', () =>
		inlineCard(
			SITE_DOCS[0],
			undefined,
			{
				place: 'Lugar',
				area: 'Barrio',
				ticket: { kind: 'buy', href: '/calendario/taller-de-cuerdas/entradas', text: 'Entradas' }
			},
			{ origin: ORIGIN, now: NOW }
		)
	);
	add('inline: tarjeta evento agotado', () =>
		inlineCard(
			SITE_DOCS[0],
			undefined,
			{ ticket: { kind: 'note', text: 'Agotadas' } },
			{ origin: ORIGIN, now: NOW }
		)
	);
	add('inline: tarjeta sin https', () =>
		inlineCard(SITE_DOCS[2], undefined, undefined, { origin: 'http://localhost', now: NOW })
	);
	// Mis entradas (misEntradas.js).
	const ectx = { ...ctx('private'), entradas: true };
	add('entradas: inicio privado', () => homeScreen(ectx));
	add('entradas: inicio grupo', () => homeScreen({ ...ctx('group'), entradas: true }));
	add('entradas: inicio grupo sin usuario del bot', () =>
		homeScreen({ ...ctx('group'), entradas: true, botUsername: null })
	);
	add('entradas: lista', () => ticketsScreen('u', TICKETS, 0, ectx));
	add('entradas: lista vacía', () => ticketsScreen('u', [], 0, ectx));
	add('entradas: lista pag 1', () => ticketsScreen('u', MANY_TICKETS, 1, ectx));
	add('entradas: pasadas', () => ticketsScreen('o', TICKETS, 0, ectx));
	add('entradas: pasadas vacía', () => ticketsScreen('o', TICKETS.slice(0, 1), 0, ectx));
	const upcoming = ticketsForView('u', TICKETS, NOW);
	add('entradas: tarjeta válida', () => ticketScreen(TICKETS[0], 'u', upcoming, ectx));
	add('entradas: tarjeta usada', () => ticketScreen(TICKETS[1], 'u', upcoming, ectx));
	add('entradas: tarjeta online', () => ticketScreen(TICKETS[2], 'u', upcoming, ectx));
	add('entradas: tarjeta sin https', () =>
		ticketScreen(TICKETS[0], 'u', upcoming, { ...ectx, origin: 'http://localhost' })
	);
	add('entradas: sin vincular', () => ticketsUnlinkedScreen(ectx));
	add('entrega grupo botón', () =>
		deliverScreen(
			homeScreen(ctx('group')),
			{ kind: 'callback', callbackId: 'cb', chatId: -100, group: true, messageId: 9, userId: 77 },
			{ media: true, privateLink: 'https://t.me/BotDePrueba?start=inicio' }
		)
	);
	add('entrega grupo botón sin link', () =>
		deliverScreen(
			homeScreen(ctx('group')),
			{ kind: 'callback', callbackId: 'cb', chatId: -100, group: true, messageId: 9, userId: 77 },
			{ media: true, privateLink: null }
		)
	);
	return cases;
}

/**
 * Lo que contesta el router (`planUpdate`) a cada update, y lo que contesta el botón cuando la
 * API falla o pide ir más despacio (`runPlan`).
 * @returns {Array<[string, () => Promise<unknown>]>}
 */
export function routerCases() {
	/** @type {Array<[string, () => Promise<unknown>]>} */
	const cases = [];
	/** @param {string} name @param {any} update @param {any} [d] */
	const add = (name, update, d = deps()) => cases.push([name, () => planUpdate(update, d)]);
	add('/start', msg('/start'));
	add('/start grupo', msg('/start', GROUP));
	add('/ayuda', msg('/ayuda'));
	add('/ayuda con cuentas', msg('/ayuda'), deps({ follows: fakeFollows() }));
	add('/hoy', msg('/hoy'));
	add('/semana', msg('/semana'));
	add('/finde', msg('/finde'));
	add('/proximos', msg('/proximos'));
	add('/evento', msg('/evento'));
	add('/evento varios', msg('/evento taller'));
	add('/evento uno', msg('/evento cuerdas'));
	add('/evento uno con seguir', msg('/evento cuerdas'), deps({ follows: fakeFollows() }));
	add(
		'/evento uno con seguir grupo',
		msg('/evento cuerdas', GROUP),
		deps({ follows: fakeFollows() })
	);
	add('/evento nada', msg('/evento inexistente'));
	add('/buscar', msg('/buscar'));
	add('/fondo', msg('/fondo'));
	add('/xyz', msg('/xyz'));
	add('respuesta a buscar', {
		update_id: 1,
		message: {
			chat: PRIVATE,
			text: 'cuerdas',
			reply_to_message: { from: { is_bot: true }, text: '🔎 Escribí qué buscás: un nombre…' }
		}
	});
	add('/vincular sin cuentas', msg('/vincular ABCD-2345'));
	add('/vincular grupo', msg('/vincular ABCD-2345', GROUP), deps({ accounts: {} }));
	add('/vincular sin código', msg('/vincular'), deps({ accounts: {} }));
	add('/vincular bien', msg('/vincular ABCD-2345'), deps({ accounts: {} }));
	add('/vincular mal', msg('/vincular ABCD-2345'), deps({ accounts: { link: 'invalid' } }));
	add('/vincular muchos', msg('/vincular ABCD-2345'), deps({ accounts: { link: 'too_many' } }));
	add('/start código', msg('/start ABCD2345'), deps({ accounts: {} }));
	add('/desvincular', msg('/desvincular'), deps({ accounts: {} }));
	add('/desvincular sin vínculo', msg('/desvincular'), deps({ accounts: { linked: false } }));
	add('/silenciar', msg('/silenciar'), deps({ accounts: {} }));
	add('/reanudar', msg('/reanudar'), deps({ accounts: {} }));
	add('/sigo', msg('/sigo'), deps({ follows: fakeFollows() }));
	add('/sigo sin vincular', msg('/sigo'), deps({ follows: fakeFollows({ linked: false }) }));
	add('/sigo sin cuentas', msg('/sigo'));
	add('/sigo grupo', msg('/sigo', GROUP), deps({ follows: fakeFollows() }));
	add('/start sigo', msg('/start sigo'), deps({ follows: fakeFollows() }));
	add('/start sigo sin cuentas', msg('/start sigo'));
	add('/start seguir', msg('/start seguir-fiesta-inventada'), deps({ follows: fakeFollows() }));
	add('/start ev viejo', msg('/start ev-no-existe'));
	add('/start adm grupo', msg('/start adm_ABCD2345', GROUP));
	add('/start adm apagado', msg('/start adm_ABCD2345'));
	add(
		'/start adm bien',
		msg('/start adm_ABCD2345'),
		deps({ adminLink: async () => ({ linked: 'admin-inventade' }) })
	);
	add('/start adm mal', msg('/start adm_ABCD2345'), deps({ adminLink: async () => 'invalid' }));
	add('/start adm muchos', msg('/start adm_ABCD2345'), deps({ adminLink: async () => 'too_many' }));
	add('botón inicio', cb('h'));
	add('botón inicio con token', cb('h'), deps({ media: true }));
	add('botón lista', cb('l:p:1'));
	add('botón tarjeta', cb('e:taller-de-cuerdas:w'), deps({ media: true, follows: fakeFollows() }));
	add('botón tarjeta vieja', cb('e:no-existe:w'));
	add('botón roto', cb('zzz'));
	add('botón buscar grupo', cb('s', GROUP), deps({ media: true }));
	add('botón ayuda grupo', cb('a', GROUP), deps({ media: true }));
	add('botón seguir', cb('f:fiesta-inventada'), deps({ follows: fakeFollows() }));
	add('botón seguir sin cuentas', cb('f:fiesta-inventada'));
	for (const r of ['created', 'created_telegram', 'already', 'too_many', 'full', 'gone']) {
		add(
			`botón seguir una ${r}`,
			cb('fy:fiesta-inventada:abc12'),
			deps({ follows: fakeFollows({ followResult: r }) })
		);
	}
	add(
		'botón seguir una que no está',
		cb('fy:fiesta-inventada:zzzzz'),
		deps({ follows: fakeFollows() })
	);
	add(
		'botón seguir grupo',
		cb('f:fiesta-inventada', GROUP),
		deps({ follows: fakeFollows(), media: true })
	);
	add('botón lo que sigo', cb('g'), deps({ follows: fakeFollows() }));
	add('botón sin chat', { update_id: 1, callback_query: { id: 'cb', data: 'h' } });
	// Mis entradas.
	add('/entradas', msg('/entradas'), deps({ tickets: fakeTickets() }));
	add(
		'/entradas sin vincular',
		msg('/entradas'),
		deps({ tickets: fakeTickets({ linked: false }) })
	);
	add('/entradas sin cuentas', msg('/entradas'));
	add('/entradas grupo', msg('/entradas', GROUP), deps({ tickets: fakeTickets() }));
	add('/start mis-entradas', msg('/start mis-entradas'), deps({ tickets: fakeTickets() }));
	add('botón inicio con entradas', cb('h'), deps({ tickets: fakeTickets() }));
	add('botón mis entradas', cb('t:u:0'), deps({ tickets: fakeTickets() }));
	add('botón entradas pasadas', cb('t:o:0'), deps({ tickets: fakeTickets() }));
	add('botón una entrada', cb('tk:tk1:u'), deps({ tickets: fakeTickets() }));
	add(
		'botón una entrada que no es de la cuenta',
		cb('tk:zzzz:u'),
		deps({ tickets: fakeTickets() })
	);
	add('error', msg('/proximos'), {
		...deps(),
		listUpcoming: async () => {
			throw new Error('x');
		}
	});
	add('error botón', cb('l:p:0'), {
		...deps(),
		listUpcoming: async () => {
			throw new Error('x');
		}
	});

	// Buscar en todo el sitio y el modo inline (#298).
	add('sitio: /buscar', msg('/buscar'), siteDeps());
	add('sitio: /buscar grupo', msg('/buscar', GROUP), siteDeps());
	add('sitio: /buscar cuerdas', msg('/buscar cuerdas'), siteDeps());
	add('sitio: /buscar nada', msg('/buscar zzzz <x>'), siteDeps());
	add('sitio: botón inicio', cb('h'), siteDeps());
	add('sitio: botón buscar', cb('s'), siteDeps());
	add('sitio: botón buscar grupo', cb('s', GROUP), siteDeps({ media: true }));
	add('sitio: botón página', cb('q:1:cuerdas'), siteDeps());
	for (const doc of SITE_DOCS) {
		add(`sitio: botón ${doc.h}`, cb(`r:${docHash(doc)}:1:cuerdas`), siteDeps({ media: true }));
	}
	add('sitio: botón que no está', cb('r:zzzzz:0:cuerdas'), siteDeps());
	add(
		'sitio: respuesta a buscar',
		{
			update_id: 1,
			message: {
				chat: PRIVATE,
				text: 'cuerdas',
				reply_to_message: {
					from: { is_bot: true },
					text: '🔎 Escribí qué buscás: un evento, un tema…'
				}
			}
		},
		siteDeps()
	);
	// Las secciones del sitio (sections.js).
	for (const section of ['m', 'w', 'a', 's']) {
		add(`secciones: ${section}`, cb(`c:${section}:0`), siteDeps());
		add(`secciones: etiquetas ${section}`, cb(`ct:${section}`), siteDeps());
	}
	add('secciones: material con etiqueta', cb(`c:m:0:${shortHash('cuerdas')}`), siteDeps());
	add('secciones: etiquetas con una elegida', cb(`ct:m:${shortHash('cuerdas')}`), siteDeps());
	add('secciones: etiqueta de otra sección', cb(`c:w:0:${shortHash('cuidados')}`), siteDeps());
	add('secciones: etiqueta que no está', cb('c:m:0:zzzzz'), siteDeps());
	add(
		'secciones: tarjeta',
		cb(`cd:m:${docHash(SITE_DOCS[2])}:0:${shortHash('cuerdas')}`),
		siteDeps({ media: true })
	);
	add('secciones: tarjeta de otra sección', cb(`cd:a:${docHash(SITE_DOCS[2])}:0`), siteDeps());
	add('secciones: sin índice', cb('c:m:0'), siteDeps({}, null));
	let iq = 1000;
	/** @param {string} name @param {string} query @param {string} [offset] @param {any} [d] */
	const inlineCase = (name, query, offset = '', d = siteDeps()) =>
		add(name, { update_id: 1, inline_query: { id: 'iq', from: { id: ++iq }, query, offset } }, d);
	inlineCase('inline: vacío', '');
	inlineCase('inline: cuerdas', 'cuerdas');
	inlineCase('inline: wiki', 'wiki:');
	inlineCase('inline: material', 'material:');
	inlineCase('inline: evento', 'evento:');
	inlineCase('inline: nada', 'zzzz');
	inlineCase('inline: sitio vacío', '', '', siteDeps({}, EMPTY_SOURCE));

	/** @param {string} name @param {any} plan @param {number} status */
	const run = (name, plan, status) =>
		cases.push([
			name,
			async () => {
				/** @type {any[]} */
				const calls = [];
				await runPlan(plan, async (method, body) => {
					calls.push({ method, body });
					return method === 'answerCallbackQuery'
						? { ok: true, status: 200 }
						: { ok: false, status, description: 'x' };
				});
				return calls;
			}
		]);
	const step = { method: 'editMessageText', chat_id: 1, message_id: 9, text: 'x' };
	run('api lenta', { steps: [step], callback: { id: 'cb' } }, 429);
	run('api falla', { steps: [step], callback: { id: 'cb' } }, 400);
	run(
		'api falla con onFail',
		{ steps: [step], callback: { id: 'cb', onFail: { text: 'Otro', url: 'https://t.me/x' } } },
		400
	);
	return cases;
}
