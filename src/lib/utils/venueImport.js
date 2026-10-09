/**
 * Lugares → «Importar de eventos»: arma lugares a partir del «Dónde» que ya tienen los eventos
 * (`location_name`, `location`, `location_map`; ver eventPlace.js). Funciones puras: las usan el
 * panel (vista previa y CSV) y el guardado, y se prueban sin base.
 *
 * Reglas (decisiones de gorrite, ver docs/amigues.md «Importar de eventos»):
 * - **Mismo lugar**: el mismo nombre, la misma dirección (con número) o el mismo link al mapa,
 *   sin importar mayúsculas, tildes, espacios ni puntuación ({@link normalizePlaceText},
 *   {@link addressKey}). Un barrio solo («Almagro, CABA») no es una dirección: no junta eventos
 *   con nombre (serían lugares distintos del mismo barrio); junta solo eventos sin nombre con el
 *   mismo texto.
 * - Se saltean los eventos online, los que no tienen «Dónde» y los que ya tienen lugar.
 * - **Privacidad** («si está en los archivos de los eventos, es público»): cada evento queda con el
 *   nivel que muestra lo mismo que ya mostraba ({@link eventShowLevel}) y el lugar con el más
 *   abierto de sus eventos ({@link venueDefaultLevel}); los eventos que muestran otra cosa llevan
 *   su propio nivel ({@link privacyOverride}).
 * - **Nada cambia en el sitio**: un evento se propone para vincular solo si con el lugar se ve lo
 *   mismo que ya se veía ({@link eventFit}); si no, se avisa qué cambiaría y queda sin marcar.
 */
import { textOrNull } from './text.js';
import { checkMapLink } from './eventPlace.js';
import { venueView } from './venues.js';

/** @typedef {import('./venues.js').VenuePrivacy} VenuePrivacy */

/**
 * @typedef {{
 *   slug: string,
 *   title: string,
 *   start: string,
 *   meta: Record<string, any>
 * }} ImportEvent
 */

/**
 * El «Dónde» de un evento, como lo escribió quien lo cargó.
 * @typedef {{ name: string, location: string, mapUrl: string }} EventPlaceFields
 */

/**
 * Un evento de un candidato, con qué mostraría si se vincula.
 * @typedef {EventPlaceFields & {
 *   slug: string,
 *   title: string,
 *   start: string,
 *   level: VenuePrivacy,
 *   fits: boolean,
 *   diffs: string[]
 * }} CandidateEvent
 */

/**
 * @typedef {{ text: string, count: number }} Variant
 */

/**
 * @typedef {{
 *   key: string,
 *   title: string,
 *   hasName: boolean,
 *   address: string,
 *   area: string,
 *   mapUrl: string,
 *   names: Variant[],
 *   locations: Variant[],
 *   merges: string[],
 *   events: CandidateEvent[],
 *   first: string,
 *   last: string,
 *   level: VenuePrivacy,
 *   existing: { id: number, title: string, slug: string } | null,
 *   suggested: boolean
 * }} VenueCandidate
 */

/**
 * @typedef {{ id: number, slug: string, title: string, data: Record<string, unknown> }} ExistingVenue
 */

/**
 * Texto para comparar: sin tildes, en minúsculas, sin puntuación y con un solo espacio.
 * @param {unknown} raw
 */
export function normalizePlaceText(raw) {
	return String(raw ?? '')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();
}

/**
 * Formas de escribir la misma ciudad (para comparar direcciones). Solo las que aparecen en los
 * eventos; la clave es el texto ya normalizado.
 * @type {readonly [RegExp, string][]}
 */
const CITY_ALIASES = Object.freeze([
	[/\bciudad autonoma de buenos aires\b/g, 'caba'],
	[/\bciudad de buenos aires\b/g, 'caba'],
	[/\bcapital federal\b/g, 'caba'],
	[/\bc a b a\b/g, 'caba']
]);

