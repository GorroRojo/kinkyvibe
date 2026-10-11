/**
 * El formulario de perfiles avisa antes de salir con cambios sin guardar (UnsavedChanges): el
 * diálogo «Tenés cambios sin guardar» está en la página, con el texto del borrador local.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import ProfileEditorForm from './ProfileEditorForm.svelte';
import { emptyFormValues } from '$lib/server/amigues/editor.js';
import { draftKey, leaveDialogText } from '$lib/admin/draft.js';

describe('ProfileEditorForm: aviso de cambios sin guardar', () => {
	it('con borrador: el diálogo dice que los cambios quedan en este navegador', () => {
		const { body } = render(ProfileEditorForm, {
			props: { values: emptyFormValues(), draftKey: draftKey('perfil', 'nuevo') }
		});
		expect(body).toContain('id="kv-unsaved-title"');
		expect(body).toContain(leaveDialogText(true).body);
		expect(body).toContain('Seguir editando');
	});

	it('sin draftKey igual avisa, sin prometer recuperar nada', () => {
		const { body } = render(ProfileEditorForm, { props: { values: emptyFormValues() } });
		expect(body).toContain('id="kv-unsaved-title"');
		expect(body).toContain(leaveDialogText(false).body);
	});
});
