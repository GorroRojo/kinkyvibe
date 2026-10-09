/**
 * El índice «En esta página» del editor: íconos de Lucide (no emoji, ver docs/estilo.md) y la
 * sección actual marcada con aria-current.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import SectionIndex from './SectionIndex.svelte';
import { formSections } from '$lib/admin/eventForm.js';

const EMOJI = /\p{Extended_Pictographic}/u;

/** Todas las secciones que puede tener el formulario, sin repetir. */
const ALL = [
	...formSections({ mode: 'nuevo' }),
	...formSections({ mode: 'contenido', hasPersonas: true }),
	...formSections({ mode: 'editar', hasImage: true, hasPersonas: true, hasPartes: true })
].filter((s, i, list) => list.findIndex((o) => o.id === s.id) === i);

/** @param {string} body */
const links = (body) => [...body.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)].map((m) => m[0]);

describe('SectionIndex', () => {
	const sections = formSections({ mode: 'editar', hasImage: true, hasPartes: true });
	const { body } = render(SectionIndex, { props: { sections } });

	it('cada sección lleva un ícono svg y su nombre, sin emoji', () => {
		const items = links(body);
		expect(items).toHaveLength(sections.length);
		sections.forEach((s, i) => {
			expect(items[i]).toContain(`href="#${s.id}"`);
			expect(items[i]).toMatch(/<svg\b[^>]*aria-hidden="true"/);
			expect(items[i]).toContain(s.label);
		});
		expect(body).not.toMatch(EMOJI);
	});

	it('marca con aria-current solo la sección actual (al cargar, la primera)', () => {
		const items = links(body);
		expect(items[0]).toContain('aria-current="true"');
		expect(items.slice(1).some((a) => a.includes('aria-current'))).toBe(false);
	});

	it('todas las secciones de formSections tienen su ícono de Lucide', () => {
		const items = links(render(SectionIndex, { props: { sections: ALL } }).body);
		expect(items).toHaveLength(ALL.length);
		for (const a of items) expect(a).toMatch(/<svg\b/);
		for (const s of ALL) expect(s.icon).not.toMatch(EMOJI);
	});
});