/**
 * Clave de una dirección: {@link normalizePlaceText} y la ciudad escrita siempre igual
 * («Ciudad Autónoma de Buenos Aires» = «CABA»).
 * @param {unknown} raw
 */
export function addressKey(raw) {
	let s = normalizePlaceText(raw);
	for (const [re, to] of CITY_ALIASES) s = s.replace(re, to);
	return s.replace(/\s+/g, ' ').trim();
}

/**
 * ¿Es una dirección con calle y número? (Un texto sin números es un barrio, un parque o una
 * ciudad: «Almagro, CABA».)
 * @param {string} text
 */
export function looksLikeStreetAddress(text) {
	return /\d/.test(text);
}

/**
 * Clave de la calle y el número para juntar eventos: el primer tramo con números («Av. Boedo 830,
 * Almagro, CABA» → «boedo 830»), sin «Av.» ni «Avenida». Vacía si no hay número. Para
 * decidir si se ve lo mismo se compara la dirección entera ({@link addressKey}).
 * @param {string} text
 */
export function streetKey(text) {
	const part = String(text ?? '')
		.split(',')
		.find((p) => looksLikeStreetAddress(p));
	if (!part) return '';
	return normalizePlaceText(part)
		.replace(/^(av|avda|avenida)\s+/, '')
		.trim();
}

/** Lo que dice un «Dónde» de un evento online. */
export const ONLINE_WORDS = new Set([
	'online',
	'virtual',
	'zoom',
	'meet',
	'google meet',
	'discord'
]);

/**
 * ¿El evento es online? (`modalidad: online`, o el «Dónde» dice «Online», «Zoom»…, o tiene la
 * etiqueta Online y no tiene dirección, como en las entradas.)
 * @param {Record<string, any>} meta
 */
export function isOnlinePlace(meta) {
	const modalidad = normalizePlaceText(meta.modalidad);
	if (modalidad === 'online' || modalidad === 'virtual') return true;
	if (modalidad === 'presencial') return false;
	if (ONLINE_WORDS.has(normalizePlaceText(meta.location))) return true;
	if (ONLINE_WORDS.has(normalizePlaceText(meta.location_name))) return true;
	const tags = Array.isArray(meta.tags) ? meta.tags : [];
	return !textOrNull(meta.location) && tags.some((t) => normalizePlaceText(t) === 'online');
}

/**
 * El «Dónde» de un evento, o `null` si es online o no tiene nada. El link al mapa cuenta solo si
 * es válido (como en la página del evento).
 * @param {Record<string, any>} meta
 * @returns {EventPlaceFields | null}
 */
export function readEventPlace(meta) {
	if (isOnlinePlace(meta)) return null;
	const name = textOrNull(meta.location_name) ?? '';
	const location = textOrNull(meta.location) ?? '';
	const map = checkMapLink(meta.location_map);
	const mapUrl = map.ok ? map.url : '';
	if (!name && !location && !mapUrl) return null;
	return { name, location, mapUrl };
}

/**
 * Clave de un link al mapa (sin `www.`, sin la barra final).
 * @param {string} url
 */
export function mapKey(url) {
	if (!url) return '';
	try {
		const u = new URL(url);
		const host = u.hostname.toLowerCase().replace(/^www\./, '');
		return `${host}${u.pathname.replace(/\/+$/, '')}${u.search}${u.hash}`;
	} catch {
		return '';
	}
}

/**
 * El punto de un link al mapa, si lo trae escrito (OpenStreetMap `mlat`/`mlon` o `#map=z/lat/lng`;
 * Google Maps `@lat,lng` o `q=`/`query=lat,lng`). Si no, `null`.
 * @param {string} url
 * @returns {{ lat: number, lng: number } | null}
 */
