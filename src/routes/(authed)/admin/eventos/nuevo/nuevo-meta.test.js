/**
 * Duplicar un evento copia su meta de venta como cualquier otro campo: el formulario arranca con
 * la meta del original y el archivo nuevo la lleva (también al duplicar desde la agenda o la
 * planilla, sin formulario). Datos inventados.
 */
import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { readable } from 'svelte/store';
import { parseDocument } from 'yaml';
import { buildEventMarkdown, formFromSource, splitMarkdown } from '$lib/utils/eventDraft.js';
import { applyTicketsToMarkdown, readTicketsForm } from '$lib/utils/ticketsEditor.js';
import { buildImportedEvent } from '$lib/utils/sheetImport.js';

vi.mock('$app/stores', () => ({
	page: readable({ url: new URL('http://localhost/admin/eventos/nuevo') })
}));

const { default: NewEvent } = await import('./+page.svelte');

const SOURCE = `---
title: Encuentro Inventado 3
category: calendario
layout: calendario
status: abierto
start: 2031-03-10T20:00-03:00
tags:
  - español
  - AMBA
  - Serie Inventada
tickets:
  - id: general
    name: General
    price: 10000
meta_venta: entradas:10
---

Texto.
`;

/** @param {string} raw */
const frontmatterOf = (raw) => parseDocument(splitMarkdown(raw).frontmatter).toJS() ?? {};

function renderDuplicate() {
	return render(NewEvent, {
		props: {
			data: /** @type {any} */ ({
				tagUsage: {},
				profiles: [],
				authorUsage: {},
				maxImageBytes: 5 * 1024 * 1024,
				source: { slug: 'encuentro-inventado-3', raw: SOURCE, title: 'Encuentro Inventado 3' },
				seriesPrompt: null,
				template: SOURCE,
				today: '2031-03-20',
				prefill: { date: '', startTime: '', endTime: '' },
				duplicables: [],
				takenSlugs: [],
				mock: false
			}),
			form: null
		}
	}).body;
}

/** @param {string} body */
const goalValue = (body) => /id="ev-goal-value"[^>]*value="([^"]*)"/.exec(body)?.[1] ?? null;

describe('duplicar un evento con meta de venta', () => {
	it('el formulario arranca con la meta del evento original', () => {
		const body = renderDuplicate();
		expect(body).toMatch(/<option value="entradas"[^>]*selected/);
		expect(goalValue(body)).toBe('10');
	});

	it('el archivo nuevo lleva la misma meta (como lo arma el formulario, sin tocarla)', () => {
		const form = { ...formFromSource(SOURCE, { today: '2031-03-20' }), startDate: '2031-04-14' };
		const md = buildEventMarkdown(SOURCE, form);
		const initial = readTicketsForm(frontmatterOf(SOURCE));
		const out = applyTicketsToMarkdown(md, readTicketsForm(frontmatterOf(SOURCE)), initial);
		expect(frontmatterOf(out).meta_venta).toBe('entradas:10');
		expect(frontmatterOf(out).start).toMatch(/^2031-04-14/);
	});

	it('cambiarla en el formulario cambia solo la del evento nuevo', () => {
		const md = buildEventMarkdown(SOURCE, formFromSource(SOURCE, { today: '2031-03-20' }));
		const initial = readTicketsForm(frontmatterOf(SOURCE));
		const edited = { ...initial, goalKind: /** @type {const} */ ('plata'), goalValue: '300000' };
		expect(frontmatterOf(applyTicketsToMarkdown(md, edited, initial)).meta_venta).toBe(
			'plata:300000'
		);
		expect(frontmatterOf(SOURCE).meta_venta).toBe('entradas:10');
	});

	it('duplicar desde la agenda o la planilla (sin formulario) también la copia', () => {
		const built = buildImportedEvent(
			SOURCE,
			{ title: 'Encuentro Inventado 4', date: '2031-05-12', startTime: '20:00' },
			{ today: '2031-03-20' }
		);
		expect(frontmatterOf(built.content).meta_venta).toBe('entradas:10');
	});
});
