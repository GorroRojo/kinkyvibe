/**
 * Operadores del buscador del panel (la paleta de comandos): arma, a partir de lo que se escribió,
 * qué se busca y con qué filtros. Puro (sin base ni DOM): lo usan la paleta (para las acciones y
 * para saber si hace falta preguntarle al servidor) y /admin/buscar (para los registros).
 *
 * La base la lee el parser compartido con el sitio y el bot (`parseSearch`, searchSyntax.js; la
 * sintaxis está en docs/buscar.md); acá se suma lo del panel.
 *
 * Operadores (sin mayúsculas ni tildes; ver docs/buscar.md y docs/panel.md):
 * - `>tema`: solo acciones (tiene que ir al comienzo).
 * - `#shibari` o `etiqueta:shibari`: eventos con esa etiqueta (también por alias) y la etiqueta.
 * - `@ana` o `persona:ana`: solo personas y perfiles.
 * - `e:latex` o `evento:latex`: solo eventos; una palabra de pestaña al final (`puerta`,
 *   `ordenes`, `mail`, `ventas`, `duplicar`) lleva directo a esa pestaña del primero. Los demás
 *   tipos de la base: `amigues:` (perfiles), `wiki:`/`kinkipedia:`/`serie:` (etiquetas);
 *   `material:` no trae nada (el panel no busca material).
 * - `orden:ana`: solo órdenes; `orden:pendiente` o `estado:pendiente`, las órdenes en ese estado.
 * - `tipo:evento` (orden, persona, perfil, etiqueta, entrada, codigo, accion; con coma, varios).
 * - `lugar:palermo`: eventos en ese lugar.
 * - `hoy`, `mañana`, `semana` («esta semana»), `finde`: eventos en esos días (y las acciones
 *   siguen apareciendo, como «Abrir la puerta de hoy»); con `cuando:` también un día de la
 *   semana (`cuando:sabado`), una fecha (`cuando:15/10`), un mes (`cuando:noviembre`) o un rango
 *   (`cuando:1/11..30/11`, `desde:1/11 hasta:30/11`). Los meses sueltos son texto en el panel.
 * - `"frase exacta"`: esas palabras juntas y en ese orden.
 * - `-palabra` (o `-"frase"`, `-#etiqueta`, `-tipo:orden`): sin eso.
 * Las palabras sueltas tienen que estar todas, en cualquier orden. Un `algo:` que no es un
 * operador se busca como texto (`20:30`, `foo:bar`).
 */
import {
	dayInWhen,
	foldQuery,
	parseSearch,
	parseWhen,
	QUERY_MAX,
	splitQuery,
	whenRange
} from './searchSyntax.js';

/**
 * @typedef {'actions' | 'events' | 'orders' | 'people' | 'profiles' | 'tags' | 'tickets' | 'codes'} SearchKind
 * @typedef {import('./searchSyntax.js').When} When
 * @typedef {'ingreso' | 'ordenes' | 'mail' | 'ventas' | 'duplicar'} EventTab
 * @typedef {'pending' | 'awaiting_transfer' | 'approved' | 'rejected' | 'cancelled' | 'refunded' | 'expired'} OrderStatus
 *
 * @typedef {object} ParsedQuery
 * @prop {string} raw lo que se escribió
 * @prop {string} text las palabras y frases buscadas, como se escribieron (para reconocer una
 *   referencia `KV-…`, un DNI o el código de una entrada)
 * @prop {string[]} words palabras sueltas (sin tildes ni mayúsculas): tienen que estar todas
 * @prop {string[]} phrases frases entre comillas (sin tildes ni mayúsculas)
 * @prop {string[]} exclude palabras o frases que no tienen que estar
 * @prop {SearchKind[] | null} kinds qué tipos de resultado pueden salir (`null`: todos)
 * @prop {string[]} tags etiquetas pedidas (`#…`, `etiqueta:…`): tienen que estar todas
 * @prop {string[]} excludeTags etiquetas que no tienen que estar
 * @prop {string[]} places lugares pedidos (`lugar:…`)
 * @prop {When | null} when días pedidos (`hoy`, `cuando:sabado`…)
 * @prop {OrderStatus | null} status estado de orden pedido
 * @prop {EventTab | null} tab pestaña del evento (`e:latex puerta`)
 * @prop {string} actionText con qué se buscan las acciones (las palabras, también las de fecha)
 * @prop {boolean} operators si se usó algún operador (para mostrar la ayuda adecuada)
 */

