// Generador de imágenes para compartir eventos (Instagram post / historia).
// Todo corre en el navegador con Canvas 2D, sin dependencias.

export const TZ = 'America/Argentina/Buenos_Aires';
export const SITE = 'kinkyvibe.ar';
const FONT = "'Lato', 'NotoColorEmojiLimited', sans-serif";

/** @type {Record<string, {w:number, h:number, label:string}>} */
export const FORMATS = {
	post: { w: 1080, h: 1350, label: 'Post (4:5)' },
	story: { w: 1080, h: 1920, label: 'Historia (9:16)' }
};

/** @type {Record<string, string>} */
export const LAYOUTS = {
	arriba: 'Imagen arriba',
	completa: 'Imagen completa',
	texto: 'Solo texto'
};

/** Lee los colores de marca de las variables CSS de style.scss (con valores por defecto). */
export function brandColors() {
	/** @param {string} name @param {string} fallback */
	const v = (name, fallback) => {
		try {
			const val = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
			return val || fallback;
		} catch (e) {
			return fallback;
		}
	};
	return {
		pink: v('--1', 'hsl(319, 90%, 60%)'),
		pinkLight: v('--1-light', 'hsl(319, 100%, 70%)'),
		pinkDark: v('--1-dark', 'hsl(319, 100%, 40%)'),
		violet: v('--2', 'hsl(262, 90%, 60%)'),
		violetLight: v('--2-light', 'hsl(262, 100%, 75%)'),
		violetDark: v('--2-dark', 'hsl(262, 90%, 50%)'),
		teal: v('--3', 'hsl(165, 84%, 45%)'),
		yellow: v('--4', 'hsl(50, 100%, 60%)'),
		ink: 'hsl(262, 55%, 11%)',
		white: '#fff'
	};
}

/** @param {ReturnType<typeof brandColors>} c */
export function statusInfo(c) {
	/** @type {Record<string, {label:string, bg:string, fg:string, stamp?:string}>} */
	return {
		anunciado: { label: 'Próximamente', bg: c.yellow, fg: c.ink },
		abierto: { label: 'Inscripción abierta', bg: c.teal, fg: c.ink },
		agotadas: { label: 'Agotado', bg: c.pinkDark, fg: c.white, stamp: 'AGOTADO' },
		cancelado: { label: 'Cancelado', bg: '#1a1a1a', fg: c.white, stamp: 'CANCELADO' }
	};
}

/** @param {string} s */
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Fecha y horario del evento, siempre en hora de Buenos Aires.
 * @param {string|Date} start
 * @param {string|Date} [end]
 * @param {Date} [now]
 */