export function coordsFromMapLink(url) {
	if (!url) return null;
	/** @type {URL} */
	let u;
	try {
		u = new URL(url);
	} catch {
		return null;
	}
	/** @param {unknown} a @param {unknown} b */
	const pair = (a, b) => {
		const lat = Number(a);
		const lng = Number(b);
		if (a === '' || b === '' || a == null || b == null) return null;
		if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
		if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
		return { lat, lng };
	};
	const m = pair(u.searchParams.get('mlat'), u.searchParams.get('mlon'));
	if (m) return m;
	const hash = u.hash.match(/map=\d+(?:\.\d+)?\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/);
	if (hash) return pair(hash[1], hash[2]);
	const at = u.pathname.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
	if (at) return pair(at[1], at[2]);
	const q = (u.searchParams.get('query') ?? u.searchParams.get('q') ?? '').match(
		/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/
	);
	if (q) return pair(q[1], q[2]);
	return null;
}

/**
 * Qué nivel de privacidad muestra lo mismo que ya muestra el evento (decisión de gorrite: lo que
 * está en los eventos ya es público):
 *
 * | El evento muestra                                   | Nivel                             |
 * | --------------------------------------------------- | --------------------------------- |
 * | nombre y dirección (o barrio, o link al mapa)       | `public` "Nombre + dirección"     |
 * | solo el nombre                                      | `name` "Sólo Nombre"              |
 * | solo una dirección con número (o un link al mapa)   | `address` "Sólo dirección"        |
 * | solo un barrio o ciudad (sin número)                | `area` "Sólo dirección parcial"   |
 *
 * @param {EventPlaceFields} place
 * @returns {VenuePrivacy}
 */
export function eventShowLevel(place) {
	const where = Boolean(place.location || place.mapUrl);
	if (place.name) return where ? 'public' : 'name';
	if (place.mapUrl || looksLikeStreetAddress(place.location)) return 'address';
	return 'area';
}

/** De más a menos abierto (para elegir el nivel del lugar). */
const OPENNESS = /** @type {const} */ (['public', 'name', 'address', 'area', 'hidden']);

/**
 * El nivel por defecto del lugar: el más abierto entre los de sus eventos. Así la página del lugar
 * muestra a lo sumo lo que ya mostraba alguno de sus eventos; cada evento que muestra menos lleva
 * su propio nivel ({@link privacyOverride}).
 * @param {readonly VenuePrivacy[]} levels
 * @returns {VenuePrivacy}
 */
export function venueDefaultLevel(levels) {
	for (const level of OPENNESS) if (levels.includes(level)) return level;
	return 'hidden';
}

/**
 * El nivel propio del evento (`data.privacy` del edge `lugar`): `null` si es el mismo que el del lugar.
 * @param {VenuePrivacy} level
 * @param {VenuePrivacy} venueDefault
 * @returns {VenuePrivacy | null}
 */
export function privacyOverride(level, venueDefault) {
	return level === venueDefault ? null : level;
}

/** @param {string} a @param {string} b */
const sameName = (a, b) => normalizePlaceText(a) === normalizePlaceText(b);
/** @param {string} a @param {string} b */
const sameAddress = (a, b) => addressKey(a) === addressKey(b);

/**
 * ¿Vincular el evento a este lugar muestra lo mismo que ya muestra? Compara lo que el evento
 * mostraba (su nombre, su dirección o barrio, su link al mapa) con lo que mostraría el lugar en el
 * nivel del evento (la misma lista blanca que usa la página, `venueView`). Distinto de mayúsculas,
 * tildes o «CABA» por «Ciudad Autónoma de Buenos Aires» cuenta como lo mismo.
 *
 * `level`: el nivel con el que se mostraría (por defecto, el que muestra lo mismo que el evento,
 * {@link eventShowLevel}; «Vincular lugares» puede usar el del lugar).
 *
 * @param {EventPlaceFields} place
 * @param {{ title: string, data: Record<string, unknown> }} venue
 * @param {VenuePrivacy} [level]
 * @returns {{ level: VenuePrivacy, fits: boolean, diffs: string[] }}
 */
