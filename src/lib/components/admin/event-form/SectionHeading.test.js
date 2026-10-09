/**
 * El título de cada sección del formulario sale de la misma entrada que su lugar en el índice
 * (`SECTION_LABELS` y `formSections` de `$lib/admin/eventForm.js`, `SECTION_ICONS`): ícono de
 * Lucide y nombre, sin emoji (docs/estilo.md: los emoji quedan para el contenido y las etiquetas).
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import SectionHeading from './SectionHeading.svelte';
import { SECTION_ICONS } from './sectionIcons.js';
import { SECTION_LABELS, formSections } from '$lib/admin/eventForm.js';

const KEYS = /** @type {Array<keyof typeof SECTION_LABELS>} */ (Object.keys(SECTION_LABELS));

describe('SectionHeading', () => {
	it('cada sección tiene nombre e ícono', () => {
		expect(Object.keys(SECTION_ICONS).sort()).toEqual([...KEYS].sort());
	});

	it.each(KEYS)('«%s»: un <legend> con el ícono de Lucide y el nombre del índice', (key) => {
		const { body } = render(SectionHeading, { props: { section: key } });
		const m = body.match(/<legend class="section-heading[^"]*"[^>]*>([\s\S]*?)<\/legend>/);
		expect(m, body).toBeTruthy();
		expect(m?.[1]).toMatch(/<svg[^>]*aria-hidden="true"/);
		expect(m?.[1].replace(/<[^>]*>/g, '').trim()).toBe(SECTION_LABELS[key]);
		expect(body).not.toMatch(/\p{Extended_Pictographic}/u);
	});

	it('como <h2> con id (la sección «Partes» es una <section>)', () => {
		const { body } = render(SectionHeading, {
			props: { section: 'partes', as: 'h2', id: 'partes-title' }
		});
		expect(body).toMatch(/<h2 class="section-heading[^"]*" id="partes-title"/);
		expect(body).toContain('Partes');
	});

	it('el índice usa los mismos nombres (formSections)', () => {
		const all = [
			...formSections({ mode: 'nuevo' }),
			...formSections({ mode: 'contenido', hasPersonas: true }),
			...formSections({ mode: 'editar', hasImage: true, hasPersonas: true, hasPartes: true })
		];
		for (const s of all) expect(s.label, s.id).toBe(SECTION_LABELS[s.icon]);
	});
});
