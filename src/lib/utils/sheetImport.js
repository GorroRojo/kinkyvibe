/**
 * Pure helpers for /admin/eventos/importar: turn rows copied from the organizers' planning
 * spreadsheet ("Calendario de Eventos y Redes", tab "Lista de Eventos 2026") into event drafts.
 *
 * - parseSheet(): pasted TSV → rows with a parsed date/time and Spanish warnings.
 * - matchSeries(): finds the most recent existing event of the same series, to duplicate it.
 * - proposeTitle() / proposeSlug() / scheduleFor(): what the review screen pre-fills.
 * - buildImportedEvent(): the markdown of the new (unlisted) event.
 *
 * Like eventDraft.js, nothing here touches the network, the filesystem or SvelteKit: it runs in
 * the browser (the review screen), on the server (building the files to commit) and in vitest.
 */
import {
	addDays,
	buildEventMarkdown,
	deriveSlug,
	formFromSource,
	isValidDate,
	isValidTime,
	parseEventDate,
	readEventFields,
	slugify,
	splitMarkdown,
	uniqueSlug
} from './eventDraft.js';

/* ------------------------------------------------------------------------------------------ */
/*  Text helpers                                                                               */
/* ------------------------------------------------------------------------------------------ */

/**
 * Lowercase, without accents, trimmed, single spaces.
 * @param {string} s
 */
export function fold(s) {
	return String(s ?? '')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/\s+/g, ' ')
		.trim();
}

