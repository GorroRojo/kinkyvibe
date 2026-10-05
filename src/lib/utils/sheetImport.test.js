import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { parseDocument } from 'yaml';
import { NEW_EVENT_TEMPLATE, splitMarkdown, readEventFields } from './eventDraft.js';
import { validateEventTags } from './adminTags.js';
import { readTicketsForm, validateTicketsForm } from './ticketsEditor.js';
import {
	parseTsv,
	parseSheet,
	cleanLink,
	normalizeLink,
	parseDateText,
	parseTimeText,
	sectionOf,
	headerMapping,
	nameTokens,
	seriesOf,
	buildMatchIndex,
	matchSeries,
	findExisting,
	proposeTitle,
	proposeSlug,
	scheduleFor,
	placeFields,
	buildImportedEvent,
	inferYear,
	eventTimes,
	inheritedTimes,
	parseGeneralPrice,
	generalTickets,
	MATCH_THRESHOLD
} from './sheetImport.js';

const TODAY = '2026-09-29';
const DIR = new URL('../posts/calendario/', import.meta.url);
const TEMPLATE = new URL('../admin/plantillas/evento.md', import.meta.url);

/** @param {string} slug */
const post = (slug) => readFileSync(new URL(`${slug}.md`, DIR), 'utf8');
/** @param {string} md */
const meta = (md) => parseDocument(splitMarkdown(md).frontmatter).toJS();

/** Every event in the repo: slug, title and dates read from the frontmatter. */
const EVENTS = readdirSync(DIR)
	.filter((f) => f.endsWith('.md') && !f.startsWith('_'))
	.flatMap((f) => {
		const slug = f.replace(/\.md$/, '');
		try {
			const fields = readEventFields(
				splitMarkdown(readFileSync(new URL(f, DIR), 'utf8')).frontmatter
			);
			return [{ slug, title: fields.title || slug, start: fields.start, end: fields.end }];
		} catch (e) {
			return [];
		}
	});
const INDEX = buildMatchIndex(EVENTS);

/** The real sample rows from the 2023 spreadsheet (see the PR description). */
const SAMPLE = [
	'FALSE\t\tTaller de Dominación para principiantes\tmiércoles 20 y jueves 21\tpospuesto\t\tOnline',
	'FALSE\t\tPicantearla. Edición Especial\tviernes 22\t21 - 03 horas\t\tAvenida Maipú 2535',
	'FALSE\t\tTaller inicial de Soguita\tsábado 23\t13 -15 hs\t\tclub soguita',
	'FALSE\t\tPop porn\tsábado 23\t20:30 hs\t\tLa Casa del Árbol',
	'FALSE\t\tMerienda Kinky\tdomingo 24\t16 horas\t\tPlaza Lavalle'
].join('\n');

const HEADER_2026 = [
	'c',
	'organiza',
	'Nombre del evento',
	'Fecha',
	'Inicio (HH:HH)',
	'Fin (HH:HH)',
	'Lugar',
	'Valor',
	'$ fondo',
	'Link Inscripción',
	'cierre form',
	'jitsi/meet',
	'comentarios',
	'inscripciones',
	'flyers nuevos',
	'ingreso esperado'
].join('\t');

describe('parseTsv', () => {
	it('splits tabs and lines, keeping empty cells', () => {
		expect(parseTsv('a\t\tb\nc\td')).toEqual([
			['a', '', 'b'],
			['c', 'd']
		]);
	});
	it('handles quoted cells with line breaks and quotes', () => {
		expect(parseTsv('x\t"línea 1\nlínea 2"\ty\nz')).toEqual([
			['x', 'línea 1\nlínea 2', 'y'],
			['z']
		]);
		expect(parseTsv('"dice ""hola"""\tb')).toEqual([['dice "hola"', 'b']]);
		// a quote that doesn't wrap the whole cell is just a character
		expect(parseTsv('"Picantearla" especial\tb')).toEqual([['"Picantearla" especial', 'b']]);
	});
	it('normalizes Windows line breaks', () => {
		expect(parseTsv('a\tb\r\nc')).toEqual([['a', 'b'], ['c']]);
	});
});

describe('section and header rows', () => {
	it('detects month and year rows, also when the merged value repeats', () => {
		expect(sectionOf(['2026'])).toEqual({ year: 2026 });
		expect(sectionOf(['SEPTIEMBRE', '', ''])).toEqual({ month: 9 });
		expect(sectionOf(['OCTUBRE', 'OCTUBRE', 'OCTUBRE'])).toEqual({ month: 10 });
		expect(sectionOf(['FALSE', '', 'OCTUBRE'])).toEqual({ month: 10 });
		expect(sectionOf(['Octubre 2026'])).toEqual({ month: 10, year: 2026 });
		expect(sectionOf(['Setiembre'])).toEqual({ month: 9 });
	});
	it('does not take event rows for sections', () => {
		expect(sectionOf(['FALSE', '', 'Merienda Kinky', 'domingo 24'])).toBe(null);
		expect(sectionOf(['OCTUBRE', 'NOVIEMBRE'])).toBe(null);
		expect(sectionOf(['Pop porn'])).toBe(null);
		expect(sectionOf(['MAR'])).toBe(null);
	});
	it('maps header rows of both tabs', () => {
		const cols = headerMapping(HEADER_2026.split('\t'));
		expect(cols?.slice(0, 7)).toEqual([
			'check',
			'organiza',
			'name',
			'date',
			'start',
			'end',
			'place'
		]);
		expect(cols?.[9]).toBe('link');
		expect(cols?.[12]).toBe('comments');
		const old = headerMapping(('fin\t' + HEADER_2026).split('\t'));
		expect(old?.slice(0, 4)).toEqual(['done', 'check', 'organiza', 'name']);
		expect(old?.[6]).toBe('end');
		expect(headerMapping(['FALSE', '', 'Pop porn'])).toBe(null);
	});
});

