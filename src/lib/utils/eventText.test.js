import { describe, expect, it } from 'vitest';
import { argDateTimeLong, startsAfter } from './dates.js';
import { eventLead } from './eventText.js';
import { eventDescription } from './seo.js';
import { feedEntry } from './feeds.js';

const START = '2026-10-02T15:00:00-03:00';

describe('eventLead: cómo se presenta un evento en una línea', () => {
	it('«Cancelado», la fecha y lo que siga, con « · »', () => {
		const when = argDateTimeLong(START);
		expect(eventLead({ start: START })).toBe(when);
		expect(eventLead({ start: START, status: 'cancelado' }, { rest: ['Galpón', 'Una jam'] })).toBe(
			`Cancelado · ${when} · Galpón · Una jam`
		);
		expect(eventLead({ start: START }, { capitalized: true })).toBe(
			when.charAt(0).toUpperCase() + when.slice(1)
		);
		expect(eventLead({}, { rest: ['', 'Solo el resumen'] })).toBe('Solo el resumen');
		expect(eventLead(null)).toBe('');
	});

	// Lo mismo que armaban la vista previa y el feed cada uno por su lado antes de juntarlo.
	/** @param {Record<string, any>} meta */
	const beforeSeo = (meta) => {
		const cap = (/** @type {string} */ s) => s.charAt(0).toUpperCase() + s.slice(1);
		const when = meta?.start ? cap(argDateTimeLong(meta.start)) : '';
		const head = [meta?.status === 'cancelado' ? 'Cancelado' : '', when]
			.filter(Boolean)
			.join(' · ');
		const summary = String(meta?.summary ?? '')
			.split(/\s+/)
			.filter(Boolean)
			.join(' ');
		return [head, summary].filter(Boolean).join(' · ');
	};
	/** @param {Record<string, any>} meta */
	const beforeFeed = (meta) => {
		const summary = typeof meta.summary === 'string' ? meta.summary.trim() : '';
		const prefix = [meta.status === 'cancelado' ? 'Cancelado' : '', argDateTimeLong(meta.start)]
			.filter(Boolean)
			.join(' · ');
		return [prefix, summary].filter(Boolean).join(' · ');
	};
	const metas = [
		{ start: START, summary: 'Una jam  para practicar' },
		{ start: START, status: 'cancelado', summary: 'Se suspende' },
		{ start: START, status: 'cancelado' },
		{ start: START },
		{ start: 'no es una fecha', summary: 'Sin fecha que se pueda leer' },
		{ summary: 'Sin fecha' }
	];

	it('la vista previa al compartir dice lo mismo que antes', () => {
		for (const meta of metas)
			expect(eventDescription(meta, null), JSON.stringify(meta)).toBe(beforeSeo(meta));
	});

	it('el feed dice lo mismo que antes', () => {
		for (const meta of metas) {
			const post = /** @type {any} */ ({
				path: '/calendario/x',
				meta: { ...meta, category: 'calendario', title: 'X' }
			});
			expect(feedEntry(post).summary, JSON.stringify(meta)).toBe(beforeFeed(meta));
		}
	});
});

describe('startsAfter: «próximo»', () => {
	const now = Date.parse('2026-10-01T12:00:00Z');
	it('empieza después de ahora', () => {
		expect(startsAfter('2026-10-01T12:00:01Z', now)).toBe(true);
		expect(startsAfter('2026-10-01T12:00:00Z', now)).toBe(false);
		expect(startsAfter('2026-09-30T12:00:00Z', now)).toBe(false);
		expect(startsAfter(now + 1, now)).toBe(true);
		expect(startsAfter(new Date(now + 1), now)).toBe(true);
	});
	it('sin fecha o con una que no se puede leer, no es próximo', () => {
		expect(startsAfter(undefined, now)).toBe(false);
		expect(startsAfter('', now)).toBe(false);
		expect(startsAfter('mañana', now)).toBe(false);
	});
	it('es lo mismo que `new Date(start).getTime() > now` (lo que estaba copiado en cada lugar)', () => {
		for (const s of ['2027-01-01', '2020-01-01T00:00:00Z', 'x', '', 0, now, now + 5]) {
			expect(startsAfter(/** @type {any} */ (s), now)).toBe(
				new Date(/** @type {any} */ (s)).getTime() > now
			);
		}
	});
});
