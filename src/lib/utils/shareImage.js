// Generador de imágenes para compartir eventos (portada, ficha con los datos y vertical 9:16).
// Todo corre en el navegador con Canvas 2D; lo único que se carga aparte son las
// tipografías elegidas y, si se pide, el generador de QR (chico, con import dinámico).
//
// El estilo sigue las piezas que publica KinkyVibe: colores planos y saturados, títulos en
// una display gruesa y redondeada con contorno y sombra "extruida", palabras chicas
// intercaladas ("GRUPO de APOYO y DISCUSIÓN"), textos inclinados como stickers, destellos
// de 4 puntas, tramas de puntos y grano. El flyer del evento es la pieza principal.

export const TZ = 'America/Argentina/Buenos_Aires';
export const SITE = 'kinkyvibe.ar';

/**
 * Tipografías a elegir, parecidas a las que usan los flyers de la comunidad: display gruesa y
 * redondeada con contorno (Picantearla, Grupo de apoyo), redondeada "burbuja" (Club de Hosts),
 * condensada alta (Cuirdas Sudacas, Taller de bondage, Panquequeo), slab (Anatomía para
 * BDSM), manuscrita (Rancheadita, Jamarada) y la Lato del sitio.
 * Las `src` se sirven desde el propio sitio (Lilita One y Fredoka: subconjunto latin de
 * Google Fonts, SIL OFL 1.1; Retosta ya la usa el sitio); las `google` se piden a Google
 * Fonts solo cuando alguien las elige.
 * @typedef {{label:string, family:string, weight:number, fallback:string,
 *   src?:{url:string, format:string, weight:string}, google?:string}} FontOption
 * @type {{display: Record<string, FontOption>, body: Record<string, FontOption>}}
 */
export const FONTS = {
	display: {
		lilita: {
			label: 'Lilita One',
			family: 'Lilita One',
			weight: 400,
			fallback: 'sans-serif',
			src: { url: '/fonts/share/lilita-one-latin.woff2', format: 'woff2', weight: '400' }
		},
		fredoka: {
			label: 'Fredoka (burbuja)',
			family: 'Fredoka',
			weight: 700,
			fallback: 'sans-serif',
			src: { url: '/fonts/share/fredoka-latin-variable.woff2', format: 'woff2', weight: '300 700' }
		},
		bebas: { label: 'Bebas Neue (condensada)', family: 'Bebas Neue', weight: 400, fallback: 'sans-serif', google: 'Bebas+Neue' },
		alfa: { label: 'Alfa Slab One', family: 'Alfa Slab One', weight: 400, fallback: 'serif', google: 'Alfa+Slab+One' },
		shrikhand: { label: 'Shrikhand', family: 'Shrikhand', weight: 400, fallback: 'serif', google: 'Shrikhand' },
		marker: { label: 'Permanent Marker (a mano)', family: 'Permanent Marker', weight: 400, fallback: 'cursive', google: 'Permanent+Marker' },
		lato: { label: 'Lato (la del sitio)', family: 'Lato', weight: 900, fallback: 'sans-serif', google: 'Lato:wght@900' },
		retosta: {
			label: 'Retosta',
			family: 'Retosta',
			weight: 400,
			fallback: 'sans-serif',
			src: { url: '/fonts/Retosta.otf', format: 'opentype', weight: '400' }
		}
	},
	body: {
		fredoka: {
			label: 'Fredoka',
			family: 'Fredoka',
			weight: 400,
			fallback: 'sans-serif',
			src: { url: '/fonts/share/fredoka-latin-variable.woff2', format: 'woff2', weight: '300 700' }
		},
		lato: { label: 'Lato (la del sitio)', family: 'Lato', weight: 400, fallback: 'sans-serif', google: 'Lato:wght@400;700' },
		nunito: { label: 'Nunito', family: 'Nunito', weight: 400, fallback: 'sans-serif', google: 'Nunito:wght@400..800' },
		oswald: { label: 'Oswald (condensada)', family: 'Oswald', weight: 400, fallback: 'sans-serif', google: 'Oswald:wght@400..700' },
		mono: { label: 'Space Mono', family: 'Space Mono', weight: 400, fallback: 'monospace', google: 'Space+Mono:wght@400;700' },
		serif: { label: 'Libre Baskerville', family: 'Libre Baskerville', weight: 400, fallback: 'serif', google: 'Libre+Baskerville:wght@400;700' }
	}
};