export const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const WEEKDAY_LABELS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTH_LABELS = [
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

/** @type {Record<string, number>} folded month word → 1..12 */
const MONTHS = {
	enero: 1,
	ene: 1,
	febrero: 2,
	feb: 2,
	marzo: 3,
	mar: 3,
	abril: 4,
	abr: 4,
	mayo: 5,
	may: 5,
	junio: 6,
	jun: 6,
	julio: 7,
	jul: 7,
	agosto: 8,
	ago: 8,
	septiembre: 9,
	setiembre: 9,
	sept: 9,
	sep: 9,
	set: 9,
	octubre: 10,
	oct: 10,
	noviembre: 11,
	nov: 11,
	diciembre: 12,
	dic: 12
};
/** Only full names are accepted in section rows ("MAR" alone is too ambiguous there). */
const FULL_MONTHS = MONTH_LABELS.map(fold).concat(['setiembre']);

/** @type {Record<string, number>} */
const WEEKDAY_WORDS = {
	domingo: 0,
	dom: 0,
	lunes: 1,
	lun: 1,
	martes: 2,
	mar: 2,
	miercoles: 3,
	mie: 3,
	mier: 3,
	jueves: 4,
	jue: 4,
	viernes: 5,
	vie: 5,
	sabado: 6,
	sab: 6
};

/** Words that mean "this event is not happening (for now)": the row starts excluded. */
const OFF_WORDS =
	/\b(pospuest[oae]s?|postergad[oae]s?|posterga|cancelad[oae]s?|suspendid[oae]s?|se suspende|no se hace)\b/;
/** Words that mean "no time yet": the row is kept but needs a time before it can be created. */
const TBD_WORDS =
	/\b(a definir|a confirmar|a conf|por definir|por confirmar|tbd|tba|a def)\b|^\?+$|^-+$/;

/** @param {number} y @param {number} m @param {number} d */
const isoDate = (y, m, d) =>
	`${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** @param {string} date YYYY-MM-DD */
const weekdayOf = (date) => {
	const [y, m, d] = date.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

/**
 * "sábado 17 de octubre de 2026"
 * @param {string} date YYYY-MM-DD
 */
export function longDate(date) {
	if (!isValidDate(date)) return '';
	const [y, m, d] = date.split('-').map(Number);
	return `${WEEKDAY_LABELS[weekdayOf(date)]} ${d} de ${MONTH_LABELS[m - 1]} de ${y}`;
}

/* ------------------------------------------------------------------------------------------ */
/*  TSV                                                                                        */
/* ------------------------------------------------------------------------------------------ */

/**
 * Splits text copied from Google Sheets into rows of cells. Sheets separates cells with tabs and
 * wraps a cell in double quotes when it contains a line break or a quote ("" = one quote).
 * @param {string} text
 * @returns {string[][]}
 */
export function parseTsv(text) {
	const src = String(text ?? '').replace(/\r\n?/g, '\n');
	/** @type {string[][]} */
	const rows = [];
	/** @type {string[]} */
	let row = [];
	let i = 0;
	while (i <= src.length) {
		let cell = '';
		if (src[i] === '"') {
			// Quoted cell: only if the closing quote is followed by a tab, newline or the end.
			let j = i + 1;
			let value = '';
			let closed = false;
			while (j < src.length) {
				if (src[j] === '"') {
					if (src[j + 1] === '"') {
						value += '"';
						j += 2;
						continue;
					}
					closed = j + 1 >= src.length || src[j + 1] === '\t' || src[j + 1] === '\n';
					break;
				}
				value += src[j++];
			}
			if (closed) {
				cell = value;
				i = j + 1;
			}
		}
		if (i < src.length && src[i] !== '\t' && src[i] !== '\n') {
			const end = src.slice(i).search(/[\t\n]/);
			const stop = end === -1 ? src.length : i + end;
			cell += src.slice(i, stop);
			i = stop;
		}
		row.push(cell);
		if (i >= src.length) {
			rows.push(row);
			break;
		}
		if (src[i] === '\n') {
			rows.push(row);
			row = [];
		}
		i++;
	}
	return rows;
}

/* ------------------------------------------------------------------------------------------ */
/*  Columns                                                                                    */
/* ------------------------------------------------------------------------------------------ */

/**
 * @typedef {'check'|'organiza'|'name'|'date'|'start'|'end'|'place'|'price'|'fund'|'link'
 *   |'formClose'|'meet'|'comments'|'signups'|'flyers'|'income'|'done'} Column
 */

/** Column order of "Lista de Eventos 2026" (used when the paste has no header row). */
export const COLUMNS_2026 = /** @type {Column[]} */ ([
	'check',
	'organiza',
	'name',
	'date',
	'start',
	'end',
	'place',
	'price',
	'fund',
	'link',
	'formClose',
	'meet',
	'comments',
	'signups',
	'flyers',
	'income'
]);

/**
 * Header cell → column. Unknown headers are ignored.
 * @param {string} cell
 * @returns {Column|null}
 */
function headerColumn(cell) {
	const h = fold(cell);
	if (!h) return null;
	// "c": a checkbox column nobody knows the meaning of. Recognized only so its TRUE/FALSE is
	// not read as another column; its value is ignored.
	if (h === 'c') return 'check';
	if (h === 'fin') return 'done'; // leading checkbox column of the 2024 tab
	if (h.startsWith('organiza')) return 'organiza';
	if (h.startsWith('nombre') || h === 'evento') return 'name';
	if (h.startsWith('fecha')) return 'date';
	if (h.startsWith('inicio') || h === 'hora' || h === 'horario') return 'start';
	if (/^fin\b/.test(h)) return 'end';
	if (h.startsWith('lugar')) return 'place';
	if (h.startsWith('valor') || h.startsWith('precio')) return 'price';
	if (h.includes('fondo')) return 'fund';
	if (h.startsWith('link') || h.includes('inscripcion ') || h === 'link inscripcion') return 'link';
	if (h.startsWith('cierre')) return 'formClose';
	if (h.includes('jitsi') || h.includes('meet')) return 'meet';
	if (h.startsWith('comentario')) return 'comments';
	if (h.startsWith('inscripciones')) return 'signups';
	if (h.startsWith('flyer')) return 'flyers';
	if (h.startsWith('ingreso')) return 'income';
	return null;
}

/**
 * Column mapping if `cells` looks like the header row, else null.
 * @param {string[]} cells
 * @returns {(Column|null)[]|null}
 */
export function headerMapping(cells) {
	const cols = cells.map(headerColumn);
	const known = cols.filter(Boolean);
	if (!cols.includes('name') || known.length < 3) return null;
	return cols;
}

const BOOL = /^(true|false|verdadero|falso)$/i;

/* ------------------------------------------------------------------------------------------ */
/*  Section rows ("2026", "OCTUBRE")                                                           */
/* ------------------------------------------------------------------------------------------ */

/**
 * `{month, year}` when the row only holds a month and/or a year (merged cells paste as the value
 * in the first cell, sometimes repeated in every cell), else null. Checkboxes are ignored.
 * @param {string[]} cells
 * @returns {{month?: number, year?: number}|null}
 */
export function sectionOf(cells) {
	const values = [...new Set(cells.map(fold).filter((c) => c && !BOOL.test(c)))];
	if (values.length !== 1) return null;
	const m = values[0].match(/^([a-z]+)?\s*(?:de\s+)?((?:19|20)\d{2})?$/);
	if (!m || (!m[1] && !m[2])) return null;
	if (m[1] && !FULL_MONTHS.includes(m[1])) return null;
	/** @type {{month?: number, year?: number}} */
	const out = {};
	if (m[1]) out.month = MONTHS[m[1]];
	if (m[2]) out.year = Number(m[2]);
	return out;
}

/* ------------------------------------------------------------------------------------------ */
/*  Dates                                                                                      */
/* ------------------------------------------------------------------------------------------ */

/**
 * The year a month (without year) most likely refers to: this year, unless that is more than two
 * months ago (then next year).
 * @param {number} month
 * @param {string} today YYYY-MM-DD
 */
export function inferYear(month, today) {
	const [y, m] = today.split('-').map(Number);
	return month >= m - 2 ? y : y + 1;
}

/**
 * @typedef {object} DateContext
 * @prop {string} today YYYY-MM-DD
 * @prop {number} [month] month of the current section row
 * @prop {number} [year] year of the current section row
 */

/**
 * Parses the "Fecha" cell: "viernes 22", "22/10", "22/10/2026", "22 de octubre",
 * "miércoles 20 y jueves 21" (several days: the first one is used and a warning explains it).
 * @param {string} text
 * @param {DateContext} ctx
 * @returns {{date: string, extraDays: string[], warnings: string[]}}
 */
export function parseDateText(text, ctx) {
	/** @type {string[]} */
	const warnings = [];
	const raw = String(text ?? '').trim();
	const t = fold(raw);
	if (!t) return { date: '', extraDays: [], warnings: ['Falta la fecha: elegila abajo.'] };

	/** @type {number|undefined} */
	let month;
	/** @type {number|undefined} */
	let year;
	/** @type {number[]} */
	let days = [];
	/** @type {number|undefined} */
	let weekday;

	const numeric = t.match(/\b(\d{1,2})\s*[/.-]\s*(\d{1,2})(?:\s*[/.-]\s*(\d{2}|\d{4}))?\b/);
	if (numeric) {
		days = [Number(numeric[1])];
		month = Number(numeric[2]);
		if (numeric[3]) year = Number(numeric[3].length === 2 ? '20' + numeric[3] : numeric[3]);
	} else {
		const yearMatch = t.match(/\b((?:19|20)\d{2})\b/);
		if (yearMatch) year = Number(yearMatch[1]);
		const noYear = yearMatch ? t.replace(yearMatch[0], ' ') : t;
		for (const word of noYear.match(/[a-z]+/g) ?? []) {
			if (month === undefined && word in MONTHS && !(word in WEEKDAY_WORDS) && word.length >= 3)
				month = MONTHS[word];
			else if (weekday === undefined && word in WEEKDAY_WORDS) weekday = WEEKDAY_WORDS[word];
		}
		// "mar" is both martes and marzo: it is a weekday unless nothing else gives the month.
		days = (noYear.match(/\b\d{1,2}\b/g) ?? []).map(Number);
	}

	days = days.filter((d) => d >= 1 && d <= 31);
	if (!days.length) {
		return {
			date: '',
			extraDays: [],
			warnings: [`No entendimos la fecha “${raw}”: elegila abajo.`]
		};
	}
	if (month !== undefined && (month < 1 || month > 12)) {
		return {
			date: '',
			extraDays: [],
			warnings: [`No entendimos la fecha “${raw}”: elegila abajo.`]
		};
	}

	const day = days[0];
	let date = '';
	if (month === undefined && ctx.month) {
		month = ctx.month;
		year ??= ctx.year ?? inferYear(month, ctx.today);
	}
	if (month !== undefined) {
		year ??= ctx.year ?? inferYear(month, ctx.today);
		date = isoDate(year, month, day);
		if (!isValidDate(date)) {
			return {
				date: '',
				extraDays: [],
				warnings: [`La fecha “${raw}” no existe (${MONTH_LABELS[month - 1]} no tiene ${day} días).`]
			};
		}
		if (weekday !== undefined && weekdayOf(date) !== weekday) {
			warnings.push(
				`Ojo: el ${day} de ${MONTH_LABELS[month - 1]} de ${year} es ${
					WEEKDAY_LABELS[weekdayOf(date)]
				}, no ${WEEKDAY_LABELS[weekday]}. Revisá la fecha.`
			);
		}
	} else {
		// No month anywhere: the next date (from today) with that day, and that weekday if given.
		let probe = ctx.today.slice(0, 8) + '01';
		for (let i = 0; i < 24 && !date; i++) {
			const candidate = probe.slice(0, 8) + String(day).padStart(2, '0');
			if (
				isValidDate(candidate) &&
				candidate >= ctx.today &&
				(weekday === undefined || weekdayOf(candidate) === weekday)
			)
				date = candidate;
			probe = addDays(probe.slice(0, 8) + '28', 7).slice(0, 8) + '01';
		}
		if (!date) {
			return {
				date: '',
				extraDays: [],
				warnings: [`No entendimos la fecha “${raw}”: elegila abajo.`]
			};
		}
		warnings.push(
			`La fila no dice el mes (copiala junto con la fila del mes, por ejemplo “OCTUBRE”). Supusimos el ${longDate(
				date
			)}: revisalo.`
		);
	}

	/** @type {string[]} */
	const extraDays = [];
	if (days.length > 1) {
		const range = /\b\d{1,2}\s*(?:al|a|-)\s*\d{1,2}\b/.test(t);
		const last = days[days.length - 1];
		if (last > day) {
			const count = range ? last - day : days.length - 1;
			for (let i = 1; i <= count; i++) extraDays.push(addDays(date, range ? i : days[i] - day));
		}
		warnings.push(
			`Son varios días (“${raw}”). Se carga un solo evento, el ${longDate(
				date
			)}. Si los otros días son otros encuentros (parte 2), cargalos aparte.`
		);
	}
	return { date, extraDays, warnings };
}

/* ------------------------------------------------------------------------------------------ */
/*  Times                                                                                      */
/* ------------------------------------------------------------------------------------------ */

/**
 * Times found in a cell: "21 - 03 horas" → ['21:00', '03:00'], "20:30 hs" → ['20:30'].
 * @param {string} text folded
 * @returns {string[]|null} null if a number isn't a valid time
 */
function timesIn(text) {
	/** @type {string[]} */
	const out = [];
	for (const m of text.matchAll(/(\d{1,2})(?:\s*[:.h]\s*(\d{2}))?(?!\d)/g)) {
		let h = Number(m[1]);
		const min = m[2] ? Number(m[2]) : 0;
		if (h === 24) h = 0;
		if (h > 23 || min > 59) return null;
		out.push(`${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
	}
	return out;
}

