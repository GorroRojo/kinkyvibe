// @vitest-environment jsdom
/**
 * «Texto» del formulario en el navegador: CodeMirror se baja recién al montar la sección
 * (`import()`); mientras tanto se ve el texto con «Cargando el editor…», y después el editor
 * anda (muestra el texto y se puede escribir). Texto inventado.
 */
import { afterEach, describe, expect, it } from 'vitest';
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

	it('CodeMirror no se importa de entrada (solo con import() al montar)', () => {
		const src = readFileSync('src/lib/components/admin/event-form/BodySection.svelte', 'utf8');
		expect(src).not.toMatch(
			/^\s*import\s[^;]*from\s+['"](svelte-codemirror-editor|@codemirror\/[^'"]+|codemirror)['"]/m
		);
		expect(src).toMatch(/import\(['"]svelte-codemirror-editor['"]\)/);
	});
});
