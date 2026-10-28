/**
 * La sintaxis de búsqueda de kinkyvibe (docs/buscar.md, decisión 0046): el registro de operadores
 * y el parser de la base, el mismo para el sitio, el bot y el panel. Puro (sin base ni DOM).
 *
 * El parser solo entiende lo escrito; qué hace cada filtro lo decide cada motor (el índice público
 * en $lib/utils/search.js para el sitio y el bot; D1 para el panel). Lo que es solo de un buscador
 * (`orden:`, `tipo:`… del panel) también está en el registro, con sus buscadores: el parser lo
 * reconoce solo en esos y lo devuelve aparte (`extra`) para que ese buscador lo use. En los demás,
 * `orden:algo` es texto.
 */

/** @typedef {'sitio' | 'bot' | 'panel'} Engine */
/** @typedef {'calendario' | 'material' | 'amigues' | 'wiki' | 'serie'} DocType */

/**
 * Un operador del registro.
 *
 * @typedef {{
 *   id: string,
 *   names: readonly string[],
 *   short?: readonly string[],
 *   prefix?: string,
 *   kind: 'type' | 'tag' | 'person' | 'place' | 'when' | 'since' | 'until' | 'extra',
 *   types?: readonly DocType[],
 *   engines: readonly Engine[],
 *   public: boolean,
 *   example: string,
 *   help: string
 * }} Operator
 * `names`: cómo se escribe (sin tildes ni mayúsculas, la primera es la forma larga de la guía);
 * `short`: las formas cortas; `prefix`: el signo que lo reemplaza (`#`, `@`); `types`: qué tipos
 * de resultado deja (los de tipo) o cuál implica (los que solo sirven para eventos); `public`: un
 * operador que no es público nunca anda en el sitio ni en el bot, aunque se lo liste ahí por error.
 */

const ALL = /** @type {const} */ (['sitio', 'bot', 'panel']);
const PANEL = /** @type {const} */ (['panel']);

