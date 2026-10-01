/**
 * Comunidad › Perfiles (/admin/comunidad/perfiles). El link a "Importar y clasificar" tiene que estar con el
 * interruptor «perfiles_publicos» apagado (la importación está pensada para revisar antes de
 * prenderlo) y también prendido, igual que "Nuevo perfil". Con el interruptor apagado está además
 * la pestaña «Fichas .md» (la lista de los .md de siempre).
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import Page from './+page.svelte';

const IMPORT_LINK = /<a[^>]*href="\/admin\/amigues\/importar"[^>]*>Importar y clasificar<\/a>/;
const FICHAS_TAB = /<a[^>]*href="\/admin\/amigues\?vista=fichas"[^>]*>(?:<!--[^>]*-->)*Fichas \.md/;
const HINT = /antes de\s+prender «perfiles_publicos»/;

/** Lo que devuelve el load con la base. @param {boolean} flagOn */
const dbData = (flagOn) => ({
	editor: 'db',
	flagOn,
	dbAvailable: true,
	filters: { q: '', kind: '', origin: '', state: '', view: '' },
	profiles: [],
	counts: { total: 0, toReview: 0, toApprove: 0, hidden: 0, deleted: 0 },
	claims: [],
	notImported: 0
});

describe('/admin/comunidad/perfiles (Perfiles)', () => {
	it('sin base (solo las fichas .md) muestra el link para importar y la pista', () => {
		const { body } = render(Page, {
			props: { data: { editor: 'md', rows: [], flagOn: false, hasDb: false }, form: null }
		});
		expect(body).toMatch(IMPORT_LINK);
		expect(body).toMatch(HINT);
		expect(body).toContain('href="/admin/comunidad/perfiles/nuevo"');
		expect(body).toContain('Perfiles');
	});

	it('con el interruptor apagado: la lista de la base, el link para importar y «Fichas .md»', () => {
		const { body } = render(Page, { props: { data: dbData(false), form: null } });
		expect(body).toMatch(/<h1[^>]*>\s*Perfiles\s*<\/h1>/);
		expect(body).toMatch(IMPORT_LINK);
		expect(body).toContain('href="/admin/comunidad/perfiles/nuevo"');
		expect(body).toMatch(HINT);
		expect(body).toMatch(FICHAS_TAB);
		expect(body).toContain('href="/admin/comunidad/perfiles?estado=para-aprobar"');
		expect(body).toContain('href="/admin/comunidad/perfiles?vista=pedidos"');
		expect(body).toContain('name="origen"');
		expect(body).toContain('name="estado"');
		expect(body).toContain('name="tipo"');
	});

	it('con el interruptor prendido sigue el link para importar, sin «Fichas .md»', () => {
		const { body } = render(Page, { props: { data: dbData(true), form: null } });
		expect(body).toMatch(IMPORT_LINK);
		expect(body).toContain('href="/admin/comunidad/perfiles/nuevo"');
		expect(body).not.toMatch(FICHAS_TAB);
	});

	it('«Fichas .md» (interruptor apagado, con base): la lista de .md con las pestañas', () => {
		const { body } = render(Page, {
			props: { data: { editor: 'md', rows: [], flagOn: false, hasDb: true }, form: null }
		});
		expect(body).toMatch(IMPORT_LINK);
		expect(body).toMatch(FICHAS_TAB);
		expect(body).toContain('href="/admin/comunidad/perfiles/nuevo"');
	});
});
