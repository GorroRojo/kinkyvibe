/**
 * Frontmatter fields (pronouns, place names) are shown as text, never parsed as HTML: they come
 * from the CMS and the spreadsheet importer, not from code.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { pronounDisplay } from '$lib/utils/mentions.js';
import Card from './Card.svelte';
import Carrousel from './Carrousel.svelte';
import PostListItem from './PostListItem.svelte';

const EVIL = '<img src=x onerror=alert(1)>';

describe('pronounDisplay', () => {
	it('puts non-breaking spaces around each "/"', () => {
		expect(pronounDisplay('https://pronombr.es/elle&ella')).toBe('elle\u00a0/\u00a0ella');
		expect(pronounDisplay('https://pronombr.es/él')).toBe('él');
	});

	it('shows nothing for "evitar" or a missing pronoun', () => {
		expect(pronounDisplay('https://pronombr.es/evitar')).toBeUndefined();
		expect(pronounDisplay(undefined)).toBeUndefined();
	});
});

describe('components render frontmatter as text', () => {
	it('Card: pronouns', () => {
		const { body } = render(Card, {
			props: {
				post: {
					path: '/amigues/x',
					meta: {
						tags: [],
						featured: '',
						category: 'amigues',
						title: 'Perfil',
						pronoun: `https://pronombr.es/elle&${EVIL}`
					}
				}
			}
		});
		expect(body).not.toContain('<img src=x');
		expect(body).toContain('&lt;img src=x onerror=alert(1)>');
		expect(body).toContain('elle\u00a0/\u00a0');
	});

	it('PostListItem: pronouns', () => {
		const { body } = render(PostListItem, {
			props: {
				post: {
					path: '/amigues/x',
					meta: {
						tags: [],
						category: 'amigues',
						layout: 'amigues',
						title: 'Perfil',
						pronoun: `https://pronombr.es/${EVIL}`
					}
				}
			}
		});
		expect(body).not.toContain('<img src=x');
		expect(body).toContain('&lt;img src=x onerror=alert(1)>');
	});

	it('Carrousel: place name', () => {
		const { body } = render(Carrousel, {
			props: {
				posts: /** @type {any[]} */ ([
					{
						path: '/calendario/x',
						meta: {
							title: 'Evento',
							start: '2099-12-01T20:00-03:00',
							location_name: `Casa ${EVIL}`,
							summary: 'Resumen',
							featured: '/x.webp',
							tags: []
						}
					}
				])
			}
		});
		expect(body).not.toContain('<img src=x');
		expect(body).toContain('Casa &lt;img');
	});

	it('Carrousel: online o el lugar con la regla de la página (eventPlace.js)', () => {
		/** @param {Record<string, unknown>} meta */
		const heading = (meta) => {
			const { body } = render(Carrousel, {
				props: {
					posts: /** @type {any[]} */ ([
						{
							path: '/calendario/x',
							meta: { title: 'Evento', start: '2099-12-01T20:00-03:00', summary: 'R', ...meta }
						}
					])
				}
			});
			// La línea de la fecha y el lugar (`.when`), sin etiquetas ni los comentarios de Svelte
			// (`<!---->`), cortando por `<` (sin regex sobre HTML).
			return (body.match(/<p class="when[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '')
				.split('<')
				.map((s, i) => (i ? s.slice(s.indexOf('>') + 1) : s))
				.join('')
				.trim();
		};
		expect(heading({ tags: ['Online'] })).toMatch(/ · Online$/);
		expect(heading({ modalidad: 'online', tags: [] })).toMatch(/ · Online$/);
		// Solo la dirección (antes: «Online», porque no tenía nombre).
		expect(heading({ location: 'Calle Falsa 123', tags: [] })).toMatch(/ · Calle Falsa 123$/);
		// Sin nada: solo la fecha (antes: «- Online»).
		const bare = heading({ tags: ['AMBA'] });
		expect(bare).not.toContain('Online');
		// (la fecha ya trae su « · » antes de la hora: termina en la hora, sin lugar)
		expect(bare).toMatch(/ · 20:00$/);
	});
});
