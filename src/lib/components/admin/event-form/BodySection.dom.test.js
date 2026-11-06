// @vitest-environment jsdom
/**
 * «Texto» del formulario en el navegador: CodeMirror se baja recién al montar la sección
 * (`import()`); mientras tanto se ve el texto con «Cargando el editor…», y después el editor
 * anda (muestra el texto y se puede escribir). Lo que se escribe llega al `value` enseguida, y
 * un `value` nuevo de afuera (recuperar un borrador) entra como un cambio, sin rearmar el editor
 * ni rebotar. Texto inventado.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { cleanup, render, waitFor } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';

// jsdom no mide nada: lo mínimo que CodeMirror le pide al DOM.
const rect = { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON() {} };
const rects = Object.assign([], { item: () => null });
Range.prototype.getBoundingClientRect ??= () => /** @type {DOMRect} */ (rect);
Range.prototype.getClientRects ??= () => /** @type {any} */ (rects);
document.elementFromPoint ??= () => null;

const { default: BodySection } = await import('./BodySection.svelte');

afterEach(() => cleanup());

describe('BodySection: CodeMirror a pedido', () => {
	it('primero el texto con «Cargando el editor…»; después el editor, con el texto, y anda', async () => {
		const { container, queryByText } = render(BodySection, {
			props: { value: '## Título inventado\n\nTexto de prueba.', id: 'ev-body' }
		});
		// antes de que llegue CodeMirror
		expect(queryByText('Cargando el editor…')).not.toBeNull();
		expect(container.querySelector('.editor-loading pre')?.textContent).toContain(
			'Título inventado'
		);
		// llega
		await waitFor(() => expect(container.querySelector('#ev-body .cm-editor')).not.toBeNull(), {
			timeout: 10_000
		});
		expect(queryByText('Cargando el editor…')).toBeNull();
		const content = /** @type {HTMLElement} */ (container.querySelector('.cm-content'));
		expect(content.textContent).toContain('## Título inventado');
		expect(content.getAttribute('contenteditable')).toBe('true');
		// escribir: el editor toma el cambio
		const { EditorView } = await import('@codemirror/view');
		const view = /** @type {import('@codemirror/view').EditorView} */ (
			EditorView.findFromDOM(/** @type {HTMLElement} */ (container.querySelector('.cm-editor')))
		);
		view.dispatch({ changes: { from: view.state.doc.length, insert: '\nOtra línea.' } });
		await waitFor(() => expect(content.textContent).toContain('Otra línea.'));
	}, 20_000);

	it('el `value` sigue al editor al toque, y uno de afuera entra sin rearmarlo ni rebotar', async () => {
		let value = '### 🕐 Parte 2 - Citas Rápidas\n\n> una cita inventada';
		let sets = 0;
		const props = {
			get value() {
				return value;
			},
			set value(v) {
				sets++;
				value = v;
			}
		};
		const { container, rerender } = render(BodySection, { props });
		await waitFor(() => expect(container.querySelector('.cm-editor')).not.toBeNull(), {
			timeout: 10_000
		});
		const { EditorView } = await import('@codemirror/view');
		const view = /** @type {import('@codemirror/view').EditorView} */ (
			EditorView.findFromDOM(/** @type {HTMLElement} */ (container.querySelector('.cm-editor')))
		);
		const setState = vi.spyOn(view, 'setState');
		const dispatch = vi.spyOn(view, 'dispatch');
		// Escribir: el value cambia en la misma transacción (antes, 300 ms después).
		view.dispatch({ changes: { from: view.state.doc.length, insert: '\nOtra línea.' } });
		expect(value).toBe('### 🕐 Parte 2 - Citas Rápidas\n\n> una cita inventada\nOtra línea.');
		await tick();
		// El eco (el mismo value que vuelve) no se vuelve a poner en el editor.
		await rerender({ value });
		await tick();
		expect(dispatch).toHaveBeenCalledTimes(1);
		// Un value nuevo de afuera: un cambio, en el mismo editor (sin setState: no se pierde el
		// deshacer ni el scroll).
		await rerender({ value: '### 🕐 Parte 2 - Citas Rápidas\n\nUn borrador recuperado.' });
		await waitFor(() => expect(view.state.doc.toString()).toContain('Un borrador recuperado.'));
		expect(setState).not.toHaveBeenCalled();
		expect(dispatch).toHaveBeenCalledTimes(2);
		expect(
			EditorView.findFromDOM(/** @type {HTMLElement} */ (container.querySelector('.cm-editor')))
		).toBe(view);
		// Se puede deshacer hasta lo que se había escrito.
		const { undo } = await import('@codemirror/commands');
		undo(view);
		expect(view.state.doc.toString()).toContain('Otra línea.');
		expect(sets).toBeGreaterThan(0);
	}, 20_000);

	it('si CodeMirror tira errores seguidos, queda un campo común con el mismo texto', async () => {
		const { container } = render(BodySection, {
			props: { value: '## Título inventado\n\n> una cita' }
		});
		await waitFor(() => expect(container.querySelector('.cm-editor')).not.toBeNull(), {
			timeout: 10_000
		});
		const { EditorView, logException } = await import('@codemirror/view');
		const view = /** @type {import('@codemirror/view').EditorView} */ (
			EditorView.findFromDOM(/** @type {HTMLElement} */ (container.querySelector('.cm-editor')))
		);
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		for (let i = 0; i < 5; i++) logException(view.state, new Error('falla inventada'));
		await waitFor(() => expect(container.querySelector('textarea.editor-fallback')).not.toBeNull());
		expect(container.querySelector('.cm-editor')).toBeNull();
		expect(
			/** @type {HTMLTextAreaElement} */ (container.querySelector('textarea.editor-fallback')).value
		).toBe('## Título inventado\n\n> una cita');
		error.mockRestore();
	}, 20_000);

	it('CodeMirror no se importa de entrada (solo con import() al montar)', () => {
		const src = readFileSync('src/lib/components/admin/event-form/BodySection.svelte', 'utf8');
		expect(src).not.toMatch(
			/^\s*import\s[^;]*from\s+['"](\.\/markdownEditor\.js|@codemirror\/[^'"]+|codemirror)['"]/m
		);
		expect(src).toMatch(/import\(['"]\.\/markdownEditor\.js['"]\)/);
	});
});
