import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import FeedLinks from './FeedLinks.svelte';

describe('FeedLinks', () => {
	it('anuncia el Atom y el JSON Feed de la página', () => {
		const { head } = render(FeedLinks, { props: { base: '/material', title: 'Material' } });
		expect(head).toContain('type="application/atom+xml"');
		expect(head).toContain('href="/material/feed.atom"');
		expect(head).toContain('href="/material/feed.json"');
		expect(head).not.toContain('text/calendar');
	});

	it('con `ics`, también el calendario para suscribirse', () => {
		const { head } = render(FeedLinks, {
			props: { base: '/calendario', title: 'Calendario', ics: '/calendario.ics' }
		});
		expect(head).toMatch(
			/<link rel="alternate" type="text\/calendar"[^>]*href="\/calendario\.ics"/
		);
	});
});