/** @type {readonly Operator[]} */
export const OPERATORS = Object.freeze([
	{
		id: 'evento',
		names: ['evento', 'eventos'],
		short: ['e'],
		kind: 'type',
		types: ['calendario'],
		engines: ALL,
		public: true,
		example: 'evento: cuerdas',
		help: 'Solo eventos.'
	},
	{
		id: 'material',
		names: ['material', 'materiales'],
		short: ['m'],
		kind: 'type',
		types: ['material'],
		engines: ALL,
		public: true,
		example: 'material: consentimiento',
		help: 'Solo material.'
	},
	{
		id: 'wiki',
		names: ['wiki', 'kinkipedia'],
		short: ['w'],
		kind: 'type',
		types: ['wiki', 'serie'],
		engines: ALL,
		public: true,
		example: 'wiki: aftercare',
		help: 'Solo la Kinkipedia (entradas y series).'
	},
	{
		id: 'serie',
		names: ['serie', 'series'],
		short: ['s'],
		kind: 'type',
		types: ['serie'],
		engines: ALL,
		public: true,
		example: 'serie: picantearla',
		help: 'Solo series.'
	},
	{
		id: 'amigues',
		names: ['amigues', 'amigue'],
		short: ['a'],
		kind: 'type',
		types: ['amigues'],
		engines: ALL,
		public: true,
		example: 'amigues: cuerdas',
		help: 'Solo amigues.'
	},
	{
		id: 'etiqueta',
		names: ['etiqueta'],
		prefix: '#',
		kind: 'tag',
		engines: ALL,
		public: true,
		example: '#shibari',
		help: 'Con esa etiqueta (o una hija), por su nombre o sus otros nombres.'
	},
	{
		id: 'persona',
		names: [],
		prefix: '@',
		kind: 'person',
		engines: ALL,
		public: true,
		example: '@gorrite',
		help: 'Lo que esa persona firma u organiza.'
	},
	{
		id: 'lugar',
		names: ['lugar'],
		kind: 'place',
		types: ['calendario'],
		engines: ALL,
		public: true,
		example: 'lugar: palermo',
		help: 'Eventos en ese lugar (su nombre, barrio o ciudad).'
	},
	{
		id: 'cuando',
		names: ['cuando'],
		kind: 'when',
		types: ['calendario'],
		engines: ALL,
		public: true,
		example: 'cuando: sabado',
		help: 'Eventos ese día, esa fecha (15/10), ese mes o en un rango (1/11..30/11).'
	},
	{
		id: 'desde',
		names: ['desde'],
		kind: 'since',
		types: ['calendario'],
		engines: ALL,
		public: true,
		example: 'desde: 1/11',
		help: 'Eventos desde ese día.'
	},
	{
		id: 'hasta',
		names: ['hasta'],
		kind: 'until',
		types: ['calendario'],
		engines: ALL,
		public: true,
		example: 'hasta: hoy',
		help: 'Eventos hasta ese día.'
	},
	// Solo en el panel: el parser los reconoce ahí y los devuelve en `extra`.
	{
		id: 'persona-panel',
		names: ['persona'],
		kind: 'extra',
		engines: PANEL,
		public: false,
		example: 'persona: ana',
		help: 'Solo personas y perfiles.'
	},
	{
		id: 'orden',
		names: ['orden'],
		kind: 'extra',
		engines: PANEL,
		public: false,
		example: 'orden: pendiente',
		help: 'Solo órdenes (o las de ese estado).'
	},
	{
		id: 'estado',
		names: ['estado'],
		kind: 'extra',
		engines: PANEL,
		public: false,
		example: 'estado: aprobada',
		help: 'Órdenes en ese estado.'
	},
	{
		id: 'tipo',
		names: ['tipo'],
		kind: 'extra',
		engines: PANEL,
		public: false,
		example: 'tipo: orden,persona',
		help: 'Solo esos tipos.'
	}
]);

/** Largo máximo de lo buscado (docs/buscar.md: lo mismo en los tres buscadores). */
export const QUERY_MAX = 100;

/**
 * Los operadores de un buscador, por cómo se escriben (sin tildes). Un operador que no es público
 * no entra en el sitio ni en el bot.
 * @type {Map<Engine, Map<string, Operator>>}
 */
const KEYS_BY_ENGINE = new Map();
for (const engine of ALL) {
	/** @type {Map<string, Operator>} */
	const keys = new Map();
	for (const op of OPERATORS) {
		if (!op.engines.includes(engine)) continue;
		if (!op.public && engine !== 'panel') continue;
		for (const name of [...op.names, ...(op.short ?? [])]) keys.set(name, op);
	}
	KEYS_BY_ENGINE.set(engine, keys);
}

/**
 * El operador que es `key` en ese buscador, o `null`.
 * @param {string} key ya sin tildes ni mayúsculas
 * @param {Engine} engine
 */
export function operatorFor(key, engine) {
	return KEYS_BY_ENGINE.get(engine)?.get(key) ?? null;
}

/**
 * Las palabras sueltas que nombran un tipo: no son obligatorias, suben lo de ese tipo (docs/buscar.md,
 * «Las palabras ordenan, los operadores filtran»).
 * @type {Readonly<Record<string, readonly DocType[]>>}
 */
export const TYPE_WORDS = Object.freeze({
	evento: ['calendario'],
	eventos: ['calendario'],
	taller: ['calendario'],
	talleres: ['calendario'],
	material: ['material'],
	materiales: ['material'],
	wiki: ['wiki', 'serie'],
	kinkipedia: ['wiki', 'serie'],
	serie: ['serie'],
	series: ['serie'],
	amigue: ['amigues'],
	amigues: ['amigues']
});

/* ------------------------------------------------------------------ */
/* Fechas                                                               */
/* ------------------------------------------------------------------ */