export function eventFit(place, venue, level = eventShowLevel(place)) {
	const view = venueView(venue, level, '');
	/** @type {string[]} */
	const diffs = [];
	const name = view.name ?? '';
	if (place.name && !sameName(place.name, name)) {
		diffs.push(`se va a ver con el nombre «${name}» (decía «${place.name}»)`);
	}
	const parts =
		level === 'public'
			? [view.address]
			: level === 'address'
				? [view.address, view.area, view.city]
				: level === 'area'
					? [view.area, view.city]
					: [];
	const shown = parts.filter(Boolean).join(', ');
	if (place.location && !sameAddress(place.location, shown)) {
		diffs.push(
			shown
				? `se va a ver «${shown}» (decía «${place.location}»)`
				: `no se va a ver «${place.location}»`
		);
	} else if (!place.location && shown) {
		diffs.push(`se va a ver «${shown}», que el evento no mostraba`);
	}
	if (level === 'public') {
		const extra = [
			view.area && 'barrio',
			view.city && 'ciudad',
			view.accessibility && 'accesibilidad',
			view.howTo && 'cómo llegar'
		].filter(Boolean);
		if (extra.length) diffs.push(`también se va a ver lo que tiene el lugar: ${extra.join(', ')}`);
	}
	if (place.mapUrl) {
		const coords = coordsFromMapLink(place.mapUrl);
		const sameCoords =
			coords && view.lat !== undefined && coords.lat === view.lat && coords.lng === view.lng;
		if (!sameCoords && !(level === 'public' || level === 'address')) {
			diffs.push('no se va a ver su link al mapa');
		} else if (!sameCoords) {
			diffs.push('su link al mapa pasa a ser el mapa del lugar');
		}
	}
	return { level, fits: diffs.length === 0, diffs };
}

/**
 * Los datos del lugar nuevo (`perfil` de tipo lugar): la dirección (o el barrio, si el candidato
 * no tiene nombre ni número), el punto del mapa si el link lo trae, y el nivel por defecto.
 *
 * @param {Pick<VenueCandidate, 'address' | 'area' | 'mapUrl'>} candidate
 * @param {VenuePrivacy} [privacy]
 */
export function venueDataFor(candidate, privacy) {
	/** @type {Record<string, unknown>} */
	const data = { kind: 'lugar' };
	if (candidate.address) data.address = candidate.address;
	if (candidate.area) data.area = candidate.area;
	const coords = coordsFromMapLink(candidate.mapUrl);
	if (coords) Object.assign(data, coords);
	if (privacy) data.venue_privacy = privacy;
	return data;
}

/**
 * Los textos de más usados a menos (a igual cantidad, el del evento más nuevo primero).
 * @param {{ text: string, start: string }[]} items
 * @param {(s: string) => string} keyOf
 * @returns {Variant[]}
 */
function variants(items, keyOf) {
	/** @type {Map<string, { text: string, count: number, start: string }>} */
	const byKey = new Map();
	for (const { text, start } of items) {
		if (!text) continue;
		const k = keyOf(text);
		const cur = byKey.get(k);
		if (!cur) byKey.set(k, { text, count: 1, start });
		else {
			cur.count++;
			if (start > cur.start) Object.assign(cur, { text, start });
		}
	}
	return [...byKey.values()]
		.sort((a, b) => b.count - a.count || b.start.localeCompare(a.start))
		.map(({ text, count }) => ({ text, count }));
}

/**
 * Busca un lugar existente con el mismo nombre o la misma calle y número ({@link streetKey}).
 * @param {{ names: Variant[], locations: Variant[] }} c
 * @param {readonly ExistingVenue[]} venues
 */