/** Cuánto tiene que medir lo buscado (sin filtros) para buscar registros. */
export const MIN_TERMS = 2;

export { foldQuery, parseWhen, splitQuery, whenRange };

/** @type {Record<string, SearchKind[]>} */
const TIPO = {
	evento: ['events'],
	eventos: ['events'],
	orden: ['orders'],
	ordenes: ['orders'],
	compra: ['orders'],
	compras: ['orders'],
	persona: ['people'],
	personas: ['people'],
	gente: ['people'],
	perfil: ['profiles'],
	perfiles: ['profiles'],
	amigue: ['profiles'],
	amigues: ['profiles'],
	etiqueta: ['tags'],
	etiquetas: ['tags'],
	entrada: ['tickets'],
	entradas: ['tickets'],
	codigo: ['codes'],
	codigos: ['codes'],
	descuento: ['codes'],
	descuentos: ['codes'],
	accion: ['actions'],
	acciones: ['actions']
};

/**
 * Los tipos de la sintaxis base (`evento:`, `amigues:`, `wiki:`…) en el panel: la Kinkipedia y las
 * series son etiquetas; el material no está en el buscador del panel (no sale nada).
 * @type {Record<import('./searchSyntax.js').DocType, SearchKind[]>}
 */
const BASE_KINDS = {
	calendario: ['events'],
	amigues: ['profiles'],
	wiki: ['tags'],
	serie: ['tags'],
	material: []
};

/** Estados de una orden por cómo se dicen (el comienzo alcanza desde 4 letras: «pend»). */
const STATUS_WORDS = /** @type {[string, OrderStatus][]} */ ([
	['pendiente', 'pending'],
	['transferencia', 'awaiting_transfer'],
	['aprobada', 'approved'],
	['rechazada', 'rejected'],
	['cancelada', 'cancelled'],
	['reembolsada', 'refunded'],
	['vencida', 'expired']
]);

/** @param {string} v ya sin tildes @returns {OrderStatus | null} */
export function orderStatusWord(v) {
	if (v.length < 4) return null;
	// «aprobado», «aprobadas»: sin la última vocal y la s del final.
	const stem = v.replace(/[aeo]s?$/, '');
	for (const [word, status] of STATUS_WORDS) {
		if (word.startsWith(v) || (stem.length >= 4 && word.startsWith(stem))) return status;
	}
	return null;
}

/** Palabras de pestaña de un evento (después de `e:`/`evento:`). */
const TAB_WORDS = /** @type {Record<string, EventTab>} */ ({
	puerta: 'ingreso',
	ingreso: 'ingreso',
	ordenes: 'ordenes',
	mail: 'mail',
	mails: 'mail',
	ventas: 'ventas',
	duplicar: 'duplicar'
});

const ALL_KINDS = /** @type {SearchKind[]} */ ([
	'actions',
	'events',
	'orders',
	'people',
	'profiles',
	'tags',
	'tickets',
	'codes'
]);

/**
 * Lee lo escrito en el buscador del panel. Nunca falla: lo que no entiende queda como texto.
 *
 * La base (texto, frases, exclusiones, `#etiqueta`, tipos, `lugar:`, fechas) la lee el parser
 * compartido (`parseSearch` de searchSyntax.js, docs/buscar.md); acá se suma lo del panel: `>`,
 * `@`/`persona:`, `orden:`, `estado:`, `tipo:` y la palabra de pestaña.
 * @param {string} raw
 * @returns {ParsedQuery}
 */
