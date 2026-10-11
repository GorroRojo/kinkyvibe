/**
 * Operadores del buscador del panel (la paleta de comandos): arma, a partir de lo que se escribió,
 * qué se busca y con qué filtros. Puro (sin base ni DOM): lo usan la paleta (para las acciones y
 * para saber si hace falta preguntarle al servidor) y /admin/buscar (para los registros).
 *
 * Operadores (sin mayúsculas ni tildes; ver docs/panel.md):
 * - `>tema`: solo acciones (tiene que ir al comienzo).
 * - `#shibari` o `etiqueta:shibari`: eventos con esa etiqueta (también por alias) y la etiqueta.
 * - `@ana` o `persona:ana`: solo personas y perfiles.
 * - `e:latex` o `evento:latex`: solo eventos; una palabra de pestaña al final (`puerta`,
 *   `ordenes`, `mail`, `ventas`, `duplicar`) lleva directo a esa pestaña del primero.
 * - `orden:ana`: solo órdenes; `orden:pendiente` o `estado:pendiente`, las órdenes en ese estado.
 * - `tipo:evento` (orden, persona, perfil, etiqueta, entrada, codigo, accion; con coma, varios).
 * - `lugar:palermo`: eventos en ese lugar.
 * - `hoy`, `mañana`, `semana` («esta semana»), `finde`: eventos en esos días (y las acciones
 *   siguen apareciendo, como «Abrir la puerta de hoy»); con `cuando:` también un día de la
 *   semana (`cuando:sabado`) o una fecha (`cuando:15/10`).
 * - `"frase exacta"`: esas palabras juntas y en ese orden.
 * - `-palabra` (o `-"frase"`, `-#etiqueta`, `-tipo:orden`): sin eso.
 * Las palabras sueltas tienen que estar todas, en cualquier orden. Un `algo:` que no es un
 * operador se busca como texto (`20:30`, `foo:bar`).
 */

/**
 * @typedef {'actions' | 'events' | 'orders' | 'people' | 'profiles' | 'tags' | 'tickets' | 'codes'} SearchKind
 * @typedef {{ kind: 'hoy' | 'manana' | 'semana' | 'finde' } | { kind: 'weekday', weekday: number } | { kind: 'date', day: number, month: number, year?: number }} When
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

/**
 * Texto para comparar sin distinguir mayúsculas ni tildes ("Ñandú José" → "nandu jose"). Igual
 * que `foldText` de la parte del servidor, pero acá para que lo use también el navegador.
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

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

/** Palabras de fecha que valen solas, sin `cuando:`. */
const BARE_WHEN = /** @type {Record<string, 'hoy' | 'manana' | 'semana' | 'finde'>} */ ({
	hoy: 'hoy',
	manana: 'manana',
	semana: 'semana',
	finde: 'finde'
});

/**
 * Lo que va después de `cuando:` (o una palabra de fecha suelta).
 * @param {string} v ya sin tildes
 * @returns {When | null}
 */
export function parseWhen(v) {
	const bare = BARE_WHEN[v];
	if (bare) return /** @type {When} */ ({ kind: bare });
	const wd = WEEKDAYS.findIndex((d) => d === v || (v.length >= 3 && d.startsWith(v)));
	if (wd !== -1) return { kind: 'weekday', weekday: wd };
	const m = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2}|\d{4}))?$/.exec(v);
	if (m) {
		const day = Number(m[1]);
		const month = Number(m[2]);
		if (day < 1 || day > 31 || month < 1 || month > 12) return null;
		if (!m[3]) return { kind: 'date', day, month };
		const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
		return { kind: 'date', day, month, year };
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

const KEYS = new Set([
	'etiqueta',
	'persona',
	'e',
	'evento',
	'orden',
	'estado',
	'tipo',
	'lugar',
	'cuando'
]);

/**
 * Parte lo escrito en pedazos: separa por espacios y respeta las comillas (`"dos palabras"`,
 * `lugar:"club x"`, `-"sin esto"`). Una comilla sin cerrar llega hasta el final.
 * @param {string} raw
 * @returns {{ neg: boolean, key: string | null, value: string, quoted: boolean, src: string }[]}
 */
export function splitQuery(raw) {
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
		if (!value && !quoted && !key) {
			// Un `-` suelto pegado a una comilla rota, o similar: se ignora.
			continue;
		}
		out.push({ neg, key, value, quoted, src: s.slice(from, i) });
	}
	return out;
}