describe('parseDateText', () => {
	const oct = { today: TODAY, month: 10, year: 2026 };
	it('uses the section month for "viernes 16" and checks the weekday', () => {
		expect(parseDateText('viernes 16', oct)).toEqual({
			date: '2026-10-16',
			extraDays: [],
			warnings: []
		});
		expect(parseDateText('sábado 17', oct).date).toBe('2026-10-17');
		const wrong = parseDateText('viernes 17', oct);
		expect(wrong.date).toBe('2026-10-17');
		expect(wrong.warnings[0]).toMatch(/es sábado, no viernes/);
	});
	it('reads dd/mm, dd/mm/yyyy and "22 de octubre"', () => {
		expect(parseDateText('22/10', { today: TODAY }).date).toBe('2026-10-22');
		expect(parseDateText('22/10/2026', { today: TODAY }).date).toBe('2026-10-22');
		expect(parseDateText('5/1/27', { today: TODAY }).date).toBe('2027-01-05');
		expect(parseDateText('22 de octubre', { today: TODAY }).date).toBe('2026-10-22');
		expect(parseDateText('jueves 22 de octubre de 2026', { today: TODAY })).toEqual({
			date: '2026-10-22',
			extraDays: [],
			warnings: []
		});
		// an explicit month beats the section's
		expect(parseDateText('3 de noviembre', oct).date).toBe('2026-11-03');
		// months long gone are next year's
		expect(parseDateText('10 de marzo', { today: TODAY }).date).toBe('2027-03-10');
	});
	it('without a section, guesses the next matching date and warns', () => {
		// next "viernes 22" after 2026-09-29 is January 2027
		const r = parseDateText('viernes 22', { today: TODAY });
		expect(r.date).toBe('2027-01-22');
		expect(r.warnings[0]).toMatch(/no dice el mes/);
		expect(parseDateText('24', { today: TODAY }).date).toBe('2026-10-24');
	});
	it('flags several days and keeps the first one', () => {
		const r = parseDateText('miércoles 20 y jueves 21', { today: TODAY, month: 10, year: 2027 });
		expect(r.date).toBe('2027-10-20');
		expect(r.extraDays).toEqual(['2027-10-21']);
		expect(r.warnings[0]).toMatch(/varios días/);
		expect(parseDateText('20 al 22', oct).extraDays).toEqual(['2026-10-21', '2026-10-22']);
	});
	it('explains what it cannot read', () => {
		expect(parseDateText('', oct).warnings[0]).toMatch(/Falta la fecha/);
		expect(parseDateText('a definir', oct).warnings[0]).toMatch(/No entendimos la fecha/);
		expect(parseDateText('31/9', oct).warnings[0]).toMatch(/no existe/);
	});
});

describe('parseTimeText', () => {
	it('reads the formats used in the spreadsheet', () => {
		expect(parseTimeText('21 - 03 horas')).toMatchObject({
			startTime: '21:00',
			endTime: '03:00',
			warnings: []
		});
		expect(parseTimeText('13 -15 hs')).toMatchObject({ startTime: '13:00', endTime: '15:00' });
		expect(parseTimeText('15 a 18 hs')).toMatchObject({ startTime: '15:00', endTime: '18:00' });
		expect(parseTimeText('20:30 hs')).toMatchObject({ startTime: '20:30', endTime: '' });
		expect(parseTimeText('16 horas')).toMatchObject({ startTime: '16:00', endTime: '' });
		expect(parseTimeText('20.30')).toMatchObject({ startTime: '20:30', endTime: '' });
		expect(parseTimeText('20hs')).toMatchObject({ startTime: '20:00', endTime: '' });
		expect(parseTimeText('de 19:30 a 24')).toMatchObject({ startTime: '19:30', endTime: '00:00' });
	});
	it('combines Inicio and Fin columns', () => {
		expect(parseTimeText('21:00', '00:30')).toMatchObject({
			startTime: '21:00',
			endTime: '00:30',
			warnings: []
		});
		const both = parseTimeText('20 a 23', '23:30');
		expect(both.endTime).toBe('23:30');
		expect(both.warnings[0]).toMatch(/usamos el fin/);
	});
	it('recognizes postponed, cancelled and undefined times', () => {
		expect(parseTimeText('pospuesto').off).toBe('pospuesto');
		expect(parseTimeText('CANCELADO').off).toBe('cancelado');
		expect(parseTimeText('', 'suspendido').off).toBe('suspendido');
		expect(parseTimeText('a definir')).toMatchObject({ startTime: '', off: '' });
		expect(parseTimeText('a definir').warnings[0]).toMatch(/a definir/);
		expect(parseTimeText('').warnings[0]).toMatch(/Falta el horario/);
		expect(parseTimeText('temprano').warnings[0]).toMatch(/No entendimos el horario/);
		expect(parseTimeText('25 hs').warnings[0]).toMatch(/No entendimos/);
	});
});