export function parseSearchQuery(raw) {
	let s = String(raw ?? '').slice(0, QUERY_MAX);
	/** @type {ParsedQuery} */
	const pq = {
		raw: s,
		text: '',
		words: [],
		phrases: [],
		exclude: [],
		kinds: null,
		tags: [],
		excludeTags: [],
		places: [],
		when: null,
		status: null,
		tab: null,
		actionText: '',
		operators: false
	};
	/** @type {Set<SearchKind> | null} */
	let scope = null;
	/** @type {Set<SearchKind>} */
	const filterKinds = new Set();
	let filtered = false;
	/** @type {Set<SearchKind>} */
	const notKinds = new Set();

	/** @param {SearchKind[]} kinds */
	const addScope = (kinds) => {
		scope ??= new Set();
		for (const k of kinds) scope.add(k);
		pq.operators = true;
	};
	/** @param {SearchKind[]} kinds */
	const addFilter = (kinds) => {
		if (!filtered) for (const k of kinds) filterKinds.add(k);
		else for (const k of [...filterKinds]) if (!kinds.includes(k)) filterKinds.delete(k);
		filtered = true;
		pq.operators = true;
	};

	if (s.trimStart().startsWith('>')) {
		addScope(['actions']);
		s = s.trimStart().slice(1);
	}

	const base = parseSearch(s, 'panel');
	const words = [...base.words];
	const phrases = [...base.phrases];
	const parts = [...base.parts];
	const plain = [...base.plain];
	pq.exclude = [...base.exclude];
	pq.excludeTags = [...base.excludeTags];
	pq.tags = [...base.tags];
	pq.places = [...base.places];
	if (base.operators) pq.operators = true;
	if (pq.tags.length) addFilter(['events', 'tags']);
	if (pq.places.length) addFilter(['events']);
	if (base.types) addScope(base.types.flatMap((t) => BASE_KINDS[t]));
	for (const t of base.excludeTypes) for (const k of BASE_KINDS[t]) notKinds.add(k);
	const eventScope = Boolean(base.types?.includes('calendario'));

	// Las fechas: `cuando:` (el último) manda; si no, la primera palabra de fecha suelta.
	const hard = base.dates.filter((d) => !d.soft).at(-1);
	const soft = base.dates.find((d) => d.soft);
	pq.when = hard?.when ?? soft?.when ?? null;

	// Lo del panel, en el orden escrito: lo que suma texto va donde estaba (de atrás para adelante,
	// así las posiciones siguen valiendo).
	for (const x of [...base.extra].reverse()) {
		const v = foldQuery(x.value);
		/** @type {{ words: string[], phrases: string[], part: string }} */
		const add = { words: [], phrases: [], part: '' };
		/** @param {string} original @param {boolean} [phrase] */
		const text = (original, phrase = false) => {
			const f = foldQuery(original);
			if (!f) return;
			if (phrase) add.phrases.push(f);
			else add.words.push(...f.split(' '));
			add.part = original.trim();
		};
		if (x.neg) {
			pq.operators = true;
			if (x.op.id === 'tipo') {
				for (const part of v.split(','))
					for (const kind of TIPO[part.trim()] ?? []) notKinds.add(kind);
			} else if (v) pq.exclude.push(v);
			continue;
		}
		switch (x.op.id) {
			case 'persona-panel':
				addScope(['people', 'profiles']);
				if (x.value) text(x.value, x.quoted);
				break;
			case 'orden': {
				addScope(['orders']);
				const st = x.quoted ? null : orderStatusWord(v);
				if (st) pq.status = st;
				else if (x.value) text(x.value, x.quoted);
				break;
			}
			case 'estado': {
				const st = orderStatusWord(v);
				if (st) {
					pq.status = st;
					addFilter(['orders']);
				} else if (x.value) text(`${x.key}:${x.value}`);
				break;
			}
			case 'tipo': {
				const kinds = v
					.split(',')
					.map((p) => TIPO[p.trim()])
					.filter(Boolean)
					.flat();
				if (kinds.length) addScope(kinds);
				else if (x.value) text(`${x.key}:${x.value}`);
				break;
			}
		}
		words.splice(x.at.words, 0, ...add.words);
		phrases.splice(x.at.phrases, 0, ...add.phrases);
		if (add.part) {
			parts.splice(x.at.parts, 0, add.part);
			plain.splice(x.at.plain, 0, add.part);
		}
	}

	// `e:latex puerta`: la última palabra de pestaña lleva a esa pestaña.
	if (eventScope) {
		for (let i = words.length - 1; i >= 0; i--) {
			const tab = TAB_WORDS[words[i]];
			if (tab && words.length > 1) {
				pq.tab = tab;
				const [word] = words.splice(i, 1);
				const at = parts.findLastIndex((p) => foldQuery(p) === word);
				if (at !== -1) parts.splice(at, 1);
				break;
			}
		}
	}

	// Las fechas filtran eventos; las acciones siguen (salvo con `cuando:`, que es un filtro).
	if (pq.when) addFilter(hard ? ['events'] : ['events', 'actions']);

	/** @type {Set<SearchKind> | null} */
	let kinds = scope;
	if (filtered)
		kinds = kinds ? new Set([...kinds].filter((x) => filterKinds.has(x))) : new Set(filterKinds);
	if (notKinds.size) {
		kinds ??= new Set(ALL_KINDS);
		for (const x of notKinds) kinds.delete(x);
	}
	pq.kinds = kinds ? [...kinds] : null;
	pq.words = words;
	pq.phrases = phrases;
	pq.text = parts.filter(Boolean).join(' ');
	pq.actionText = plain.join(' ');
	return pq;
}

