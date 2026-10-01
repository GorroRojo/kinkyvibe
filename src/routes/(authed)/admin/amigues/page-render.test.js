/**
 * El link a "Importar y clasificar" tiene que estar con el interruptor «perfiles_publicos»
 * apagado (la importación está pensada para revisar antes de prenderlo) y también prendido.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import Page from './+page.svelte';

const IMPORT_LINK = /<a[^>]*href="\/admin\/amigues\/importar"[^>]*>Importar y clasificar<\/a>/;

describe('/admin/amigues', () => {
	it('con el interruptor apagado (editor .md) muestra el link para importar y la pista', () => {
		const { body } = render(Page, {
			props: { data: { editor: 'md', rows: [] }, form: null }
		});
		expect(body).toMatch(IMPORT_LINK);
		expect(body).toContain('antes de prender «perfiles_publicos»');
		expect(body).toContain('href="/admin/amigues/nuevo"');
	});

	it('con el interruptor prendido (editor de la base) sigue mostrando el link', () => {
		const { body } = render(Page, {
			props: {
				data: { editor: 'db', profiles: [], q: '', kind: '', kinds: [], notImported: 0 },
				form: null
			}
		});
		expect(body).toMatch(IMPORT_LINK);
		expect(body).toContain('href="/admin/amigues/nuevo"');
	});
});
