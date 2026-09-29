// Dibujo de las imágenes para compartir eventos, con Canvas 2D y sin dependencias.
//
// Los diseños salen de los flyers que publica la comunidad (ver LAYOUTS en shareImage.js):
// colores planos y saturados, títulos en display gruesa con contorno y sombra "extruida",
// palabras chicas intercaladas, franjas cruzadas con la fecha, estrellas con el precio,
// barra al pie con dónde anotarse y una nota con asterisco para quién es el evento.

import { FONTS, SITE, STATUS, eventInfo, shortPlace, defaultTexts } from './shareImage.js';
import { hexToRgb, readableText, ensureContrast, mix, luminance, DARK_TEXT } from './palette.js';

/** @param {import('./shareImage.js').FontOption} f @param {string} second */
const stack = (f, second) => `'${f.family}', '${second}', ${f.fallback}`;
// tipografías en uso: renderShareImage las fija en cada dibujo (la display tiene un
// respaldo distinto que la de textos, así las dos cadenas nunca son iguales)
let DISPLAY = stack(FONTS.display.lilita, 'Lilita One');
let DISPLAY_WEIGHT = 400;
let ROUND = stack(FONTS.body.fredoka, 'Lato');

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

/* ------------------------------------------------------------------ */
/* Helpers de dibujo                                                   */
/* ------------------------------------------------------------------ */

/** @param {CanvasRenderingContext2D} ctx @param {string} family @param {number} size @param {number|string} [weight] */
const setFont = (ctx, family, size, weight = 400) => {
	// la display se usa siempre en su único peso (Lato va en 900)
	if (family === DISPLAY) weight = DISPLAY_WEIGHT;
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
	// los espacios duros (\u00a0) no cortan: "20:30\u00a0HS" queda junto
	const words = text.split(/[^\S\u00a0]+/).filter(Boolean);
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

/** @type {Map<string, HTMLCanvasElement>} */
const badgeCache = new Map();
/**
 * Logo redondo "KINKY VIBE" recoloreado con la paleta (el logo del sitio es rosa;
 * en las piezas que publican va violeta o blanco según el caso).
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
/* Bloques comunes                                                     */
/* ------------------------------------------------------------------ */

/**
 * @typedef {import('./shareImage.js').Palette} Palette
 * @typedef {Palette & {bar:string, barText:string, note:string, noteText:string, stripe:string, stripeText:string}} FullPalette
 * @typedef {ReturnType<typeof defaultTexts>} Texts
 * @typedef {{x:number, y:number, w:number, h:number}} Box
 * @typedef {{w:number, h:number, top:number, bottom:number, s:number, qr:boolean[][]|null}} Frame
 * @typedef {{meta:any, texts:Texts, image:HTMLImageElement|null, logo:HTMLImageElement|null,
 *   status?:string, cancelled:boolean, layout:string}} RenderOpts
 */

/** Colores de las barras y franjas, derivados de la paleta. @param {Palette} p @returns {FullPalette} */
export function completePalette(p) {
	const bar = p.extrude;
	const note = p.pillBg;
	const stripe = '#fffaf0';
	return {
		...p,
		bar,
		barText: readableText(bar),
		note,
		noteText: readableText(note),
		stripe,
		stripeText: ensureContrast(luminance(p.bg) > 0.5 ? p.title : p.bg, stripe, 3.2)
	};
}

/** @param {string} hex @param {number} a */
const rgba = (hex, a) => {
	const [r, g, b] = hexToRgb(hex);
	return `rgba(${r},${g},${b},${a})`;
};
/** @param {string} s */
const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);
/** @param {string} text @param {number} max */
const firstWords = (text, max) =>
	text.length <= max ? text : text.slice(0, max).replace(/\s+\S*$/, '').replace(/[\s,.:;-]+$/, '') + '…';
/** @param {string} s */
const upperFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Título completo: antetítulo chico, título gordo, bajada. Mide y (si no es dry) dibuja
 * dentro de la caja.
 * @param {CanvasRenderingContext2D} ctx @param {Texts} t @param {Box} box @param {Palette} p
 * @param {{align:'left'|'center', maxSize:number, rot?:number, dry?:boolean, valign?:'top'|'center'|'bottom', minSize?:number}} o
 */