/**
 * Parses "Inicio (HH:HH)" and "Fin (HH:HH)": "21 - 03 horas", "13 -15 hs", "15 a 18 hs",
 * "20:30 hs", "16 horas", "20.30", "21:00" + "00:30". "pospuesto"/"cancelado" → off,
 * "a definir" → no time.
 * @param {string} startText
 * @param {string} [endText]
 * @returns {{startTime: string, endTime: string, off: string, warnings: string[]}}
 */
export function parseTimeText(startText, endText = '') {
	const s = fold(startText);
	const e = fold(endText);
	/** @type {string[]} */
	const warnings = [];
	const offMatch = (s + ' ' + e).match(OFF_WORDS);
	if (offMatch) return { startTime: '', endTime: '', off: offMatch[1], warnings };
	if (!s && !e) return { startTime: '', endTime: '', off: '', warnings: ['Falta el horario.'] };
	if (TBD_WORDS.test(s) || (!s && TBD_WORDS.test(e))) {
		return { startTime: '', endTime: '', off: '', warnings: ['El horario está “a definir”.'] };
	}
	const startTimes = timesIn(s);
	const endTimes = timesIn(e);
	if (!startTimes || !startTimes.length) {
		return {
			startTime: '',
			endTime: '',
			off: '',
			warnings: [`No entendimos el horario “${String(startText).trim()}”.`]
		};
	}
	const startTime = startTimes[0];
	let endTime = startTimes[1] ?? '';
	if (endTimes && endTimes.length) {
		if (endTime && endTime !== endTimes[0]) {
			warnings.push(
				`El inicio dice “${String(startText).trim()}” y el fin dice “${String(
					endText
				).trim()}”: usamos el fin.`
			);
		}
		endTime = endTimes[0];
	} else if (e && !TBD_WORDS.test(e)) {
		warnings.push(`No entendimos la hora de fin “${String(endText).trim()}”.`);
	}
	if (endTime === startTime) endTime = '';
	return { startTime, endTime, off: '', warnings };
}