/**
 * Lee lo escrito en el buscador del panel. Nunca falla: lo que no entiende queda como texto.
 * @param {string} raw
 * @returns {ParsedQuery}
 */
export function parseSearchQuery(raw) {
	let s = String(raw ?? '').slice(0, 200);
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
	let eventScope = false;
	let whenIsFilter = false;
	/** Palabras y frases como se escribieron (para `text`; las que se sacan quedan vacías). */
	/** @type {string[]} */
	const textParts = [];
	/** Para cada palabra de `pq.words`, dónde está en `textParts`. */
	/** @type {number[]} */
	const wordAt = [];
	/** @type {string[]} */
	const actionParts = [];

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
	/** @param {string} original @param {boolean} [phrase] */
	const addText = (original, phrase = false) => {
		const f = foldQuery(original);
		if (!f) return;
		if (phrase) pq.phrases.push(f);
		else {
			pq.words.push(f);
			wordAt.push(textParts.length);
		}
		textParts.push(original.trim());
		actionParts.push(original.trim());
	};

	if (s.trimStart().startsWith('>')) {
		addScope(['actions']);
		s = s.trimStart().slice(1);
	}

	const tokens = splitQuery(s);
	for (let ti = 0; ti < tokens.length; ti++) {
		const t = tokens[ti];
		let key = t.key;
		let value = t.value;
		if (!key && !t.quoted) {
			const m = /^([\p{L}]+):(.*)$/su.exec(value);
			if (m && KEYS.has(foldQuery(m[1]))) {
				key = m[1];
				value = m[2];
			} else if (value.startsWith('#')) {
				key = 'etiqueta';
				value = value.slice(1);
			} else if (value.startsWith('@')) {
				key = 'persona';
				value = value.slice(1);
			}
		}
		const k = key ? foldQuery(key) : null;
		const v = foldQuery(value);

		if (k && !KEYS.has(k)) {
			// `algo:"…"` con una clave que no existe: va como texto.
			if (t.neg) pq.exclude.push(foldQuery(`${key}:${value}`));
			else addText(`${key}:${value}`, t.quoted);
			continue;
		}

		if (!k) {
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
			const bare = BARE_WHEN[v];
			if (bare && !pq.when) {
				pq.when = { kind: bare };
				pq.operators = true;
				actionParts.push(value);
				// «esta semana»: el «esta» de antes no es texto.
				const prev = tokens[ti - 1];
				if (bare === 'semana' && prev && !prev.key && !prev.neg && !prev.quoted) {
					if (foldQuery(prev.value) === 'esta' && pq.words.at(-1) === 'esta') {
						pq.words.pop();
						textParts[/** @type {number} */ (wordAt.pop())] = '';
					}
				}
				continue;
			}
			addText(value);
			continue;
		}

		// Operadores con clave.
		if (t.neg) {
			pq.operators = true;
			if (k === 'etiqueta') {
				if (v) pq.excludeTags.push(v);
			} else if (k === 'tipo') {
				for (const part of v.split(','))
					for (const kind of TIPO[part.trim()] ?? []) notKinds.add(kind);
			} else if (v) pq.exclude.push(v);
			continue;
		}
		switch (k) {
			case 'etiqueta':
				if (!v) break;
				pq.tags.push(v);
				addFilter(['events', 'tags']);
				break;
			case 'persona':
				addScope(['people', 'profiles']);
				if (value) addText(value, t.quoted);
				break;
			case 'e':
			case 'evento':
				addScope(['events']);
				eventScope = true;
				if (value) addText(value, t.quoted);
				break;
			case 'orden': {
				addScope(['orders']);
				const st = t.quoted ? null : orderStatusWord(v);
				if (st) pq.status = st;
				else if (value) addText(value, t.quoted);
				break;
			}
			case 'estado': {
				const st = orderStatusWord(v);
				if (st) {
					pq.status = st;
					addFilter(['orders']);
				} else if (value) addText(`${key}:${value}`);
				break;
			}
			case 'tipo': {
				const kinds = v
					.split(',')
					.map((p) => TIPO[p.trim()])
					.filter(Boolean)
					.flat();
				if (kinds.length) addScope(kinds);
				else if (value) addText(`${key}:${value}`);
				break;
			}
			case 'lugar':
				if (!v) break;
				pq.places.push(v);
				addFilter(['events']);
				break;
			case 'cuando': {
				const w = parseWhen(v);
				if (w) {
					pq.when = w;
					whenIsFilter = true;
					pq.operators = true;
				} else if (value) addText(`${key}:${value}`);
				break;
			}
		}
	}

	// `e:latex puerta`: la última palabra de pestaña lleva a esa pestaña.
	if (eventScope) {
		for (let i = pq.words.length - 1; i >= 0; i--) {
			const tab = TAB_WORDS[pq.words[i]];
			if (tab && pq.words.length > 1) {
				pq.tab = tab;
				pq.words.splice(i, 1);
				textParts[wordAt.splice(i, 1)[0]] = '';
				break;
			}
		}
	}

	// Las fechas filtran eventos; las acciones siguen (salvo con `cuando:`, que es un filtro).
	if (pq.when) addFilter(whenIsFilter ? ['events'] : ['events', 'actions']);

	/** @type {Set<SearchKind> | null} */
	let kinds = scope;
	if (filtered)
		kinds = kinds ? new Set([...kinds].filter((x) => filterKinds.has(x))) : new Set(filterKinds);
	if (notKinds.size) {
		kinds ??= new Set(
			/** @type {SearchKind[]} */ ([
				'actions',
				'events',
				'orders',
				'people',
				'profiles',
				'tags',
				'tickets',
				'codes'
			])
		);
		for (const x of notKinds) kinds.delete(x);
	}
	pq.kinds = kinds ? [...kinds] : null;
	pq.text = textParts.filter(Boolean).join(' ');
	pq.actionText = actionParts.join(' ');
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

/** Desfase de Argentina (UTC−3, sin horario de verano). */
const AR_OFFSET_MS = -3 * 60 * 60 * 1000;

/** @param {number} ms */
const dayOf = (ms) => new Date(ms + AR_OFFSET_MS).toISOString().slice(0, 10);

/**
 * Días (Argentina, `YYYY-MM-DD`, ambos incluidos) que abarca una fecha pedida, contando desde
 * `now`. `semana`: de hoy al domingo; `finde`: de viernes a domingo (si ya es finde, de hoy al
 * domingo); un día de la semana: el próximo (hoy cuenta). Una fecha sin año: `null` (se compara
 * solo día y mes; ver {@link eventInWhen}).
 * @param {When} when
 * @param {number} [now]
 * @returns {{ from: string, to: string } | null}
 */
export function whenRange(when, now = Date.now()) {
	const DAY = 86_400_000;
	const today = dayOf(now);
	const wd = new Date(`${today}T12:00:00Z`).getUTCDay();
	const plus = (/** @type {number} */ n) => dayOf(now + n * DAY);
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
		case 'date': {
			if (!when.year) return null;
			const d = `${when.year}-${String(when.month).padStart(2, '0')}-${String(when.day).padStart(2, '0')}`;
			return { from: d, to: d };
		}
	}
	return null;
}

/**
 * ¿El evento (con `start` y `end` ISO con la hora de Argentina, `2031-10-10T21:00-03:00`) cae en
 * esos días? Un evento de varios días vale si alguno cae adentro.
 * @param {{ start?: string, end?: string }} e
 * @param {When} when
 * @param {number} [now]
 */
export function eventInWhen(e, when, now = Date.now()) {
	const start = (e.start || '').slice(0, 10);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return false;
	const endRaw = (e.end || '').slice(0, 10);
	const end = /^\d{4}-\d{2}-\d{2}$/.test(endRaw) && endRaw >= start ? endRaw : start;
	if (when.kind === 'date' && !when.year) {
		const [, m, d] = start.split('-').map(Number);
		return m === when.month && d === when.day;
	}
	const range = whenRange(when, now);
	return (
		Boolean(range) &&
		start <= /** @type {{ to: string }} */ (range).to &&
		end >= /** @type {{ from: string }} */ (range).from
	);
}