/** @type {Map<string, Promise<void>>} */
const fontLoads = new Map();
/**
 * Carga una tipografía (una sola vez), con tope de tiempo: si no llega, se dibuja con la
 * de respaldo y la página redibuja cuando termina.
 * @param {'display'|'body'} kind @param {string} id @param {number} [timeout]
 */
export function loadFont(kind, id, timeout = 8000) {
	const f = FONTS[kind][id];
	if (!f || typeof document === 'undefined' || !document.fonts || typeof FontFace === 'undefined') {
		return Promise.resolve();
	}
	const key = kind + ':' + id;
	let p = fontLoads.get(key);
	if (!p) {
		p = (async () => {
			if (f.src) {
				const src = /** @type {NonNullable<FontOption['src']>} */ (f.src);
				const already = [...document.fonts].find(
					(ff) => ff.family.replace(/['"]/g, '') === f.family && ff.status === 'loaded'
				);
				if (already) return;
				const face = new FontFace(f.family, `url(${src.url}) format('${src.format}')`, {
					weight: src.weight,
					display: 'block'
				});
				document.fonts.add(face);
				await face.load();
			} else if (f.google) {
				const href = `https://fonts.googleapis.com/css2?family=${f.google}&display=block`;
				if (!document.querySelector(`link[href="${href}"]`)) {
					await new Promise((resolve) => {
						const link = document.createElement('link');
						link.rel = 'stylesheet';
						link.href = href;
						link.onload = link.onerror = resolve;
						document.head.appendChild(link);
					});
				}
				const weights = kind === 'display' ? [f.weight] : [400, 600, 700];
				await Promise.all(
					weights.map((w) => document.fonts.load(`${w} 40px '${f.family}'`, 'AÁÑ¡aéñ01'))
				);
			}
		})().catch(() => {});
		fontLoads.set(key, p);
	}
	return Promise.race([p, new Promise((r) => setTimeout(r, timeout))]);
}

/** Carga las tipografías por defecto del canvas. */
export const loadFonts = (timeout = 8000) =>
	Promise.all([loadFont('display', 'lilita', timeout), loadFont('body', 'fredoka', timeout)]);

/** @type {Record<string, {w:number, h:number, label:string}>} */
export const FORMATS = {
	post: { w: 1080, h: 1350, label: 'Portada' },
	info: { w: 1080, h: 1350, label: 'Ficha con los datos' },
	story: { w: 1080, h: 1920, label: 'Vertical 9:16' }
};

/** Proporción de la portada y la ficha (van juntas, así que comparten proporción). */
/** @type {Record<string, {h:number, label:string}>} */
export const RATIOS = {
	square: { h: 1080, label: 'Cuadrada 1:1' },
	portrait: { h: 1350, label: 'Vertical 4:5' }
};

/**
 * Diseños de la portada, cada uno basado en una familia de flyers de la comunidad.
 * @type {Record<string, {label:string, image:boolean}>}
 */
export const LAYOUTS = {
	flyer: { label: 'Flyer entero', image: true },
	franja: { label: 'Franja cruzada', image: false },
	foto: { label: 'Foto con título', image: false },
	grupo: { label: 'Encabezado partido', image: false },
	cartel: { label: 'Cartel centrado', image: false }
};

/**
 * Paletas de la casa, sacadas de los flyers publicados. Por defecto se usa la paleta
 * detectada en la imagen del evento (ver palette.js).
 * @typedef {{label:string, bg:string, bg2:string, title:string, extrude:string, outline:string|null,
 *   small:string, sub:string, accent:string, text:string, pillBg:string, pillFg:string, dots:string,
 *   duoDark:string, duoLight:string, badge:string, badgeText:string, tape:string, tapeText:string}} Palette
 * @type {Record<string, Palette>}
 */
export const PALETTES = {
	uva: {
		label: 'Uva',
		bg: '#2b0f4e',
		bg2: '#fd633a',
		title: '#f7a1dc',
		extrude: '#150626',
		outline: '#f6f08c',
		small: '#f6f08c',
		sub: '#f6f08c',
		accent: '#f6f08c',
		text: '#ffffff',
		pillBg: '#f6f08c',
		pillFg: '#2b0f4e',
		dots: '#7b3fe4',
		duoDark: '#3a0d78',
		duoLight: '#b27cff',
		badge: '#8a4bf0',
		badgeText: '#ffffff',
		tape: '#f6f08c',
		tapeText: '#150626'
	},
	chicle: {
		label: 'Chicle',
		bg: '#f7b2e3',
		bg2: '#8fe6a2',
		title: '#6b2ee6',
		extrude: '#3d1590',
		outline: null,
		small: '#e052c9',
		sub: '#ef9d1f',
		accent: '#6b2ee6',
		text: '#3d1590',
		pillBg: '#6b2ee6',
		pillFg: '#ffffff',
		dots: '#e88ad6',
		duoDark: '#4a1bb0',
		duoLight: '#f7b2e3',
		badge: '#fbe9f5',
		badgeText: '#e67acb',
		tape: '#3d1590',
		tapeText: '#f7b2e3'
	},
	noche: {
		label: 'Noche',
		bg: '#17101f',
		bg2: '#2b1a42',
		title: '#a55bf2',
		extrude: '#3f1873',
		outline: null,
		small: '#31e3b7',
		sub: '#31e3b7',
		accent: '#74e36b',
		text: '#ffffff',
		pillBg: '#a55bf2',
		pillFg: '#ffffff',
		dots: '#33254a',
		duoDark: '#17101f',
		duoLight: '#a55bf2',
		badge: '#a55bf2',
		badgeText: '#ffffff',
		tape: '#74e36b',
		tapeText: '#17101f'
	},
	mandarina: {
		label: 'Mandarina',
		bg: '#f4622f',
		bg2: '#1b4b50',
		title: '#3cc2bd',
		extrude: '#123538',
		outline: '#123538',
		small: '#ffffff',
		sub: '#fff1d6',
		accent: '#ffffff',
		text: '#123538',
		pillBg: '#123538',
		pillFg: '#ffffff',
		dots: '#d94d1c',
		duoDark: '#123538',
		duoLight: '#f79a6f',
		badge: '#123538',
		badgeText: '#f4622f',
		tape: '#123538',
		tapeText: '#ffffff'
	},
	durazno: {
		label: 'Durazno',
		bg: '#f7aba0',
		bg2: '#fde9df',
		title: '#7d1a1e',
		extrude: '#3a1414',
		outline: null,
		small: '#3a1414',
		sub: '#3a1414',
		accent: '#7d1a1e',
		text: '#3a1414',
		pillBg: '#7d1a1e',
		pillFg: '#fde9df',
		dots: '#2a1616',
		duoDark: '#6b1519',
		duoLight: '#fbc9bf',
		badge: '#7d1a1e',
		badgeText: '#f7aba0',
		tape: '#3a1414',
		tapeText: '#f7aba0'
	}
};

/** Stickers de estado. `tape` = cinta cruzada (cancelado); el resto va en una estrella. */
/** @type {Record<string, {sticker:string[], tape?:boolean, caption:string}>} */
export const STATUS = {
	anunciado: { sticker: ['¡SE', 'VIENE!'], caption: '📣 ¡Se viene!' },
	abierto: { sticker: ['¡ANO-', 'TATE!'], caption: '' },
	agotadas: { sticker: ['¡AGO-', 'TADO!'], caption: '🔥 ¡Cupos agotados! 🔥' },
	cancelado: { sticker: ['CANCELADO'], tape: true, caption: '❌ EVENTO CANCELADO ❌' }
};

/* ------------------------------------------------------------------ */
/* Datos del evento                                                    */
/* ------------------------------------------------------------------ */

/** @param {string} s */
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
/** @param {string} s */
const noDots = (s) => s.replace(/\./g, '');

/**
 * Fecha y horario del evento, siempre en hora de Buenos Aires.
 * `day`/`hours` son la versión larga (texto del posteo y placa de datos);
 * `dayShort`/`hoursShort` la versión sticker ("SÁB 17 ENE", "20 A 01:30 HS").
 * Un evento que termina de madrugada del día siguiente cuenta como una sola noche.
 * @param {string|Date} start
 * @param {string|Date} [end]
 * @param {Date} [now]
 */
export function formatEventDate(start, end, now = new Date()) {
	const s = new Date(start);
	if (isNaN(+s)) return { day: '', hours: '', dayShort: '', hoursShort: '', multiDay: false };
	const e = end && !isNaN(+new Date(end)) ? new Date(end) : null;
	/** @param {Date} d @param {Intl.DateTimeFormatOptions} o */
	const fmt = (d, o) => new Intl.DateTimeFormat('es-AR', { timeZone: TZ, ...o }).format(d);
	/** @param {Date} d */
	const dayKey = (d) =>
		new Intl.DateTimeFormat('en-CA', { timeZone: TZ, dateStyle: 'short' }).format(d);
	/** @param {Date} d */
	const hour = (d) => Number(fmt(d, { hour: 'numeric', hourCycle: 'h23' }));
	/** @param {Date} d */
	const time = (d) => fmt(d, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
	/** @param {Date} d  "20" o "20:30" */
	const shortTime = (d) => time(d).replace(/:00$/, '').replace(/^0(\d)/, '$1');
	/** @param {Date} d */
	const wd = (d) => noDots(fmt(d, { weekday: 'short' })).slice(0, 3);
	/** @param {Date} d */
	const mon = (d) => noDots(fmt(d, { month: 'short' })).slice(0, 3);
	/** @param {Date} d */
	const dnum = (d) => fmt(d, { day: 'numeric' });
	const otherYear = fmt(s, { year: 'numeric' }) !== fmt(now, { year: 'numeric' });

	/** @type {Intl.DateTimeFormatOptions} */
	const dayOpts = { weekday: 'long', day: 'numeric', month: 'long' };
	if (otherYear) dayOpts.year = 'numeric';
	const long = (/** @type {Date} */ d) => capitalize(fmt(d, dayOpts).replace(',', ''));

	const sameDay = !e || dayKey(e) === dayKey(s);
	// termina de madrugada (antes de las 9) y dura menos de 16 hs: es la misma noche
	const overnight = !!e && !sameDay && hour(e) < 9 && +e - +s < 16 * 3600e3;
	const multiDay = !!e && !sameDay && !overnight;

	let day = long(s);
	let hours;
	let dayShort = `${wd(s)} ${dnum(s)} ${mon(s)}`;
	let hoursShort;
	if (!e) {
		hours = time(s) + ' hs';
		hoursShort = shortTime(s) + ' HS';
	} else if (!multiDay) {
		hours = time(s) + ' a ' + time(e) + ' hs';
		hoursShort = shortTime(s) + ' A ' + shortTime(e) + ' HS';
	} else {
		const sameMonth = mon(s) === mon(e);
		dayShort = sameMonth
			? `${wd(s)} ${dnum(s)} AL ${wd(e)} ${dnum(e)} ${mon(e)}`
			: `${wd(s)} ${dnum(s)} ${mon(s)} AL ${wd(e)} ${dnum(e)} ${mon(e)}`;
		day = long(s) + ' al ' + long(e).charAt(0).toLowerCase() + long(e).slice(1);
		hours = 'desde las ' + time(s) + ' hs hasta las ' + time(e) + ' hs';
		hoursShort = 'DESDE LAS ' + shortTime(s) + ' HS';
	}
	return { day, hours, dayShort: dayShort.toUpperCase(), hoursShort, multiDay };
}

/** @param {string} s */
export function shortPlace(s) {
	return s
		.replace(/Ciudad Aut[oó]noma de Buenos Aires/gi, 'CABA')
		.replace(/Provincia de Buenos Aires/gi, 'PBA')
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * Parte el título en antetítulo / título / bajada:
 * "Picantearla (49ª Edición)" → título "Picantearla", bajada "49ª Edición";
 * "Club de Hosts - Noche de Juegos" → título + bajada;
 * "Amarres: placer en el trabajo sexual - Cuirdas Sudacas" → antetítulo "Cuirdas Sudacas".
 * @param {string} full
 */
export function splitTitle(full) {
	let t = String(full ?? '').trim();
	let kicker = '';
	let sub = '';
	const paren = t.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
	if (paren) {
		t = paren[1];
		sub = paren[2];
	}
	const dash = t.split(/\s+[-–—]\s+/);
	if (dash.length > 1) {
		const left = dash[0];
		const right = dash.slice(1).join(' - ');
		if (left.includes(':')) {
			kicker = right;
			t = left;
		} else {
			t = left;
			sub = sub ? right + ' · ' + sub : right;
		}
	}
	const colon = t.match(/^([^:]{2,}):\s*(.+)$/);
	if (colon) {
		t = colon[1];
		sub = sub ? colon[2] + ' · ' + sub : colon[2];
	}
	return { kicker: kicker.trim(), title: t.trim(), sub: sub.trim() };
}

/** @param {string[]|undefined} tags */
export function priceLabel(tags) {
	const t = (tags ?? []).map((x) => String(x).toLowerCase());
	if (t.includes('gratis')) return 'GRATIS';
	if (t.includes('a la gorra')) return 'A LA GORRA';
	return '';
}

/** @param {string[]} names */
const joinNames = (names) =>
	names.length <= 1 ? names[0] ?? '' : names.slice(0, -1).join(', ') + ' & ' + names[names.length - 1];

/**
 * Datos del evento ya formateados para dibujar / escribir.
 * @param {any} meta
 */
export function eventInfo(meta) {
	const { day, hours, dayShort, hoursShort, multiDay } = formatEventDate(meta.start, meta.end);
	const online = !meta.location;
	const place = online ? 'Online' : meta.location_name ?? meta.location;
	const address = !online && meta.location_name ? meta.location : '';
	/** @type {string[]} */
	const all = (meta.authors ?? [])
		.filter(Boolean)
		.map((/** @type {string} */ a) => (a === 'KinkyVibe' ? 'Kinky Vibe' : a.replaceAll('_', ' ')));
	const guests = all.filter((a) => a !== 'Kinky Vibe');
	return {
		title: String(meta.title ?? '').trim(),
		day,
		hours,
		dayShort,
		hoursShort,
		multiDay,
		online,
		place,
		address,
		/** organizan, sin contar a Kinky Vibe (que ya está en el logo) */
		by: joinNames(guests),
		/** organizan, todes */
		organizers: joinNames(all),
		status: meta.status,
		url: SITE + '/calendario/' + meta.postID,
		ended: meta.end ? new Date(meta.end) < new Date() : new Date(meta.start) < new Date()
	};
}

/** Etiquetas que ya se dicen de otra forma (lugar, precio, idioma) o no suman en la imagen. */
const NOT_TOPICS = new Set(
	[
		'kinkyvibe', 'evento', 'calendario', 'español', 'inglés', 'lsa', 'pago', 'gratis', 'a la gorra',
		'online', 'presencial', 'argentina', 'amba', 'córdoba', 'rosario', 'santa cruz', 'la plata',
		'uruguay', 'montevideo', 'chile', 'brasil'
	]
);

/** "BDSM · Cuerdas · Inicial" @param {string[]|undefined} tags @param {number} [max] */
export function topicTags(tags, max = 6) {
	return (tags ?? [])
		.map((t) => String(t))
		.filter((t) => !NOT_TOPICS.has(t.toLowerCase()))
		.slice(0, max)
		.map((t) => capitalize(t))
		.join(' · ');
}

/**
 * Primeras oraciones de un texto, hasta ~max caracteres.
 * @param {string} text @param {number} [max]
 */
export function firstSentences(text, max = 160) {
	const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
	if (clean.length <= max) return clean;
	const parts = clean.split(/(?<=[.!?])\s+/);
	let out = '';
	for (const s of parts) {
		if (!out && s.length > max) {
			const cut = s.slice(0, max).replace(/\s+\S*$/, '');
			return cut.replace(/[\s,.:;-]+$/, '') + '…';
		}
		if ((out + ' ' + s).trim().length > max) break;
		out = (out + ' ' + s).trim();
	}
	return out;
}

/** "6000$" → "$6.000". @param {string} text */
export function findAmount(text) {
	const m = String(text ?? '').match(/\$\s?(\d[\d.,]*)|(\d[\d.,]*)\s?\$/);
	if (!m) return '';
	const n = Number((m[1] ?? m[2]).replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.'));
	return isFinite(n) && n > 0 ? '$' + n.toLocaleString('es-AR') : '';
}

/**
 * @typedef {{heading:string, text:string, items:string[]}} Section
 * @typedef {{priceInfo:string, audience:string, access:string, dress:string}} BodyExtras
 */

/**
 * Datos útiles que suelen estar en el texto del evento (secciones "Entrada",
 * "¿A quién está dirigido?", "Accesibilidad", "Dress code"...).
 * @param {Section[]} sections
 * @returns {BodyExtras}
 */
export function extrasFromSections(sections) {
	/** @param {RegExp} re @param {RegExp} [not] */
	const find = (re, not) => sections.find((s) => re.test(s.heading) && !(not && not.test(s.heading)));
	const price = find(/entrada|valor|precio|costo|bono|aporte/i, /llevar|libre!?$|bloque/i);
	const audience = find(/dirigid|para qui[eé]n/i);
	const access = find(/accesib/i);
	const dress = find(/dress|vestimenta|requisit|qu[eé] (traer|llevar)/i, /aportes/i);
	let dressText = dress ? firstSentences(dress.items.length ? dress.items.join(' · ') : dress.text, 140) : '';
	if (!dressText) {
		const m = sections.map((s) => s.text).join(' ').match(/[^.!?]*dress ?code[^.!?]*[.!?]?/i);
		if (m) dressText = firstSentences(m[0], 140);
	}
	return {
		priceInfo: price ? firstSentences(price.text || price.items.join(' · '), 150) : '',
		audience: audience ? firstSentences(audience.text || audience.items.join(' · '), 150) : '',
		access: access ? firstSentences(access.items.length ? access.items.join(' · ') : access.text, 140) : '',
		dress: dressText
	};
}

/**
 * Secciones del texto de un evento tal como se ve en su página pública (solo navegador).
 * @param {string} html
 * @returns {Section[]}
 */
export function sectionsFromHTML(html) {
	if (typeof DOMParser === 'undefined') return [];
	const doc = new DOMParser().parseFromString(html, 'text/html');
	const content = doc.querySelector('article .content');
	if (!content) return [];
	/** @type {Section[]} */
	const out = [];
	/** @type {Section} */
	let cur = { heading: '', text: '', items: [] };
	/** @param {Element} el */
	const walk = (el) => {
		for (const child of [...el.children]) {
			if (/^H[1-4]$/.test(child.tagName)) {
				if (cur.heading || cur.text) out.push(cur);
				cur = { heading: child.textContent?.trim() ?? '', text: '', items: [] };
			} else if (child.tagName === 'UL' || child.tagName === 'OL') {
				for (const li of child.querySelectorAll(':scope > li')) {
					const t = li.textContent?.replace(/\s+/g, ' ').trim();
					if (t) cur.items.push(t);
				}
			} else if (child.tagName === 'P') {
				cur.text += ' ' + (child.textContent ?? '');
			} else if (/^(DIV|SECTION)$/.test(child.tagName) && !child.matches('nav, .toc')) {
				walk(child);
			}
		}
	};
	walk(content);
	if (cur.heading || cur.text) out.push(cur);
	return out.map((s) => ({ ...s, text: s.text.replace(/\s+/g, ' ').trim() }));
}

/** @typedef {ReturnType<typeof defaultTexts>} Texts */

/**
 * Campos de texto de las imágenes: cada uno se puede apagar o editar antes de descargar.
 * `on`: si arranca prendido (cuando tiene texto). `where`: en qué imágenes aparece.
 * @type {{key:keyof Texts, label:string, placeholder?:string, where:string, long?:boolean, on?:boolean, required?:boolean}[]}
 */
export const FIELDS = [
	{ key: 'title', label: 'Título', where: 'todas', required: true },
	{ key: 'kicker', label: 'Antetítulo', placeholder: 'taller de…, con…', where: 'portada' },
	{ key: 'sub', label: 'Bajada', placeholder: 'Debajo del título', where: 'portada' },
	{ key: 'date', label: 'Fecha', where: 'todas' },
	{ key: 'hours', label: 'Horario', where: 'todas' },
	{ key: 'place', label: 'Lugar', where: 'todas' },
	{ key: 'address', label: 'Dirección', where: 'ficha' },
	{ key: 'price', label: 'Entrada', placeholder: 'GRATIS, A LA GORRA, $…', where: 'todas' },
	{ key: 'priceInfo', label: 'Detalle de la entrada', placeholder: 'con posibilidad de beca, en puerta…', where: 'todas', long: true },
	{ key: 'organizers', label: 'Organiza', where: 'ficha' },
	{ key: 'summary', label: 'Descripción corta', where: 'ficha', long: true },
	{ key: 'audience', label: 'Para quién es', placeholder: 'para subs, doms, switches…', where: 'nota al pie y ficha', long: true },
	{ key: 'dress', label: 'Dress code / qué traer', placeholder: 'Dress code, qué llevar…', where: 'ficha', long: true },
	{ key: 'access', label: 'Accesibilidad', placeholder: 'Rampa, baños sin género, LSA…', where: 'ficha', long: true },
	{ key: 'tags', label: 'Etiquetas', where: 'ficha' },
	{ key: 'cta', label: 'Llamado', placeholder: 'Inscribite en', where: 'barra de abajo' },
	{ key: 'url', label: 'Link del evento', where: 'barra de abajo' }
];

/**
 * Textos editables de las imágenes, con los valores sugeridos a partir del evento.
 * @param {any} meta
 * @param {Partial<BodyExtras>} [extras] lo que se encontró en el texto del evento
 */
export function defaultTexts(meta, extras = {}) {
	const info = eventInfo(meta);
	const { kicker, title, sub } = splitTitle(info.title);
	const where = info.online ? 'ONLINE' : shortPlace(info.place);
	// el llamado va antes del link, en la barra de abajo ("Inscribite en kinkyvibe.ar/…")
	let cta = 'Más info en';
	if (meta.link && info.status !== 'cancelado' && !info.ended) {
		const opening = meta.opening_date ? new Date(meta.opening_date) : null;
		if (opening && !isNaN(+opening) && +opening > Date.now()) {
			const d = new Intl.DateTimeFormat('es-AR', { timeZone: TZ, day: 'numeric', month: 'numeric' });
			cta = 'Inscripción desde el ' + d.format(opening) + ' en';
		} else if (info.status === 'abierto') {
			cta = /entrada|venta/i.test(meta.link_text ?? '') ? 'Entradas en' : 'Inscribite en';
		}
	}
	const tags = (meta.tags ?? []).map((/** @type {string} */ t) => String(t).toLowerCase());
	const access = [
		tags.includes('lsa') ? 'Con intérprete de LSA' : '',
		tags.includes('inglés') ? 'En inglés' : '',
		extras.access ?? ''
	]
		.filter(Boolean)
		.join(' · ');
	const summary = String(meta.summary ?? '').trim();
	return {
		kicker: kicker || (info.by ? 'con ' + info.by : ''),
		title,
		sub,
		date: info.dayShort,
		hours: info.hoursShort,
		place: where,
		address: info.address ? shortPlace(info.address) : '',
		price: priceLabel(meta.tags) || findAmount(extras.priceInfo ?? ''),
		priceInfo: extras.priceInfo ?? '',
		organizers: info.organizers,
		summary: summary === '-' ? '' : summary,
		audience: extras.audience ?? '',
		dress: extras.dress ?? '',
		access,
		tags: topicTags(meta.tags),
		cta,
		url: info.url
	};
}

/**
 * Qué campos arrancan prendidos: los que tienen texto, salvo los largos que no entrarían.
 * @param {Texts} texts
 * @returns {Record<string, boolean>}
 */
export function defaultEnabled(texts) {
	/** @type {Record<string, boolean>} */
	const on = {};
	for (const f of FIELDS) {
		const v = String(texts[f.key] ?? '');
		on[f.key] = f.required || (!!v && (!f.long || v.length <= 160));
	}
	return on;
}

/**
 * Textos con los campos apagados vacíos (así los omite el dibujo).
 * @param {Texts} texts @param {Record<string, boolean>} enabled
 * @returns {Texts}
 */
export function visibleTexts(texts, enabled) {
	const out = { ...texts };
	for (const f of FIELDS) if (!f.required && !enabled[f.key]) out[f.key] = '';
	return out;
}

/** Raíces de palabras que los filtros automáticos de las redes suelen esconder. */
const SENSITIVE =
	/\b(er[oó]tic\w*|sex\w*|bdsm|kink\w*|fetich\w*|asfixi\w*|tortur\w*|genital\w*|porn\w*|sado\w*|masoquis\w*|humillaci\w*|shibari|bondage|sumis\w*|dominaci\w*|fisting|spanking|nalgad\w*|agujas?)\b/giu;
const LEET = /** @type {Record<string, string>} */ ({ a: '4', e: '3', i: '1', o: '0', á: '4', é: '3', í: '1', ó: '0' });

/**
 * "Disimula" palabras sensibles como en los flyers (ASF1XI4 ER0TIC4, TORTUR4 G3NIT4L, BD$M):
 * cambia dos vocales (desde el final) por números, y la S de BDSM por $.
 * @param {string} text
 */
export function censorText(text) {
	return String(text ?? '').replace(SENSITIVE, (word) => {
		if (/^bdsm$/i.test(word)) return word.replace(/s/i, '$');
		const chars = [...word];
		let changed = 0;
		for (let i = chars.length - 1; i > 0 && changed < 2; i--) {
			const low = chars[i].toLowerCase();
			if (LEET[low]) {
				chars[i] = LEET[low];
				changed++;
				i--; // no dos seguidas
			}
		}
		return chars.join('');
	});
}

/* ------------------------------------------------------------------ */
/* Texto sugerido para el posteo                                       */
/* ------------------------------------------------------------------ */

/** Etiquetas que no suman como hashtag */
const SKIP_TAGS = new Set(['español', 'inglés', 'lsa', 'pago', 'gratis', 'a la gorra', 'kinkyvibe']);

/** @param {string} tag */
export const toHashtag = (tag) =>
	'#' +
	tag
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.replace(/[^\p{L}\p{N}]+/gu, '')
		.toLowerCase();

/** @param {any} meta */
export function buildCaption(meta) {
	const info = eventInfo(meta);
	const price = priceLabel(meta.tags);
	const lines = [];
	const st = STATUS[info.status];
	if (st?.caption) lines.push(st.caption, '');
	lines.push(`✨ ${info.title} ✨`);
	if (info.by) lines.push(`con ${info.by}`);
	lines.push('');
	if (meta.summary && meta.summary !== '-') lines.push(String(meta.summary).trim(), '');
	if (info.day) lines.push(`📅 ${info.day}`, `🕗 ${info.hours}`);
	if (info.online) {
		lines.push('💻 Online');
	} else {
		lines.push(`📍 ${info.place}${info.address ? ` (${info.address})` : ''}`);
	}
	if (price) lines.push(`💸 ${capitalize(price.toLowerCase())}`);
	lines.push('');
	if (info.status === 'abierto' && meta.link) {
		const label = meta.link_text ? capitalize(String(meta.link_text).toLowerCase()) : 'Inscripción';
		lines.push(`👉 ${label} y más info: ${info.url}`);
	} else {
		lines.push(`🔗 Más info: ${info.url}`);
	}
	lines.push('');
	/** @type {string[]} */
	const tags = ['#kinkyvibe'];
	for (const t of meta.tags ?? []) {
		if (SKIP_TAGS.has(String(t).toLowerCase())) continue;
		const h = toHashtag(String(t));
		if (h.length > 2 && !tags.includes(h)) tags.push(h);
	}
	for (const extra of ['#bdsm', '#kink']) if (!tags.includes(extra)) tags.push(extra);
	if ((meta.tags ?? []).includes('AMBA') && !tags.includes('#buenosaires')) tags.push('#buenosaires');
	lines.push(tags.slice(0, 20).join(' '));
	return lines.join('\n');
}