function findExisting(c, venues) {
	const names = new Set(c.names.map((v) => normalizePlaceText(v.text)));
	const streets = new Set(c.locations.map((v) => streetKey(v.text)).filter(Boolean));
	return (
		venues.find((v) => names.has(normalizePlaceText(v.title))) ??
		venues.find((v) => {
			const d = v.data ?? {};
			const own = streetKey(textOrNull(d.address) ?? '');
			return Boolean(own) && streets.has(own);
		}) ??
		null
	);
}

/**
 * Agrupa los eventos en candidatos a lugar.
 *
 * @param {readonly ImportEvent[]} events todos los eventos (listados y no listados)
 * @param {{ linked?: ReadonlySet<string>, venues?: readonly ExistingVenue[] }} [opts] los eventos
 *   que ya tienen lugar y los lugares que ya existen
 * @returns {{ candidates: VenueCandidate[], skipped: { online: number, empty: number, linked: number } }}
 */
export function planVenueImport(events, { linked = new Set(), venues = [] } = {}) {
	const skipped = { online: 0, empty: 0, linked: 0 };
	/** @type {(ImportEvent & { place: EventPlaceFields })[]} */
	const usable = [];
	for (const e of events) {
		if (linked.has(e.slug)) {
			skipped.linked++;
			continue;
		}
		if (isOnlinePlace(e.meta)) {
			skipped.online++;
			continue;
		}
		const place = readEventPlace(e.meta);
		if (!place) {
			skipped.empty++;
			continue;
		}
		usable.push({ ...e, place });
	}

	// Unión de eventos por claves compartidas, en dos pasadas:
	// 1. la misma calle y número, el mismo link al mapa, o (solo entre eventos sin nombre) el mismo
	//    barrio;
	// 2. el mismo nombre, salvo que los dos grupos tengan direcciones distintas (un lugar que se
	//    mudó, o dos lugares con el mismo nombre): esos quedan como candidatos aparte.
	/** @type {number[]} */
	const parent = usable.map((_, i) => i);
	/** @param {number} i @returns {number} */
	const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
	/** @type {Map<number, Set<string>>} calles de cada grupo */
	const streets = new Map(
		usable.map((e, i) => {
			const k = streetKey(e.place.location);
			return [i, new Set(k ? [k] : [])];
		})
	);
	/** @type {Map<number, Set<string>>} por qué se juntó cada grupo */
	const reasons = new Map();
	/** @type {Set<string>} */
	const conflicts = new Set();
	/**
	 * @param {number} i
	 * @param {number} j
	 * @param {string} why
	 * @param {boolean} checkStreets
	 */
	const unite = (i, j, why, checkStreets) => {
		const a = find(i);
		const b = find(j);
		if (a === b) return;
		const sa = /** @type {Set<string>} */ (streets.get(a));
		const sb = /** @type {Set<string>} */ (streets.get(b));
		if (checkStreets && sa.size && sb.size && ![...sa].some((k) => sb.has(k))) {
			conflicts.add(normalizePlaceText(usable[i].place.name));
			return;
		}
		parent[a] = b;
		streets.set(b, new Set([...sa, ...sb]));
		const set = new Set([...(reasons.get(a) ?? []), ...(reasons.get(b) ?? [])]);
		set.add(why);
		reasons.set(b, set);
	};
	/**
	 * @param {(p: EventPlaceFields) => [string, string] | null} keyOf
	 * @param {boolean} checkStreets
	 */
	const pass = (keyOf, checkStreets) => {
		/** @type {Map<string, number>} */
		const owner = new Map();
		usable.forEach((e, i) => {
			const key = keyOf(e.place);
			if (!key) return;
			const j = owner.get(key[0]);
			if (j === undefined) owner.set(key[0], i);
			else unite(i, j, key[1], checkStreets);
		});
	};
	pass(
		(p) => (streetKey(p.location) ? [streetKey(p.location), 'la misma dirección'] : null),
		false
	);
	pass((p) => (p.mapUrl ? [mapKey(p.mapUrl), 'el mismo link al mapa'] : null), false);
	pass(
		(p) =>
			p.location && !p.name && !streetKey(p.location)
				? [addressKey(p.location), 'el mismo barrio']
				: null,
		false
	);
	pass((p) => (p.name ? [normalizePlaceText(p.name), 'el mismo nombre'] : null), true);

	/** @type {Map<number, (ImportEvent & { place: EventPlaceFields })[]>} */
	const groups = new Map();
	usable.forEach((e, i) => {
		const r = find(i);
		groups.set(r, [...(groups.get(r) ?? []), e]);
	});

	/** @type {VenueCandidate[]} */
	const candidates = [];
	for (const [root, group] of groups) {
		group.sort((a, b) => b.start.localeCompare(a.start) || a.slug.localeCompare(b.slug));
		const names = variants(
			group.map((e) => ({ text: e.place.name, start: e.start })),
			normalizePlaceText
		);
		const locations = variants(
			group.map((e) => ({ text: e.place.location, start: e.start })),
			addressKey
		);
		const maps = variants(
			group.map((e) => ({ text: e.place.mapUrl, start: e.start })),
			mapKey
		);
		const hasName = names.length > 0;
		const topLocation = locations[0]?.text ?? '';
		// Con nombre, el «Dónde» va entero a la dirección (la página lo muestra junto al nombre,
		// como antes). Sin nombre: con número es la dirección; sin número, el barrio.
		const location =
			hasName || looksLikeStreetAddress(topLocation)
				? (locations.find((v) => looksLikeStreetAddress(v.text))?.text ?? topLocation)
				: topLocation;
		const mapUrl = maps[0]?.text ?? '';
		const found = findExisting({ names, locations }, venues);
		const existing = found ? { id: found.id, title: found.title, slug: found.slug } : null;
		const title = existing?.title ?? names[0]?.text ?? topLocation;
		const target = found ?? newVenueFor({ title, hasName, mapUrl }, { title, location });
		const evs = group.map((e) => {
			const fit = eventFit(e.place, target);
			return { slug: e.slug, title: e.title, start: e.start, ...e.place, ...fit };
		});
		const fitting = evs.filter((e) => e.fits);
		const starts = group.map((e) => e.start).filter(Boolean);
		/** @type {string[]} */
		const merges = [];
		const why = [...(reasons.get(root) ?? [])];
		if (names.some((v) => conflicts.has(normalizePlaceText(v.text)))) {
			merges.push(
				'Hay otro candidato con el mismo nombre en otra dirección: no los juntamos (¿se mudó?).'
			);
		}
		if (names.length > 1 || locations.length > 1 || maps.length > 1) {
			const shown = [...names, ...locations].map((v) => `«${v.text}» (${v.count})`).join(', ');
			merges.push(`Juntamos ${shown}${why.length ? ` por tener ${why.join(' y ')}` : ''}.`);
		}
		candidates.push({
			key: `c-${[...group].map((e) => e.slug).sort()[0]}`,
			title,
			hasName,
			address: /** @type {string} */ (target.data.address ?? ''),
			area: /** @type {string} */ (target.data.area ?? ''),
			mapUrl,
			names,
			locations,
			merges,
			events: evs,
			first: starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : '',
			last: starts.length ? starts.reduce((a, b) => (a > b ? a : b)) : '',
			level: venueDefaultLevel((fitting.length ? fitting : evs).map((e) => e.level)),
			existing,
			// Se proponen marcados los que tienen nombre (sin nombre habría que inventarle uno).
			suggested: hasName && fitting.length > 0
		});
	}
	candidates.sort((a, b) => b.events.length - a.events.length || a.title.localeCompare(b.title));
	return { candidates, skipped };
}