function titleBlock(ctx, t, box, p, o) {
	const kickSize = Math.round(o.maxSize * 0.36);
	const subMax = Math.round(o.maxSize * 0.42);
	const kick = t.kicker
		? fitText(ctx, t.kicker, {
				maxWidth: box.w,
				maxHeight: kickSize * 2.3,
				maxSize: kickSize,
				minSize: Math.min(26, kickSize),
				weight: 600,
				maxLines: 2
		  })
		: null;
	const sub = t.sub
		? fitText(ctx, t.sub, {
				maxWidth: box.w,
				maxHeight: subMax * 2.4,
				maxSize: subMax,
				minSize: Math.min(26, subMax),
				weight: 700,
				lineHeight: 1.08,
				maxLines: 2
		  })
		: null;
	const kickH = kick ? kick.lines.length * kick.lineHeight + 12 : 0;
	const subH = sub ? sub.lines.length * sub.lineHeight + 14 : 0;
	const title = layoutTitle(ctx, t.title || ' ', {
		maxWidth: box.w - o.maxSize * 0.12,
		maxHeight: Math.max(box.h - kickH - subH, 60),
		maxSize: o.maxSize,
		minSize: o.minSize ?? 40
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
	ctx.textAlign = o.align;
	ctx.textBaseline = 'top';
	if (kick) {
		ctx.fillStyle = p.sub;
		setFont(ctx, ROUND, kick.size, 600);
		kick.lines.forEach((l, i) => ctx.fillText(l, cx, yy + i * kick.lineHeight));
		yy += kickH;
	}
	drawTitle(ctx, title, cx, yy, o.align, p);
	yy += title.h + 14;
	if (sub) {
		ctx.fillStyle = p.sub;
		setFont(ctx, ROUND, sub.size, 700);
		ctx.textAlign = o.align;
		ctx.textBaseline = 'top';
		sub.lines.forEach((l, i) => ctx.fillText(l, cx, yy + i * sub.lineHeight));
	}
	ctx.restore();
	return { y, h };
}

/**
 * QR en un recuadro blanco (oscuro sobre claro, que es lo que leen todas las cámaras).
 * @param {CanvasRenderingContext2D} ctx @param {boolean[][]} qr @param {number} x @param {number} y @param {number} size
 */
function drawQR(ctx, qr, x, y, size) {
	const n = qr.length;
	const pad = size * 0.08;
	const cell = (size - 2 * pad) / n;
	ctx.save();
	ctx.fillStyle = '#ffffff';
	roundRectPath(ctx, x, y, size, size, size * 0.06);
	ctx.fill();
	ctx.fillStyle = DARK_TEXT;
	for (let r = 0; r < n; r++) {
		for (let c = 0; c < n; c++) {
			if (qr[r][c]) {
				ctx.fillRect(x + pad + c * cell, y + pad + r * cell, Math.ceil(cell), Math.ceil(cell));
			}
		}
	}
	ctx.restore();
}

/** "Inscribite en kinkyvibe.ar/calendario/…" @param {Texts} t */
const ctaLine = (t) => [t.cta, t.url || (t.cta ? SITE : '')].filter(Boolean).join(' ');

/**
 * Renglones del llamado + link: en uno si entra; si no, el llamado arriba y el link entero
 * abajo (achicado si hace falta, nunca cortado en el medio).
 * @param {CanvasRenderingContext2D} ctx @param {Texts} t @param {number} maxW @param {number} size
 * @returns {{text:string, size:number}[]}
 */
function ctaLines(ctx, t, maxW, size) {
	const url = t.url || (t.cta ? SITE : '');
	const one = [t.cta, url].filter(Boolean).join(' ');
	setFont(ctx, ROUND, size, 600);
	if (!one || ctx.measureText(one).width <= maxW) return one ? [{ text: one, size }] : [];
	/** @type {{text:string, size:number}[]} */
	const out = [];
	if (t.cta) {
		const f = fitText(ctx, t.cta, { maxWidth: maxW, maxHeight: size * 1.2, maxSize: size, minSize: size * 0.7, weight: 600, maxLines: 1 });
		out.push({ text: f.lines[0], size: f.size });
	}
	if (url) {
		let us = size;
		setFont(ctx, ROUND, us, 600);
		while (ctx.measureText(url).width > maxW && us > 12) setFont(ctx, ROUND, (us -= 1));
		out.push({ text: url, size: us });
	}
	return out;
}

/**
 * Barras al pie, como en casi todos los flyers: una oscura con dónde anotarse (y el QR, si
 * se pidió) y, abajo de todo, una nota con asterisco para quién es. Devuelve dónde empiezan.
 * @param {CanvasRenderingContext2D} ctx @param {Texts} t @param {Frame} f @param {FullPalette} p
 * @param {{dry?:boolean, skipMain?:boolean, skipNote?:boolean}} [opt]
 */
function footerBars(ctx, t, f, p, opt = {}) {
	const s = f.s;
	const note = opt.skipNote || !t.audience ? '' : '*' + lowerFirst(t.audience);
	const qr = !opt.skipMain && f.qr ? f.qr : null;
	const qrS = qr ? 170 * s : 0;
	const mainW = f.w - 90 * s - (qrS ? qrS + 30 * s : 0);
	const main = opt.skipMain ? [] : ctaLines(ctx, t, mainW, 33 * s);
	/** @type {{lines:{text:string, size:number}[], bg:string, fg:string, qr:boolean[][]|null}[]} */
	const items = [];
	if (note) {
		const fn = fitText(ctx, note, { maxWidth: f.w - 90 * s, maxHeight: 28 * s * 2.5, maxSize: 28 * s, minSize: 20 * s, weight: 600, lineHeight: 1.2, maxLines: 2 });
		items.push({ lines: fn.lines.map((text) => ({ text, size: fn.size })), bg: p.note, fg: p.noteText, qr: null });
	}
	if (main.length || qr) items.push({ lines: main, bg: p.bar, fg: p.barText, qr });
	let y = f.h - f.bottom;
	let first = true;
	for (const it of items) {
		const textH = it.lines.reduce((a, l) => a + l.size * 1.22, 0);
		const hh = Math.max(textH, it.qr ? qrS : 0) + 34 * s;
		const top = y - hh;
		if (!opt.dry) {
			ctx.fillStyle = it.bg;
			ctx.fillRect(0, top, f.w, (first ? f.h : y) - top);
			ctx.fillStyle = it.fg;
			ctx.textBaseline = 'top';
			let ty = top + (hh - textH) / 2 + 2 * s;
			const x = it.qr ? 45 * s + qrS + 30 * s : f.w / 2;
			ctx.textAlign = it.qr ? 'left' : 'center';
			if (it.qr) drawQR(ctx, it.qr, 45 * s, top + (hh - qrS) / 2, qrS);
			for (const l of it.lines) {
				setFont(ctx, ROUND, l.size, 600);
				ctx.fillText(l.text, x, ty);
				ty += l.size * 1.22;
			}
		}
		y = top;
		first = false;
	}
	return y;
}

/**
 * Estrella con el precio ("valor: $23.400 con posibilidad de beca").
 * @param {CanvasRenderingContext2D} ctx @param {number} cx @param {number} cy @param {number} r
 * @param {string} price @param {string} note @param {FullPalette} p
 */
function priceBurst(ctx, cx, cy, r, price, note, p) {
	const spikes = 20;
	/** @param {number} rr */
	const path = (rr) => {
		ctx.beginPath();
		for (let i = 0; i < spikes * 2; i++) {
			const q = i % 2 ? rr * 0.86 : rr;
			const a = (i / (spikes * 2)) * Math.PI * 2;
			ctx.lineTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q);
		}
		ctx.closePath();
	};
	const bg = p.pillBg;
	const fg = p.pillFg;
	ctx.save();
	ctx.translate(cx, cy);
	ctx.rotate(-0.08);
	ctx.translate(-cx, -cy);
	ctx.fillStyle = p.bar;
	path(r * 1.1);
	ctx.fill();
	ctx.fillStyle = bg;
	path(r);
	ctx.fill();
	ctx.fillStyle = fg;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'top';
	const isAmount = /\d/.test(price);
	const label = isAmount ? 'valor:' : '';
	const labelS = r * 0.2;
	let size = r * 0.44;
	setFont(ctx, DISPLAY, size);
	while (ctx.measureText(price).width > r * 1.45 && size > 12) setFont(ctx, DISPLAY, (size -= 2));
	const nf = note
		? fitText(ctx, note, { maxWidth: r * 1.3, maxHeight: r * 0.42, maxSize: r * 0.15, minSize: r * 0.1, weight: 600, lineHeight: 1.05, maxLines: 3 })
		: null;
	const total = (label ? labelS * 1.1 : 0) + size * 1.02 + (nf ? nf.lines.length * nf.lineHeight + 4 : 0);
	let y = cy - total / 2;
	if (label) {
		setFont(ctx, ROUND, labelS, 700);
		ctx.fillText(label, cx, y);
		y += labelS * 1.1;
	}
	setFont(ctx, DISPLAY, size);
	ctx.fillText(price, cx, y + size * 0.04);
	y += size * 1.02 + 4;
	if (nf) {
		setFont(ctx, ROUND, nf.size, 600);
		nf.lines.forEach((l, i) => ctx.fillText(l, cx, y + i * nf.lineHeight));
	}
	ctx.restore();
}

/**
 * Estado del evento: estrella (se viene / anotate / agotado) o cinta (cancelado).
 * @param {CanvasRenderingContext2D} ctx @param {RenderOpts} o @param {FullPalette} p
 * @param {number} x @param {number} y @param {number} r @param {number} tapeY @param {number} w
 */
function statusSticker(ctx, o, p, x, y, r, tapeY, w) {
	const st = o.status ? STATUS[o.status] : undefined;
	if (!st) return;
	if (st.tape) tape(ctx, w / 2, tapeY, w * 1.6, st.sticker[0], p.tape, p.tapeText, -0.07);
	else starburst(ctx, x, y, r, st.sticker, stickerColor(p), p.bg, p.extrude);
}

/** Color de la estrella de estado: el de las palabras chicas, salvo que se confunda con el título. @param {Palette} p */
const stickerColor = (p) => (p.small === p.title || p.small === p.text ? p.accent : p.small);

/** Fondo con la foto (duotono con la paleta, gris si se canceló). @param {RenderOpts} o @param {Palette} p @param {number} w @param {number} h @param {number} [focusY] */
const tinted = (o, p, w, h, focusY = 0.35) =>
	duotone(
		/** @type {HTMLImageElement} */ (o.image),
		w,
		h,
		o.cancelled ? '#222222' : p.duoDark,
		o.cancelled ? '#cccccc' : p.duoLight,
		focusY
	);

/**
 * "SÁBADO" + "17 DE ENERO" (o lo que se haya escrito en la fecha).
 * @param {RenderOpts} o
 */
function dateParts(o) {
	const t = o.texts;
	if (!t.date) return [];
	const def = defaultTexts(o.meta);
	const info = eventInfo(o.meta);
	if (t.date !== def.date || info.multiDay) return [t.date];
	const [weekday, ...rest] = info.day.replace(/ de \d{4}$/, '').split(' ');
	return [weekday.toUpperCase(), rest.join(' ').toUpperCase()];
}

/* ------------------------------------------------------------------ */
/* Portadas (un diseño por familia de flyers)                          */
/* ------------------------------------------------------------------ */

/**
 * "Flyer entero": el flyer del evento sin recortar (muchos ya traen sus textos), con la
 * fecha en una pastilla abajo y la barra con el link.
 * @param {CanvasRenderingContext2D} ctx @param {RenderOpts} o @param {Frame} f @param {FullPalette} p
 */
function tplFlyer(ctx, o, f, p) {
	const { w, h, s } = f;
	const t = o.texts;
	ctx.fillStyle = p.bg;
	ctx.fillRect(0, 0, w, h);
	halftone(ctx, w * 0.96, f.top + 40 * s, 340 * s, p.dots, 30 * s);
	halftone(ctx, w * 0.03, h - f.bottom - 160 * s, 300 * s, p.dots, 30 * s);
	grain(ctx, w, h, 0.12);
	const barsTop = footerBars(ctx, t, f, p, { dry: true });
	const line = [t.date, t.hours, t.place].filter(Boolean).join('  |  ');
	const pillO = { size: 46 * s, bg: p.pillBg, fg: p.pillFg, shadow: p.extrude, align: /** @type {const} */ ('center'), rot: -0.02, maxW: w - 90 * s };
	const lp = line ? pill(ctx, line, w / 2, 0, { ...pillO, dry: true }) : { w: 0, h: 0 };
	// el detalle largo de la entrada va en la ficha; acá solo si es corto
	const priceLine = [t.price, t.priceInfo.length <= 48 ? t.priceInfo : ''].filter(Boolean).join(' · ') || firstWords(t.priceInfo, 48);
	const priceO = { size: 34 * s, family: ROUND, weight: 700, bg: p.small, fg: readableText(p.small), shadow: null, align: /** @type {const} */ ('center'), maxW: w - 140 * s };
	const pp = priceLine ? pill(ctx, priceLine, w / 2, 0, { ...priceO, dry: true }) : { w: 0, h: 0 };
	const infoH = (lp.h ? lp.h + 24 * s : 0) + (pp.h ? pp.h + 16 * s : 0);
	const boxTop = f.top + 56 * s;
	const maxW = w - 110 * s;
	const maxH = barsTop - 36 * s - infoH - boxTop - 20 * s;
	const img = /** @type {HTMLImageElement} */ (o.image);
	const sc = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
	const dw = img.naturalWidth * sc;
	const dh = img.naturalHeight * sc;
	const x = (w - dw) / 2;
	const y = boxTop + (maxH - dh) / 2;
	ctx.fillStyle = p.extrude;
	roundRectPath(ctx, x + 18 * s, y + 18 * s, dw, dh, 16 * s);
	ctx.fill();
	ctx.save();
	roundRectPath(ctx, x, y, dw, dh, 16 * s);
	ctx.clip();
	if (o.cancelled && 'filter' in ctx) ctx.filter = 'grayscale(1)';
	ctx.drawImage(img, x, y, dw, dh);
	ctx.filter = 'none';
	ctx.restore();
	let yy = y + dh + 40 * s;
	if (line) {
		pill(ctx, line, w / 2, yy, pillO);
		yy += lp.h + 24 * s;
	}
	if (priceLine) pill(ctx, priceLine, w / 2, yy, priceO);
	badge(ctx, o.logo, Math.max(16 * s, x - 56 * s), Math.max(f.top + 10 * s, y - 50 * s), 136 * s, p, -0.12);
	statusSticker(ctx, o, p, Math.min(w - 130 * s, x + dw - 20 * s), y + dh - 60 * s, 118 * s, y + dh * 0.6, w);
	footerBars(ctx, t, f, p);
}

/**
 * "Franja cruzada" (Picantearla): bloque oscuro arriba con el título, franja clara en
 * diagonal con fecha, horario y lugar, foto en duotono a la izquierda, entrada grande a la
 * derecha y otra franja abajo con dónde anotarse.
 * @param {CanvasRenderingContext2D} ctx @param {RenderOpts} o @param {Frame} f @param {FullPalette} p
 */
function tplFranja(ctx, o, f, p) {
	const { w, h, s, top } = f;
	const t = o.texts;
	const H = h - top - f.bottom;
	// con QR la barra de abajo va derecha (el QR no se lee bien girado)
	const flatBar = !!f.qr;
	ctx.fillStyle = p.bg;
	ctx.fillRect(0, 0, w, h);
	const noteTop = footerBars(ctx, t, f, p, { dry: true, skipMain: !flatBar });
	const yL = top + H * 0.37;
	const yR = top + H * 0.25;
	const ang = Math.atan2(yR - yL, w);
	const hasPrice = !!(t.price || t.priceInfo);
	if (o.image) {
		// con precio, la foto va a la izquierda y el precio sobre el fondo liso
		const bw = hasPrice ? w * 0.66 : w;
		const bh = noteTop - yR;
		ctx.drawImage(tinted(o, p, bw, bh, 0.25), 0, yR, bw, bh);
		if (hasPrice) {
			const g = ctx.createLinearGradient(bw * 0.62, 0, bw, 0);
			g.addColorStop(0, rgba(p.bg, 0));
			g.addColorStop(1, p.bg);
			ctx.fillStyle = g;
			ctx.fillRect(bw * 0.62, yR, bw * 0.38 + 1, bh);
		}
	} else {
		halftone(ctx, w * 0.18, noteTop - 180 * s, 420 * s, p.dots, 34 * s);
	}
	ctx.fillStyle = p.bar;
	ctx.beginPath();
	ctx.moveTo(0, 0);
	ctx.lineTo(w, 0);
	ctx.lineTo(w, yR);
	ctx.lineTo(0, yL);
	ctx.closePath();
	ctx.fill();
	grain(ctx, w, h, 0.14);
	// título dentro del bloque oscuro, inclinado como la franja
	// como en Picantearla: relleno de color, contorno oscuro y sombra clara
	const titleFill = ensureContrast(p.title, p.bar, 3);
	const titleP = { ...p, title: titleFill, extrude: mix(titleFill, '#ffffff', 0.65), outline: p.bar, sub: p.barText, small: p.barText };
	titleBlock(ctx, t, { x: 64 * s, y: top + 34 * s, w: w - 128 * s, h: yR - top - 40 * s }, titleP, {
		align: 'left',
		maxSize: 150 * s,
		rot: ang
	});
	// franja clara con los datos
	const sh = 84 * s;
	const midY = (yL + yR) / 2;
	ctx.save();
	ctx.translate(w / 2, midY + sh * 0.1);
	ctx.rotate(ang);
	ctx.fillStyle = p.stripe;
	ctx.fillRect(-w, -sh / 2, 2 * w, sh);
	const line = [t.date, t.hours, t.place].filter(Boolean).join(' | ').toUpperCase();
	if (line) {
		const fl = fitText(ctx, line, { maxWidth: w * 0.92, maxHeight: sh, maxSize: 46 * s, minSize: 22 * s, weight: 700, maxLines: 1 });
		ctx.fillStyle = p.stripeText;
		setFont(ctx, ROUND, fl.size, 700);
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(fl.lines[0], 0, fl.size * 0.04);
	}
	ctx.restore();
	// entrada, a la derecha
	const px = w * 0.6;
	const pw = w - px - 46 * s;
	let py = yR + sh + 60 * s;
	const cx = px + pw / 2;
	const priceBottom = noteTop - (flatBar ? 60 : 230) * s;
	if (t.price) {
		ctx.fillStyle = p.text;
		setFont(ctx, DISPLAY, 52 * s);
		ctx.textAlign = 'center';
		ctx.textBaseline = 'top';
		ctx.fillText(/\d/.test(t.price) ? 'ENTRADA' : 'ENTRADA', cx, py);
		py += 62 * s;
		let size = 124 * s;
		setFont(ctx, DISPLAY, size);
		while (ctx.measureText(t.price).width > pw && size > 30) setFont(ctx, DISPLAY, (size -= 4));
		const tw = ctx.measureText(t.price).width;
		chunky(ctx, t.price, cx - tw / 2, py + size * 0.82, size, { fill: p.text, extrude: p.bar, outline: null, depth: size * 0.06 });
		py += size * 1.08;
	}
	if (t.priceInfo && priceBottom - py > 40 * s) {
		const fi = fitText(ctx, t.priceInfo.toUpperCase(), { maxWidth: pw, maxHeight: priceBottom - py, maxSize: 36 * s, minSize: 24 * s, weight: 700, lineHeight: 1.12, maxLines: 5 });
		ctx.fillStyle = p.text;
		setFont(ctx, ROUND, fi.size, 700);
		ctx.textAlign = 'center';
		ctx.textBaseline = 'top';
		fi.lines.forEach((l, i) => ctx.fillText(l, cx, py + i * fi.lineHeight));
	}
	// franja de abajo con el link
	const main = ctaLine(t).toUpperCase();
	const by = noteTop - 110 * s;
	if (!flatBar && main) {
		const bandC = mix(p.bar, '#ffffff', 0.28);
		ctx.save();
		ctx.translate(w / 2, by);
		ctx.rotate(ang * 0.8);
		ctx.fillStyle = bandC;
		ctx.fillRect(-w, -40 * s, 2 * w, 80 * s);
		const fl = fitText(ctx, main, { maxWidth: w * 0.94, maxHeight: 80 * s, maxSize: 34 * s, minSize: 18 * s, weight: 700, maxLines: 1 });
		ctx.fillStyle = readableText(bandC);
		setFont(ctx, ROUND, fl.size, 700);
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(fl.lines[0], 0, fl.size * 0.04);
		ctx.restore();
	}
	badge(ctx, o.logo, w - 230 * s, (flatBar ? noteTop : by) - 250 * s, 190 * s, p, -0.1);
	statusSticker(ctx, o, p, w * 0.2, yL + 180 * s, 115 * s, (yR + noteTop) / 2, w);
	footerBars(ctx, t, f, p, { skipMain: !flatBar });
}

/**
 * "Foto con título" (Taller de sumisión, Taller de humillación, Brateo): foto a sangre,
 * datos en recuadros arriba a la izquierda, estrella con el valor, título enorme abajo y
 * barra con el link.
 * @param {CanvasRenderingContext2D} ctx @param {RenderOpts} o @param {Frame} f @param {FullPalette} p
 */
function tplFoto(ctx, o, f, p) {
	const { w, h, s, top } = f;
	const t = o.texts;
	const H = h - top - f.bottom;
	ctx.fillStyle = p.bg;
	ctx.fillRect(0, 0, w, h);
	const barsTop = footerBars(ctx, t, f, p, { dry: true });
	if (o.image) {
		if (o.cancelled && 'filter' in ctx) ctx.filter = 'grayscale(1)';
		drawCover(ctx, o.image, 0, 0, w, barsTop, 0.3);
		ctx.filter = 'none';
		const g = ctx.createLinearGradient(0, top + H * 0.4, 0, barsTop);
		g.addColorStop(0, rgba(p.bg, 0));
		g.addColorStop(0.55, rgba(p.bg, 0.75));
		g.addColorStop(1, rgba(p.bg, 0.97));
		ctx.fillStyle = g;
		ctx.fillRect(0, top + H * 0.4, w, barsTop - top - H * 0.4 + 1);
	} else {
		halftone(ctx, w * 0.9, top + H * 0.3, 420 * s, p.dots, 34 * s);
		sparkle(ctx, w * 0.14, top + H * 0.45, 40 * s, p.accent);
	}
	grain(ctx, w, h, 0.12);
	// recuadros con fecha y lugar
	let y = top + 50 * s;
	const x = 50 * s;
	const boxW = w * 0.42;
	/** @param {string[]} lines @param {number} size */
	const box = (lines, size) => {
		const fits = lines.map((l) => fitText(ctx, l, { family: DISPLAY, maxWidth: boxW - 40 * s, maxHeight: size * 1.2, maxSize: size, minSize: 18 * s, maxLines: 1 }));
		setFont(ctx, DISPLAY, size);
		const bw = Math.max(...fits.map((fi) => (setFont(ctx, DISPLAY, fi.size), ctx.measureText(fi.lines[0]).width))) + 40 * s;
		const bh = fits.reduce((a, fi) => a + fi.size * 1.05, 0) + 28 * s;
		ctx.fillStyle = p.pillBg;
		ctx.strokeStyle = p.bar;
		ctx.lineWidth = 6 * s;
		ctx.fillRect(x, y, bw, bh);
		ctx.strokeRect(x, y, bw, bh);
		ctx.fillStyle = p.pillFg;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'top';
		let ly = y + 16 * s;
		for (const fi of fits) {
			setFont(ctx, DISPLAY, fi.size);
			ctx.fillText(fi.lines[0], x + bw / 2, ly + fi.size * 0.06);
			ly += fi.size * 1.05;
		}
		y += bh + 14 * s;
	};
	const dp = dateParts(o);
	if (dp.length || t.hours) box([...dp, t.hours].filter(Boolean), 56 * s);
	if (t.place) box([t.place.toUpperCase()], 42 * s);
	badge(ctx, o.logo, w - 200 * s, top + 40 * s, 150 * s, p, 0.1);
	// título abajo
	const titleTop = top + H * 0.56;
	const titleP = { ...p, outline: p.outline ?? p.extrude };
	titleBlock(ctx, t, { x: 60 * s, y: titleTop, w: w - 120 * s, h: barsTop - 40 * s - titleTop }, titleP, {
		align: 'center',
		maxSize: 170 * s,
		valign: 'bottom'
	});
	const st = o.status ? STATUS[o.status] : undefined;
	if (t.price || t.priceInfo) {
		const note = t.price && t.priceInfo.length <= 48 ? t.priceInfo : '';
		const main = t.price || (t.priceInfo.length <= 16 ? t.priceInfo : '');
		if (main) priceBurst(ctx, w - 200 * s, top + H * (st && !st.tape ? 0.46 : 0.42), 150 * s, main, note, p);
	}
	statusSticker(ctx, o, p, w - 150 * s, top + 330 * s, 100 * s, top + H * 0.5, w);
	footerBars(ctx, t, f, p);
}

/**
 * "Encabezado partido" (Grupo de apoyo y discusión): título a la izquierda, línea, fecha
 * grande con contorno a la derecha y detalles abajo; la imagen ocupa la parte de abajo;
 * barra con el link y nota con asterisco.
 * @param {CanvasRenderingContext2D} ctx @param {RenderOpts} o @param {Frame} f @param {FullPalette} p
 */
function tplGrupo(ctx, o, f, p) {
	const { w, h, s, top } = f;
	const t = o.texts;
	const H = h - top - f.bottom;
	ctx.fillStyle = p.bg;
	ctx.fillRect(0, 0, w, h);
	const barsTop = footerBars(ctx, t, f, p, { dry: true });
	const headTop = top + 64 * s;
	const headH = Math.min(H * (H / w < 1.1 ? 0.46 : 0.38), 560 * s);
	const leftW = w * 0.5;
	const divX = 60 * s + leftW + 26 * s;
	// imagen / lomas abajo
	const imgTop = headTop + headH + 30 * s;
	if (imgTop < barsTop - 60 * s) {
		ctx.save();
		ctx.beginPath();
		ctx.moveTo(0, barsTop);
		ctx.lineTo(0, imgTop + 50 * s);
		ctx.bezierCurveTo(w * 0.22, imgTop - 40 * s, w * 0.4, imgTop + 70 * s, w * 0.6, imgTop + 10 * s);
		ctx.bezierCurveTo(w * 0.78, imgTop - 40 * s, w * 0.9, imgTop + 40 * s, w, imgTop);
		ctx.lineTo(w, barsTop);
		ctx.closePath();
		ctx.clip();
		if (o.image) {
			if (o.cancelled && 'filter' in ctx) ctx.filter = 'grayscale(1)';
			drawCover(ctx, o.image, 0, imgTop - 60 * s, w, barsTop - imgTop + 60 * s, 0.6);
			ctx.filter = 'none';
		} else {
			ctx.fillStyle = p.bg2;
			ctx.fillRect(0, imgTop - 60 * s, w, barsTop - imgTop + 60 * s);
			halftone(ctx, w * 0.8, barsTop - 60 * s, 380 * s, mix(p.bg2, p.bg, 0.4), 30 * s);
			hills(ctx, w, imgTop + (barsTop - imgTop) * 0.55, barsTop, mix(p.bg2, p.title, 0.25));
		}
		ctx.restore();
	}
	grain(ctx, w, h, 0.12);
	// título a la izquierda (con conectores chicos: GRUPO de APOYO y DISCUSIÓN)
	titleBlock(ctx, t, { x: 60 * s, y: headTop, w: leftW, h: headH }, p, { align: 'left', maxSize: 118 * s, valign: 'center' });
	// línea divisoria
	ctx.fillStyle = p.title;
	ctx.fillRect(divX, headTop, 8 * s, headH);
	// fecha con contorno a la derecha
	const rx = divX + 34 * s;
	const rw = w - rx - 50 * s;
	let y = headTop + 4 * s;
	const dp = [...dateParts(o), t.hours].filter(Boolean);
	dp.forEach((l, i) => {
		let size = (i === 0 && dp.length > 1 ? 100 : 62) * s;
		setFont(ctx, DISPLAY, size);
		while (ctx.measureText(l).width > rw && size > 20) setFont(ctx, DISPLAY, (size -= 2));
		ctx.save();
		ctx.lineJoin = 'round';
		ctx.lineWidth = size * (size > 80 * s ? 0.12 : 0.08);
		ctx.strokeStyle = p.title;
		ctx.fillStyle = ensureContrast(mix(p.bg, '#ffffff', 0.55), p.title, 3);
		ctx.textAlign = 'left';
		ctx.textBaseline = 'top';
		ctx.strokeText(l, rx, y);
		ctx.fillText(l, rx, y);
		ctx.restore();
		y += size * 1.02;
	});
	if (dp.length) {
		y += 14 * s;
		ctx.fillStyle = p.title;
		ctx.fillRect(rx - 34 * s, y, rw + 34 * s + 20 * s, 7 * s);
		y += 24 * s;
	}
	const details = [t.place ? lowerFirst(t.place === t.place.toUpperCase() ? t.place.toLowerCase() : t.place) : '', t.price ? t.price.toLowerCase() : '', t.priceInfo].filter(Boolean);
	if (details.length) {
		const room = headTop + headH - y;
		/** @type {string[]} */
		let lines = [];
		let size = 36 * s;
		for (; size >= 22 * s; size -= 2 * s) {
			setFont(ctx, ROUND, size, 600);
			lines = details.flatMap((d) => wrapLines(ctx, d, rw));
			if (lines.length * size * 1.12 <= room) break;
		}
		const lh = size * 1.12;
		ctx.fillStyle = p.title;
		ctx.textAlign = 'left';
		ctx.textBaseline = 'top';
		lines.slice(0, Math.max(1, Math.floor(room / lh))).forEach((l, i) => ctx.fillText(l, rx, y + i * lh));
	}
	if (imgTop < barsTop - 60 * s) {
		ctx.save();
		ctx.globalAlpha = 0.92;
		// abajo a la izquierda de la imagen: arriba pisaba el final del título
		badge(ctx, o.logo, 40 * s, barsTop - 190 * s, 150 * s, p, -0.12);
		ctx.restore();
	}
	statusSticker(ctx, o, p, w - 150 * s, imgTop + 120 * s, 110 * s, (imgTop + barsTop) / 2, w);
	footerBars(ctx, t, f, p);
}

/**
 * "Cartel centrado" (Club de Hosts, Age Play): fondo con trama de puntos, título centrado
 * con contorno y destellos, recuadro oscuro con fecha y lugar, barra con el link.
 * @param {CanvasRenderingContext2D} ctx @param {RenderOpts} o @param {Frame} f @param {FullPalette} p
 */
function tplCartel(ctx, o, f, p) {
	const { w, h, s, top } = f;
	const t = o.texts;
	const H = h - top - f.bottom;
	ctx.fillStyle = p.bg;
	ctx.fillRect(0, 0, w, h);
	// trama de puntos parejos
	ctx.fillStyle = rgba(p.dots, 0.9);
	const step = 22 * s;
	for (let yy = step / 2; yy < h; yy += step) {
		for (let xx = ((yy / step) % 2 ? step / 2 : 0) + step / 4; xx < w; xx += step) {
			ctx.beginPath();
			ctx.arc(xx, yy, 2.6 * s, 0, Math.PI * 2);
			ctx.fill();
		}
	}
	grain(ctx, w, h, 0.1);
	const barsTop = footerBars(ctx, t, f, p, { dry: true });
	// recuadro con los datos (se mide primero para saber cuánto lugar queda)
	// fecha y horario no se parten por dentro ("19 A 20:30" / "HS" quedaba feo)
	const dateLine = [t.date, t.hours].filter(Boolean).map((x) => x.trim().replace(/ +/g, '\u00a0')).join('  •  ');
	const placeLine = t.place;
	// el detalle largo de la entrada va en la ficha; acá solo si es corto
	const priceLine = [t.price, t.priceInfo.length <= 48 ? t.priceInfo : ''].filter(Boolean).join(' · ') || firstWords(t.priceInfo, 48);
	const bw = w * 0.76;
	const lines = [
		dateLine && { text: dateLine, size: 50 * s, weight: 700, color: ensureContrast(p.title, p.bar, 4.5) },
		placeLine && { text: placeLine, size: 32 * s, weight: 500, color: p.barText },
		priceLine && { text: priceLine, size: 30 * s, weight: 700, color: ensureContrast(p.small, p.bar, 4.5) }
	].filter(Boolean);
	const fits = /** @type {{text:string,size:number,weight:number,color:string}[]} */ (lines).map((l) => ({
		l,
		f: fitText(ctx, l.text, { maxWidth: bw - 120 * s, maxHeight: l.size * 2.4, maxSize: l.size, minSize: l.size * 0.6, weight: l.weight, lineHeight: 1.15, maxLines: 2 })
	}));
	const boxH = fits.length ? fits.reduce((a, x) => a + x.f.lines.length * x.f.lineHeight + 8 * s, 0) + 44 * s : 0;
	const boxY = barsTop - 70 * s - boxH;
	// imagen chica (si entra) entre el título y el recuadro
	const titleTop = top + Math.max(70 * s, H * 0.08);
	const titleH = Math.min(H * 0.42, boxY - titleTop - 40 * s);
	const tb = titleBlock(ctx, t, { x: 120 * s, y: titleTop, w: w - 240 * s, h: titleH }, { ...p, outline: p.outline ?? p.extrude }, {
		align: 'center',
		maxSize: 180 * s,
		dry: true
	});
	const freeTop = tb.y + tb.h + 40 * s;
	const freeH = boxY - 40 * s - freeTop;
	const withImage = !!o.image && freeH > 260 * s;
	// sin imagen, el título se centra en todo el espacio libre
	const titleBox = withImage
		? { x: 120 * s, y: titleTop, w: w - 240 * s, h: titleH }
		: { x: 110 * s, y: titleTop, w: w - 220 * s, h: boxY - 50 * s - titleTop };
	if (withImage && o.image) {
		const img = o.image;
		const sc = Math.min((w * 0.6) / img.naturalWidth, freeH / img.naturalHeight);
		const dw = img.naturalWidth * sc;
		const dh = img.naturalHeight * sc;
		const ix = (w - dw) / 2;
		const iy = freeTop + (freeH - dh) / 2;
		ctx.save();
		ctx.translate(w / 2, iy + dh / 2);
		ctx.rotate(0.03);
		ctx.translate(-w / 2, -(iy + dh / 2));
		ctx.fillStyle = p.bar;
		roundRectPath(ctx, ix + 16 * s, iy + 16 * s, dw, dh, 20 * s);
		ctx.fill();
		roundRectPath(ctx, ix, iy, dw, dh, 20 * s);
		ctx.clip();
		if (o.cancelled && 'filter' in ctx) ctx.filter = 'grayscale(1)';
		ctx.drawImage(img, ix, iy, dw, dh);
		ctx.filter = 'none';
		ctx.restore();
	}
	const tb2 = titleBlock(ctx, t, titleBox, { ...p, outline: p.outline ?? p.extrude }, {
		align: 'center',
		maxSize: withImage ? 180 * s : 200 * s
	});
	tb.y = tb2.y;
	tb.h = tb2.h;
	sparkle(ctx, 80 * s, tb.y + tb.h * 0.7, 44 * s, p.accent);
	sparkle(ctx, w - 90 * s, tb.y + 20 * s, 50 * s, p.accent);
	sparkle(ctx, w - 150 * s, tb.y + 110 * s, 22 * s, p.accent);
	badge(ctx, o.logo, 40 * s, tb.y - 30 * s, 110 * s, p, -0.12);
	if (fits.length) {
		const bx = (w - bw) / 2;
		ctx.fillStyle = p.bar;
		ctx.strokeStyle = mix(p.bar, '#ffffff', 0.3);
		ctx.lineWidth = 5 * s;
		roundRectPath(ctx, bx, boxY, bw, boxH, 34 * s);
		ctx.fill();
		ctx.stroke();
		let yy = boxY + 22 * s;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'top';
		for (const { l, f: fi } of fits) {
			ctx.fillStyle = l.color;
			setFont(ctx, ROUND, fi.size, l.weight);
			fi.lines.forEach((ln, i) => ctx.fillText(ln, w / 2, yy + i * fi.lineHeight));
			yy += fi.lines.length * fi.lineHeight + 8 * s;
		}
		if (dateLine) {
			sparkle(ctx, bx + 34 * s, boxY + 22 * s + fits[0].f.lineHeight / 2, 14 * s, p.accent);
			sparkle(ctx, bx + bw - 34 * s, boxY + 22 * s + fits[0].f.lineHeight / 2, 14 * s, p.accent);
		}
	}
	statusSticker(ctx, o, p, w - 150 * s, boxY - 40 * s, 105 * s, (tb.y + tb.h + boxY) / 2, w);
	footerBars(ctx, t, f, p);
}

/* ------------------------------------------------------------------ */
/* Ficha con todos los datos                                           */
/* ------------------------------------------------------------------ */

/**
 * Deja como mucho n renglones; si sobra texto, el último termina en "…".
 * @param {CanvasRenderingContext2D} ctx @param {string[]} lines @param {number} n @param {number} maxW
 */
function clampLines(ctx, lines, n, maxW) {
	if (lines.length <= n) return lines;
	const out = lines.slice(0, n);
	let last = out[n - 1];
	while (last.length > 1 && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1);
	out[n - 1] = last.replace(/[\s,.:;-]+$/, '') + '…';
	return out;
}

/**
 * @param {CanvasRenderingContext2D} ctx @param {RenderOpts} o @param {Frame} f @param {FullPalette} p
 */
function renderInfo(ctx, o, f, p) {
	const { w, h, s } = f;
	const t = o.texts;
	const info = eventInfo(o.meta);
	const def = defaultTexts(o.meta);
	ctx.fillStyle = p.bg;
	ctx.fillRect(0, 0, w, h);
	halftone(ctx, w * 0.02, h * 0.9, 360 * s, p.dots, 32 * s);
	grain(ctx, w, h, 0.14);
	sparkle(ctx, w - 70 * s, 250 * s, 26 * s, p.accent);
	const pad = 72 * s;
	const short = h <= w;
	const barsTop = footerBars(ctx, t, f, p, { skipNote: true });
	badge(ctx, o.logo, w - 200 * s, f.top + 44 * s, 140 * s, p, 0.1);
	const tb = titleBlock(ctx, { ...t, kicker: '', sub: t.sub }, { x: pad, y: f.top + pad, w: w - pad * 2 - 150 * s, h: (short ? 180 : 250) * s }, p, {
		align: 'left',
		maxSize: (short ? 92 : 108) * s,
		valign: 'top',
		rot: -0.02
	});
	let y = tb.y + tb.h + (short ? 26 : 40) * s;
	/** @type {[string, string, string][]} */
	const rows = [
		['CUÁNDO', t.date === def.date ? info.day : t.date, t.hours === def.hours ? info.hours : t.hours.toLowerCase()],
		['DÓNDE', t.place === def.place ? (info.online ? 'Online' : shortPlace(info.place)) : t.place, t.address],
		['ENTRADA', t.price ? upperFirst(t.price === t.price.toUpperCase() && !/\d/.test(t.price) ? t.price.toLowerCase() : t.price) : t.priceInfo, t.price ? t.priceInfo : ''],
		['ORGANIZA', t.organizers, ''],
		['PARA QUIÉN', t.audience ? upperFirst(t.audience) : '', ''],
		[/dress|vestim/i.test(t.dress) ? 'DRESS CODE' : 'TENÉ EN CUENTA', t.dress, ''],
		['ACCESIBILIDAD', t.access, '']
	];
	if (!t.date) rows[0][1] = '';
	if (!t.place) rows[1][1] = t.address;
	const shown = rows.filter((r) => r[1]);
	const tagsH = t.tags ? 60 * s : 0;
	const avail = barsTop - 40 * s - tagsH - y;
	// resumen + filas: se busca la escala más grande con la que todo entra
	const summary = t.summary;
	/** @param {number} k */
	const measure = (k) => {
		setFont(ctx, DISPLAY, 30 * k * s);
		const labelW = Math.max(0, ...shown.map((r) => ctx.measureText(r[0]).width)) + 36 * k * s;
		const vx = pad + labelW + 22 * s;
		const vw = w - pad - vx;
		let total = 0;
		/** @type {{sum:string[]|null, rows:{label:string, main:string[], sub:string[], h:number}[], labelW:number, vx:number, vw:number}} */
		const L = { sum: null, rows: [], labelW, vx, vw };
		if (summary) {
			setFont(ctx, ROUND, 36 * k * s, 500);
			L.sum = clampLines(ctx, wrapLines(ctx, summary, w - pad * 2), short ? 3 : 4, w - pad * 2);
			total += L.sum.length * 36 * k * s * 1.25 + 26 * k * s;
		}
		for (const [label, main, sub] of shown) {
			setFont(ctx, ROUND, 38 * k * s, 600);
			const m = clampLines(ctx, wrapLines(ctx, main, vw), 3, vw);
			setFont(ctx, ROUND, 31 * k * s, 400);
			const sb = sub ? clampLines(ctx, wrapLines(ctx, sub, vw), 2, vw) : [];
			const rh = Math.max(30 * k * s * 1.5, m.length * 38 * k * s * 1.18 + sb.length * 31 * k * s * 1.18) + 22 * k * s;
			L.rows.push({ label, main: m, sub: sb, h: rh });
			total += rh;
		}
		return { total, L };
	};
	// con pocos datos la letra crece (hasta 1.5) en vez de dejar medio cartel vacío
	let k = 1.5;
	let m = measure(k);
	while (m.total > avail && k > 0.6) m = measure((k -= 0.05));
	const { L } = m;
	if (m.total < avail) y += Math.min((avail - m.total) / 3, 120 * s);
	if (L.sum) {
		ctx.fillStyle = p.text;
		setFont(ctx, ROUND, 36 * k * s, 500);
		ctx.textAlign = 'left';
		ctx.textBaseline = 'top';
		L.sum.forEach((l, i) => ctx.fillText(l, pad, y + i * 36 * k * s * 1.25));
		y += L.sum.length * 36 * k * s * 1.25 + 26 * k * s;
	}
	for (const r of L.rows) {
		if (y + r.h > barsTop - tagsH) break;
		pill(ctx, r.label, pad, y, { size: 30 * k * s, bg: p.pillBg, fg: p.pillFg, shadow: p.extrude, rot: -0.03 });
		ctx.fillStyle = p.text;
		ctx.textAlign = 'left';
		ctx.textBaseline = 'top';
		setFont(ctx, ROUND, 38 * k * s, 600);
		r.main.forEach((l, i) => ctx.fillText(l, L.vx, y + 2 * s + i * 38 * k * s * 1.18));
		if (r.sub.length) {
			ctx.globalAlpha = 0.85;
			setFont(ctx, ROUND, 31 * k * s, 400);
			const sy = y + 2 * s + r.main.length * 38 * k * s * 1.18;
			r.sub.forEach((l, i) => ctx.fillText(l, L.vx, sy + i * 31 * k * s * 1.18));
			ctx.globalAlpha = 1;
		}
		y += r.h;
	}
	if (t.tags) {
		const ft = fitText(ctx, t.tags, { maxWidth: w - pad * 2, maxHeight: 50 * s, maxSize: 32 * s, minSize: 22 * s, weight: 700, maxLines: 1 });
		ctx.fillStyle = p.small;
		setFont(ctx, ROUND, ft.size, 700);
		ctx.textAlign = 'left';
		ctx.textBaseline = 'bottom';
		ctx.fillText(ft.lines[0], pad, barsTop - 26 * s);
	}
	if (o.status && STATUS[o.status]?.tape) tape(ctx, w / 2, barsTop - 110 * s, w * 1.6, 'CANCELADO', p.tape, p.tapeText, -0.04);
}

/* ------------------------------------------------------------------ */
/* Entrada                                                             */
/* ------------------------------------------------------------------ */

const TEMPLATES = { flyer: tplFlyer, franja: tplFranja, foto: tplFoto, grupo: tplGrupo, cartel: tplCartel };

/**
 * Dibuja la imagen para compartir en el canvas dado.
 * @param {HTMLCanvasElement} canvas
 * @param {{meta:any, format:'post'|'info'|'story', ratio?:string, layout:string, palette:Palette, texts:Texts,
 *   image:HTMLImageElement|null, logo:HTMLImageElement|null, showStatus?:boolean,
 *   fonts?:{display?:string, body?:string}, qr?:boolean[][]|null}} opts
 */
export function renderShareImage(canvas, opts) {
	const w = 1080;
	const h = opts.format === 'story' ? 1920 : opts.ratio === 'square' ? 1080 : 1350;
	canvas.width = w;
	canvas.height = h;
	const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
	const fd = FONTS.display[opts.fonts?.display ?? ''] ?? FONTS.display.lilita;
	const fb = FONTS.body[opts.fonts?.body ?? ''] ?? FONTS.body.fredoka;
	DISPLAY = stack(fd, 'Lilita One');
	DISPLAY_WEIGHT = fd.weight;
	ROUND = stack(fb, 'Lato');
	const status = opts.showStatus ?? true ? opts.meta.status : undefined;
	let layout = opts.layout in TEMPLATES ? opts.layout : 'cartel';
	if (layout === 'flyer' && !opts.image) layout = 'cartel';
	/** @type {RenderOpts} */
	const o = {
		meta: opts.meta,
		texts: opts.texts,
		image: opts.image,
		logo: opts.logo,
		status,
		cancelled: status === 'cancelado',
		layout
	};
	const story = opts.format === 'story';
	/** @type {Frame} */
	const frame = {
		w,
		h,
		// en las verticales la interfaz de las apps tapa arriba y abajo
		top: story ? 200 : 0,
		bottom: story ? 170 : 0,
		s: 1,
		qr: opts.format === 'post' ? null : opts.qr ?? null
	};
	const p = completePalette(opts.palette);
	ctx.clearRect(0, 0, w, h);
	ctx.textBaseline = 'top';
	if (opts.format === 'info') renderInfo(ctx, o, frame, p);
	else TEMPLATES[/** @type {keyof typeof TEMPLATES} */ (layout)](ctx, o, frame, p);
	return canvas;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<Blob|null>}
 */
export const canvasToBlob = (canvas) =>
	new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
