import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDocument } from 'yaml';
import {
	buildEventMarkdown,
	formFromSource,
	readEventFields,
	splitMarkdown
} from '$lib/utils/eventDraft.js';
import { postFields, toInput } from './postFields.js';
import {
	endDateFollowingStart,
	scheduleFromInputs,
	scheduleProblems,
	scheduleSpan,
	scheduleSummary,
	scheduleToInputs
} from './schedule.js';

const DIR = 'src/lib/posts/calendario';
// Los que tienen las propiedades mal escritas se editan como texto (sin esta sección).
const events = readdirSync(DIR)
	.filter((f) => f.endsWith('.md') && !f.startsWith('_'))
	.map((f) => ({ file: f, raw: readFileSync(join(DIR, f), 'utf8') }))
	.filter(({ raw }) => {
		try {
			return parseDocument(splitMarkdown(raw).frontmatter).errors.length === 0;
		} catch {
			return false;
		}
	});

/** @param {string} key */
const field = (key) => {
	const f = postFields('calendario').find((x) => x.key === key);
	if (!f) throw new Error(key);
	return f;
};

/** Lo que Editar pone en los inputs de un evento. @param {string} raw */
const editInputs = (raw) => {
	const meta = parseDocument(splitMarkdown(raw).frontmatter).toJS() ?? {};
	return {
		start: /** @type {string} */ (toInput(field('start'), meta.start)),
		end: /** @type {string} */ (toInput(field('end'), meta.end))
	};
};

describe('ida y vuelta con los eventos reales', () => {
	it('hay eventos para probar (y alguno termina al día siguiente)', () => {
		expect(events.length).toBeGreaterThan(100);
		const afterMidnight = events.filter(({ raw }) => {
			const { start, end } = editInputs(raw);
			return end && end.slice(0, 10) > start.slice(0, 10);
		});
		expect(afterMidnight.length).toBeGreaterThan(0);
	});

	it('Editar: sin tocar nada, la sección devuelve los mismos inputs (no se reescribe nada)', () => {
		for (const { file, raw } of events) {
			const inputs = editInputs(raw);
			expect(scheduleToInputs(scheduleFromInputs(inputs.start, inputs.end)), file).toEqual(inputs);
		}
	});

	it('Crear: con las fechas del original, se guardan el mismo start y end', () => {
		for (const { file, raw } of events) {
			const values = formFromSource(raw, { today: '2026-10-02' });
			const fields = readEventFields(splitMarkdown(raw).frontmatter);
			const summary = scheduleSummary(values);
			if (!summary.start || summary.error) continue;
			const built = readEventFields(
				splitMarkdown(buildEventMarkdown(raw, { ...values, featuredMode: 'keep' })).frontmatter
			);
			expect(built.start, file).toBe(summary.start);
			expect(built.end, file).toBe(summary.end);
			// Lo que el archivo ya tenía con el formato del sitio queda igual.
			if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}-03:00$/.test(fields.start))
				expect(summary.start, file).toBe(fields.start);
			if (values.hasEnd && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}-03:00$/.test(fields.end))
				expect(summary.end, file).toBe(fields.end);
		}
	});
});

describe('scheduleFromInputs / scheduleToInputs', () => {
	it('un evento que termina después de medianoche', () => {
		const s = scheduleFromInputs('2026-12-19T22:00', '2026-12-20T03:00');
		expect(s).toEqual({
			startDate: '2026-12-19',
			startTime: '22:00',
			hasEnd: true,
			endDate: '2026-12-20',
			endTime: '03:00'
		});
		expect(scheduleToInputs(s)).toEqual({ start: '2026-12-19T22:00', end: '2026-12-20T03:00' });
		expect(scheduleSummary(s)).toEqual({
			start: '2026-12-19T22:00-03:00',
			end: '2026-12-20T03:00-03:00',
			error: null,
			text: 'sábado 19 de diciembre de 2026, de 22:00 a 03:00 (del domingo 20 de diciembre de 2026)'
		});
	});
	it('sin fin: «Tiene hora de finalización» apagado, con una hora propuesta por si se prende', () => {
		const s = scheduleFromInputs('2026-12-19T21:00', '');
		expect(s.hasEnd).toBe(false);
		expect(s.endTime).toBe('23:00');
		expect(scheduleToInputs(s)).toEqual({ start: '2026-12-19T21:00', end: '' });
	});
	it('sin inicio queda vacío', () => {
		expect(scheduleToInputs(scheduleFromInputs('', ''))).toEqual({ start: '', end: '' });
	});
	it('apagar el fin lo saca; vaciar la hora deja el input vacío', () => {
		const s = scheduleFromInputs('2026-12-19T21:00', '2026-12-19T23:00');
		expect(scheduleToInputs({ ...s, hasEnd: false }).end).toBe('');
		expect(scheduleToInputs({ ...s, startTime: '' }).start).toBe('');
	});
	it('un valor raro del archivo que nadie tocó vuelve igual', () => {
		expect(scheduleToInputs(scheduleFromInputs('2026-02-30T21:00', '')).start).toBe(
			'2026-02-30T21:00'
		);
	});
});

describe('scheduleProblems', () => {
	const ok = scheduleFromInputs('2026-12-19T22:00', '2026-12-20T03:00');
	it('nada si está completo', () => {
		expect(scheduleProblems(ok)).toEqual([]);
	});
	it('lo que falta, con los mismos textos que al crear', () => {
		expect(scheduleProblems({ ...ok, startDate: '' })).toEqual(['Falta la fecha de inicio.']);
		expect(scheduleProblems({ ...ok, startTime: '' })).toEqual(['Falta la hora de inicio.']);
		expect(scheduleProblems({ ...ok, endDate: '' })).toEqual(['Falta la fecha de fin.']);
		expect(scheduleProblems({ ...ok, endTime: '' })).toEqual(['Falta la hora de fin.']);
	});
	it('termina antes de empezar (el mismo día a las 03:00)', () => {
		expect(scheduleProblems({ ...ok, endDate: '2026-12-19' })).toEqual([
			'El evento tiene que terminar después de empezar.'
		]);
	});
});

describe('scheduleSpan / endDateFollowingStart', () => {
	const s = scheduleFromInputs('2026-12-19T22:00', '2026-12-20T03:00');
	it('la duración en días', () => {
		expect(scheduleSpan(s)).toBe(1);
		expect(scheduleSpan({ ...s, endDate: '' })).toBe(0);
		expect(scheduleSpan({ ...s, endDate: '2026-12-01' })).toBe(0);
	});
	it('«21:00 a 01:00» el mismo día: el día siguiente solo si se pide (duplicar)', () => {
		const typo = { ...s, endDate: '2026-12-19', startTime: '21:00', endTime: '01:00' };
		expect(scheduleSpan(typo)).toBe(0);
		expect(scheduleSpan(typo, { fixSameDayTypo: true })).toBe(1);
	});
	it('el fin sigue al inicio con la misma duración', () => {
		expect(endDateFollowingStart({ ...s, startDate: '2026-12-31' }, 1)).toBe('2027-01-01');
		expect(endDateFollowingStart({ ...s, startDate: '' }, 1)).toBe('2026-12-20');
	});
});
