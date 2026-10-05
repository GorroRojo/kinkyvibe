/**
 * Lugares → «Vincular lugares»: para cada «Dónde» escrito a mano en los eventos sin lugar, qué
 * perfil de lugar es probablemente, con un puntaje (0 a 100) y por qué. Funciones puras: las usan
 * el panel y sus pruebas, sin base. Ver docs/amigues.md «Vincular lugares».
 *
 * Señales (la más fuerte manda; cada señal fuerte de más suma un poco):
 * - **mismo nombre** (el nombre del evento = el nombre del lugar o su dirección en el sitio, sin
 *   importar mayúsculas, tildes ni puntuación): 100;
 * - **misma calle y número** («Av. Boedo 830» = «Avenida Boedo 830, CABA»): 95; con la calle
 *   escrita parecido y el mismo número, 80;
 * - **mismo punto del mapa** (el link al mapa del evento cae a menos de 150 m del lugar): 90;
 * - **nombre parecido** (similitud de letras, o un nombre contiene al otro): hasta 85;
 * - **dirección parecida** (sin número que coincida): hasta 70.
 * Si el nombre coincide pero las dos direcciones tienen número y son distintas, baja (¿se mudó? ¿es
 * otro lugar con el mismo nombre?).
 */
import { addressKey, coordsFromMapLink, normalizePlaceText } from './venueImport.js';
import { textOrNull } from './text.js';

/** @typedef {import('./venues.js').VenuePrivacy} VenuePrivacy */

/**
 * Un perfil de lugar, con lo que hace falta para compararlo.
 * @typedef {{ id: number, slug: string, title: string, legacySlug?: string | null, data: Record<string, unknown> }} MatchVenue
 */

/**
 * Un «Dónde» de eventos (un grupo): los nombres y direcciones como los escribieron y el link al
 * mapa (`Variant` de venueImport.js).
 * @typedef {{ names: { text: string }[], locations: { text: string }[], mapUrl?: string }} MatchPlace
 */

/**
 * @typedef {{ id: number, score: number, reasons: string[] }} VenueSuggestion
 */

/** Puntaje mínimo para sugerir un lugar. */
export const MIN_SCORE = 45;
/** Desde cuánto una sugerencia se propone marcada (si le gana bien a la segunda). */
export const CONFIDENT_SCORE = 85;
/** Cuánto le tiene que ganar a la segunda para proponerse marcada. */
const CONFIDENT_GAP = 10;

/**
 * Abreviaturas de las direcciones, ya en {@link normalizePlaceText}. Los tipos de calle se sacan
 * (no ayudan a comparar: «Av. Boedo» y «Boedo» son la misma calle); los títulos se escriben enteros.
 * @type {readonly [RegExp, string][]}
 */
const STREET_WORDS = Object.freeze([
	[/\b(av|avda|avd|avenida|calle|pasaje|pje|psje|boulevard|bulevar|blvd|bv|diagonal|diag)\b/g, ' '],
	[/\b(gral|grl)\b/g, 'general'],
	[/\b(pte|pres|presid)\b/g, 'presidente'],
	[/\b(dr|dra)\b/g, 'doctor'],
	[/\b(cnel|crel)\b/g, 'coronel'],
	[/\b(tte)\b/g, 'teniente'],
	[/\b(sta)\b/g, 'santa'],
	[/\b(sto)\b/g, 'santo'],
	[/\b(ing)\b/g, 'ingeniero'],
	[/\b(prof)\b/g, 'profesor'],
	[/\b(int)\b/g, 'intendente'],
	[/\b(cap|cptan)\b/g, 'capitan'],
	[/\b(alte|almte)\b/g, 'almirante'],
	[/\b(n|nro|num|numero)\b/g, ' ']
]);

/**
 * El texto de una dirección listo para separarla: sin el punto de los miles («1.234» → «1234») y
 * sin los «°»/«º» de «N°».
 * @param {unknown} raw
 */
function cleanAddress(raw) {
	return String(raw ?? '')
		.replace(/(\d)\.(\d{3})(?!\d)/g, '$1$2')
		.replace(/[°º]/g, ' ');
}

/**
 * La calle y el número de una dirección: el primer tramo (entre comas) con un número; la calle son
 * las palabras antes del número, sin «Av.», «Calle»… y con «Gral.», «Pte.»… enteros. `null` si no
 * tiene número (un barrio, una ciudad).
 *
 * @param {unknown} raw
 * @returns {{ street: string, number: string } | null}
 */
export function parseStreet(raw) {
	const part = cleanAddress(raw)
		.split(',')
		.find((p) => /\d/.test(p));
	if (!part) return null;
	let s = ` ${normalizePlaceText(part)} `;
	for (const [re, to] of STREET_WORDS) s = s.replace(re, to);
	const words = s.split(/\s+/).filter(Boolean);
	const at = words.findIndex((w) => /^\d+$/.test(w));
	if (at <= 0) return null;
	return { street: words.slice(0, at).join(' '), number: words[at] };
}

/**
 * Clave de un nombre para comparar: {@link normalizePlaceText}, que también sirve para las
 * direcciones en el sitio («la.colectiver» = «La Colectiver»).
 * @param {unknown} raw
 */
