import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import LoQueEnlaza from './LoQueEnlaza.svelte';

const LINKS = [
	{ type: 'etiqueta', title: 'Bondage', path: '/wiki/bondage' },
	{
		type: 'evento',
		title: 'Un taller de prueba',
		path: '/calendario/taller-prueba',
		date: '4 may 2024'
	},
	{ type: 'material', title: 'Un texto de prueba', path: '/material/texto-prueba' },
	{ type: 'perfil', title: 'Persona Ficticia', path: '/amigues/persona-ficticia' }
];

describe('LoQueEnlaza', () => {
	it('sin links (o con el interruptor apagado) no dibuja nada', () => {
		expect(render(LoQueEnlaza, { props: { links: null } }).body).not.toContain('lo-que-enlaza');
		expect(render(LoQueEnlaza, { props: { links: [] } }).body).not.toContain('lo-que-enlaza');
	});

	it('es un <details> cerrado de entrada, con el título y cuántas son en el <summary>', () => {
		const { body } = render(LoQueEnlaza, { props: { links: LINKS } });
		expect(body).toMatch(/<details\b/);
		expect(body).not.toMatch(/<details[^>]*\bopen\b/);
		const summary = body.match(/<summary[^>]*>([\s\S]*?)<\/summary>/)?.[1] ?? '';
		expect(summary).toContain('Lo que enlaza acá');
		expect(summary).toMatch(/>4<span class="sr[^"]*"> páginas<\/span>/);
		expect(summary).toContain('id="lo-que-enlaza-titulo"');
		expect(body).toMatch(/<section[^>]*aria-labelledby="lo-que-enlaza-titulo"/);
	});

	it('con una sola, dice «página»', () => {
		const { body } = render(LoQueEnlaza, { props: { links: LINKS.slice(0, 1) } });
		expect(body).toMatch(/>1<span class="sr[^"]*"> página<\/span>/);
	});

	it('cada link es una pastilla con el color de su tipo, el tipo para lectores y la fecha', () => {
		const { body } = render(LoQueEnlaza, { props: { links: LINKS } });
		for (const l of LINKS) expect(body).toContain(`href="${l.path}"`);
		for (const t of ['evento', 'material', 'perfil', 'etiqueta'])
			expect(body).toMatch(new RegExp(`class="chip t-${t}[ "]`));
		expect(body).toMatch(/<span class="sr[^"]*">Evento:<\/span>/);
		expect(body).toMatch(/<span class="sr[^"]*">Amigues:<\/span>/);
		expect(body).toContain('4 may 2024');
		expect(body).toContain('title="Kinkipedia"');
	});

	it('los íconos y la flecha son decorativos', () => {
		const { body } = render(LoQueEnlaza, { props: { links: LINKS } });
		const svgs = body.match(/<svg\b[^>]*>/g) ?? [];
		expect(svgs.length).toBe(LINKS.length + 2);
		for (const s of svgs) expect(s).toContain('aria-hidden="true"');
	});
});