/**
 * @typedef {{ kind: 'hoy' | 'manana' | 'semana' | 'finde' }
 *   | { kind: 'weekday', weekday: number }
 *   | { kind: 'date', day: number, month: number, year?: number }
 *   | { kind: 'month', month: number, offset?: number }
 *   | { kind: 'range', from?: When, to?: When }} When
 * `month`: un mes por nombre (`month` 1–12, el próximo con ese nombre) o relativo (`offset` 0
 * este mes, 1 el que viene; entonces `month` es 0). `range`: `cuando:a..b`, `desde:` y `hasta:`
 * (cada punta, una fecha de las otras: se toma su primer día o su último).
 */

export const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

export const MONTHS = [
	'enero',
	'febrero',
	'marzo',
	'abril',
	'mayo',
	'junio',
	'julio',
	'agosto',
	'septiembre',
	'octubre',
	'noviembre',
	'diciembre'
];

/** Palabras de fecha que valen solas, sin `cuando:` (con la regla de respaldo del sitio y el bot). */
const BARE_WHEN = /** @type {Record<string, 'hoy' | 'manana' | 'semana' | 'finde'>} */ ({
	hoy: 'hoy',
	manana: 'manana',
	semana: 'semana',
	finde: 'finde'
});

/** @param {string} v ya sin tildes @returns {number} 1–12, o 0 */
function monthOf(v) {
	if (v === 'setiembre') return 9;
	const i = MONTHS.findIndex((m) => m === v || (v.length >= 3 && m.startsWith(v)));
	return i + 1;
}

/**
 * Lo que va después de `cuando:` (o una palabra de fecha suelta): `hoy`, `manana`, `semana`,
 * `finde`, un día de la semana, un mes, una fecha `d/m` o `d/m/aaaa`, o un rango `a..b`.
 * @param {string} v ya sin tildes
 * @returns {When | null}
 */
export function parseWhen(v) {
	const range = /^(.*)\.\.(.*)$/.exec(v);
	if (range) {
		const from = range[1] ? parseWhen(range[1]) : null;
		const to = range[2] ? parseWhen(range[2]) : null;
		if ((range[1] && !from) || (range[2] && !to) || (!from && !to)) return null;
		if (from?.kind === 'range' || to?.kind === 'range') return null;
		return { kind: 'range', ...(from ? { from } : {}), ...(to ? { to } : {}) };
	}
	const bare = BARE_WHEN[v];
	if (bare) return /** @type {When} */ ({ kind: bare });
	const wd = WEEKDAYS.findIndex((d) => d === v || (v.length >= 3 && d.startsWith(v)));
	if (wd !== -1) return { kind: 'weekday', weekday: wd };
	const month = monthOf(v);
	if (month) return { kind: 'month', month };
	const m = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2}|\d{4}))?$/.exec(v);
	if (m) {
		const day = Number(m[1]);
		const mo = Number(m[2]);
		if (day < 1 || day > 31 || mo < 1 || mo > 12) return null;
		if (!m[3]) return { kind: 'date', day, month: mo };
		const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
		return { kind: 'date', day, month: mo, year };
	}
	return null;
}

/** Desfase de Argentina (UTC−3, sin horario de verano). */
const AR_OFFSET_MS = -3 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

/** El día (Argentina, `YYYY-MM-DD`) de un momento. @param {number} ms */
export const arDay = (ms) => new Date(ms + AR_OFFSET_MS).toISOString().slice(0, 10);