/* ------------------------------------------------------------------------------------------ */
/*  Rows                                                                                       */
/* ------------------------------------------------------------------------------------------ */

/**
 * @typedef {object} SheetRow
 * @prop {number} line 1-based line of the paste
 * @prop {string} name
 * @prop {string} organiza
 * @prop {string} dateText
 * @prop {string} timeText "Inicio" as written
 * @prop {string} endText "Fin" as written
 * @prop {string} date YYYY-MM-DD or ''
 * @prop {string} startTime hh:mm or ''
 * @prop {string} endTime hh:mm or '' (may be earlier than startTime: ends the next day)
 * @prop {string} start site format (YYYY-MM-DDThh:mm-03:00) or ''
 * @prop {string} end site format or ''
 * @prop {string[]} extraDays other days mentioned in "Fecha"
 * @prop {string} place
 * @prop {string} price
 * @prop {string} link a URL, or '' (see linkText)
 * @prop {string} linkText the "Link Inscripción" cell as written
 * @prop {string} comments
 * @prop {number|undefined} sectionMonth
 * @prop {number|undefined} sectionYear
 * @prop {string} off "pospuesto", "cancelado"... when the row says the event isn't happening
 * @prop {string[]} warnings Spanish, for the organizers
 */

/**
 * `start`/`end` in site format from a date and times; an end at or before the start is the next
 * day ("21 - 03 horas").
 * @param {string} date
 * @param {string} startTime
 * @param {string} endTime
 */
