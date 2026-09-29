// Generador de imágenes para compartir eventos en Instagram (post, carrusel, historia).
// Todo corre en el navegador con Canvas 2D, sin dependencias.
//
// El estilo sigue las piezas que KinkyVibe publica en @kinkyvibeargentina: colores planos y
// saturados (uva/amarillo manteca/rosa chicle/naranja/menta), títulos en una display gruesa
// y redondeada con contorno y sombra "extruida", palabras chicas intercaladas ("GRUPO de
// APOYO y DISCUSIÓN"), textos inclinados como stickers, destellos de 4 puntas, tramas de
// puntos y grano. El flyer del evento es la pieza principal; los datos van en stickers.

export const TZ = 'America/Argentina/Buenos_Aires';
export const SITE = 'kinkyvibe.ar';
const DISPLAY = "'Lilita One', 'Lato', sans-serif";
const ROUND = "'Fredoka', 'Lato', sans-serif";

/**
 * Tipografías del canvas (el sitio sigue en Lato), servidas desde /static/fonts/share:
 * Lilita One y Fredoka (variable 300–700), subconjunto latin de Google Fonts, SIL OFL 1.1.
 * Se sirven desde el propio sitio para que el dibujo no dependa de fonts.googleapis.com.
 */
const FONT_FILES = [
	{ family: 'Lilita One', url: '/fonts/share/lilita-one-latin.woff2', weight: '400' },
	{ family: 'Fredoka', url: '/fonts/share/fredoka-latin-variable.woff2', weight: '300 700' }
];

/** @type {Record<string, {w:number, h:number, label:string}>} */
export const FORMATS = {
	post: { w: 1080, h: 1350, label: 'Post' },
	info: { w: 1080, h: 1350, label: 'Carrusel · datos' },
	story: { w: 1080, h: 1920, label: 'Historia (9:16)' }
};

/** Proporción del feed: se aplica al post y a la placa de datos (un carrusel comparte proporción). */
/** @type {Record<string, {h:number, label:string}>} */
export const RATIOS = {
	square: { h: 1080, label: 'Cuadrado 1:1' },
	portrait: { h: 1350, label: 'Vertical 4:5' }
};

/** @type {Record<string, string>} */
export const LAYOUTS = {
	flyer: 'Flyer',
	duotono: 'Foto duotono',
	tipografico: 'Tipográfico'
};

/**
 * Paletas sacadas de los flyers publicados. `auto` elige la más cercana al color dominante
 * del flyer del evento.
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
	const authors = (meta.authors ?? [])
		.filter((/** @type {string} */ a) => a && a !== 'KinkyVibe')
		.map((/** @type {string} */ a) => a.replaceAll('_', ' '));
	const by =
		authors.length == 0
			? ''
			: authors.length == 1
			? authors[0]
			: authors.slice(0, -1).join(', ') + ' & ' + authors[authors.length - 1];
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
		by,
		status: meta.status,
		url: SITE + '/calendario/' + meta.postID,
		ended: meta.end ? new Date(meta.end) < new Date() : new Date(meta.start) < new Date()
	};
}

/**
 * Textos editables de las imágenes, con los valores sugeridos a partir del evento.
 * @param {any} meta
 */
export function defaultTexts(meta) {
	const info = eventInfo(meta);
	const { kicker, title, sub } = splitTitle(info.title);
	const where = info.online ? 'ONLINE' : shortPlace(info.place);
	let cta = '';
	if (meta.link && (info.status === 'abierto' || info.status === 'anunciado')) {
		cta = String(meta.link_text || 'Inscripción').toUpperCase() + ' · LINK EN BIO';
	}
	return {
		kicker: kicker || (info.by ? 'con ' + info.by : ''),
		title,
		sub,
		date: info.dayShort,
		hours: info.hoursShort,
		place: where,
		price: priceLabel(meta.tags),
		cta
	};
}

/* ------------------------------------------------------------------ */
/* Carga de recursos                                                   */
/* ------------------------------------------------------------------ */

/**
 * Carga una imagen sin "ensuciar" el canvas. Las imágenes del sitio son del mismo origen;
 * si alguna viniera de otro origen se pide con CORS y, si falla, se devuelve null.
 * @param {string|undefined} src
 * @returns {Promise<HTMLImageElement|null>}
 */
export function loadImage(src) {
	return new Promise((resolve) => {
		if (!src || src === 'undefined') return resolve(null);
		const img = new Image();
		try {
			if (new URL(src, location.href).origin !== location.origin) img.crossOrigin = 'anonymous';
		} catch (e) {
			return resolve(null);
		}
		img.decoding = 'async';
		img.onload = () => resolve(img.naturalWidth > 0 ? img : null);
		img.onerror = () => resolve(null);
		img.src = src;
	});
}