describe('parseSheet', () => {
	it('parses the real sample rows inside a SEPTIEMBRE 2023 section', () => {
		const { rows, layout } = parseSheet('2023\nSEPTIEMBRE\t\t\n' + SAMPLE, { today: TODAY });
		expect(layout).toBe('2026');
		expect(rows.map((r) => r.name)).toEqual([
			'Taller de Dominación para principiantes',
			'Picantearla. Edición Especial',
			'Taller inicial de Soguita',
			'Pop porn',
			'Merienda Kinky'
		]);
		const [dom, pica, soguita, pop, merienda] = rows;
		expect(dom.off).toBe('pospuesto');
		expect(dom.warnings[0]).toMatch(/no se importa/);
		expect(dom.place).toBe('Online');
		expect(pica).toMatchObject({
			date: '2023-09-22',
			start: '2023-09-22T21:00-03:00',
			end: '2023-09-23T03:00-03:00',
			place: 'Avenida Maipú 2535',
			sectionMonth: 9,
			sectionYear: 2023,
			warnings: []
		});
		expect(soguita).toMatchObject({
			start: '2023-09-23T13:00-03:00',
			end: '2023-09-23T15:00-03:00'
		});
		expect(pop).toMatchObject({ start: '2023-09-23T20:30-03:00', end: '' });
		expect(merienda).toMatchObject({
			start: '2023-09-24T16:00-03:00',
			end: '',
			place: 'Plaza Lavalle'
		});
		// the "c" checkbox is ignored entirely
		expect(rows.every((r) => !('checked' in r))).toBe(true);
	});
	it('ignores the "c" checkbox: TRUE and FALSE rows read the same', () => {
		const row = '\tKinkyVibe\tPicantearla\tviernes 16\t21 - 03 horas\t\tAgrelo 3399';
		const read = (/** @type {string} */ c) =>
			parseSheet([HEADER_2026, 'OCTUBRE', c + row].join('\n'), { today: TODAY }).rows[0];
		expect(read('TRUE')).toEqual(read('FALSE'));
	});
	it('parses 2026-style rows with a header, sections and every column', () => {
		const text = [
			HEADER_2026,
			'2026',
			'OCTUBRE\tOCTUBRE\tOCTUBRE',
			'TRUE\tKinkyVibe\tPicantearla\tviernes 16\t21 - 03 horas\t\tAgrelo 3399\t$8000\t\thttps://forms.gle/abc\t\t\tconfirmar DJ',
			'FALSE\t\tTaller de Bondage\tsábado 17\t15 a 18 hs\t\t\t\t\tforms.gle/xyz',
			'FALSE\t\tCine kinky\tdomingo 18\tcancelado',
			'FALSE\t\tNoche de juegos sin nombre conocido\t24/10\t22 hs\t02 hs\tPor definir\t\t\tpendiente',
			'NOVIEMBRE',
			'FALSE\t\tMerienda Kinky\tsábado 7\ta definir'
		].join('\n');
		const { rows, hasHeader, layout } = parseSheet(text, { today: TODAY });
		expect(hasHeader).toBe(true);
		expect(layout).toBe('encabezado');
		expect(rows).toHaveLength(5);
		const [pica, bondage, cine, noche, merienda] = rows;
		expect(pica).toMatchObject({
			organiza: 'KinkyVibe',
			start: '2026-10-16T21:00-03:00',
			end: '2026-10-17T03:00-03:00',
			price: '$8000',
			link: 'https://forms.gle/abc',
			comments: 'confirmar DJ',
			warnings: []
		});
		expect(bondage).toMatchObject({
			start: '2026-10-17T15:00-03:00',
			end: '2026-10-17T18:00-03:00',
			link: 'https://forms.gle/xyz'
		});
		expect(cine.off).toBe('cancelado');
		expect(noche).toMatchObject({ start: '2026-10-24T22:00-03:00', end: '2026-10-25T02:00-03:00' });
		expect(noche.warnings[0]).toMatch(/no parece una dirección web/);
		expect(merienda).toMatchObject({ date: '2026-11-07', start: '', sectionMonth: 11 });
		expect(merienda.warnings[0]).toMatch(/a definir/);
	});
	it('supports the 2024 tab (extra leading checkbox), with and without header', () => {
		const row = 'FALSE\tFALSE\t\tPop porn\t23/9/2023\t20:30 hs\t23 hs\tLa Casa del Árbol';
		const noHeader = parseSheet(row, { today: TODAY });
		expect(noHeader.layout).toBe('2024');
		expect(noHeader.rows[0]).toMatchObject({
			name: 'Pop porn',
			start: '2023-09-23T20:30-03:00',
			end: '2023-09-23T23:00-03:00',
			place: 'La Casa del Árbol'
		});
		const withHeader = parseSheet('fin\t' + HEADER_2026 + '\n' + row, { today: TODAY });
		expect({ ...withHeader.rows[0], line: 1 }).toEqual(noHeader.rows[0]);
	});
	it('rolls the year over when months go back without a year row', () => {
		const { rows } = parseSheet(
			'DICIEMBRE\nFALSE\t\tA\t5/12\t20\nENERO\nFALSE\t\tB\tsábado 9\t20',
			{
				today: TODAY
			}
		);
		expect(rows.map((r) => r.date)).toEqual(['2026-12-05', '2027-01-09']);
		expect(rows[1].warnings).toEqual([]);
		expect(inferYear(7, TODAY)).toBe(2026);
		expect(inferYear(6, TODAY)).toBe(2027);
	});
	it('skips empty rows and ignores rows without name nor date', () => {
		const { rows } = parseSheet('\n\t\t\nFALSE\t\t\t\t\t\tsolo lugar\n', { today: TODAY });
		expect(rows).toEqual([]);
	});
});