export function composeSchedule(date, startTime, endTime) {
	if (!isValidDate(date) || !isValidTime(startTime)) return { start: '', end: '', endDate: '' };
	const start = `${date}T${startTime}-03:00`;
	if (!isValidTime(endTime)) return { start, end: '', endDate: '' };
	const endDate = endTime <= startTime ? addDays(date, 1) : date;
	return { start, end: `${endDate}T${endTime}-03:00`, endDate };
}

/** @param {string} text */
function cleanLink(text) {
	const t = String(text ?? '').trim();
	const m = t.match(
		/(https?:\/\/\S+)|\b((?:forms\.gle|bit\.ly|docs\.google\.com|linktr\.ee)\/\S+)/i
	);
	if (!m) return '';
	return m[1] ?? 'https://' + m[2];
}

/**
 * Parses what the organizers pasted from the spreadsheet.
 * @param {string} text
 * @param {{today: string}} opts
 * @returns {{rows: SheetRow[], hasHeader: boolean, layout: 'encabezado'|'2026'|'2024'}}
 */
export function parseSheet(text, { today }) {
	const table = parseTsv(text);
	/** @type {(Column|null)[]} */
	let columns = COLUMNS_2026;
	let hasHeader = false;
	/** @type {'encabezado'|'2026'|'2024'} */
	let layout = '2026';
	/** @type {number|undefined} */
	let month;
	/** @type {number|undefined} */
	let year;
	let yearExplicit = false;
	/** @type {SheetRow[]} */
	const rows = [];

	table.forEach((cells, index) => {
		if (cells.every((c) => !c.trim())) return;
		const header = headerMapping(cells);
		if (header) {
			columns = header;
			hasHeader = true;
			layout = 'encabezado';
			return;
		}
		const section = sectionOf(cells);
		if (section) {
			if (section.year) {
				year = section.year;
				yearExplicit = true;
				if (!section.month) month = undefined;
			}
			if (section.month) {
				if (!section.year) {
					if (year === undefined) year = inferYear(section.month, today);
					// "NOVIEMBRE, DICIEMBRE, ENERO" without a year row in between: next year.
					else if (month !== undefined && section.month < month) year += 1;
				}
				month = section.month;
			}
			return;
		}
		// Without a header: the 2024 tab had an extra checkbox column ("fin") before "c".
		let cols = columns;
		if (!hasHeader && BOOL.test(cells[0]?.trim() ?? '') && BOOL.test(cells[1]?.trim() ?? '')) {
			cols = /** @type {(Column|null)[]} */ (['done', ...COLUMNS_2026]);
			layout = '2024';
		}
		/** @type {Partial<Record<Column, string>>} */
		const v = {};
		cols.forEach((col, i) => {
			if (col && v[col] === undefined) v[col] = (cells[i] ?? '').trim();
		});
		const name = (v.name ?? '').replace(/\s+/g, ' ').trim();
		if (!name && !v.date) return;

		/** @type {string[]} */
		const warnings = [];
		if (!name) warnings.push('La fila no tiene nombre de evento.');
		const parsedDate = parseDateText(v.date ?? '', {
			today,
			month,
			year: yearExplicit || month ? year : undefined
		});
		const times = parseTimeText(v.start ?? '', v.end ?? '');
		const nameOff = fold(name).match(OFF_WORDS);
		const dateOff = fold(v.date ?? '').match(OFF_WORDS);
		const off = times.off || nameOff?.[1] || dateOff?.[1] || '';
		if (off) {
			warnings.push(`La planilla dice “${off}”: no se importa, salvo que la marques.`);
		} else {
			warnings.push(...parsedDate.warnings, ...times.warnings);
		}
		const link = cleanLink(v.link ?? '');
		if (v.link && !link && !/^(no|-+|x|\?+)$/i.test(v.link)) {
			warnings.push(`El link de inscripción “${v.link}” no parece una dirección web: no se usa.`);
		}
		const { start, end } = composeSchedule(parsedDate.date, times.startTime, times.endTime);
		rows.push({
			line: index + 1,
			name,
			organiza: v.organiza ?? '',
			dateText: v.date ?? '',
			timeText: v.start ?? '',
			endText: v.end ?? '',
			date: parsedDate.date,
			startTime: times.startTime,
			endTime: times.endTime,
			start,
			end,
			extraDays: parsedDate.extraDays,
			place: v.place ?? '',
			price: v.price ?? '',
			link,
			linkText: v.link ?? '',
			comments: v.comments ?? '',
			sectionMonth: month,
			sectionYear: month || yearExplicit ? year : undefined,
			off,
			warnings
		});
	});
	return { rows, hasHeader, layout };
}

/* ------------------------------------------------------------------------------------------ */
/*  Series matching                                                                            */
/* ------------------------------------------------------------------------------------------ */