export const nameKey = (raw) => normalizePlaceText(raw);

/**
 * Similitud entre 0 y 1 de dos textos ya normalizados (coeficiente de Dice con pares de letras, sin
 * espacios). 1 = iguales.
 * @param {string} a
 * @param {string} b
 */
export function similarity(a, b) {
	const x = a.replace(/\s+/g, '');
	const y = b.replace(/\s+/g, '');
	if (!x || !y) return 0;
	if (x === y) return 1;
	if (x.length < 2 || y.length < 2) return 0;
	/** @type {Map<string, number>} */
	const pairs = new Map();
	for (let i = 0; i < x.length - 1; i++) {
		const p = x.slice(i, i + 2);
		pairs.set(p, (pairs.get(p) ?? 0) + 1);
	}
	let both = 0;
	for (let i = 0; i < y.length - 1; i++) {
		const p = y.slice(i, i + 2);
		const n = pairs.get(p) ?? 0;
		if (n > 0) {
			both++;
			pairs.set(p, n - 1);
		}
	}
	return (2 * both) / (x.length - 1 + (y.length - 1));
}

/**
 * ¿Todas las palabras del nombre más corto están en el otro? («Galpón» y «El Galpón de Boedo».)
 * Solo con palabras de 4 letras o más, para no juntar por «el», «la», «bar»…
 * @param {string} a
 * @param {string} b
 */
function contains(a, b) {
	const [short, long] = a.length <= b.length ? [a, b] : [b, a];
	const words = short.split(' ').filter((w) => w.length >= 4);
	if (!words.length) return false;
	const set = new Set(long.split(' '));
	return words.every((w) => set.has(w));
}

/**
 * Distancia aproximada en metros entre dos puntos (suficiente para «el mismo lugar»).
 * @param {{ lat: number, lng: number }} a
 * @param {{ lat: number, lng: number }} b
 */
function meters(a, b) {
	const k = Math.PI / 180;
	const x = (b.lng - a.lng) * k * Math.cos(((a.lat + b.lat) / 2) * k);
	const y = (b.lat - a.lat) * k;
	return Math.sqrt(x * x + y * y) * 6_371_000;
}

/** @param {number} n */
const pct = (n) => `${Math.round(n * 100)} %`;

/**
 * La dirección completa de un lugar para comparar (calle, barrio y ciudad).
 * @param {Record<string, unknown>} d
 */
const venueAddress = (d) =>
	[textOrNull(d.address), textOrNull(d.area), textOrNull(d.city)].filter(Boolean).join(', ');

/**
 * Cuánto se parece un «Dónde» a un lugar, y por qué. `score` 0 = nada.
 *
 * @param {MatchPlace} place
 * @param {MatchVenue} venue
 * @returns {{ score: number, reasons: string[] }}
 */
export function matchVenue(place, venue) {
	const d = venue.data ?? {};
	const venueNames = [venue.title, venue.slug, venue.legacySlug]
		.map((n) => nameKey(n))
		.filter(Boolean);
	const names = [...new Set(place.names.map((n) => nameKey(n.text)).filter(Boolean))];
	const ownAddress = venueAddress(d);
	const ownStreet = parseStreet(textOrNull(d.address) ?? '');
	const streets = /** @type {{ street: string, number: string }[]} */ (
		place.locations.map((l) => parseStreet(l.text)).filter((s) => s !== null)
	);

	/** @type {{ score: number, reason: string, strong: boolean }[]} */
	const signals = [];

	// Nombre.
	let sameName = false;
	let bestName = { s: 0, text: '', contained: false };
	for (const n of names) {
		for (const v of venueNames) {
			if (n === v) sameName = true;
			const s = similarity(n, v);
			const contained = contains(n, v);
			if (s > bestName.s || (contained && !bestName.contained))
				bestName = { s, text: n, contained };
		}
	}

	// Calle y número.
	let sameStreet = false;
	let closeStreet = false;
	let otherNumber = false;
	if (ownStreet) {
		for (const s of streets) {
			if (s.number !== ownStreet.number) {
				if (similarity(s.street, ownStreet.street) >= 0.8) otherNumber = true;
				continue;
			}
			if (s.street === ownStreet.street) sameStreet = true;
			else if (
				similarity(s.street, ownStreet.street) >= 0.7 ||
				contains(s.street, ownStreet.street)
			)
				closeStreet = true;
		}
	}
	const differentAddress = Boolean(ownStreet) && streets.length > 0 && !sameStreet && !closeStreet;

	if (sameName) {
		if (differentAddress) {
			signals.push({
				score: 70,
				reason: `mismo nombre, pero otra dirección (el lugar: «${textOrNull(d.address)}»)`,
				strong: false
			});
		} else {
			signals.push({ score: 100, reason: `mismo nombre («${venue.title}»)`, strong: true });
		}
	} else if (bestName.s >= 0.6 || bestName.contained) {
		const score = Math.round(Math.max(bestName.s * 85, bestName.contained ? 75 : 0));
		signals.push({
			score: differentAddress ? Math.min(score, 55) : score,
			reason: bestName.contained
				? `un nombre contiene al otro («${venue.title}»)`
				: `nombre parecido (${pct(bestName.s)})`,
			strong: false
		});
	}

	if (sameStreet && ownStreet) {
		signals.push({
			score: 95,
			reason: `misma calle y número («${textOrNull(d.address)}»)`,
			strong: true
		});
	} else if (closeStreet) {
		signals.push({
			score: 80,
			reason: `mismo número y calle parecida («${textOrNull(d.address)}»)`,
			strong: true
		});
	} else if (ownAddress && !otherNumber) {
		let best = 0;
		for (const l of place.locations)
			best = Math.max(best, similarity(addressKey(l.text), addressKey(ownAddress)));
		if (best >= 0.7) {
			signals.push({
				score: Math.round(best * 70),
				reason: `dirección parecida (${pct(best)})`,
				strong: false
			});
		}
	}

	// El punto del mapa.
	const coords = coordsFromMapLink(place.mapUrl ?? '');
	if (coords && typeof d.lat === 'number' && typeof d.lng === 'number') {
		const m = meters(coords, { lat: d.lat, lng: d.lng });
		if (m <= 150) {
			signals.push({
				score: 90,
				reason: `mismo punto del mapa (a ${Math.round(m)} m)`,
				strong: true
			});
		}
	}

	if (!signals.length) return { score: 0, reasons: [] };
	signals.sort((a, b) => b.score - a.score);
	const extra = signals.slice(1).filter((s) => s.strong).length;
	return {
		score: Math.min(100, signals[0].score + 5 * extra),
		reasons: signals.map((s) => s.reason)
	};
}