describe('series matching', () => {
	it('reads real events from the repo', () => {
		expect(EVENTS.length).toBeGreaterThan(400);
	});
	it('normalizes names', () => {
		expect(nameTokens('Picantearla (62ª Edición)')).toEqual(['picantearla']);
		expect(nameTokens('Picantearla. Edición Especial')).toEqual(['picantearla']);
		expect(nameTokens('Picantearla Deluxe 🔥 (56° Edición)')).toEqual(['picantearla', 'deluxe']);
		expect(nameTokens('Taller de Dominación para Principiantes (parte 1 de 2)')).toEqual([
			'taller',
			'dominacion',
			'principiant'
		]);
		expect(seriesOf('picantearla-2026-09')).toBe('picantearla');
		expect(seriesOf('merienda-kinky-noviembre-2023')).toBe('merienda-kinky');
		expect(seriesOf('someter-2026-09-cordoba')).toBe('someter');
		expect(seriesOf('taller-bdsm-inicial-2024-06-parte-2')).toBe('taller-bdsm-inicial');
		expect(seriesOf('acuerdos-en-no-monogamias')).toBe('acuerdos-en-no-monogamias');
	});

	/** Most recent event of a series, straight from the repo. */
	const latest = (
		/** @type {string} */ series,
		/** @type {(s: string) => boolean} */ ok = () => true
	) =>
		EVENTS.filter((e) => seriesOf(e.slug) === series && ok(e.slug)).sort((a, b) =>
			b.start.localeCompare(a.start)
		)[0].slug;

	it('maps every Picantearla spelling to the latest Picantearla', () => {
		const expected = latest('picantearla');
		expect(expected).toMatch(/^picantearla-20\d\d-\d\d$/);
		for (const name of [
			'Picantearla',
			'Picantearla. Edición Especial',
			'Picantearla (62ª Edición)',
			'PICANTEARLA'
		]) {
			const { best } = matchSeries(name, INDEX);
			expect(best?.slug, name).toBe(expected);
			expect(best?.score).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
		}
	});
	it('keeps sub-series apart', () => {
		expect(matchSeries('Picantearla Deluxe', INDEX).best?.slug).toBe(latest('picantearla-deluxe'));
		expect(matchSeries('Picantearla Protocolar', INDEX).best?.slug).toBe(
			latest('picantearla-protocolar')
		);
		expect(matchSeries('Someter', INDEX).best?.slug).toBe('someter-2026-09');
		expect(matchSeries('¡Córdoba! Someter', INDEX).best?.slug).toBe('someter-2026-09-cordoba');
	});
	it('finds workshops by their short name', () => {
		expect(matchSeries('Taller de Bondage', INDEX).best?.slug).toBe(
			latest('taller-bondage', (s) => !s.includes('cordoba'))
		);
		expect(matchSeries('Taller de Dominación para principiantes', INDEX).best?.slug).toBe(
			latest('taller-dominacion-principiantes', (s) => !s.includes('parte-2'))
		);
		expect(matchSeries('Merienda Kinky', INDEX).best?.slug).toBe('merienda-kinky-noviembre-2023');
		// never a "parte 2" when there is a part 1
		expect(matchSeries('Taller introductorio intensivo de shibari', INDEX).best?.slug).not.toMatch(
			/parte-2/
		);
	});
	it('offers up to two alternatives from other series', () => {
		const { best, alternatives } = matchSeries('Picantearla', INDEX);
		expect(alternatives.length).toBe(2);
		expect(
			alternatives.every((a) => a.slug !== best?.slug && a.slug.startsWith('picantearla-'))
		).toBe(true);
	});
	it('says "sin evento anterior" for unknown names', () => {
		expect(matchSeries('Pop porn', INDEX).best).toBe(null);
		expect(matchSeries('Taller inicial de Soguita', INDEX).best).toBe(null);
		expect(matchSeries('Noche de juegos sin nombre conocido', INDEX).best).toBe(null);
		expect(matchSeries('', INDEX)).toEqual({ best: null, alternatives: [] });
	});
	it('spots events that are already loaded', () => {
		const pica = EVENTS.find((e) => e.slug === 'picantearla-2026-09');
		expect(findExisting('Picantearla', pica?.start.slice(0, 10) ?? '', INDEX)).toEqual([
			'picantearla-2026-09'
		]);
		expect(findExisting('Picantearla', '2026-10-16', INDEX)).toEqual([]);
	});
});