/**
 * ¿Pueden salir resultados de este tipo?
 * @param {ParsedQuery} pq
 * @param {SearchKind} kind
 */
export function allowsKind(pq, kind) {
	return !pq.kinds || pq.kinds.includes(kind);
}

/**
 * ¿Hay algo para buscar registros? Texto de al menos {@link MIN_TERMS} letras o algún filtro.
 * @param {ParsedQuery} pq
 */
export function hasRecordCriteria(pq) {
	if (pq.kinds && pq.kinds.every((k) => k === 'actions')) return false;
	const terms = [...pq.words, ...pq.phrases].join(' ');
	return (
		terms.length >= MIN_TERMS ||
		pq.tags.length > 0 ||
		pq.places.length > 0 ||
		pq.when !== null ||
		pq.status !== null
	);
}

/**
 * Qué tan bien está `f` en alguno de los textos (ya sin tildes): 0 igual, 1 al comienzo, 2 al
 * comienzo de una palabra, 3 en el medio; `-1` si no está.
 * @param {string} f
 * @param {string[]} values
 */
export function foldedRank(f, values) {
	let best = -1;
	for (const v of values) {
		const at = v.indexOf(f);
		if (at === -1) continue;
		const rank = v === f ? 0 : at === 0 ? 1 : /[\s@._-]/.test(v[at - 1]) ? 2 : 3;
		if (best === -1 || rank < best) best = rank;
	}
	return best;
}

/**
 * ¿Estos campos cumplen con el texto buscado? Cada palabra y cada frase tiene que estar en
 * alguno, y ninguna de las excluidas en ninguno. Devuelve qué tan bien (como
 * {@link foldedRank}: todo junto y entero es 0; palabras sueltas en distinto orden, desde 1) o
 * `-1` si no cumple. Sin texto buscado (solo filtros) cumple todo, con 3.
 * @param {ParsedQuery} pq
 * @param {...unknown} fields
 */
export function matchTerms(pq, ...fields) {
	const values = fields.map(foldQuery).filter(Boolean);
	if (pq.exclude.some((x) => values.some((v) => v.includes(x)))) return -1;
	const terms = [...pq.words, ...pq.phrases];
	if (!terms.length) return 3;
	let worst = 0;
	for (const term of terms) {
		const r = foldedRank(term, values);
		if (r === -1) return -1;
		worst = Math.max(worst, r);
	}
	if (terms.length === 1) return worst;
	const together = foldedRank(terms.join(' '), values);
	return together !== -1 ? together : Math.max(1, worst);
}

/**
 * ¿El evento (con `start` y `end` ISO con la hora de Argentina, `2031-10-10T21:00-03:00`) cae en
 * esos días? Un evento de varios días vale si alguno cae adentro (`dayInWhen`, compartido con el
 * sitio y el bot).
 * @param {{ start?: string, end?: string }} e
 * @param {When} when
 * @param {number} [now]
 */
export function eventInWhen(e, when, now = Date.now()) {
	const start = (e.start || '').slice(0, 10);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return false;
	const endRaw = (e.end || '').slice(0, 10);
	const end = /^\d{4}-\d{2}-\d{2}$/.test(endRaw) && endRaw >= start ? endRaw : start;
	return dayInWhen(start, end, when, now);
}