/** Words that say nothing about which event it is. */
const STOPWORDS = new Set(
	(
		'de del la las el los lo y e o en con para por un una unos unas a al sobre the and ' +
		'edicion ed especial parte nro no num numero vol hs horas'
	).split(' ')
);
/** Words that appear in many series: they count, but less. */
const WEAK_WORDS = /** @type {Record<string, number>} */ ({
	taller: 0.3,
	online: 0.5,
	virtual: 0.5,
	intensivo: 0.6,
	inicial: 0.8,
	evento: 0.3,
	fiesta: 0.6,
	jam: 0.8
});

/** @param {string} w */
function stem(w) {
	if (w.length > 5 && w.endsWith('es')) return w.slice(0, -2);
	if (w.length > 4 && w.endsWith('s')) return w.slice(0, -1);
	return w;
}

/**
 * Meaningful words of an event name or slug: no accents, punctuation, emojis, numbers, ordinals
 * ("61ª"), month names, "Edición", "parte"...
 * @param {string} text
 * @returns {string[]}
 */
export function nameTokens(text) {
	const words = fold(text)
		.replace(/[^a-z0-9]+/g, ' ')
		.split(' ')
		.filter((w) => w && !/\d/.test(w) && !STOPWORDS.has(w) && !(w in MONTHS && w.length > 3));
	return [...new Set(words.map(stem))];
}

/** @param {string} w */
const weight = (w) => WEAK_WORDS[w] ?? 1;

/**
 * Weighted Dice similarity between two token lists (0..1).
 * @param {string[]} a
 * @param {string[]} b
 */
export function similarity(a, b) {
	if (!a.length || !b.length) return 0;
	const setB = new Set(b);
	let common = 0;
	for (const w of a) if (setB.has(w)) common += weight(w);
	const total = a.reduce((s, w) => s + weight(w), 0) + b.reduce((s, w) => s + weight(w), 0);
	return total ? (2 * common) / total : 0;
}

/**
 * The series part of a slug: everything before its date.
 * `picantearla-2026-09` → `picantearla`, `someter-2026-09-cordoba` → `someter`,
 * `merienda-kinky-noviembre-2023` → `merienda-kinky`, `acuerdos-en-no-monogamias` → itself.
 * @param {string} slug
 */
export function seriesOf(slug) {
	const words = Object.keys(MONTHS).join('|');
	const m = slug.match(
		new RegExp(`^(.+?)-(?:(?:19|20)\\d{2}|(?:${words})-(?:19|20)\\d{2})(?:-|$)`)
	);
	return (m ? m[1] : slug).replace(/-parte-\d+$/, '');
}

/** @param {string} slug */
const isLaterPart = (slug) => /-parte-(?:[2-9]|\d{2,})(?:-|$)/.test(slug);

/**
 * @typedef {object} IndexedEvent
 * @prop {string} slug
 * @prop {string} title
 * @prop {string} start site format
 * @prop {string} [end]
 */

/**
 * @typedef {object} Candidate
 * @prop {string} slug
 * @prop {string} title
 * @prop {string} start
 * @prop {number} score 0..1
 */

/** Below this, a row is "sin evento anterior: se crea desde cero". */
export const MATCH_THRESHOLD = 0.6;

/**
 * Pre-tokenizes the events, so matching many rows is cheap.
 * @param {IndexedEvent[]} events
 */
export function buildMatchIndex(events) {
	return events
		.filter((e) => e.slug && !e.slug.startsWith('_'))
		.map((e) => {
			const series = seriesOf(e.slug);
			return {
				...e,
				series,
				titleTokens: nameTokens(e.title),
				slugTokens: nameTokens(e.slug.replace(/-parte-\d+/, '').replace(/-/g, ' '))
			};
		});
}

/**
 * Finds the most recent existing event of the same series as a spreadsheet row.
 *
 * Every event gets a score (the best of: name vs its title, name vs its slug words). Events are
 * grouped by series (the slug before its date), and each series is represented by its most recent
 * event whose score is close to the series' best — so "Picantearla. Edición Especial" (which
 * matches the 2023 "Picantearla - Edición Especial" exactly) still proposes the latest
 * Picantearla, while "Picantearla Deluxe" proposes the latest Deluxe.
 *
 * @param {string} name
 * @param {ReturnType<typeof buildMatchIndex>} index
 * @returns {{best: Candidate|null, alternatives: Candidate[]}} best is null below MATCH_THRESHOLD
 */