/** @param {number} y @param {number} m 1–12 @param {number} d */
const ymd = (y, m, d) =>
	`${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Último día del mes. @param {number} y @param {number} m 1–12 */
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/**
 * Días (Argentina, `YYYY-MM-DD`, ambos incluidos) que abarca una fecha pedida, contando desde
 * `now`. `semana`: de hoy al domingo; `finde`: de viernes a domingo (si ya es finde, de hoy al
 * domingo); un día de la semana: el próximo (hoy cuenta); un mes: el próximo con ese nombre (este,
 * si es este). Un rango puede quedar abierto de un lado (`from` o `to` vacío). Una fecha sin año
 * fuera de un rango: `null` (se compara solo día y mes; ver {@link dayInWhen}).
 * @param {When} when
 * @param {number} [now]
 * @returns {{ from: string, to: string } | null}
 */
export function whenRange(when, now = Date.now()) {
	const today = arDay(now);
	const [ty, tm] = today.split('-').map(Number);
	const wd = new Date(`${today}T12:00:00Z`).getUTCDay();
	const plus = (/** @type {number} */ n) => arDay(now + n * DAY_MS);
	switch (when.kind) {
		case 'hoy':
			return { from: today, to: today };
		case 'manana':
			return { from: plus(1), to: plus(1) };
		case 'semana':
			return { from: today, to: plus((7 - wd) % 7) };
		case 'finde':
			return wd === 5 || wd === 6 || wd === 0
				? { from: today, to: plus((7 - wd) % 7) }
				: { from: plus(5 - wd), to: plus(7 - wd) };
		case 'weekday': {
			const d = plus((when.weekday - wd + 7) % 7);
			return { from: d, to: d };
		}
		case 'month': {
			let y = ty;
			let m = when.month;
			if (!m) {
				m = tm + (when.offset ?? 0);
				if (m > 12) [y, m] = [y + 1, m - 12];
			} else if (m < tm) y++;
			return { from: ymd(y, m, 1), to: ymd(y, m, lastDay(y, m)) };
		}
		case 'date': {
			if (!when.year) return null;
			const d = ymd(when.year, when.month, when.day);
			return { from: d, to: d };
		}
		case 'range': {
			/** @param {When | undefined} w @param {'from' | 'to'} side */
			const end = (w, side) => {
				if (!w) return side === 'from' ? '0000-01-01' : '9999-12-31';
				// En un rango, una fecha sin año es de este año.
				const r =
					w.kind === 'date' && !w.year ? whenRange({ ...w, year: ty }, now) : whenRange(w, now);
				return r ? r[side] : side === 'from' ? '0000-01-01' : '9999-12-31';
			};
			let from = end(when.from, 'from');
			let to = end(when.to, 'to');
			// `1/12..15/1`: la segunda punta, del año que viene.
			if (to < from && when.to?.kind === 'date' && !when.to.year) {
				to = ymd(Number(to.slice(0, 4)) + 1, Number(to.slice(5, 7)), Number(to.slice(8, 10)));
			}
			return { from, to };
		}
	}
	return null;
}

/**
 * ¿Algo que va del día `start` al día `end` (Argentina, `YYYY-MM-DD`) cae en esa fecha? Si dura
 * varios días, vale con que alguno caiga adentro.
 * @param {string} start
 * @param {string} end
 * @param {When} when
 * @param {number} [now]
 */
export function dayInWhen(start, end, when, now = Date.now()) {
	if (end < start) end = start;
	if (when.kind === 'date' && !when.year) {
		const [, m, d] = start.split('-').map(Number);
		return m === when.month && d === when.day;
	}
	const range = whenRange(when, now);
	return (
		Boolean(range) &&
		start <= /** @type {any} */ (range).to &&
		end >= /** @type {any} */ (range).from
	);
}

/* ------------------------------------------------------------------ */
/* Lectura                                                              */
/* ------------------------------------------------------------------ */

/**
 * Texto para comparar sin distinguir mayúsculas ni tildes ("Ñandú José" → "nandu jose").
 * @param {unknown} value
 */
export function foldQuery(value) {
	return String(value ?? '')
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * @typedef {{ neg: boolean, key: string | null, value: string, quoted: boolean, src: string }} Piece
 */

/**
 * Parte lo escrito en pedazos: separa por espacios y respeta las comillas (`"dos palabras"`,
 * `lugar:"club x"`, `-"sin esto"`). Una comilla sin cerrar llega hasta el final.
 * @param {string} raw
 * @returns {Piece[]}
 */
export function splitQuery(raw) {
	/** @type {Piece[]} */
	const out = [];
	const s = String(raw ?? '');
	let i = 0;
	while (i < s.length) {
		while (i < s.length && /\s/.test(s[i])) i++;
		if (i >= s.length) break;
		const from = i;
		let neg = false;
		if (s[i] === '-' && i + 1 < s.length && !/\s/.test(s[i + 1])) {
			neg = true;
			i++;
		}
		/** @type {string | null} */
		let key = null;
		let value = '';
		let quoted = false;
		// `clave:` pegado a una comilla: el valor es lo de adentro.
		const keyed = /^([\p{L}]+):"/u.exec(s.slice(i));
		if (keyed) {
			key = keyed[1];
			i += keyed[0].length - 1;
		}
		if (s[i] === '"') {
			quoted = true;
			const end = s.indexOf('"', i + 1);
			value = s.slice(i + 1, end === -1 ? s.length : end);
			i = end === -1 ? s.length : end + 1;
		} else {
			let j = i;
			while (j < s.length && !/\s/.test(s[j]) && s[j] !== '"') j++;
			value = s.slice(i, j);
			i = j;
		}
		if (!value && !quoted && !key) continue;
		out.push({ neg, key, value, quoted, src: s.slice(from, i) });
	}
	return out;
}

/**
 * Lo entendido de una búsqueda. Todo sin tildes ni mayúsculas salvo `text` y `extra[].value`.
 *
 * @typedef {object} ParsedSearch
 * @prop {string} raw lo que se escribió (cortado a {@link QUERY_MAX})
 * @prop {string[]} words palabras sueltas: tienen que estar todas
 * @prop {string[]} phrases frases entre comillas: esas palabras juntas y en ese orden
 * @prop {string[]} hints palabras sueltas que nombran un tipo (`evento`, `taller`…): no son
 *   obligatorias, suben lo de ese tipo
 * @prop {DocType[]} hintTypes los tipos que suben esas palabras
 * @prop {string[]} exclude palabras o frases que no tienen que estar
 * @prop {DocType[] | null} types qué tipos pueden salir por los operadores de tipo (`null`: todos)
 * @prop {DocType[]} excludeTypes tipos que no (`-evento:`)
 * @prop {DocType[] | null} implied el tipo que implican los operadores de un solo tipo (`lugar:`,
 *   las fechas): `['calendario']` o `null`
 * @prop {string[]} tags etiquetas pedidas (`#…`, `etiqueta:…`): tienen que estar todas
 * @prop {string[]} excludeTags etiquetas que no
 * @prop {string[]} people personas pedidas (`@…`)
 * @prop {string[]} excludePeople personas que no
 * @prop {string[]} places lugares pedidos (`lugar:…`)
 * @prop {string[]} excludePlaces lugares que no
 * @prop {{ when: When, soft: boolean, src: string }[]} dates fechas pedidas (todas tienen que
 *   cumplirse); `soft`: una palabra suelta (`finde`, `noviembre`), que en el sitio y el bot vuelve a
 *   ser texto si no deja nada (la regla de respaldo; ver `datesAsText`)
 * @prop {{ op: Operator, key: string, value: string, neg: boolean, quoted: boolean }[]} extra los
 *   operadores propios de ese buscador (en el orden escrito), para que los use él
 * @prop {string} text las palabras y frases, como se escribieron
 * @prop {boolean} operators si se usó algún operador
 */