/**
 * El lugar nuevo de un candidato, con el nombre y el «Dónde» que se elijan en la vista previa (por
 * defecto, los más usados). Con nombre, o con número, el «Dónde» es la dirección; si no, el barrio.
 *
 * @param {Pick<VenueCandidate, 'title' | 'hasName' | 'mapUrl'>} candidate
 * @param {{ title?: string, location?: string }} choice
 * @returns {{ title: string, data: Record<string, unknown> }}
 */
export function newVenueFor(candidate, { title, location = '' }) {
	const name = (title ?? '').trim() || candidate.title;
	const street = candidate.hasName || looksLikeStreetAddress(location);
	return {
		title: name,
		data: venueDataFor({
			address: street ? location : '',
			area: street ? '' : location,
			mapUrl: candidate.mapUrl
		})
	};
}

/**
 * Los eventos del candidato con qué mostrarían vinculados a `venue` (cuando en la vista previa se
 * cambia el nombre o la dirección del lugar nuevo).
 *
 * @param {VenueCandidate} candidate
 * @param {{ title: string, data: Record<string, unknown> }} venue
 * @returns {CandidateEvent[]}
 */
export function refitEvents(candidate, venue) {
	return candidate.events.map((e) => ({ ...e, ...eventFit(e, venue) }));
}

