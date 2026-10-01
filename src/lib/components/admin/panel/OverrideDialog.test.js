/**
 * Pasar un límite se confirma solo con el botón: sin casilla "Entiendo…" (decisión de gorrite).
 * El aviso y la explicación siguen; el control real es del servidor (requireAdmin + clave).
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import OverrideDialog from './OverrideDialog.svelte';

describe('OverrideDialog', () => {
	const { body } = render(OverrideDialog, { props: { confirmLabel: 'Sí, vender igual' } });

	it('no pide tildar una casilla', () => {
		expect(body).not.toContain('type="checkbox"');
		expect(body).not.toContain('Entiendo');
	});

	it('el botón que confirma no arranca deshabilitado', () => {
		const confirm = body.match(/<button[^>]*>Sí, vender igual<\/button>/);
		expect(confirm).not.toBeNull();
		expect(confirm?.[0]).not.toContain('disabled');
	});

	it('sigue explicando que queda anotado y se puede cancelar', () => {
		expect(body).toContain('registro de actividad');
		expect(body).toContain('Cancelar');
	});
});