/** Carga las tipografías del canvas (una sola vez), con un tope de tiempo. */
export async function loadFonts(timeout = 8000) {
	if (typeof document === 'undefined' || !document.fonts || typeof FontFace === 'undefined') return;
	const loads = FONT_FILES.map(async (f) => {
		const already = [...document.fonts].find((ff) => ff.family.replace(/['"]/g, '') === f.family);
		if (already) return already.status === 'loaded' ? already : already.load();
		const face = new FontFace(f.family, `url(${f.url}) format('woff2')`, {
			weight: f.weight,
			display: 'block'
		});
		document.fonts.add(face);
		return face.load();
	});
	await Promise.race([
		Promise.all(loads).catch(() => {}),
		new Promise((r) => setTimeout(r, timeout))
	]);
}

/**
 * Paleta más cercana al color dominante de la imagen (el fondo del flyer, casi siempre).
 * @param {HTMLImageElement|null} img
 * @returns {keyof typeof PALETTES}
 */
export function pickPalette(img) {
	if (!img || typeof document === 'undefined') return 'uva';
	try {
		const n = 32;
		const cv = document.createElement('canvas');
		cv.width = n;
		cv.height = n;
		const cx = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
		cx.drawImage(img, 0, 0, n, n);
		const d = cx.getImageData(0, 0, n, n).data;
		/** @type {Map<number, {n:number, r:number, g:number, b:number}>} */
		const buckets = new Map();
		for (let i = 0; i < d.length; i += 4) {
			const key = ((d[i] >> 5) << 6) | ((d[i + 1] >> 5) << 3) | (d[i + 2] >> 5);
			const b = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
			b.n++;
			b.r += d[i];
			b.g += d[i + 1];
			b.b += d[i + 2];
			buckets.set(key, b);
		}
		const top = [...buckets.values()].sort((a, b) => b.n - a.n)[0];
		const dom = [top.r / top.n, top.g / top.n, top.b / top.n];
		/** @type {keyof typeof PALETTES} */
		let best = 'uva';
		let bestD = Infinity;
		for (const [id, p] of Object.entries(PALETTES)) {
			const c = hexToRgb(p.bg);
			// distancia "redmean": barata y bastante perceptual
			const rm = (dom[0] + c[0]) / 2;
			const dr = dom[0] - c[0];
			const dg = dom[1] - c[1];
			const db = dom[2] - c[2];
			const dist = (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
			if (dist < bestD) {
				bestD = dist;
				best = /** @type {keyof typeof PALETTES} */ (id);
			}
		}
		return best;
	} catch (e) {
		return 'uva';
	}
}

/** @param {string} hex @returns {number[]} */
function hexToRgb(hex) {
	const h = hex.replace('#', '');
	return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

/* ------------------------------------------------------------------ */
/* Helpers de dibujo                                                   */
/* ------------------------------------------------------------------ */

/** @param {CanvasRenderingContext2D} ctx @param {string} family @param {number} size @param {number|string} [weight] */
const setFont = (ctx, family, size, weight = 400) => {
	ctx.font = `${weight} ${size}px ${family}`;
};

/**
 * Parte un texto en líneas que entren en maxWidth. Las palabras demasiado largas
 * (p. ej. URLs) se cortan por caracteres.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} maxWidth
 */
export function wrapLines(ctx, text, maxWidth) {
	const words = text.split(/\s+/).filter(Boolean);
	/** @type {string[]} */
	const lines = [];
	let line = '';
	for (let word of words) {
		const candidate = line ? line + ' ' + word : word;
		if (ctx.measureText(candidate).width <= maxWidth) {
			line = candidate;
			continue;
		}
		if (line) lines.push(line);
		line = '';
		while (ctx.measureText(word).width > maxWidth && word.length > 1) {
			let i = word.length - 1;
			while (i > 1 && ctx.measureText(word.slice(0, i)).width > maxWidth) i--;
			lines.push(word.slice(0, i));
			word = word.slice(i);
		}
		line = word;
	}
	if (line) lines.push(line);
	return lines;
}

/**
 * Tamaño más grande con el que el texto entra en la caja; si no entra ni con minSize, trunca.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {{family?:string, maxWidth:number, maxHeight:number, maxSize:number, minSize:number, weight?:number, lineHeight?:number, maxLines?:number}} o
 */
export function fitText(ctx, text, o) {
	const family = o.family ?? ROUND;
	const lh = o.lineHeight ?? 1.1;
	const maxLines = o.maxLines ?? Infinity;
	/** @type {string[]} */
	let lines = [];
	for (let size = o.maxSize; size >= o.minSize; size -= 2) {
		setFont(ctx, family, size, o.weight);
		lines = wrapLines(ctx, text, o.maxWidth);
		if (lines.length <= maxLines && lines.length * size * lh <= o.maxHeight) {
			return { lines, size, lineHeight: size * lh };
		}
	}
	const size = o.minSize;
	setFont(ctx, family, size, o.weight);
	lines = wrapLines(ctx, text, o.maxWidth);
	const n = Math.max(1, Math.min(maxLines, Math.floor(o.maxHeight / (size * lh))));
	if (lines.length > n) {
		lines = lines.slice(0, n);
		let last = lines[n - 1];
		while (last.length > 1 && ctx.measureText(last + '…').width > o.maxWidth) last = last.slice(0, -1);
		lines[n - 1] = last.replace(/[\s,.:;-]+$/, '') + '…';
	}
	return { lines, size, lineHeight: size * lh };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y @param {number} w @param {number} h @param {number} r
 */
function roundRectPath(ctx, x, y, w, h, r) {
	r = Math.min(r, w / 2, h / 2);
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}

/**
 * Dibuja la imagen cubriendo la caja (recortando lo que sobra).
 * @param {CanvasRenderingContext2D} ctx @param {CanvasImageSource & {width:number,height:number}} img
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {number} [focusY] 0 = arriba, 1 = abajo
 */
function drawCover(ctx, img, x, y, w, h, focusY = 0.5) {
	const iw = /** @type {any} */ (img).naturalWidth || img.width;
	const ih = /** @type {any} */ (img).naturalHeight || img.height;
	const scale = Math.max(w / iw, h / ih);
	const dw = iw * scale;
	const dh = ih * scale;
	ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) * focusY, dw, dh);
}

/** Canvas auxiliar (no se agrega al DOM). @param {number} w @param {number} h */
function offscreen(w, h) {
	const cv = document.createElement('canvas');
	cv.width = Math.max(1, Math.round(w));
	cv.height = Math.max(1, Math.round(h));
	return { cv, cx: /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d')) };
}

/**
 * Imagen en duotono (sombras → dark, luces → light), como las fotos violetas de Picantearla.
 * @param {HTMLImageElement} img @param {number} w @param {number} h
 * @param {string} dark @param {string} light @param {number} [focusY]
 */
function duotone(img, w, h, dark, light, focusY = 0.4) {
	const { cv, cx } = offscreen(w, h);
	drawCover(cx, img, 0, 0, w, h, focusY);
	try {
		const data = cx.getImageData(0, 0, cv.width, cv.height);
		const d = data.data;
		const a = hexToRgb(dark);
		const b = hexToRgb(light);
		for (let i = 0; i < d.length; i += 4) {
			let l = (0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]) / 255;
			l = Math.min(1, Math.max(0, (l - 0.12) * 1.35)); // más contraste
			d[i] = a[0] + (b[0] - a[0]) * l;
			d[i + 1] = a[1] + (b[1] - a[1]) * l;
			d[i + 2] = a[2] + (b[2] - a[2]) * l;
		}
		cx.putImageData(data, 0, 0);
	} catch (e) {
		// imagen de otro origen sin CORS: queda a color
	}
	return cv;
}

/** @type {HTMLCanvasElement|null} */
let grainTile = null;
/** Grano de impresión encima de los planos de color. @param {CanvasRenderingContext2D} ctx @param {number} w @param {number} h @param {number} [alpha] */
function grain(ctx, w, h, alpha = 0.16) {
	if (!grainTile) {
		const { cv, cx } = offscreen(160, 160);
		const data = cx.createImageData(160, 160);
		for (let i = 0; i < data.data.length; i += 4) {
			const v = Math.random() * 255;
			data.data[i] = data.data[i + 1] = data.data[i + 2] = v;
			data.data[i + 3] = 255;
		}
		cx.putImageData(data, 0, 0);
		grainTile = cv;
	}
	const pattern = ctx.createPattern(grainTile, 'repeat');
	if (!pattern) return;
	ctx.save();
	ctx.globalAlpha = alpha;
	ctx.globalCompositeOperation = 'overlay';
	ctx.fillStyle = pattern;
	ctx.fillRect(0, 0, w, h);
	ctx.restore();
}

/**
 * Trama de puntos que se achican lejos de la esquina (como en "Perfil de riesgo").
 * @param {CanvasRenderingContext2D} ctx @param {number} cx @param {number} cy
 * @param {number} radius @param {string} color @param {number} [step]
 */
function halftone(ctx, cx, cy, radius, color, step = 30) {
	ctx.save();
	ctx.fillStyle = color;
	for (let y = cy - radius; y <= cy + radius; y += step) {
		for (let x = cx - radius; x <= cx + radius; x += step) {
			const off = (Math.round((y - cy) / step) % 2) * (step / 2);
			const d = Math.hypot(x + off - cx, y - cy) / radius;
			if (d >= 1) continue;
			const r = (step / 2) * (1 - d) * 0.95;
			if (r < 1.2) continue;
			ctx.beginPath();
			ctx.arc(x + off, y, r, 0, Math.PI * 2);
			ctx.fill();
		}
	}
	ctx.restore();
}

/** Destello de 4 puntas (Club de Hosts). @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} r @param {string} color */
function sparkle(ctx, x, y, r, color) {
	ctx.save();
	ctx.fillStyle = color;
	ctx.beginPath();
	ctx.moveTo(x, y - r);
	ctx.quadraticCurveTo(x + r * 0.12, y - r * 0.12, x + r, y);
	ctx.quadraticCurveTo(x + r * 0.12, y + r * 0.12, x, y + r);
	ctx.quadraticCurveTo(x - r * 0.12, y + r * 0.12, x - r, y);
	ctx.quadraticCurveTo(x - r * 0.12, y - r * 0.12, x, y - r);
	ctx.fill();
	ctx.restore();
}

/**
 * Lomas onduladas de fondo (Grupo de apoyo).
 * @param {CanvasRenderingContext2D} ctx @param {number} w @param {number} top @param {number} bottom @param {string} color
 */
function hills(ctx, w, top, bottom, color) {
	ctx.save();
	ctx.fillStyle = color;
	ctx.beginPath();
	ctx.moveTo(0, bottom);
	ctx.lineTo(0, top + 40);
	ctx.bezierCurveTo(w * 0.18, top - 70, w * 0.32, top + 90, w * 0.52, top + 20);
	ctx.bezierCurveTo(w * 0.7, top - 50, w * 0.84, top + 70, w, top - 10);
	ctx.lineTo(w, bottom);
	ctx.closePath();
	ctx.fill();
	ctx.restore();
}

/**
 * Estrella/sello con puntas (Someter, estados).
 * @param {CanvasRenderingContext2D} ctx @param {number} cx @param {number} cy @param {number} r
 * @param {string[]} lines @param {string} bg @param {string} fg @param {string} shadow
 */
function starburst(ctx, cx, cy, r, lines, bg, fg, shadow) {
	const spikes = 16;
	/** @param {number} ox @param {number} oy */
	const path = (ox, oy) => {
		ctx.beginPath();
		for (let i = 0; i < spikes * 2; i++) {
			const rr = i % 2 ? r * 0.84 : r;
			const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
			ctx.lineTo(cx + ox + Math.cos(a) * rr, cy + oy + Math.sin(a) * rr);
		}
		ctx.closePath();
	};
	ctx.save();
	ctx.translate(cx, cy);
	ctx.rotate(0.14);
	ctx.translate(-cx, -cy);
	ctx.fillStyle = shadow;
	path(r * 0.07, r * 0.07);
	ctx.fill();
	ctx.fillStyle = bg;
	path(0, 0);
	ctx.fill();
	ctx.fillStyle = fg;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	let size = r * 0.46;
	setFont(ctx, DISPLAY, size);
	const widest = () => Math.max(...lines.map((l) => ctx.measureText(l).width));
	while (widest() > r * 1.4 && size > 10) {
		size -= 2;
		setFont(ctx, DISPLAY, size);
	}
	const lh = size * 0.95;
	lines.forEach((l, i) => ctx.fillText(l, cx, cy + (i - (lines.length - 1) / 2) * lh + size * 0.06));
	ctx.restore();
}

/**
 * Cinta cruzada para eventos cancelados.
 * @param {CanvasRenderingContext2D} ctx @param {number} cx @param {number} cy @param {number} len
 * @param {string} text @param {string} bg @param {string} fg @param {number} [angle]
 */
function tape(ctx, cx, cy, len, text, bg, fg, angle = -0.14) {
	const h = 124;
	ctx.save();
	ctx.translate(cx, cy);
	ctx.rotate(angle);
	ctx.shadowColor = 'rgba(0,0,0,.35)';
	ctx.shadowBlur = 24;
	ctx.fillStyle = bg;
	ctx.fillRect(-len / 2, -h / 2, len, h);
	ctx.shadowBlur = 0;
	ctx.fillStyle = fg;
	setFont(ctx, DISPLAY, 76);
	ctx.textBaseline = 'middle';
	ctx.textAlign = 'left';
	const unit = text + '  •  ';
	const uw = ctx.measureText(unit).width;
	for (let x = -len / 2 - uw / 3; x < len / 2; x += uw) ctx.fillText(unit, x, 6);
	ctx.restore();
}

/**
 * Texto "gordo" con sombra extruida y contorno, como los títulos de los flyers.
 * @param {CanvasRenderingContext2D} ctx @param {string} text @param {number} x @param {number} y (baseline)
 * @param {number} size @param {{fill:string, extrude:string, outline:string|null, depth?:number}} s
 */
function chunky(ctx, text, x, y, size, s) {
	ctx.save();
	setFont(ctx, DISPLAY, size);
	ctx.textBaseline = 'alphabetic';
	ctx.textAlign = 'left';
	ctx.lineJoin = 'round';
	const depth = s.depth ?? size * 0.075;
	const ow = s.outline ? size * 0.11 : 0;
	// extrusión: capas desplazadas en diagonal
	ctx.fillStyle = s.extrude;
	ctx.strokeStyle = s.extrude;
	ctx.lineWidth = ow;
	const steps = Math.max(1, Math.ceil(depth / 2));
	for (let i = steps; i >= 1; i--) {
		const d = (depth * i) / steps;
		if (ow) ctx.strokeText(text, x + d, y + d);
		ctx.fillText(text, x + d, y + d);
	}
	if (s.outline) {
		ctx.strokeStyle = s.outline;
		ctx.lineWidth = ow;
		ctx.strokeText(text, x, y);
	}
	ctx.fillStyle = s.fill;
	ctx.fillText(text, x, y);
	ctx.restore();
}

/** Palabras que van chiquitas entre las grandes ("GRUPO de APOYO y DISCUSIÓN"). */
const CONNECTORS = new Set(
	'de del la las el los y e o u a al en con para por sin x lo le les un una'.split(' ')
);

/**
 * @typedef {{text:string, small:boolean, w:number}} Token
 * @typedef {{size:number, lineH:number, lines:{tokens:Token[], w:number}[], w:number, h:number}} TitleLayout
 */

/**
 * Arma el título en líneas con palabras grandes (mayúsculas, display) y conectores chicos.
 * @param {CanvasRenderingContext2D} ctx @param {string} text
 * @param {{maxWidth:number, maxHeight:number, maxSize:number, minSize:number, maxLines?:number}} o
 * @returns {TitleLayout}
 */
export function layoutTitle(ctx, text, o) {
	const words = text.split(/\s+/).filter(Boolean);
	const raw = words.map((w, i) => ({
		text: w,
		small: CONNECTORS.has(w.toLowerCase()) && i > 0 && i < words.length - 1
	}));
	const maxLines = o.maxLines ?? 5;
	/** @type {TitleLayout|null} */
	let result = null;
	for (let size = o.maxSize; size >= o.minSize; size -= 4) {
		const smallSize = size * 0.5;
		const space = size * 0.2;
		/** @type {Token[]} */
		const tokens = raw.map((t) => {
			if (t.small) {
				setFont(ctx, ROUND, smallSize, 600);
				return { text: t.text.toLowerCase(), small: true, w: ctx.measureText(t.text.toLowerCase()).width };
			}
			setFont(ctx, DISPLAY, size);
			const up = t.text.toUpperCase();
			return { text: up, small: false, w: ctx.measureText(up).width };
		});
		/** @type {{tokens:Token[], w:number}[]} */
		const lines = [];
		let cur = { tokens: /** @type {Token[]} */ ([]), w: 0 };
		for (let i = 0; i < tokens.length; i++) {
			const t = tokens[i];
			const add = (cur.tokens.length ? space : 0) + t.w;
			// un conector no se queda colgando al final de la línea: viaja con la palabra siguiente
			const next = t.small && tokens[i + 1] ? space + tokens[i + 1].w : 0;
			if (cur.tokens.length && cur.w + add + next > o.maxWidth) {
				lines.push(cur);
				cur = { tokens: [], w: 0 };
			}
			cur.w += (cur.tokens.length ? space : 0) + t.w;
			cur.tokens.push(t);
		}
		if (cur.tokens.length) lines.push(cur);
		const lineH = size * 0.98;
		const h = lines.length * lineH + size * 0.12;
		const w = Math.max(...lines.map((l) => l.w));
		result = { size, lineH, lines, w, h };
		if (lines.length <= maxLines && h <= o.maxHeight && w <= o.maxWidth) return result;
	}
	return /** @type {TitleLayout} */ (result);
}

/**
 * Dibuja un título armado con layoutTitle. (x, y) = esquina superior del bloque según align.
 * @param {CanvasRenderingContext2D} ctx @param {TitleLayout} t @param {number} x @param {number} y
 * @param {'left'|'center'} align @param {Palette} p
 */
function drawTitle(ctx, t, x, y, align, p) {
	t.lines.forEach((line, li) => {
		let lx = align === 'center' ? x - line.w / 2 : x;
		const base = y + li * t.lineH + t.size * 0.82;
		const space = t.size * 0.2;
		for (const tok of line.tokens) {
			if (tok.small) {
				// conector: arriba, alineado con la altura de las mayúsculas
				ctx.save();
				setFont(ctx, ROUND, t.size * 0.5, 600);
				ctx.textBaseline = 'alphabetic';
				ctx.textAlign = 'left';
				ctx.fillStyle = p.small;
				ctx.fillText(tok.text, lx, base - t.size * 0.3);
				ctx.restore();
			} else {
				chunky(ctx, tok.text, lx, base, t.size, {
					fill: p.title,
					extrude: p.extrude,
					outline: p.outline
				});
			}
			lx += tok.w + space;
		}
	});
}

/**
 * Pastilla con sombra dura (sticker). Devuelve su tamaño.
 * @param {CanvasRenderingContext2D} ctx @param {string} text @param {number} x @param {number} y
 * @param {{size:number, family?:string, weight?:number, bg:string, fg:string, shadow?:string|null, align?:'left'|'center'|'right', rot?:number, dry?:boolean, maxW?:number}} o
 */
function pill(ctx, text, x, y, o) {
	const family = o.family ?? DISPLAY;
	let size = o.size;
	setFont(ctx, family, size, o.weight ?? 400);
	while (o.maxW && ctx.measureText(text).width + size * 1.1 > o.maxW && size > 14) {
		size -= 2;
		setFont(ctx, family, size, o.weight ?? 400);
	}
	const w = ctx.measureText(text).width + size * 1.1;
	const h = size * 1.5;
	if (o.dry || !text) return { w: text ? w : 0, h: text ? h : 0 };
	const left = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
	ctx.save();
	ctx.translate(left + w / 2, y + h / 2);
	ctx.rotate(o.rot ?? 0);
	if (o.shadow) {
		ctx.fillStyle = o.shadow;
		roundRectPath(ctx, -w / 2 + size * 0.14, -h / 2 + size * 0.14, w, h, h / 2);
		ctx.fill();
	}
	ctx.fillStyle = o.bg;
	roundRectPath(ctx, -w / 2, -h / 2, w, h, h / 2);
	ctx.fill();
	ctx.fillStyle = o.fg;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	setFont(ctx, family, size, o.weight ?? 400);
	ctx.fillText(text, 0, size * (family === DISPLAY ? 0.07 : 0.04));
	ctx.restore();
	return { w, h };
}

/** Pin de ubicación. @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} s @param {string} color @param {string} hole */
function pinIcon(ctx, x, y, s, color, hole) {
	const cx = x + s / 2;
	const r = s * 0.36;
	const cy = y + r + s * 0.02;
	ctx.save();
	ctx.fillStyle = color;
	ctx.beginPath();
	ctx.arc(cx, cy, r, Math.PI * 0.8, Math.PI * 2.2);
	ctx.lineTo(cx, y + s);
	ctx.closePath();
	ctx.fill();
	ctx.fillStyle = hole;
	ctx.beginPath();
	ctx.arc(cx, cy, r * 0.42, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();
}

/** @type {Map<string, HTMLCanvasElement>} */
const badgeCache = new Map();
/**
 * Logo redondo "KINKY VIBE" recoloreado con la paleta (el logo del sitio es rosa;
 * en Instagram usan violeta o blanco según la pieza).
 * @param {HTMLImageElement} logo @param {string} circle @param {string} letters
 */
function badgeCanvas(logo, circle, letters) {
	const key = logo.src + circle + letters;
	const hit = badgeCache.get(key);
	if (hit) return hit;
	const { cv, cx } = offscreen(logo.naturalWidth, logo.naturalHeight);
	cx.drawImage(logo, 0, 0);
	try {
		const data = cx.getImageData(0, 0, cv.width, cv.height);
		const d = data.data;
		const c = hexToRgb(circle);
		const l = hexToRgb(letters);
		for (let i = 0; i < d.length; i += 4) {
			if (!d[i + 3]) continue;
			// el logo es rosa (G bajo) con letras blancas (G alto): G decide la mezcla
			const t = Math.min(1, Math.max(0, (d[i + 1] - 60) / 170));
			d[i] = c[0] + (l[0] - c[0]) * t;
			d[i + 1] = c[1] + (l[1] - c[1]) * t;
			d[i + 2] = c[2] + (l[2] - c[2]) * t;
		}
		cx.putImageData(data, 0, 0);
	} catch (e) {
		// sin acceso a los píxeles: queda el logo original
	}
	badgeCache.set(key, cv);
	return cv;
}

/**
 * @param {CanvasRenderingContext2D} ctx @param {HTMLImageElement|null} logo
 * @param {number} x @param {number} y @param {number} s @param {Palette} p @param {number} [rot]
 */
function badge(ctx, logo, x, y, s, p, rot = -0.12) {
	if (!logo) return;
	const b = badgeCanvas(logo, p.badge, p.badgeText);
	ctx.save();
	ctx.translate(x + s / 2, y + s / 2);
	ctx.rotate(rot);
	ctx.drawImage(b, -s / 2, -s / 2, s, (s * b.height) / b.width);
	ctx.restore();
}

/* ------------------------------------------------------------------ */
/* Bloques                                                             */
/* ------------------------------------------------------------------ */

/**
 * @typedef {ReturnType<typeof defaultTexts>} Texts
 * @typedef {{x:number, y:number, w:number, h:number}} Box
 */

/**
 * Título completo: antetítulo chico, título gordo, bajada. Mide y (si no es dry) dibuja
 * centrado verticalmente en la caja.
 * @param {CanvasRenderingContext2D} ctx @param {Texts} t @param {Box} box @param {Palette} p
 * @param {{align:'left'|'center', maxSize:number, rot?:number, dry?:boolean, valign?:'top'|'center'|'bottom'}} o
 */
function titleBlock(ctx, t, box, p, o) {
	const kickSize = Math.round(o.maxSize * 0.34);
	const subMax = Math.round(o.maxSize * 0.42);
	const kick = t.kicker
		? fitText(ctx, t.kicker, {
				maxWidth: box.w,
				maxHeight: kickSize * 2.3,
				maxSize: kickSize,
				minSize: 26,
				weight: 600,
				maxLines: 2
		  })
		: null;
	const sub = t.sub
		? fitText(ctx, t.sub, {
				maxWidth: box.w,
				maxHeight: subMax * 2.4,
				maxSize: subMax,
				minSize: 28,
				weight: 600,
				lineHeight: 1.08,
				maxLines: 2
		  })
		: null;
	const kickH = kick ? kick.lines.length * kick.lineHeight + 14 : 0;
	const subH = sub ? sub.lines.length * sub.lineHeight + 18 : 0;
	const title = layoutTitle(ctx, t.title || ' ', {
		maxWidth: box.w - o.maxSize * 0.1,
		maxHeight: Math.max(box.h - kickH - subH, 80),
		maxSize: o.maxSize,
		minSize: 44
	});
	const h = kickH + title.h + subH;
	let y = box.y;
	if ((o.valign ?? 'center') === 'center') y = box.y + (box.h - h) / 2;
	if (o.valign === 'bottom') y = box.y + box.h - h;
	if (o.dry) return { y, h };
	const cx = o.align === 'center' ? box.x + box.w / 2 : box.x;
	ctx.save();
	if (o.rot) {
		ctx.translate(box.x + box.w / 2, y + h / 2);
		ctx.rotate(o.rot);
		ctx.translate(-(box.x + box.w / 2), -(y + h / 2));
	}
	let yy = y;
	if (kick) {
		ctx.fillStyle = p.sub;
		setFont(ctx, ROUND, kick.size, 600);
		ctx.textAlign = o.align;
		ctx.textBaseline = 'top';
		kick.lines.forEach((l, i) => ctx.fillText(l, cx, yy + i * kick.lineHeight));
		yy += kickH;
	}
	drawTitle(ctx, title, cx, yy, o.align, p);
	yy += title.h + 18;
	if (sub) {
		ctx.fillStyle = p.sub;
		setFont(ctx, ROUND, sub.size, 600);
		ctx.textAlign = o.align;
		ctx.textBaseline = 'top';
		sub.lines.forEach((l, i) => ctx.fillText(l, cx, yy + i * sub.lineHeight));
	}
	ctx.restore();
	return { y, h };
}

/**
 * Datos en stickers: fecha (pastilla grande), horario, lugar, precio y llamado.
 * @param {CanvasRenderingContext2D} ctx @param {Texts} t @param {Box} box @param {Palette} p
 * @param {{align:'left'|'center', scale?:number, dry?:boolean, onPhoto?:boolean}} o
 */
function infoStickers(ctx, t, box, p, o) {
	const k = o.scale ?? 1;
	const center = o.align === 'center';
	const x = center ? box.x + box.w / 2 : box.x;
	// sobre una foto el texto suelto no se lee: todo va en pastillas
	const textColor = o.onPhoto ? p.pillFg : p.text;
	/** @type {{h:number, draw:(y:number)=>void}[]} */
	const rows = [];
	const gap = 16 * k;
	if (t.date) {
		const dateOpts = {
			size: 74 * k,
			bg: p.pillBg,
			fg: p.pillFg,
			shadow: p.extrude,
			align: o.align,
			rot: -0.035,
			maxW: box.w
		};
		const d = pill(ctx, t.date, x, 0, { ...dateOpts, dry: true });
		rows.push({ h: d.h + 6 * k, draw: (y) => pill(ctx, t.date, x, y, dateOpts) });
	}
	if (t.hours) {
		const hoursOpts = o.onPhoto
			? { size: 44 * k, bg: p.pillBg, fg: p.pillFg, shadow: p.extrude, align: o.align, rot: 0.02, maxW: box.w }
			: null;
		if (hoursOpts) {
			const hh = pill(ctx, t.hours, x, 0, { ...hoursOpts, dry: true });
			rows.push({ h: hh.h, draw: (y) => pill(ctx, t.hours, x, y, hoursOpts) });
		} else {
			const f = fitText(ctx, t.hours, {
				family: DISPLAY,
				maxWidth: box.w,
				maxHeight: 60 * k,
				maxSize: 54 * k,
				minSize: 30,
				maxLines: 1
			});
			rows.push({
				h: f.lineHeight,
				draw(y) {
					ctx.fillStyle = textColor;
					setFont(ctx, DISPLAY, f.size);
					ctx.textAlign = o.align;
					ctx.textBaseline = 'top';
					ctx.fillText(f.lines[0], x + (center ? 0 : 6 * k), y);
				}
			});
		}
	}
	if (t.place) {
		const iconS = 42 * k;
		const f = fitText(ctx, t.place, {
			maxWidth: box.w - iconS - 16 * k - (o.onPhoto ? 60 * k : 0),
			maxHeight: 100 * k,
			maxSize: 42 * k,
			minSize: 26,
			weight: 600,
			lineHeight: 1.12,
			maxLines: 2
		});
		setFont(ctx, ROUND, f.size, 600);
		const tw = Math.max(...f.lines.map((l) => ctx.measureText(l).width));
		const rowW = iconS + 12 * k + tw;
		const padX = o.onPhoto ? 26 * k : 0;
		const h = Math.max(iconS, f.lines.length * f.lineHeight) + (o.onPhoto ? 24 * k : 0);
		rows.push({
			h,
			draw(y) {
				const left = center ? x - rowW / 2 : x + (o.onPhoto ? 0 : 6 * k);
				if (o.onPhoto) {
					ctx.fillStyle = p.pillBg;
					roundRectPath(ctx, left - padX / 2, y, rowW + padX * 1.5, h, 22 * k);
					ctx.fill();
				}
				const ty = y + (h - f.lines.length * f.lineHeight) / 2;
				pinIcon(ctx, left + (o.onPhoto ? padX / 3 : 0), y + (h - iconS) / 2, iconS, o.onPhoto ? p.pillFg : p.small, o.onPhoto ? p.pillBg : p.bg);
				ctx.fillStyle = textColor;
				setFont(ctx, ROUND, f.size, 600);
				ctx.textAlign = 'left';
				ctx.textBaseline = 'top';
				f.lines.forEach((l, i) =>
					ctx.fillText(l, left + iconS + 12 * k + (o.onPhoto ? padX / 3 : 0), ty + i * f.lineHeight)
				);
			}
		});
	}
	const extras = [t.price, t.cta].filter(Boolean);
	if (extras.length) {
		const size = 32 * k;
		const optsFor = (/** @type {number} */ i) => ({
			size,
			family: ROUND,
			weight: 700,
			bg: i === 0 && t.price ? p.small : p.text,
			fg: i === 0 && t.price ? p.bg : p.bg,
			shadow: null,
			maxW: box.w
		});
		const sizes = extras.map((e, i) => pill(ctx, e, 0, 0, { ...optsFor(i), dry: true }));
		const total = sizes.reduce((a, s) => a + s.w, 0) + 14 * k * (extras.length - 1);
		const stacked = total > box.w;
		const h = stacked ? sizes.reduce((a, s) => a + s.h + 10 * k, -10 * k) : Math.max(...sizes.map((s) => s.h));
		rows.push({
			h: h + 4 * k,
			draw(y) {
				let px = center ? x - total / 2 : x;
				let py = y + 4 * k;
				extras.forEach((e, i) => {
					if (stacked) {
						pill(ctx, e, x, py, { ...optsFor(i), align: o.align });
						py += sizes[i].h + 10 * k;
					} else {
						pill(ctx, e, px, py, { ...optsFor(i), align: 'left' });
						px += sizes[i].w + 14 * k;
					}
				});
			}
		});
	}
	const h = rows.reduce((a, r) => a + r.h + gap, -gap);
	if (o.dry) return { h: Math.max(0, h) };
	let y = box.y + Math.max(0, (box.h - h) / 2);
	for (const r of rows) {
		r.draw(y);
		y += r.h + gap;
	}
	return { h };
}

/** Fondo plano de la paleta con grano. @param {CanvasRenderingContext2D} ctx @param {number} w @param {number} h @param {Palette} p */
function flatBackground(ctx, w, h, p) {
	ctx.fillStyle = p.bg;
	ctx.fillRect(0, 0, w, h);
}

/**
 * Pieza principal cuadrada (flyer / duotono / tipográfica) dibujada en una caja.
 * Es lo que va en el post 1:1 y en la tarjeta de la historia.
 * @param {CanvasRenderingContext2D} ctx @param {RenderOpts} o @param {Box} b @param {Palette} p
 * @param {{withInfo:boolean}} [opt]
 */
function hero(ctx, o, b, p, opt = { withInfo: false }) {
	const t = o.texts;
	const gray = o.cancelled;
	ctx.save();
	ctx.beginPath();
	ctx.rect(b.x, b.y, b.w, b.h);
	ctx.clip();
	if (o.layout === 'flyer' && o.image) {
		if (gray && 'filter' in ctx) ctx.filter = 'grayscale(1) contrast(.9)';
		drawCover(ctx, o.image, b.x, b.y, b.w, b.h, 0.5);
		ctx.filter = 'none';
		if (opt.withInfo && o.overlay) {
			// stickers de fecha abajo a la izquierda, chicos para tapar lo menos posible del flyer
			const s = (b.w / 1080) * 0.8;
			const dry = infoStickers(ctx, { ...t, kicker: '', title: '', sub: '', price: '', cta: '' }, { x: b.x + 44 * s, y: 0, w: b.w * 0.7, h: 0 }, p, { align: 'left', scale: s * 0.92, dry: true, onPhoto: true });
			infoStickers(
				ctx,
				{ ...t, kicker: '', title: '', sub: '', price: '', cta: '' },
				{ x: b.x + 44 * s, y: b.y + b.h - dry.h - 48 * s, w: b.w * 0.7, h: dry.h },
				p,
				{ align: 'left', scale: s * 0.92, onPhoto: true }
			);
		}
	} else if (o.layout === 'duotono' && o.image) {
		const d = duotone(o.image, b.w, b.h, gray ? '#222222' : p.duoDark, gray ? '#bbbbbb' : p.duoLight, 0.35);
		ctx.fillStyle = p.bg2;
		ctx.fillRect(b.x, b.y, b.w, b.h);
		ctx.drawImage(d, b.x, b.y, b.w, b.h);
		// franja diagonal con el título (Picantearla)
		const s = b.w / 1080;
		const yl = b.y + b.h * 0.6;
		const yr = b.y + b.h * 0.48;
		ctx.fillStyle = p.bg;
		ctx.beginPath();
		ctx.moveTo(b.x, b.y);
		ctx.lineTo(b.x + b.w, b.y);
		ctx.lineTo(b.x + b.w, yr);
		ctx.lineTo(b.x, yl);
		ctx.closePath();
		ctx.fill();
		grain(ctx, b.x + b.w, b.y + b.h, 0.12);
		titleBlock(ctx, t, { x: b.x + 70 * s, y: b.y + 70 * s, w: b.w - 140 * s, h: b.h * 0.42 - 40 * s }, p, {
			align: 'center',
			maxSize: 150 * s,
			rot: -0.1
		});
		if (opt.withInfo) {
			const dry = infoStickers(ctx, { ...t, price: '', cta: '' }, { x: b.x + 44 * s, y: 0, w: b.w * 0.66, h: 0 }, p, { align: 'left', scale: s * 0.9, dry: true, onPhoto: true });
			infoStickers(ctx, { ...t, price: '', cta: '' }, { x: b.x + 44 * s, y: b.y + b.h - dry.h - 46 * s, w: b.w * 0.66, h: dry.h }, p, {
				align: 'left',
				scale: s * 0.9,
				onPhoto: true
			});
		}
	} else {
		// tipográfico: planos de color, lomas, trama y destellos
		const s = b.w / 1080;
		ctx.fillStyle = p.bg;
		ctx.fillRect(b.x, b.y, b.w, b.h);
		halftone(ctx, b.x + b.w * 0.98, b.y + b.h * 0.04, 300 * s, p.dots, 30 * s);
		hills(ctx, b.w, b.y + b.h * (opt.withInfo ? 0.62 : 0.78), b.y + b.h, p.bg2);
		grain(ctx, b.x + b.w, b.y + b.h, 0.14);
		sparkle(ctx, b.x + 70 * s, b.y + b.h * (opt.withInfo ? 0.5 : 0.62), 40 * s, p.accent);
		sparkle(ctx, b.x + b.w - 150 * s, b.y + b.h * (opt.withInfo ? 0.5 : 0.62), 34 * s, p.accent);
		sparkle(ctx, b.x + b.w - 90 * s, b.y + b.h * (opt.withInfo ? 0.56 : 0.7), 20 * s, p.accent);
		// cancelado: el título deja lugar para la cinta
		const titleH = opt.withInfo ? b.h * (o.cancelled ? 0.4 : 0.5) : b.h * 0.7;
		titleBlock(ctx, t, { x: b.x + 80 * s, y: b.y + 90 * s, w: b.w - 160 * s, h: titleH }, p, {
			align: 'center',
			maxSize: 170 * s,
			rot: -0.05
		});
		if (opt.withInfo) {
			// con estrella de estado abajo a la derecha, los datos (centrados) dejan libre esa esquina
			const inset = o.status && STATUS[o.status] && !STATUS[o.status].tape ? 250 : 80;
			const box = { x: b.x + inset * s, y: b.y + b.h * 0.64, w: b.w - 2 * inset * s, h: b.h * 0.3 };
			infoStickers(ctx, { ...t, price: '', cta: '' }, box, p, {
				align: 'center',
				scale: s * 0.95,
				onPhoto: true
			});
		}
	}
	ctx.restore();
}

/**
 * @typedef {{meta:any, texts:Texts, format:string, ratio:string, layout:string, palette:Palette,
 *   image:HTMLImageElement|null, logo:HTMLImageElement|null, cancelled:boolean, status?:string, overlay:boolean}} RenderOpts
 */

/** Estado a mostrar como sticker encima de la pieza. @param {CanvasRenderingContext2D} ctx @param {RenderOpts} o @param {Box} b @param {Palette} p */
function statusOverlay(ctx, o, b, p) {
	const st = o.status ? STATUS[o.status] : undefined;
	if (!st) return;
	const s = b.w / 1080;
	if (st.tape) {
		// entre el título y los datos, para que se siga leyendo qué se cancela
		const y = o.layout === 'tipografico' ? 0.555 : 0.6;
		tape(ctx, b.x + b.w / 2, b.y + b.h * y, b.w * 1.6, st.sticker[0], p.tape, p.tapeText, -0.07);
		return;
	}
	// abajo a la derecha: arriba suele estar el título (del flyer o el nuestro)
	starburst(
		ctx,
		b.x + b.w - 150 * s,
		b.y + b.h - 150 * s,
		118 * s,
		st.sticker,
		stickerColor(p),
		p.bg,
		p.extrude
	);
}

/** Color de la estrella de estado: el de las palabras chicas, salvo que se confunda con el título. @param {Palette} p */
const stickerColor = (p) => (p.small === p.title || p.small === p.text ? p.accent : p.small);

/* ------------------------------------------------------------------ */
/* Formatos                                                            */
/* ------------------------------------------------------------------ */

/** @param {CanvasRenderingContext2D} ctx @param {RenderOpts} o @param {number} w @param {number} h */
function renderPost(ctx, o, w, h) {
	const p = o.palette;
	flatBackground(ctx, w, h, p);
	if (h === w) {
		hero(ctx, o, { x: 0, y: 0, w, h }, p, { withInfo: true });
		statusOverlay(ctx, o, { x: 0, y: 0, w, h }, p);
		return;
	}
	// 4:5 → pieza cuadrada arriba + faja de datos con borde en diagonal
	const sq = w;
	hero(ctx, o, { x: 0, y: 0, w, h: sq }, p, { withInfo: false });
	statusOverlay(ctx, o, { x: 0, y: 0, w, h: sq }, p);
	ctx.fillStyle = p.bg;
	ctx.beginPath();
	ctx.moveTo(0, sq - 34);
	ctx.lineTo(w, sq + 16);
	ctx.lineTo(w, h);
	ctx.lineTo(0, h);
	ctx.closePath();
	ctx.fill();
	grain(ctx, w, h, 0.12);
	const bandTop = sq + 20;
	const badgeS = 170;
	badge(ctx, o.logo, w - badgeS - 44, bandTop + (h - bandTop - badgeS) / 2 - 6, badgeS, p);
	const t = { ...o.texts, cta: '' };
	infoStickers(ctx, t, { x: 52, y: bandTop, w: w - badgeS - 130, h: h - bandTop - 24 }, p, {
		align: 'left',
		scale: 0.8
	});
}

/** Placa de datos (segunda foto del carrusel). @param {CanvasRenderingContext2D} ctx @param {RenderOpts} o @param {number} w @param {number} h */
function renderInfo(ctx, o, w, h) {
	const p = o.palette;
	const t = o.texts;
	flatBackground(ctx, w, h, p);
	halftone(ctx, w * 0.02, h * 0.98, 360, p.dots, 32);
	grain(ctx, w, h, 0.14);
	sparkle(ctx, w - 110, 120, 44, p.accent);
	sparkle(ctx, w - 170, 200, 22, p.accent);
	const pad = 80;
	const short = h === w;
	const info = eventInfo(o.meta);
	// título chico arriba
	const tb = titleBlock(ctx, { ...t, sub: '', kicker: '' }, { x: pad, y: pad, w: w - pad * 2 - 120, h: short ? 190 : 250 }, p, {
		align: 'left',
		maxSize: short ? 96 : 112,
		valign: 'top',
		rot: -0.03
	});
	let y = tb.y + tb.h + (short ? 30 : 46);
	// resumen
	// cancelado en 1:1: sin resumen, para que los datos no queden diminutos
	const summary = h === w && o.status === 'cancelado' ? '' : String(o.meta.summary ?? '').trim();
	if (summary && summary !== '-') {
		const f = fitText(ctx, summary, {
			maxWidth: w - pad * 2,
			maxHeight: short ? 130 : 210,
			maxSize: 40,
			minSize: 30,
			weight: 500,
			lineHeight: 1.25,
			maxLines: short ? 3 : 5
		});
		ctx.fillStyle = p.text;
		setFont(ctx, ROUND, f.size, 500);
		ctx.textAlign = 'left';
		ctx.textBaseline = 'top';
		f.lines.forEach((l, i) => ctx.fillText(l, pad, y + i * f.lineHeight));
		y += f.lines.length * f.lineHeight + (short ? 30 : 50);
	}
	/** @type {[string, string, string][]} */
	const rows = [
		['CUÁNDO', t.date ? info.day : '', t.hours ? t.hours.toLowerCase() : ''],
		['DÓNDE', info.online ? 'Online' : shortPlace(info.place), info.address ? shortPlace(info.address) : ''],
		['ENTRADA', t.price ? capitalize(t.price.toLowerCase()) : '', ''],
		['INSCRIPCIÓN', t.cta ? capitalize(t.cta.toLowerCase().replace('link en bio', 'link en la bio')) : '', '']
	];
	// si el usuario editó fecha/lugar, respetamos su texto
	const custom = defaultTexts(o.meta);
	if (t.date !== custom.date) rows[0][1] = t.date;
	if (t.place !== custom.place) rows[1][1] = t.place;
	const footerY = h - 150;
	const cancelled = !!(o.status && STATUS[o.status]?.tape);
	const rowsShown = rows.filter((r) => r[1]);
	// cancelado: la cinta va abajo, sobre el pie, sin tapar los datos
	const avail = footerY - (cancelled ? 170 : 30) - y;
	const natural = (/** @type {string} */ sub) => 60 + 60 + (sub ? 46 : 0) + 34;
	const needed = rowsShown.reduce((a, r) => a + natural(r[2]), 0);
	const k = Math.max(0.75, Math.min(1.25, avail / Math.max(1, needed)));
	for (const [label, main, sub] of rowsShown) {
		const rowH = natural(sub) * k;
		const lp = pill(ctx, label, pad, y, {
			size: 34 * k,
			bg: p.pillBg,
			fg: p.pillFg,
			shadow: p.extrude,
			rot: -0.03
		});
		const mx = pad;
		const my = y + lp.h + 10 * k;
		const f = fitText(ctx, main, {
			maxWidth: w - pad * 2,
			maxHeight: 112 * k,
			maxSize: 48 * k,
			minSize: 34,
			weight: 600,
			maxLines: 2
		});
		ctx.fillStyle = p.text;
		setFont(ctx, ROUND, f.size, 600);
		ctx.textAlign = 'left';
		ctx.textBaseline = 'top';
		f.lines.forEach((l, i) => ctx.fillText(l, mx, my + i * f.lineHeight));
		const mainH = f.lines.length * f.lineHeight;
		if (sub) {
			const g = fitText(ctx, sub, { maxWidth: w - pad * 2, maxHeight: 44 * k, maxSize: 36 * k, minSize: 24, weight: 400, maxLines: 1 });
			ctx.globalAlpha = 0.85;
			setFont(ctx, ROUND, g.size, 400);
			ctx.fillText(g.lines[0], mx, my + mainH + 2);
			ctx.globalAlpha = 1;
		}
		y += rowH + Math.max(0, mainH - f.lineHeight);
	}
	// pie: logo + link
	badge(ctx, o.logo, pad - 6, footerY - 10, 110, p, -0.1);
	ctx.fillStyle = p.text;
	const [domain, ...rest] = info.url.split('/');
	const path = '/' + rest.join('/');
	const tx = pad + 124;
	const pathFit = fitText(ctx, path, { maxWidth: w - tx - pad, maxHeight: 40, maxSize: 32, minSize: 20, weight: 500, maxLines: 1 });
	ctx.textBaseline = 'alphabetic';
	ctx.textAlign = 'left';
	setFont(ctx, ROUND, 40, 700);
	ctx.fillText(domain, tx, footerY + 40);
	ctx.globalAlpha = 0.85;
	setFont(ctx, ROUND, pathFit.size, 500);
	ctx.fillText(pathFit.lines[0], tx, footerY + 40 + pathFit.size * 1.25);
	ctx.globalAlpha = 1;
	if (cancelled) tape(ctx, w / 2, footerY - 70, w * 1.6, 'CANCELADO', p.tape, p.tapeText, -0.04);
}

/** Historia 9:16. @param {CanvasRenderingContext2D} ctx @param {RenderOpts} o @param {number} w @param {number} h */
function renderStory(ctx, o, w, h) {
	const p = o.palette;
	const t = o.texts;
	flatBackground(ctx, w, h, p);
	halftone(ctx, w * 0.96, h * 0.06, 360, p.dots, 32);
	halftone(ctx, w * 0.02, h * 0.97, 300, p.dots, 32);
	grain(ctx, w, h, 0.14);
	// Instagram tapa ~220 px arriba y ~260 abajo con su interfaz
	const safeTop = 230;
	const safeBottom = 280;
	const cardS = 860;
	const cardX = (w - cardS) / 2;
	const cardY = safeTop + 40;
	// tarjeta con sombra dura, inclinada
	ctx.save();
	ctx.translate(w / 2, cardY + cardS / 2);
	ctx.rotate(-0.035);
	ctx.translate(-w / 2, -(cardY + cardS / 2));
	ctx.fillStyle = p.extrude;
	roundRectPath(ctx, cardX + 26, cardY + 26, cardS, cardS, 28);
	ctx.fill();
	ctx.save();
	roundRectPath(ctx, cardX, cardY, cardS, cardS, 28);
	ctx.clip();
	hero(ctx, o, { x: cardX, y: cardY, w: cardS, h: cardS }, p, { withInfo: false });
	ctx.restore();
	ctx.restore();
	sparkle(ctx, 110, cardY + cardS + 70, 40, p.accent);
	sparkle(ctx, w - 100, cardY - 10, 30, p.accent);
	const st = o.status ? STATUS[o.status] : undefined;
	if (st && !st.tape) {
		starburst(ctx, w - 170, cardY + cardS - 20, 130, st.sticker, stickerColor(p), p.bg, p.extrude);
	}
	if (st?.tape) tape(ctx, w / 2, cardY + cardS * 0.62, w * 1.6, 'CANCELADO', p.tape, p.tapeText, -0.1);
	// datos
	const infoTop = cardY + cardS + 76;
	const footer = h - safeBottom + 10;
	infoStickers(ctx, t, { x: 90, y: infoTop, w: w - 180, h: footer - infoTop - 90 }, p, {
		align: 'center',
		scale: 1.05
	});
	// pie: logo + dominio
	const bs = 96;
	setFont(ctx, ROUND, 38, 600);
	const dw = ctx.measureText(SITE).width;
	const total = bs + 18 + dw;
	badge(ctx, o.logo, (w - total) / 2, footer - bs / 2 + 30, bs, p, -0.1);
	ctx.fillStyle = p.text;
	ctx.textAlign = 'left';
	ctx.textBaseline = 'middle';
	ctx.fillText(SITE, (w - total) / 2 + bs + 18, footer + 30);
}

/**
 * Dibuja la imagen para compartir en el canvas dado.
 * @param {HTMLCanvasElement} canvas
 * @param {{meta:any, format:string, ratio?:string, layout:string, palette?:string, texts?:Texts,
 *   image:HTMLImageElement|null, logo:HTMLImageElement|null, showStatus?:boolean}} opts
 */
export function renderShareImage(canvas, opts) {
	const f = FORMATS[opts.format];
	const ratio = opts.ratio ?? 'portrait';
	const w = f.w;
	const h = opts.format === 'story' ? f.h : RATIOS[ratio]?.h ?? f.h;
	canvas.width = w;
	canvas.height = h;
	const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
	const showStatus = opts.showStatus ?? true;
	const status = showStatus ? opts.meta.status : undefined;
	const paletteId = !opts.palette || opts.palette === 'auto' ? pickPalette(opts.image) : opts.palette;
	/** @type {RenderOpts} */
	const o = {
		meta: opts.meta,
		texts: opts.texts ?? defaultTexts(opts.meta),
		format: opts.format,
		ratio,
		layout: !opts.image ? 'tipografico' : opts.layout,
		palette: PALETTES[paletteId] ?? PALETTES.uva,
		image: opts.image,
		logo: opts.logo,
		status,
		cancelled: status === 'cancelado',
		overlay: opts.overlay ?? true
	};
	ctx.clearRect(0, 0, w, h);
	ctx.textBaseline = 'top';
	if (opts.format === 'story') renderStory(ctx, o, w, h);
	else if (opts.format === 'info') renderInfo(ctx, o, w, h);
	else renderPost(ctx, o, w, h);
	return canvas;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<Blob|null>}
 */
export const canvasToBlob = (canvas) =>
	new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));

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
		lines.push(`👉 ${meta.link_text ? capitalize(String(meta.link_text).toLowerCase()) : 'Inscripción'}: link en bio`);
	}
	lines.push(`🔗 Más info: ${info.url}`);
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