/**
 * Los lugares que probablemente son ese «Dónde», del más al menos probable (solo los de
 * {@link MIN_SCORE} o más; a igual puntaje, por nombre).
 *
 * @param {MatchPlace} place
 * @param {readonly MatchVenue[]} venues
 * @param {{ limit?: number }} [opts]
 * @returns {VenueSuggestion[]}
 */
export function suggestVenues(place, venues, { limit = 3 } = {}) {
	return venues
		.map((v) => ({ id: v.id, title: v.title, ...matchVenue(place, v) }))
		.filter((s) => s.score >= MIN_SCORE)
		.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
		.slice(0, limit)
		.map(({ id, score, reasons }) => ({ id, score, reasons }));
}

/**
 * ¿La primera sugerencia es lo bastante segura para proponerla marcada en «Vincular todas las
 * marcadas»? Desde {@link CONFIDENT_SCORE} y ganándole bien a la segunda.
 * @param {readonly VenueSuggestion[]} suggestions
 */
export function isConfident(suggestions) {
	const [first, second] = suggestions;
	if (!first || first.score < CONFIDENT_SCORE) return false;
	return !second || first.score - second.score >= CONFIDENT_GAP;
}

/** De más a menos abierto (el mismo orden que `venueDefaultLevel` en venueImport.js). */
const OPENNESS = /** @type {const} */ (['public', 'name', 'address', 'area', 'hidden']);

/**
 * El nivel propio de un evento al vincularlo a un lugar que ya existe (`data.privacy` del edge
 * `lugar`; `null` = el del lugar). Si el evento mostraba menos que el nivel del lugar (por ejemplo
 * solo el nombre, y el lugar muestra nombre y dirección), lleva el suyo, así sigue mostrando lo
 * mismo. Si mostraba más, toma el del lugar: vincular nunca muestra del lugar más de lo que el
 * lugar deja ver por defecto (quien lo cargó lo eligió).
 *
 * @param {VenuePrivacy} eventLevel lo que mostraba el evento (`eventShowLevel`)
 * @param {VenuePrivacy} venueLevel el nivel del lugar
 * @returns {VenuePrivacy | null}
 */
export function linkPrivacy(eventLevel, venueLevel) {
	return OPENNESS.indexOf(eventLevel) > OPENNESS.indexOf(venueLevel) ? eventLevel : null;
}

/**
 * La clave del «Dónde» de un evento (nombre y dirección normalizados) que se guarda al «Dejar como
 * texto»: si después cambia, el evento se vuelve a sugerir.
 * @param {{ name?: string, location?: string }} place
 */
export function placeKeyOf(place) {
	return `${nameKey(place.name ?? '')}|${addressKey(place.location ?? '')}`.slice(0, 600);
}

/**
 * Lugares que coinciden con lo que se busca (en el nombre, la dirección o el barrio), para elegir
 * otro a mano. Vacío si no se escribió nada.
 *
 * @template {{ title: string, address?: string, area?: string, city?: string }} V
 * @param {readonly V[]} venues
 * @param {string} query
 * @param {number} [limit]
 * @returns {V[]}
 */
export function searchVenues(venues, query, limit = 8) {
	const words = normalizePlaceText(query).split(' ').filter(Boolean);
	if (!words.length) return [];
	return venues
		.filter((v) => {
			const hay = normalizePlaceText([v.title, v.address, v.area, v.city].join(' '));
			return words.every((w) => hay.includes(w));
		})
		.slice(0, limit);
}