export function matchSeries(name, index) {
	const tokens = nameTokens(name);
	if (!tokens.length) return { best: null, alternatives: [] };
	/** @type {Map<string, {score: number, members: {e: any, score: number}[]}>} */
	const groups = new Map();
	for (const e of index) {
		const score = Math.max(similarity(tokens, e.titleTokens), similarity(tokens, e.slugTokens));
		if (score <= 0) continue;
		const g = groups.get(e.series) ?? { score: 0, members: [] };
		g.score = Math.max(g.score, score);
		g.members.push({ e, score });
		groups.set(e.series, g);
	}
	/** @type {Candidate[]} */
	const candidates = [];
	for (const g of groups.values()) {
		const close = g.members.filter((m) => m.score >= g.score - 0.15);
		const pool = close.some((m) => !isLaterPart(m.e.slug))
			? close.filter((m) => !isLaterPart(m.e.slug))
			: close;
		pool.sort((a, b) => (b.e.start || '').localeCompare(a.e.start || ''));
		const rep = pool[0].e;
		candidates.push({ slug: rep.slug, title: rep.title, start: rep.start, score: round(g.score) });
	}
	candidates.sort((a, b) => b.score - a.score || (b.start || '').localeCompare(a.start || ''));
	const top = candidates[0];
	if (!top || top.score < MATCH_THRESHOLD) {
		return { best: null, alternatives: candidates.filter((c) => c.score >= 0.3).slice(0, 2) };
	}
	return { best: top, alternatives: candidates.slice(1, 3).filter((c) => c.score >= 0.3) };
}

/** @param {number} n */
const round = (n) => Math.round(n * 100) / 100;

/**
 * Existing events that look like this same row (same series, same day): probably already loaded.
 * @param {string} name
 * @param {string} date YYYY-MM-DD
 * @param {ReturnType<typeof buildMatchIndex>} index
 */
export function findExisting(name, date, index) {
	if (!date) return [];
	const tokens = nameTokens(name);
	return index
		.filter((e) => parseEventDate(e.start).date === date)
		.filter(
			(e) =>
				Math.max(similarity(tokens, e.titleTokens), similarity(tokens, e.slugTokens)) >=
				MATCH_THRESHOLD
		)
		.map((e) => e.slug);
}

/* ------------------------------------------------------------------------------------------ */
/*  Proposals for the review screen                                                            */
/* ------------------------------------------------------------------------------------------ */

const EDITION = /\((\d+)\s*([ªº°])\s*(Edici[oó]n)\)/i;

/**
 * Title for the new event. When the spreadsheet name adds nothing to the previous event's title
 * ("Picantearla" vs "Picantearla (61ª Edición)", "Taller de Bondage" vs "Taller de Bondage:
 * Restricciones & Placer"), the previous title is reused, with its edition number bumped.
 * Otherwise the spreadsheet name wins ("Picantearla. Edición Especial", "Taller de Bondage
 * Online").
 * @param {string} sheetName
 * @param {string|undefined} sourceTitle
 * @param {number} [bump] how many editions later (2 when the same series is twice in the paste)
 */
export function proposeTitle(sheetName, sourceTitle, bump = 1) {
	const name = String(sheetName ?? '').trim();
	if (!sourceTitle) return name;
	const own = titleWords(name);
	const theirs = new Set(titleWords(sourceTitle));
	const addsNothing = own.every((w) => theirs.has(w));
	const hasOwnNumber = /\d/.test(name);
	if (!addsNothing || (hasOwnNumber && !EDITION.test(sourceTitle))) return name || sourceTitle;
	if (hasOwnNumber) return name;
	return sourceTitle
		.trim()
		.replace(EDITION, (_, n, sign, word) => `(${Number(n) + bump}${sign} ${word})`);
}

/** Unlike for matching, words like "Especial" or "Online" matter for the title. */
const TITLE_FILLER = new Set(
	'de del la las el los y e en con para por un una a al edicion ed'.split(' ')
);

/** @param {string} text */
function titleWords(text) {
	const words = fold(text)
		.replace(/[^a-z0-9]+/g, ' ')
		.split(' ')
		.filter((w) => w && !/\d/.test(w) && !TITLE_FILLER.has(w));
	return [...new Set(words.map(stem))];
}

/**
 * @param {string|null} sourceSlug
 * @param {string} name
 * @param {string} date YYYY-MM-DD
 * @param {Iterable<string>|((slug: string) => boolean)} taken
 */
export function proposeSlug(sourceSlug, name, date, taken) {
	const ym = isValidDate(date) ? date.slice(0, 7) : '';
	let base;
	if (sourceSlug) base = ym ? deriveSlug(sourceSlug, date) : sourceSlug;
	else
		base = [slugify(name).slice(0, 60).replace(/-+$/, '') || 'evento', ym]
			.filter(Boolean)
			.join('-');
	return uniqueSlug(base, taken);
}

/**
 * The end of the new event: the one in the spreadsheet, or else the previous event's length.
 * @param {{date: string, startTime: string, endTime: string}} row
 * @param {{start: string, end?: string}|null} source
 * @returns {{start: string, end: string, endDate: string, endTime: string, estimated: boolean}}
 */
