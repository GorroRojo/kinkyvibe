/**
 * «X min de lectura» (idea de JorgeT10, PR #46): la página de un material lo recibe de
 * `siteContent`, calculado del texto guardado en la base; un texto corto y los eventos no.
 * D1 de miniflare; datos inventados.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { seedPosts } from './testing.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
});
afterAll(async () => {
	await t?.dispose();
});
beforeEach(async () => {
	await resetDB(t.db);
});
afterEach(() => {
	vi.resetModules();
});

/** @param {number} n */
const words = (n) => Array.from({ length: n }, (_, i) => `palabra${i}`).join(' ');

const MATERIAL = {
	category: 'material',
	title: 'Guía Inventada de Prueba',
	summary: 'Una guía que no existe',
	published_date: '2030-03-01Z-03:00',
	authors: ['Persona Inventada'],
	tags: ['bondage']
};

async function posts() {
	vi.resetModules();
	const repo = await import('./repo.js');
	repo.setContentDB(t.db);
	return import('./posts.js');
}

describe('tiempo de lectura en la base', () => {
	it('un material largo trae sus minutos (HTML y código no cuentan)', async () => {
		await seedPosts(t.db, [
			{
				meta: { ...MATERIAL, postID: 'guia-larga-inventada' },
				// 450 palabras de texto + un bloque de código que no se lee.
				body: `## Qué es\n\n<p>${words(448)}</p>\n\n\`\`\`\n${words(500)}\n\`\`\`\n`
			},
			{ meta: { ...MATERIAL, postID: 'guia-corta-inventada' }, body: 'Solo un link.' }
		]);
		const m = await posts();
		const long = await m.siteContent(t.platform, 'material', 'guia-larga-inventada');
		expect(long?.readingMinutes).toBe(3);
		// Las palabras viajan para recalcular con la velocidad de cada persona (450, sin el código).
		expect(long?.readingWords).toBe(450);
		expect(long?.html).toContain('palabra0');
		const short = await m.siteContent(t.platform, 'material', 'guia-corta-inventada');
		expect(short?.readingMinutes).toBe(0);
		expect(short?.readingWords).toBe(0);
	});

	it('los eventos no lo traen', async () => {
		await seedPosts(t.db, [
			{
				meta: {
					category: 'calendario',
					postID: 'taller-inventado-2031-06',
					title: 'Taller Inventado',
					start: '2031-06-10T20:00-03:00'
				},
				body: words(900)
			}
		]);
		const m = await posts();
		const event = await m.siteEvent(t.platform, 'taller-inventado-2031-06');
		expect(event).not.toBeNull();
		expect(event?.readingMinutes).toBeUndefined();
		expect(event?.readingWords).toBeUndefined();
	});
});