/**
 * Lo que se va a guardar para un candidato elegido: los eventos marcados (solo los del
 * candidato), el nivel del lugar (el más abierto de esos eventos) y el nivel propio de cada uno.
 *
 * Para un lugar que ya existe, `venueDefault` es el nivel que ya tiene (no se cambia).
 *
 * @param {VenueCandidate} candidate
 * @param {Iterable<string>} chosenSlugs
 * @param {VenuePrivacy} [venueDefault]
 * @returns {{ venuePrivacy: VenuePrivacy, links: { slug: string, privacy: VenuePrivacy | null }[] }}
 */
export function importLinks(candidate, chosenSlugs, venueDefault) {
	const chosen = new Set(chosenSlugs);
	const events = candidate.events.filter((e) => chosen.has(e.slug));
	const venuePrivacy =
		venueDefault ??
		venueDefaultLevel((events.length ? events : candidate.events).map((e) => e.level));
	return {
		venuePrivacy,
		links: events.map((e) => ({ slug: e.slug, privacy: privacyOverride(e.level, venuePrivacy) }))
	};
}

/**
 * Si el perfil del lugar nuevo aparece en /amigues (`listed`) o no (`unlisted`: `data.unlisted`,
 * como cualquier perfil no listado). Es aparte del nivel de privacidad de la dirección: un lugar
 * no listado sigue saliendo en sus eventos con lo que su nivel deja ver y su página sigue andando
 * (por el link del evento), pero no está en las listas de /amigues.
 *
 * @typedef {'unlisted' | 'listed'} VenueListing
 */

/** Decisión de gorrite: los lugares que se crean desde los eventos nacen no listados. */
export const DEFAULT_VENUE_LISTING = /** @type {VenueListing} */ ('unlisted');

/**
 * Los textos de la vista previa: la opción para todos y la de cada lugar.
 * @type {Readonly<Record<VenueListing, { all: string, one: string }>>}
 */
export const VENUE_LISTING_LABELS = Object.freeze({
	unlisted: { all: 'No listados (no aparecen en Amigues)', one: 'No listado' },
	listed: { all: 'Públicos', one: 'Público' }
});

/**
 * @param {unknown} value
 * @returns {value is VenueListing}
 */
export const isVenueListing = (value) => value === 'unlisted' || value === 'listed';

/**
 * Cómo se crea un lugar: lo elegido para ese lugar si se eligió; si no, lo elegido para todos; y
 * ante cualquier otra cosa, no listado.
 *
 * @param {unknown} all la opción «Cómo se crean» de la vista previa
 * @param {unknown} [own] la de ese lugar (vacía = como todos)
 * @returns {VenueListing}
 */
export function venueListing(all, own) {
	if (isVenueListing(own)) return own;
	if (isVenueListing(all)) return all;
	return DEFAULT_VENUE_LISTING;
}