describe('proposals', () => {
	it('proposes titles', () => {
		expect(proposeTitle('Picantearla', 'Picantearla (61ª Edición)')).toBe(
			'Picantearla (62ª Edición)'
		);
		expect(proposeTitle('Picantearla', 'Picantearla (61ª Edición)', 2)).toBe(
			'Picantearla (63ª Edición)'
		);
		expect(proposeTitle('Picantearla Deluxe', 'Picantearla Deluxe 🔥 (56° Edición)')).toBe(
			'Picantearla Deluxe 🔥 (57° Edición)'
		);
		expect(proposeTitle('Picantearla (62ª Edición)', 'Picantearla (61ª Edición)')).toBe(
			'Picantearla (62ª Edición)'
		);
		expect(proposeTitle('Picantearla. Edición Especial', 'Picantearla (61ª Edición)')).toBe(
			'Picantearla. Edición Especial'
		);
		expect(proposeTitle('Taller de Bondage', 'Taller de Bondage: Restricciones & Placer')).toBe(
			'Taller de Bondage: Restricciones & Placer'
		);
		expect(
			proposeTitle('Taller de Bondage Online', 'Taller de Bondage: Restricciones & Placer')
		).toBe('Taller de Bondage Online');
		expect(proposeTitle('Pop porn', undefined)).toBe('Pop porn');
	});
	it('proposes free slugs', () => {
		expect(proposeSlug('picantearla-2026-09', 'Picantearla', '2026-10-16', [])).toBe(
			'picantearla-2026-10'
		);
		expect(
			proposeSlug('picantearla-2026-09', 'Picantearla', '2026-10-16', ['picantearla-2026-10'])
		).toBe('picantearla-2026-10-2');
		expect(proposeSlug('merienda-kinky-noviembre-2023', 'Merienda Kinky', '2026-11-07', [])).toBe(
			'merienda-kinky-2026-11'
		);
		expect(proposeSlug(null, 'Pop porn', '2026-10-24', [])).toBe('pop-porn-2026-10');
		expect(proposeSlug(null, '¡Noche!', '', [])).toBe('noche');
	});
	it('keeps the previous event length when the sheet has no end', () => {
		const source = { start: '2026-09-12T20:00-03:00', end: '2026-09-13T01:30-03:00' };
		expect(scheduleFor({ date: '2026-10-16', startTime: '21:00', endTime: '' }, source)).toEqual({
			start: '2026-10-16T21:00-03:00',
			end: '2026-10-17T02:30-03:00',
			endDate: '2026-10-17',
			endTime: '02:30',
			estimated: true
		});
		expect(
			scheduleFor({ date: '2026-10-16', startTime: '21:00', endTime: '03:00' }, source)
		).toMatchObject({
			end: '2026-10-17T03:00-03:00',
			estimated: false
		});
		expect(
			scheduleFor({ date: '2026-10-16', startTime: '21:00', endTime: '' }, null)
		).toMatchObject({
			end: '',
			estimated: false
		});
	});
	it('decides where the event happens', () => {
		const soguita = { location: 'Almagro, CABA', location_name: 'Club Soguita Shibari' };
		expect(placeFields('club soguita', soguita)).toEqual({ changed: false });
		expect(placeFields('', soguita)).toEqual({ changed: false });
		expect(placeFields('Avenida Maipú 2535', soguita)).toEqual({
			location: 'Avenida Maipú 2535',
			location_name: '',
			changed: true
		});
		expect(placeFields('La Casa del Árbol', soguita)).toEqual({
			location: '',
			location_name: 'La Casa del Árbol',
			changed: true
		});
		expect(placeFields('online', soguita)).toMatchObject({ location: 'Online', changed: true });
	});
});

