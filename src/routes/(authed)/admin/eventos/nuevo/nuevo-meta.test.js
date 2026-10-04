/**
 * Cargar una edición nueva de una serie con meta de venta por defecto: el formulario arranca con
 * esa meta (copiada; la meta que traía el original no manda), y lo dice. Datos inventados.
 */
import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { readable } from 'svelte/store';

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

/** @param {Record<string, string>} seriesGoals */
function renderNew(seriesGoals) {
	return render(NewEvent, {
		props: {
			data: /** @type {any} */ ({
				tagUsage: {},
				profiles: [],
				authorUsage: {},
				maxImageBytes: 5 * 1024 * 1024,
				source: { slug: 'encuentro-inventado-3', raw: SOURCE, title: 'Encuentro Inventado 3' },
				seriesPrompt: null,
				seriesGoals,
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

describe('nueva edición de una serie con meta por defecto', () => {
	it('arranca con la meta de la serie (no la copiada del original) y avisa de dónde viene', () => {
		const body = renderNew({ 'Serie Inventada': 'plata:300000' });
		expect(goalValue(body)).toBe('300000');
		expect(body).toContain('Es la meta por defecto de la serie «Serie Inventada»');
	});

	it('sin meta en la serie, queda la del original', () => {
		const body = renderNew({});
		expect(goalValue(body)).toBe('10');
		expect(body).not.toContain('Es la meta por defecto de la serie');
	});
});
