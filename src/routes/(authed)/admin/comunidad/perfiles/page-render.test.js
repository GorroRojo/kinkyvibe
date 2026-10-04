/**
 * Comunidad › Perfiles (/admin/comunidad/perfiles). El link a "Importar y clasificar" tiene que
 * estar con base y sin base, igual que "Nuevo perfil". El interruptor «perfiles_publicos» quedó
 * prendido para siempre: los casos «apagado» (la pista «antes de prender» con base y la pestaña
 * «Fichas .md») se fueron con él.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import Page from './+page.svelte';

const IMPORT_LINK =
	/<a[^>]*href="\/admin\/comunidad\/perfiles\/importar"[^>]*>Importar y clasificar<\/a>/;
const FICHAS_TAB =
	/<a[^>]*href="\/admin\/comunidad\/perfiles\?vista=fichas"[^>]*>(?:<!--[^>]*-->)*Fichas \.md/;
const HINT = /prender «perfiles_publicos»/;

/** Lo que devuelve el load con la base. */
const dbData = () => ({
	editor: 'db',
	dbAvailable: true,
	filters: { q: '', kind: '', origin: '', state: '', view: '' },
	profiles: [],
	counts: { total: 0, toReview: 0, toApprove: 0, hidden: 0, deleted: 0 },
	claims: [],
	notImported: 0
});

describe('/admin/comunidad/perfiles (Perfiles)', () => {
	it('sin base (solo las fichas .md) muestra el link para importar', () => {
		const { body } = render(Page, {
			props: { data: { editor: 'md', rows: [] }, form: null }
		});
		expect(body).toMatch(IMPORT_LINK);
		expect(body).not.toMatch(HINT);
		expect(body).not.toMatch(FICHAS_TAB);
		expect(body).toContain('href="/admin/comunidad/perfiles/nuevo"');
		expect(body).toContain('Perfiles');
	});

	it('con base: la lista de la base, el link para importar, sin «Fichas .md» ni la pista', () => {
		const { body } = render(Page, { props: { data: dbData(), form: null } });
		expect(body).toMatch(/<h1[^>]*>\s*Perfiles\s*<\/h1>/);
		expect(body).toMatch(IMPORT_LINK);
		expect(body).toContain('href="/admin/comunidad/perfiles/nuevo"');
		expect(body).not.toMatch(HINT);
		expect(body).not.toMatch(FICHAS_TAB);
		expect(body).toContain('href="/admin/comunidad/perfiles?estado=para-aprobar"');
		expect(body).toContain('href="/admin/comunidad/perfiles?vista=pedidos"');
		expect(body).toContain('name="origen"');
		expect(body).toContain('name="estado"');
		expect(body).toContain('name="tipo"');
	});
});