describe('buildImportedEvent', () => {
	it('duplicates the previous Picantearla as an unlisted draft', () => {
		const raw = post('picantearla-2026-09');
		const { content, notes } = buildImportedEvent(
			raw,
			{
				title: 'Picantearla (62ª Edición)',
				date: '2026-10-16',
				startTime: '21:00',
				endTime: '03:00',
				place: 'Agrelo 3399',
				link: 'https://forms.gle/abc'
			},
			{ today: TODAY }
		);
		const m = meta(content);
		expect(m).toMatchObject({
			published_date: '2026-09-29Z-03:00',
			title: 'Picantearla (62ª Edición)',
			start: '2026-10-16T21:00-03:00',
			end: '2026-10-17T03:00-03:00',
			status: 'abierto',
			link: 'https://forms.gle/abc',
			force_unlisted: true,
			category: 'calendario',
			featured: 'picantearla-miniatura.webp',
			location: 'Agrelo 3399, Boedo.  Ciudad Autónoma de Buenos Aires'
		});
		expect(m.summary).toBe(meta(raw).summary);
		expect(m.tags).toEqual(meta(raw).tags);
		// the panel's draft marker: only these get «A confirmar» / «Confirmar» in the agenda
		expect(m.borrador).toBe(true);
		// body and comments are kept
		expect(splitMarkdown(content).body).toBe(splitMarkdown(raw).body);
		expect(content).toContain('status: abierto # abierto | anunciado | agotadas | cancelado');
		expect(notes).toEqual([]);
	});
	it('without a link it stays "anunciado", and a new place replaces the old one', () => {
		const { content, notes } = buildImportedEvent(
			post('taller-bondage-2026-03'),
			{
				title: 'Taller de Bondage',
				date: '2026-10-17',
				startTime: '15:00',
				endTime: '18:00',
				place: 'La Casa del Árbol'
			},
			{ today: TODAY }
		);
		const m = meta(content);
		expect(m).toMatchObject({
			status: 'anunciado',
			location_name: 'La Casa del Árbol',
			start: '2026-10-17T15:00-03:00',
			end: '2026-10-17T18:00-03:00',
			force_unlisted: true
		});
		expect(m.location).toBeUndefined();
		expect(content).toMatch(/^#location: Sarmiento 3096/m);
		expect(notes.join(' ')).toMatch(/lugar cambió/);
		expect(notes.join(' ')).toMatch(/anunciado/);
		// no link in the row: the previous edition's link stays in the file (hidden while anunciado)
		expect(m.link).toBe(meta(post('taller-bondage-2026-03')).link);
	});
	it('keeps a numeric featured image so the page can copy it', () => {
		const { featured, content } = buildImportedEvent(
			post('merienda-kinky-noviembre-2023'),
			{ title: 'Merienda Kinky', date: '2026-11-07', startTime: '16:00', endTime: '' },
			{ today: TODAY }
		);
		expect(featured).toBe('1');
		const m = meta(content);
		expect(m.featured).toBe(1);
		expect(m.end).toBeUndefined();
		expect(m.force_unlisted).toBe(true);
		expect(m.borrador).toBe(true);
	});
	it('creates unknown events from the template', () => {
		const template = readFileSync(TEMPLATE, 'utf8');
		const { content, notes } = buildImportedEvent(
			template,
			{
				title: 'Pop porn',
				date: '2026-10-24',
				startTime: '20:30',
				endTime: '23:00',
				place: 'La Casa del Árbol',
				link: 'https://example.com/entradas'
			},
			{ today: TODAY, fromTemplate: true }
		);
		const m = meta(content);
		expect(m).toMatchObject({
			title: 'Pop porn',
			start: '2026-10-24T20:30-03:00',
			end: '2026-10-24T23:00-03:00',
			location_name: 'La Casa del Árbol',
			link: 'https://example.com/entradas',
			status: 'abierto',
			force_unlisted: true,
			published_date: '2026-09-29Z-03:00'
		});
		expect(notes.join(' ')).toMatch(/desde cero/);
	});
	it('rejects impossible schedules', () => {
		expect(() =>
			buildImportedEvent(
				post('picantearla-2026-09'),
				{ title: 'X', date: '2026-10-16', startTime: '' },
				{ today: TODAY }
			)
		).toThrow(/Hora inválida/);
		expect(() =>
			buildImportedEvent(
				post('picantearla-2026-09'),
				{ title: '', date: '2026-10-16', startTime: '20:00' },
				{ today: TODAY }
			)
		).toThrow(/título/);
	});
});

describe('imported drafts follow the event tag rules', () => {
	const template = readFileSync(TEMPLATE, 'utf8');
	const choice = { title: 'Algo nuevo', date: '2026-10-10', startTime: '20:00', endTime: '22:00' };
	it('an online row makes the place Online', () => {
		const src = readFileSync(
			new URL('../posts/calendario/taller-ecofetichismo-2026-09-cordoba.md', import.meta.url),
			'utf8'
		);
		const { content, notes } = buildImportedEvent(
			src,
			{ ...choice, place: 'Zoom' },
			{ today: '2026-09-29' }
		);
		const tags = parseDocument(splitMarkdown(content).frontmatter).toJS().tags;
		expect(tags).toContain('Online');
		expect(tags).not.toContain('Córdoba');
		expect(notes.join(' ')).toMatch(/etiquetas de idioma\/lugar/);
	});
	it('a draft from the template keeps a valid language and place', () => {
		const { content } = buildImportedEvent(template, choice, {
			today: '2026-09-29',
			fromTemplate: true
		});
		const tags = parseDocument(splitMarkdown(content).frontmatter).toJS().tags;
		expect(validateEventTags(tags)).toEqual([]);
	});
});

describe('a repeated event without times takes the original ones', () => {
	const row = (/** @type {Record<string, string>} */ o = {}) => ({
		name: 'Picantearla',
		startTime: '',
		endTime: '',
		timeText: '',
		endText: '',
		off: '',
		...o
	});
	const source = { start: '2026-09-18T21:00-03:00', end: '2026-09-19T03:00-03:00' };

	it('reads the times of an event', () => {
		expect(eventTimes(source)).toEqual({ startTime: '21:00', endTime: '03:00' });
		expect(eventTimes({ start: '2026-09-18T21:00-03:00' })).toEqual({
			startTime: '21:00',
			endTime: ''
		});
		expect(eventTimes(null)).toEqual({ startTime: '', endTime: '' });
	});

	it('from the event it duplicates (same start and end, on the new day)', () => {
		expect(inheritedTimes(row(), { source })).toEqual({
			startTime: '21:00',
			endTime: '03:00',
			from: 'source'
		});
	});

	it('an earlier row of the paste with the same name wins over the old edition', () => {
		const earlier = [
			{ name: 'Taller de Bondage', startTime: '15:00', endTime: '18:00' },
			{ name: 'PICANTEARLA', startTime: '22:00', endTime: '04:00' }
		];
		expect(inheritedTimes(row(), { source, earlier })).toEqual({
			startTime: '22:00',
			endTime: '04:00',
			from: 'row'
		});
		// An earlier row without times doesn't count.
		expect(
			inheritedTimes(row(), {
				source,
				earlier: [{ name: 'Picantearla', startTime: '', endTime: '' }]
			})
		).toMatchObject({ from: 'source' });
	});

	it('nothing to inherit: own times, "a definir", off, or no original with times', () => {
		expect(inheritedTimes(row({ startTime: '20:00', timeText: '20 hs' }), { source })).toBeNull();
		expect(inheritedTimes(row({ timeText: 'a definir' }), { source })).toBeNull();
		expect(inheritedTimes(row({ off: 'pospuesto' }), { source })).toBeNull();
		expect(inheritedTimes(row(), { source: null })).toBeNull();
		expect(inheritedTimes(row(), { source: { start: '2026-09-18' } })).toBeNull();
	});

	it('with fake rows from the spreadsheet: the second day of the same event', () => {
		const text = [
			HEADER_2026,
			'OCTUBRE 2026',
			'FALSE\tKinkyVibe\tPicantearla\tviernes 16\t21\t03\tAgrelo 3399\t$8000',
			'FALSE\tKinkyVibe\tPicantearla\tsábado 31\t\t\tAgrelo 3399\t$8000'
		].join('\n');
		const { rows } = parseSheet(text, { today: TODAY });
		expect(rows[1].startTime).toBe('');
		expect(inheritedTimes(rows[1], { earlier: rows.slice(0, 1) })).toEqual({
			startTime: '21:00',
			endTime: '03:00',
			from: 'row'
		});
	});
});

describe('General price without cupo', () => {
	it('reads one plain General price', () => {
		expect(parseGeneralPrice('$8000')).toBe(8000);
		expect(parseGeneralPrice('$ 8.000')).toBe(8000);
		expect(parseGeneralPrice('General $8.000')).toBe(8000);
		expect(parseGeneralPrice('General: 12,000')).toBe(12000);
		expect(parseGeneralPrice('Entrada general 5000 pesos')).toBe(5000);
		expect(parseGeneralPrice('valor $ 3500')).toBe(3500);
	});

	it('anything else is not imported (loaded by hand in Entradas)', () => {
		for (const text of [
			'',
			'a definir',
			'gratis',
			'A la gorra',
			'$8000 / $6000 anticipada',
			'$5000 y $3000',
			'General $8000 (cupo 30)',
			'$8000 cupos limitados',
			'Socies $5000',
			'desde $5000',
			'$8000 + fondo',
			'8.000,50',
			'0',
			'$'
		]) {
			expect(parseGeneralPrice(text), text).toBeNull();
		}
	});

	it('builds the General ticket type: that price, no capacity', () => {
		expect(generalTickets(undefined, 8000)).toMatchObject({
			tickets: [{ id: 'general', name: 'General', price: 8000 }]
		});
		const copied = generalTickets(
			[{ id: 'general', name: 'General', price: 6000, capacity: 40, door_price: 7000 }],
			8000
		);
		expect(copied.tickets).toEqual([
			{ id: 'general', name: 'General', price: 8000, door_price: 7000 }
		]);
		expect(copied.note).toMatch(/sin cupo \(antes tenía 40\)/);
		const other = generalTickets(
			[
				{ id: 'general', name: 'General', price: 6000 },
				{ id: 'vip', name: 'VIP', price: 9000 }
			],
			8000
		);
		expect(other.tickets).toBeNull();
		expect(other.note).toMatch(/otras entradas/);
		expect(
			generalTickets([{ id: 'general', name: 'General', a_la_gorra: { minimo: 0 } }], 8000).tickets
		).toBeNull();
	});

	it('buildImportedEvent writes it into the new event (valid for the ticket editor)', () => {
		const choice = {
			title: 'Taller de Bondage',
			date: '2026-10-17',
			startTime: '15:00',
			endTime: '18:00',
			price: 'General $8.000'
		};
		const { content, notes } = buildImportedEvent(post('taller-bondage-2026-03'), choice, {
			today: TODAY
		});
		const m = meta(content);
		expect(meta(post('taller-bondage-2026-03')).tickets).toBeUndefined();
		expect(m.tickets).toEqual([{ id: 'general', name: 'General', price: 8000 }]);
		const form = readTicketsForm(m);
		expect(form.types[0]).toMatchObject({ name: 'General', price: '8000', capacity: '' });
		expect(validateTicketsForm(form).errors).toEqual([]);
		expect(m.title).toBe('Taller de Bondage');
		// Only the tickets change: same body and everything else as without a price.
		const plain = buildImportedEvent(
			post('taller-bondage-2026-03'),
			{ ...choice, price: '' },
			{
				today: TODAY
			}
		);
		expect(splitMarkdown(content).body).toBe(splitMarkdown(plain.content).body);
		const rest = { ...m };
		delete rest.tickets;
		expect(rest).toEqual(meta(plain.content));
		expect(notes.join(' ')).toMatch(/entrada General a \$8\.000, sin cupo/);

		// From scratch too.
		const fresh = buildImportedEvent(
			NEW_EVENT_TEMPLATE,
			{ ...choice, price: '$5000' },
			{
				today: TODAY,
				fromTemplate: true
			}
		);
		expect(meta(fresh.content).tickets).toEqual([{ id: 'general', name: 'General', price: 5000 }]);

		// A price that isn't a plain General: no tickets, no note.
		const none = buildImportedEvent(
			post('taller-bondage-2026-03'),
			{ ...choice, price: 'a la gorra' },
			{
				today: TODAY
			}
		);
		expect(meta(none.content).tickets).toBeUndefined();
		expect(none.notes.join(' ')).not.toMatch(/General/);
	});
});

describe('cleanLink (Link Inscripción)', () => {
	it('acepta web, forms.gle suelto, mailto: y un mail suelto (→ mailto:)', () => {
		expect(cleanLink('https://forms.gle/abc')).toBe('https://forms.gle/abc');
		expect(cleanLink('forms.gle/abc')).toBe('https://forms.gle/abc');
		expect(cleanLink('mailto:hola@ejemplo.test')).toBe('mailto:hola@ejemplo.test');
		expect(cleanLink('Escribinos a hola@ejemplo.test')).toBe('mailto:hola@ejemplo.test');
	});

	it('normalizeLink: un mail escrito a mano en la revisión pasa a mailto:', () => {
		expect(normalizeLink(' hola@ejemplo.test ')).toBe('mailto:hola@ejemplo.test');
		expect(normalizeLink('https://forms.gle/abc')).toBe('https://forms.gle/abc');
		expect(normalizeLink('tel:+5491100000000')).toBe('tel:+5491100000000');
		expect(normalizeLink('escribinos a hola@ejemplo.test')).toBe('escribinos a hola@ejemplo.test');
	});

	it('acepta tel: y una página del sitio (la celda es solo la dirección)', () => {
		expect(cleanLink('tel:+5491100000000')).toBe('tel:+5491100000000');
		expect(cleanLink('Llamanos: tel:+54-11-0000-0000')).toBe('tel:+54-11-0000-0000');
		expect(cleanLink('/calendario/fiesta-inventada')).toBe('/calendario/fiesta-inventada');
		expect(cleanLink('//otro-sitio.test/x')).toBe('');
		expect(cleanLink('/calendario/a b')).toBe('');
	});

	it('nunca javascript: ni otros esquemas; texto suelto, vacío', () => {
		expect(cleanLink('javascript:alert(1)')).toBe('');
		expect(cleanLink('data:text/html,x')).toBe('');
		expect(cleanLink('mailto:')).toBe('');
		expect(cleanLink('pendiente')).toBe('');
		expect(cleanLink('')).toBe('');
	});

	it('una fila con un mail de inscripción lo usa como mailto: y sin aviso', () => {
		const text = [
			HEADER_2026,
			'2026',
			'OCTUBRE\tOCTUBRE\tOCTUBRE',
			'FALSE\t\tTaller Inventado\tsábado 17\t15 a 18 hs\t\t\t\t\tmailto:hola@ejemplo.test',
			'FALSE\t\tCharla Inventada\tdomingo 18\t15 a 18 hs\t\t\t\t\tjavascript:alert(1)'
		].join('\n');
		const { rows } = parseSheet(text, { today: TODAY });
		expect(rows[0]).toMatchObject({ link: 'mailto:hola@ejemplo.test', warnings: [] });
		expect(rows[1].link).toBe('');
		expect(rows[1].warnings[0]).toMatch(/no parece una dirección web ni un mail/);
	});
});