export function formatEventDate(start, end, now = new Date()) {
	const s = new Date(start);
	if (isNaN(+s)) return { day: '', hours: '' };
	const e = end ? new Date(end) : null;
	const year = (/** @type {Date} */ d) =>
		new Intl.DateTimeFormat('es-AR', { timeZone: TZ, year: 'numeric' }).format(d);
	const dayKey = (/** @type {Date} */ d) =>
		new Intl.DateTimeFormat('en-CA', { timeZone: TZ, dateStyle: 'short' }).format(d);
	const time = (/** @type {Date} */ d) =>
		new Intl.DateTimeFormat('es-AR', {
			timeZone: TZ,
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: 'h23'
		}).format(d);
	/** @type {Intl.DateTimeFormatOptions} */
	const dayOpts = { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' };
	if (year(s) !== year(now)) dayOpts.year = 'numeric';
	const day = capitalize(new Intl.DateTimeFormat('es-AR', dayOpts).format(s).replace(',', ''));
	let hours = time(s);
	if (e && !isNaN(+e)) {
		if (dayKey(e) === dayKey(s)) {
			hours += ' a ' + time(e) + ' hs';
		} else {
			const endDay = new Intl.DateTimeFormat('es-AR', {
				timeZone: TZ,
				weekday: 'long',
				day: 'numeric'
			})
				.format(e)
				.replace(',', '');
			hours += ' hs → ' + endDay + ', ' + time(e) + ' hs';
		}
	} else {
		hours += ' hs';
	}
	return { day, hours };
}

/**
 * Datos del evento ya formateados para dibujar / escribir.
 * @param {any} meta
 */
export function eventInfo(meta) {
	const { day, hours } = formatEventDate(meta.start, meta.end);
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
		online,
		place,
		address,
		by,
		status: meta.status,
		url: SITE + '/calendario/' + meta.postID,
		ended: meta.end ? new Date(meta.end) < new Date() : new Date(meta.start) < new Date()
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

/** Espera a que Lato (400/700/900) esté disponible, con un tope de tiempo. */
export async function loadFonts(timeout = 4000) {
	if (typeof document === 'undefined' || !document.fonts) return;
	const loads = Promise.all(
		['400', '700', '900'].map((w) => document.fonts.load(`${w} 48px Lato`).catch(() => []))
	).then(() => document.fonts.ready);
	await Promise.race([loads, new Promise((r) => setTimeout(r, timeout))]);
}

/* ------------------------------------------------------------------ */
/* Helpers de dibujo                                                   */
/* ------------------------------------------------------------------ */

/** @param {CanvasRenderingContext2D} ctx @param {number} size @param {number|string} [weight] */
const setFont = (ctx, size, weight = 400) => {
	ctx.font = `${weight} ${size}px ${FONT}`;
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
		// palabra sola que no entra: cortar por caracteres
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
 * Busca el tamaño de fuente más grande con el que el texto entra en la caja.
 * Si ni con minSize entra, trunca con "…".
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {{maxWidth:number, maxHeight:number, maxSize:number, minSize:number, weight?:number, lineHeight?:number, maxLines?:number}} o
 */
export function fitText(ctx, text, o) {
	const lh = o.lineHeight ?? 1.1;
	const maxLines = o.maxLines ?? Infinity;
	/** @type {string[]} */
	let lines = [];
	for (let size = o.maxSize; size >= o.minSize; size -= 2) {
		setFont(ctx, size, o.weight);
		lines = wrapLines(ctx, text, o.maxWidth);
		if (lines.length <= maxLines && lines.length * size * lh <= o.maxHeight) {
			return { lines, size, weight: o.weight, lineHeight: size * lh };
		}
	}
	const size = o.minSize;
	setFont(ctx, size, o.weight);
	lines = wrapLines(ctx, text, o.maxWidth);
	const n = Math.max(1, Math.min(maxLines, Math.floor(o.maxHeight / (size * lh))));
	if (lines.length > n) {
		lines = lines.slice(0, n);
		let last = lines[n - 1];
		while (last.length > 1 && ctx.measureText(last + '…').width > o.maxWidth) {
			last = last.slice(0, -1);
		}
		lines[n - 1] = last.replace(/[\s,.:;-]+$/, '') + '…';
	}
	return { lines, size, weight: o.weight, lineHeight: size * lh };
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
 * @param {CanvasRenderingContext2D} ctx @param {HTMLImageElement} img
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {number} [focusY] 0 = arriba, 1 = abajo
 */
function drawCover(ctx, img, x, y, w, h, focusY = 0.5) {
	const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
	const dw = img.naturalWidth * scale;
	const dh = img.naturalHeight * scale;
	ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) * focusY, dw, dh);
}

/**
 * Dibuja la imagen entera dentro de la caja, con la misma imagen desenfocada de fondo.
 * Así no se cortan los flyers que ya traen texto.
 * @param {CanvasRenderingContext2D} ctx @param {HTMLImageElement} img
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {{grayscale?: boolean, inner?: {x:number, y:number, w:number, h:number}}} [o]
 *   inner: caja (dentro de la principal) donde va la imagen nítida
 */
function drawContainBlurred(ctx, img, x, y, w, h, o = {}) {
	const gray = o.grayscale ? ' grayscale(1)' : '';
	ctx.save();
	ctx.beginPath();
	ctx.rect(x, y, w, h);
	ctx.clip();
	if ('filter' in ctx) ctx.filter = `blur(36px) brightness(0.55) saturate(1.3)${gray}`;
	drawCover(ctx, img, x - 80, y - 80, w + 160, h + 160);
	ctx.filter = 'none';
	if (!('filter' in ctx)) {
		ctx.fillStyle = 'rgba(0,0,0,.55)';
		ctx.fillRect(x, y, w, h);
	}
	const b = o.inner ?? { x, y, w, h };
	const scale = Math.min(b.w / img.naturalWidth, b.h / img.naturalHeight);
	const dw = img.naturalWidth * scale;
	const dh = img.naturalHeight * scale;
	ctx.shadowColor = 'rgba(0,0,0,.45)';
	ctx.shadowBlur = 40;
	if (gray && 'filter' in ctx) ctx.filter = 'grayscale(1)';
	ctx.drawImage(img, b.x + (b.w - dw) / 2, b.y + (b.h - dh) / 2, dw, dh);
	ctx.restore();
}

/** Íconos simples dibujados con paths (no dependen de fuentes de emoji). */
const icons = {
	/** @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} s */
	calendar(ctx, x, y, s) {
		const lw = s * 0.1;
		ctx.lineWidth = lw;
		roundRectPath(ctx, x + lw / 2, y + s * 0.16, s - lw, s * 0.8, s * 0.14);
		ctx.stroke();
		ctx.fillRect(x + lw / 2, y + s * 0.16, s - lw, s * 0.24);
		ctx.fillRect(x + s * 0.24, y, lw * 1.2, s * 0.26);
		ctx.fillRect(x + s * 0.76 - lw * 1.2, y, lw * 1.2, s * 0.26);
	},
	/** @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} s */
	pin(ctx, x, y, s) {
		const cx = x + s / 2;
		const r = s * 0.36;
		const cy = y + r + s * 0.02;
		ctx.beginPath();
		ctx.arc(cx, cy, r, Math.PI * 0.8, Math.PI * 2.2);
		ctx.lineTo(cx, y + s);
		ctx.closePath();
		ctx.fill();
		ctx.save();
		ctx.globalCompositeOperation = 'destination-out';
		ctx.beginPath();
		ctx.arc(cx, cy, r * 0.42, 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();
	},
	/** @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} s */
	screen(ctx, x, y, s) {
		const lw = s * 0.1;
		ctx.lineWidth = lw;
		roundRectPath(ctx, x + lw / 2, y + s * 0.08, s - lw, s * 0.62, s * 0.08);
		ctx.stroke();
		ctx.fillRect(x + s * 0.44, y + s * 0.7, s * 0.12, s * 0.16);
		ctx.fillRect(x + s * 0.24, y + s * 0.86, s * 0.52, lw);
	}
};

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string[]} lines @param {number} x @param {number} y @param {number} lineHeight
 * @param {CanvasTextAlign} align
 */
function drawLines(ctx, lines, x, y, lineHeight, align) {
	ctx.textAlign = align;
	ctx.textBaseline = 'top';
	lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
}

/**
 * Sello diagonal para "AGOTADO" / "CANCELADO".
 * @param {CanvasRenderingContext2D} ctx @param {string} text
 * @param {number} cx @param {number} cy @param {number} maxW
 * @param {string} color
 */
function drawStamp(ctx, text, cx, cy, maxW, color) {
	ctx.save();
	ctx.translate(cx, cy);
	ctx.rotate(-0.16);
	let size = 150;
	setFont(ctx, size, 900);
	while (ctx.measureText(text).width > maxW - 120 && size > 40) {
		size -= 4;
		setFont(ctx, size, 900);
	}
	const w = ctx.measureText(text).width + size * 0.8;
	const h = size * 1.45;
	ctx.shadowColor = 'rgba(0,0,0,.35)';
	ctx.shadowBlur = 30;
	ctx.fillStyle = 'rgba(255,255,255,.93)';
	roundRectPath(ctx, -w / 2, -h / 2, w, h, size * 0.18);
	ctx.fill();
	ctx.shadowBlur = 0;
	ctx.lineWidth = size * 0.09;
	ctx.strokeStyle = color;
	roundRectPath(
		ctx,
		-w / 2 + size * 0.12,
		-h / 2 + size * 0.12,
		w - size * 0.24,
		h - size * 0.24,
		size * 0.1
	);
	ctx.stroke();
	ctx.fillStyle = color;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(text, 0, size * 0.04);
	ctx.restore();
}

/**
 * Bloque de texto principal: estado, título, organizadores, fecha, lugar.
 * Mide todo, le da al título el espacio que sobra y lo dibuja.
 * @param {CanvasRenderingContext2D} ctx
 * @param {ReturnType<typeof eventInfo>} info
 * @param {{x:number, y:number, w:number, h:number}} box
 * @param {{align: 'top'|'bottom'|'center', textAlign: 'left'|'center', scale: number, showStatus: boolean, colors: ReturnType<typeof brandColors>, titleMax: number, accent: string, badgeScale?: number, dry?: boolean}} o
 * @returns {{top: number, height: number}} dónde queda el bloque (con dry: true solo mide)
 */
function drawTextBlock(ctx, info, box, o) {
	const c = o.colors;
	const k = o.scale;
	const status = o.showStatus ? statusInfo(c)[info.status] : undefined;
	const center = o.textAlign === 'center';

	/** @type {{h:number, draw:(y:number)=>void}[]} */
	const items = [];
	const gap = 26 * k;

	// estado
	if (status) {
		const size = 30 * k * (o.badgeScale ?? 1);
		setFont(ctx, size, 900);
		const label = status.label.toUpperCase();
		const pw = ctx.measureText(label).width + size * 1.4;
		const ph = size * 1.8;
		items.push({
			h: ph,
			draw(y) {
				const px = center ? box.x + (box.w - pw) / 2 : box.x;
				ctx.fillStyle = status.bg;
				roundRectPath(ctx, px, y, pw, ph, ph / 2);
				ctx.fill();
				ctx.fillStyle = status.fg;
				setFont(ctx, size, 900);
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.fillText(label, px + pw / 2, y + ph / 2 + size * 0.04);
			}
		});
	}

	// organizadores
	/** @type {ReturnType<typeof fitText>|null} */
	let byFit = null;
	if (info.by) {
		byFit = fitText(ctx, 'por ' + info.by, {
			maxWidth: box.w,
			maxHeight: 80 * k,
			maxSize: 36 * k,
			minSize: 26 * k,
			weight: 700,
			lineHeight: 1.2,
			maxLines: 2
		});
	}

	// detalles (fecha, lugar)
	const iconS = 44 * k;
	const iconGap = 22 * k;
	const detailX = center ? box.x : box.x + iconS + iconGap;
	const detailW = center ? box.w : box.w - iconS - iconGap;
	/** @param {string} main @param {string} sub @param {keyof typeof icons} icon */
	const detail = (main, sub, icon) => {
		const m = fitText(ctx, main, {
			maxWidth: detailW,
			maxHeight: 100 * k,
			maxSize: 44 * k,
			minSize: 32 * k,
			weight: 700,
			lineHeight: 1.15,
			maxLines: 2
		});
		const s = sub
			? fitText(ctx, sub, {
					maxWidth: detailW,
					maxHeight: 84 * k,
					maxSize: 36 * k,
					minSize: 26 * k,
					weight: 400,
					lineHeight: 1.2,
					maxLines: 2
			  })
			: null;
		const h = m.lines.length * m.lineHeight + (s ? 6 * k + s.lines.length * s.lineHeight : 0);
		return {
			h,
			/** @param {number} y */
			draw(y) {
				const tx = center ? box.x + box.w / 2 : detailX;
				if (!center) {
					ctx.fillStyle = o.accent;
					ctx.strokeStyle = o.accent;
					icons[icon](ctx, box.x, y + (m.size - iconS) / 2 + 2 * k, iconS);
				}
				ctx.fillStyle = c.white;
				setFont(ctx, m.size, 700);
				drawLines(ctx, m.lines, tx, y, m.lineHeight, center ? 'center' : 'left');
				if (s) {
					ctx.fillStyle = 'rgba(255,255,255,.82)';
					setFont(ctx, s.size, 400);
					drawLines(
						ctx,
						s.lines,
						tx,
						y + m.lines.length * m.lineHeight + 6 * k,
						s.lineHeight,
						center ? 'center' : 'left'
					);
				}
			}
		};
	};
	const details = [
		info.day ? detail(info.day, info.hours, 'calendar') : null,
		detail(info.place, info.address, info.online ? 'screen' : 'pin')
	].filter(Boolean);

	const fixedH =
		items.reduce((a, i) => a + i.h + gap, 0) +
		(byFit ? byFit.lines.length * byFit.lineHeight + gap * 0.5 : 0) +
		gap * 0.6 +
		details.reduce((a, d) => a + (d?.h ?? 0) + gap, 0) -
		gap;

	const title = fitText(ctx, info.title, {
		maxWidth: box.w,
		maxHeight: Math.max(box.h - fixedH - gap, 60 * k),
		maxSize: o.titleMax,
		minSize: 44 * k,
		weight: 900,
		lineHeight: 1.04,
		maxLines: 6
	});
	const titleH = title.lines.length * title.lineHeight;
	const total = fixedH + titleH + gap;

	let y = box.y;
	if (o.align === 'bottom') y = box.y + box.h - total;
	if (o.align === 'center') y = box.y + (box.h - total) / 2;
	y = Math.max(y, box.y);
	const top = y;
	if (o.dry) return { top, height: total };

	for (const it of items) {
		it.draw(y);
		y += it.h + gap;
	}
	ctx.fillStyle = c.white;
	setFont(ctx, title.size, 900);
	drawLines(ctx, title.lines, center ? box.x + box.w / 2 : box.x, y, title.lineHeight, o.textAlign);
	y += titleH + gap * 0.5;
	if (byFit) {
		ctx.fillStyle = o.accent;
		setFont(ctx, byFit.size, 700);
		drawLines(
			ctx,
			byFit.lines,
			center ? box.x + box.w / 2 : box.x,
			y,
			byFit.lineHeight,
			o.textAlign
		);
		y += byFit.lines.length * byFit.lineHeight + gap * 0.5;
	}
	y += gap * 0.6;
	for (const d of details) {
		if (!d) continue;
		d.draw(y);
		y += d.h + gap;
	}
	return { top, height: total };
}

/**
 * Pie con logo + URL del evento.
 * @param {CanvasRenderingContext2D} ctx
 * @param {ReturnType<typeof eventInfo>} info
 * @param {HTMLImageElement|null} logo
 * @param {{x:number, y:number, w:number, h:number}} box
 * @param {boolean} center
 */
function drawFooter(ctx, info, logo, box, center) {
	const ls = box.h;
	const [domain, ...rest] = info.url.split('/');
	const path = '/' + rest.join('/');
	let size = 32;
	const textMax = box.w - (logo ? ls + 24 : 0);
	setFont(ctx, size, 700);
	const measure = () => {
		setFont(ctx, size, 900);
		const a = ctx.measureText(domain).width;
		setFont(ctx, size, 400);
		return a + ctx.measureText(path).width;
	};
	while (measure() > textMax && size > 22) size -= 1;
	const oneLine = measure() <= textMax;
	const textW = oneLine ? measure() : textMax;
	const totalW = (logo ? ls + 24 : 0) + textW;
	let x = center ? box.x + (box.w - totalW) / 2 : box.x;
	if (logo) {
		ctx.drawImage(logo, x, box.y, ls, ls);
		x += ls + 24;
	}
	ctx.textBaseline = 'middle';
	ctx.textAlign = 'left';
	ctx.fillStyle = '#fff';
	if (oneLine) {
		setFont(ctx, size, 900);
		ctx.fillText(domain, x, box.y + ls / 2);
		const dw = ctx.measureText(domain).width;
		setFont(ctx, size, 400);
		ctx.fillStyle = 'rgba(255,255,255,.85)';
		ctx.fillText(path, x + dw, box.y + ls / 2);
	} else {
		// URL muy larga: dominio arriba, ruta partida abajo
		setFont(ctx, size, 900);
		ctx.fillText(domain, x, box.y + ls * 0.28);
		setFont(ctx, size, 400);
		ctx.fillStyle = 'rgba(255,255,255,.85)';
		// cortar la ruta después de "/" o "-" para que no quede una palabra partida
		const lines = wrapLines(ctx, path.replace(/([/-])/g, '$1 '), textW).map((l) =>
			l.replaceAll(' ', '')
		);
		const shown = lines.length > 1 ? [lines[0], lines.slice(1).join('')] : lines;
		let last = shown[shown.length - 1];
		while (ctx.measureText(last).width > textW && last.length > 1) last = last.slice(0, -2) + '…';
		shown[shown.length - 1] = last;
		shown.forEach((l, i) => ctx.fillText(l, x, box.y + ls * 0.28 + (i + 1) * size * 1.15));
	}
}

/**
 * Dibuja la imagen para compartir en el canvas dado.
 * @param {HTMLCanvasElement} canvas
 * @param {{meta:any, format: keyof typeof FORMATS, layout: keyof typeof LAYOUTS, image: HTMLImageElement|null, logo: HTMLImageElement|null, showStatus?: boolean}} o
 */
export function renderShareImage(canvas, o) {
	const { w, h } = FORMATS[o.format];
	canvas.width = w;
	canvas.height = h;
	const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
	const c = brandColors();
	const info = eventInfo(o.meta);
	const showStatus = o.showStatus ?? true;
	const status = showStatus ? statusInfo(c)[info.status] : undefined;
	const story = o.format === 'story';
	// En historias, Instagram tapa ~200px arriba y abajo con su interfaz
	const safeTop = story ? 200 : 0;
	const safeBottom = story ? 200 : 0;
	const pad = 72;
	const layout = !o.image && o.layout !== 'texto' ? 'texto' : o.layout;
	const gray = info.status === 'cancelado' && showStatus;

	ctx.clearRect(0, 0, w, h);
	ctx.textBaseline = 'top';

	/** Fondo con el degradé de marca */
	const brandBackground = () => {
		const g = ctx.createLinearGradient(0, 0, w, h);
		g.addColorStop(0, c.pink);
		g.addColorStop(0.55, c.violet);
		g.addColorStop(1, c.violetDark);
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, w, h);
		// círculos decorativos
		ctx.save();
		ctx.globalAlpha = 0.14;
		ctx.fillStyle = '#fff';
		ctx.beginPath();
		ctx.arc(w * 0.95, h * 0.08, w * 0.42, 0, Math.PI * 2);
		ctx.fill();
		ctx.globalAlpha = 0.1;
		ctx.beginPath();
		ctx.arc(w * 0.02, h * 0.98, w * 0.55, 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();
	};

	if (layout === 'arriba' && o.image) {
		const imgTop = safeTop ? safeTop - 40 : 0;
		const imgH = story ? 760 : 640;
		ctx.fillStyle = c.ink;
		ctx.fillRect(0, 0, w, h);
		const g = ctx.createLinearGradient(0, imgH, 0, h);
		g.addColorStop(0, c.violetDark);
		g.addColorStop(1, c.ink);
		ctx.fillStyle = g;
		ctx.fillRect(0, imgTop + imgH, w, h - imgTop - imgH);
		// en historias, la zona tapada por Instagram lleva solo el fondo desenfocado
		drawContainBlurred(ctx, o.image, 0, 0, w, imgTop + imgH, {
			grayscale: gray,
			inner: { x: 0, y: imgTop, w, h: imgH }
		});
		// franja de color entre imagen y texto
		const band = ctx.createLinearGradient(0, 0, w, 0);
		band.addColorStop(0, c.pink);
		band.addColorStop(1, c.violet);
		ctx.fillStyle = band;
		ctx.fillRect(0, imgTop + imgH, w, 12);
		if (status?.stamp) drawStamp(ctx, status.stamp, w / 2, imgTop + imgH / 2, w, status.bg);
		const footerH = 84;
		const footerY = h - safeBottom - pad * 0.8 - footerH;
		drawTextBlock(
			ctx,
			info,
			{
				x: pad,
				y: imgTop + imgH + 12 + pad * 0.7,
				w: w - pad * 2,
				h: footerY - (imgTop + imgH + 12 + pad * 0.7) - 36
			},
			{
				align: 'center',
				textAlign: 'left',
				scale: 1,
				showStatus: showStatus && !status?.stamp,
				colors: c,
				titleMax: story ? 104 : 88,
				accent: c.pinkLight
			}
		);
		drawFooter(ctx, info, o.logo, { x: pad, y: footerY, w: w - pad * 2, h: footerH }, false);
	} else if (layout === 'completa' && o.image) {
		ctx.fillStyle = c.ink;
		ctx.fillRect(0, 0, w, h);
		ctx.save();
		if (gray && 'filter' in ctx) ctx.filter = 'grayscale(1)';
		drawCover(ctx, o.image, 0, 0, w, h, 0.3);
		ctx.restore();
		const footerH = 84;
		const footerY = h - safeBottom - pad * 0.8 - footerH;
		const textTop = h * (story ? 0.4 : 0.36);
		const textBox = { x: pad, y: textTop, w: w - pad * 2, h: footerY - textTop - 40 };
		const textOpts = {
			align: /** @type {'bottom'} */ ('bottom'),
			textAlign: /** @type {'left'} */ ('left'),
			scale: 1,
			showStatus: showStatus && !status?.stamp,
			colors: c,
			titleMax: story ? 110 : 96,
			accent: c.pinkLight
		};
		// degradé para que el texto se lea: opaco donde empieza el texto, transparente arriba
		const { top: blockTop } = drawTextBlock(ctx, info, textBox, { ...textOpts, dry: true });
		const fadeStart = Math.max(0, blockTop - 360);
		const g = ctx.createLinearGradient(0, fadeStart, 0, h);
		const solid = Math.min(0.95, (blockTop - 20 - fadeStart) / (h - fadeStart));
		g.addColorStop(0, 'rgba(24, 8, 48, 0)');
		g.addColorStop(solid * 0.55, 'rgba(34, 10, 70, .6)');
		g.addColorStop(solid, 'rgba(26, 8, 54, .9)');
		g.addColorStop(1, 'rgba(16, 5, 32, .97)');
		ctx.fillStyle = g;
		ctx.fillRect(0, fadeStart, w, h - fadeStart);
		const top = ctx.createLinearGradient(0, 0, 0, 260 + safeTop);
		top.addColorStop(0, 'rgba(18, 6, 36, .55)');
		top.addColorStop(1, 'rgba(18, 6, 36, 0)');
		ctx.fillStyle = top;
		ctx.fillRect(0, 0, w, 260 + safeTop);
		if (status?.stamp) {
			drawStamp(
				ctx,
				status.stamp,
				w / 2,
				safeTop + Math.max(180, (blockTop - safeTop) / 2),
				w,
				status.bg
			);
		}
		drawTextBlock(ctx, info, textBox, textOpts);
		drawFooter(ctx, info, o.logo, { x: pad, y: footerY, w: w - pad * 2, h: footerH }, false);
	} else {
		// solo texto (o sin imagen destacada)
		brandBackground();
		const logoS = story ? 240 : 190;
		const logoY = safeTop + (story ? 60 : 64);
		if (o.logo) {
			ctx.save();
			ctx.shadowColor = 'rgba(0,0,0,.25)';
			ctx.shadowBlur = 30;
			ctx.drawImage(o.logo, (w - logoS) / 2, logoY, logoS, logoS);
			ctx.restore();
		}
		const urlH = 44;
		const urlY = h - safeBottom - pad - urlH;
		const top = logoY + logoS + 60;
		drawTextBlock(
			ctx,
			info,
			{ x: pad, y: top, w: w - pad * 2, h: urlY - top - 60 },
			{
				align: 'center',
				textAlign: 'center',
				scale: story ? 1.3 : 1.15,
				showStatus,
				colors: c,
				titleMax: story ? 150 : 128,
				accent: c.yellow,
				badgeScale: status?.stamp ? 1.6 : 1
			}
		);
		drawFooter(ctx, info, null, { x: pad, y: urlY, w: w - pad * 2, h: urlH }, true);
	}
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
const SKIP_TAGS = new Set([
	'español',
	'inglés',
	'lsa',
	'pago',
	'gratis',
	'a la gorra',
	'kinkyvibe'
]);

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
	const lines = [];
	if (info.status === 'cancelado') lines.push('❌ EVENTO CANCELADO ❌', '');
	if (info.status === 'agotadas') lines.push('🔥 ¡Cupos agotados! 🔥', '');
	if (info.status === 'anunciado') lines.push('📣 ¡Se viene!', '');
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
	lines.push('');
	if (info.status === 'abierto' && meta.link) lines.push('👉 Inscripción abierta');
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
	if ((meta.tags ?? []).includes('AMBA') && !tags.includes('#buenosaires'))
		tags.push('#buenosaires');
	lines.push(tags.slice(0, 20).join(' '));
	return lines.join('\n');
}