/**
 * Lee lo escrito en un buscador. Nunca falla: lo que no entiende queda como texto.
 *
 * @param {unknown} raw
 * @param {Engine} engine
 * @param {{ datesAsText?: boolean }} [opts] `datesAsText`: las palabras de fecha sueltas son texto
 *   (la segunda pasada de la regla de respaldo)
 * @returns {ParsedSearch}
 */
export function parseSearch(raw, engine, { datesAsText = false } = {}) {
	const s = String(raw ?? '').slice(0, QUERY_MAX);
	/** @type {ParsedSearch} */
	const pq = {
		raw: s,
		words: [],
		phrases: [],
		hints: [],
		hintTypes: [],
		exclude: [],
		types: null,
		excludeTypes: [],
		implied: null,
		tags: [],
		excludeTags: [],
		people: [],
		excludePeople: [],
		places: [],
		excludePlaces: [],
		dates: [],
		extra: [],
		text: '',
		operators: false
	};
	/** @type {string[]} */
	const textParts = [];
	/** @type {{ when: When, src: string }[]} */
	const since = [];
	/** @type {{ when: When, src: string }[]} */
	const until = [];

	/** @param {string} original @param {boolean} [phrase] */
	const addText = (original, phrase = false) => {
		const f = foldQuery(original);
		if (!f) return;
		if (phrase) pq.phrases.push(f);
		else pq.words.push(...f.split(' '));
		textParts.push(original.trim());
	};
	/** @param {DocType[]} types */
	const addTypes = (types) => {
		pq.types = [...new Set([...(pq.types ?? []), ...types])];
	};
	const implyEvents = () => {
		pq.implied = ['calendario'];
	};
	/** @param {When} when @param {boolean} soft @param {string} src */
	const addDate = (when, soft, src) => {
		pq.dates.push({ when, soft, src });
		pq.operators = true;
		implyEvents();
	};

	const pieces = splitQuery(s);
	for (let pi = 0; pi < pieces.length; pi++) {
		const t = pieces[pi];
		let key = t.key;
		let value = t.value;
		if (!key && !t.quoted) {
			const m = /^([\p{L}]+):(.*)$/su.exec(value);
			if (m && operatorFor(foldQuery(m[1]), engine)) {
				key = m[1];
				value = m[2];
			} else if (value.length > 1 && value.startsWith('#')) {
				key = 'etiqueta';
				value = value.slice(1);
			} else if (value.length > 1 && value.startsWith('@')) {
				key = '@';
				value = value.slice(1);
			}
		}
		const k = key ? foldQuery(key) : null;
		const op =
			k === '@'
				? /** @type {Operator} */ (OPERATORS.find((o) => o.id === 'persona'))
				: k
					? operatorFor(k, engine)
					: null;

		if (k && !op) {
			// `algo:"…"` con una clave que no existe: va como texto.
			if (t.neg) pq.exclude.push(foldQuery(`${key}:${value}`));
			else addText(`${key}:${value}`, t.quoted);
			continue;
		}

		if (!op) {
			const v = foldQuery(value);
			if (!v) continue;
			if (t.neg) {
				pq.exclude.push(v);
				pq.operators = true;
				continue;
			}
			if (t.quoted) {
				addText(value, true);
				pq.operators = true;
				continue;
			}
			if (!datesAsText) {
				// «este mes», «mes que viene», «esta semana»: más de una pieza.
				const next = (/** @type {number} */ n) => {
					const p = pieces[pi + n];
					return p && !p.key && !p.neg && !p.quoted ? foldQuery(p.value) : '';
				};
				if (v === 'este' && next(1) === 'mes') {
					addDate({ kind: 'month', month: 0, offset: 0 }, true, `${value} ${pieces[pi + 1].value}`);
					pi += 1;
					continue;
				}
				if (v === 'mes' && next(1) === 'que' && next(2) === 'viene') {
					addDate({ kind: 'month', month: 0, offset: 1 }, true, `${value} que viene`);
					pi += 2;
					continue;
				}
				if (v === 'esta' && next(1) === 'semana') {
					addDate({ kind: 'semana' }, true, `${value} ${pieces[pi + 1].value}`);
					pi += 1;
					continue;
				}
				const bare = BARE_WHEN[v];
				const month = bare ? 0 : MONTHS.includes(v) || v === 'setiembre' ? monthOf(v) : 0;
				if (bare || month) {
					addDate(
						bare ? /** @type {When} */ ({ kind: bare }) : { kind: 'month', month },
						true,
						value
					);
					continue;
				}
			}
			const hint = TYPE_WORDS[v];
			if (hint) {
				pq.hints.push(v);
				pq.hintTypes = [...new Set([...pq.hintTypes, ...hint])];
				textParts.push(value);
				continue;
			}
			addText(value);
			continue;
		}

		// Un operador. `nombre:` solo: el valor es la pieza siguiente, si no es otro operador.
		if (!value && !t.quoted && op.kind !== 'type') {
			const n = pieces[pi + 1];
			if (n && !n.neg && !n.key && !/^[#@]/.test(n.value)) {
				const m = /^([\p{L}]+):/u.exec(n.value);
				if (!(m && operatorFor(foldQuery(m[1]), engine))) {
					value = n.value;
					t.quoted = n.quoted;
					pi++;
				}
			}
		}
		const v = foldQuery(value);
		pq.operators = true;

		if (op.kind === 'extra') {
			pq.extra.push({ op, key: k ?? '', value, neg: t.neg, quoted: t.quoted });
			continue;
		}
		if (t.neg) {
			if (op.kind === 'type') pq.excludeTypes.push(...(op.types ?? []));
			else if (op.kind === 'tag') v && pq.excludeTags.push(v);
			else if (op.kind === 'person') v && pq.excludePeople.push(v);
			else if (op.kind === 'place') v && pq.excludePlaces.push(v);
			else if (v) pq.exclude.push(v);
			continue;
		}
		switch (op.kind) {
			case 'type':
				addTypes([...(op.types ?? [])]);
				// `evento:cuerdas` o `evento: cuerdas`: el resto es texto.
				if (value) addText(value, t.quoted);
				break;
			case 'tag':
				if (v) pq.tags.push(v);
				break;
			case 'person':
				if (v) pq.people.push(v);
				break;
			case 'place':
				if (v) {
					pq.places.push(v);
					implyEvents();
				}
				break;
			case 'when':
			case 'since':
			case 'until': {
				const w = v ? parseWhen(v) : null;
				if (!w || (op.kind !== 'when' && w.kind === 'range')) {
					if (value) addText(`${key}:${value}`);
					break;
				}
				if (op.kind === 'when') addDate(w, false, t.src);
				else (op.kind === 'since' ? since : until).push({ when: w, src: t.src });
				break;
			}
		}
	}
	// `desde:a hasta:b` = `cuando:a..b`.
	for (let i = 0; i < Math.max(since.length, until.length); i++) {
		const from = since[i]?.when;
		const to = until[i]?.when;
		addDate(
			{ kind: 'range', ...(from ? { from } : {}), ...(to ? { to } : {}) },
			false,
			[since[i]?.src, until[i]?.src].filter(Boolean).join(' ')
		);
	}
	pq.text = textParts.filter(Boolean).join(' ');
	return pq;
}

/**
 * ¿Qué tipos pueden salir? Los de los operadores de tipo, acotados por lo que implican los demás
 * (`lugar:`, las fechas) y sin los excluidos. `null`: todos.
 * @param {ParsedSearch} pq
 * @returns {DocType[] | null}
 */
export function allowedTypes(pq) {
	/** @type {DocType[] | null} */
	let types = pq.types;
	if (pq.implied) types = types ? types.filter((x) => pq.implied?.includes(x)) : [...pq.implied];
	if (pq.excludeTypes.length) {
		types ??= ['calendario', 'material', 'amigues', 'wiki', 'serie'];
		types = types.filter((x) => !pq.excludeTypes.includes(x));
	}
	return types;
}