export function scheduleFor(row, source) {
	const own = composeSchedule(row.date, row.startTime, row.endTime);
	if (!own.start || own.end || !source?.end)
		return { ...own, endTime: row.endTime, estimated: false };
	const s = parseEventDate(source.start);
	const e = parseEventDate(source.end);
	if (!s.date || !s.time || !e.date || !e.time) return { ...own, endTime: '', estimated: false };
	const minutes =
		(Date.parse(`${e.date}T${e.time}:00Z`) - Date.parse(`${s.date}T${s.time}:00Z`)) / 60000;
	if (!(minutes > 0 && minutes <= 24 * 60)) return { ...own, endTime: '', estimated: false };
	const endMs = Date.parse(`${row.date}T${row.startTime}:00Z`) + minutes * 60000;
	const iso = new Date(endMs).toISOString();
	const endDate = iso.slice(0, 10);
	const endTime = iso.slice(11, 16);
	return {
		start: own.start,
		end: `${endDate}T${endTime}-03:00`,
		endDate,
		endTime,
		estimated: true
	};
}

/* ------------------------------------------------------------------------------------------ */
/*  The new event file                                                                         */
/* ------------------------------------------------------------------------------------------ */

/**
 * @typedef {object} ImportChoice what the review screen sends for one row
 * @prop {string} title
 * @prop {string} date YYYY-MM-DD
 * @prop {string} startTime hh:mm
 * @prop {string} [endTime] hh:mm ('' = no end); earlier than startTime = the next day
 * @prop {string} [place]
 * @prop {string} [link]
 */

const ONLINE = /^(online|virtual|zoom|meet|google meet|jitsi|por zoom|por meet)$/i;

/**
 * Where the event happens, given the spreadsheet's "Lugar" and the previous event.
 * Kept as is when the sheet is empty or names the same place ("club soguita" vs
 * "Club Soguita Shibari"); an address (has a number) goes to `location`, a venue name to
 * `location_name`.
 * @param {string} place
 * @param {{location: string, location_name: string}} source
 * @returns {{location?: string, location_name?: string, changed: boolean}}
 */
export function placeFields(place, source) {
	const p = String(place ?? '').trim();
	if (!p) return { changed: false };
	const f = fold(p).replace(/[^a-z0-9 ]/g, '');
	const known = [source.location, source.location_name].map((x) =>
		fold(x).replace(/[^a-z0-9 ]/g, '')
	);
	if (known.some((k) => k && (k.includes(f) || f.includes(k)))) return { changed: false };
	if (ONLINE.test(p)) return { location: 'Online', location_name: '', changed: true };
	if (/\d/.test(p)) return { location: p, location_name: '', changed: true };
	return { location: '', location_name: p, changed: true };
}

/**
 * Builds the markdown of an imported event: a copy of `sourceRaw` (the previous event of the
 * series, or the events template) with the new title, dates, place and link, published_date
 * today, and ALWAYS `force_unlisted: true` (a draft the organizers publish later).
 *
 * @param {string} sourceRaw
 * @param {ImportChoice} choice
 * @param {{today: string, fromTemplate?: boolean}} opts
 * @returns {{content: string, notes: string[], featured: string}}
 */
export function buildImportedEvent(sourceRaw, choice, { today, fromTemplate = false }) {
	const { frontmatter } = splitMarkdown(sourceRaw);
	const source = readEventFields(frontmatter);
	const form = formFromSource(sourceRaw, { today, fromTemplate });
	/** @type {string[]} */
	const notes = [];

	form.title = String(choice.title ?? '').trim();
	form.startDate = choice.date;
	form.startTime = choice.startTime;
	const endTime = String(choice.endTime ?? '').trim();
	if (endTime) {
		const { endDate } = composeSchedule(choice.date, choice.startTime, endTime);
		form.hasEnd = true;
		form.endDate = endDate;
		form.endTime = endTime;
	} else {
		form.hasEnd = false;
	}

	const place = placeFields(
		choice.place ?? '',
		fromTemplate ? { location: '', location_name: '' } : source
	);
	if (place.changed) {
		form.location = place.location ?? '';
		form.location_name = place.location_name ?? '';
		if (!fromTemplate)
			notes.push('El lugar cambió respecto del evento anterior: revisá la dirección.');
	}

	const link = String(choice.link ?? '').trim();
	if (link) {
		form.link = link;
		form.status = 'abierto';
		if (!form.link_text) form.link_text = 'Inscribirme';
	} else {
		form.status = 'anunciado';
		if (form.link)
			notes.push('Sin link nuevo: queda “anunciado” (el link del evento anterior no se muestra).');
	}
	form.unlisted = true;
	if (fromTemplate) notes.push('Creado desde cero: falta el texto, la imagen y las etiquetas.');

	return { content: buildEventMarkdown(sourceRaw, form), notes, featured: source.featured };
}
