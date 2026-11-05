/**
 * El editor de markdown de la sección «Texto» (BodySection), armado directo con CodeMirror 6.
 * BodySection lo baja con `import()` recién al montarse (CodeMirror pesa ~150 KB comprimido).
 *
 * Antes se usaba `svelte-codemirror-editor`, que con cada cambio del texto que venía de afuera
 * (recuperar un borrador) reemplazaba todo el estado del editor (`setState`: se perdía el scroll,
 * la posición y el deshacer, y se medía todo de nuevo) y le avisaba al formulario 300 ms después
 * de cada tecla. Acá:
 * - lo que se escribe llega al formulario en la misma transacción (`onChange`);
 * - un texto que viene de afuera entra como un cambio chico (`syncDoc`), y solo si es distinto
 *   del que ya tiene el editor: el eco de lo que el editor mismo mandó no vuelve a entrar;
 * - si CodeMirror tira errores seguidos (`exceptionSink`), `onFail` le avisa a BodySection, que
 *   lo cambia por un campo de texto común con el mismo texto.
 */
import { EditorState } from '@codemirror/state';
import {
	EditorView,
	crosshairCursor,
	drawSelection,
	dropCursor,
	highlightActiveLine,
	highlightActiveLineGutter,
	highlightSpecialChars,
	keymap,
	lineNumbers,
	rectangularSelection
} from '@codemirror/view';
import {
	defaultKeymap,
	history,
	historyKeymap,
	indentWithTab,
	isolateHistory
} from '@codemirror/commands';
import {
	bracketMatching,
	defaultHighlightStyle,
	foldGutter,
	foldKeymap,
	indentOnInput,
	indentUnit,
	syntaxHighlighting
} from '@codemirror/language';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import {
	autocompletion,
	closeBrackets,
	closeBracketsKeymap,
	completionKeymap
} from '@codemirror/autocomplete';
import { markdown } from '@codemirror/lang-markdown';
import { docChange } from './markdownEditorSync.js';

/** Errores de CodeMirror que se toleran antes de pasar al campo de texto común. */
const MAX_ERRORS = 5;
/** …dentro de esta ventana (ms). */
const ERROR_WINDOW = 10_000;

/**
 * @param {HTMLElement} parent
 * @param {{
 *   doc: string,
 *   onChange: (text: string) => void,
 *   onFail?: (error: unknown) => void,
 *   label?: string
 * }} opts
 */
export function createMarkdownEditor(parent, { doc, onChange, onFail, label = 'Texto' }) {
	/** @type {number[]} */
	let errors = [];
	let failed = false;
	const view = new EditorView({
		parent,
		state: EditorState.create({
			doc,
			extensions: [
				lineNumbers(),
				highlightActiveLineGutter(),
				highlightSpecialChars(),
				history(),
				foldGutter(),
				drawSelection(),
				dropCursor(),
				EditorState.allowMultipleSelections.of(true),
				indentOnInput(),
				indentUnit.of('    '),
				EditorState.tabSize.of(4),
				syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
				bracketMatching(),
				closeBrackets(),
				autocompletion(),
				rectangularSelection(),
				crosshairCursor(),
				highlightActiveLine(),
				highlightSelectionMatches(),
				keymap.of([
					...closeBracketsKeymap,
					...defaultKeymap,
					...searchKeymap,
					...historyKeymap,
					...foldKeymap,
					...completionKeymap,
					indentWithTab
				]),
				markdown(),
				EditorView.lineWrapping,
				EditorView.contentAttributes.of({ 'aria-label': label }),
				EditorView.updateListener.of((update) => {
					if (update.docChanged) onChange(update.state.doc.toString());
				}),
				EditorView.exceptionSink.of((e) => {
					console.error('[editor] error de CodeMirror:', e);
					const now = Date.now();
					errors = [...errors.filter((t) => now - t < ERROR_WINDOW), now];
					if (errors.length >= MAX_ERRORS && !failed) {
						failed = true;
						// Fuera del ciclo de CodeMirror: puede estar a mitad de una medición.
						queueMicrotask(() => onFail?.(e));
					}
				})
			]
		})
	});
	return view;
}

/**
 * Pone `value` en el editor si es distinto de lo que tiene: un solo cambio, del tramo que
 * difiere (no reemplaza el estado: el scroll, la selección y el deshacer quedan). Es un paso
 * propio del deshacer: no se junta con lo que se venía escribiendo.
 * @param {EditorView} view
 * @param {string} value
 * @returns {boolean} si hubo que cambiar algo
 */
export function syncDoc(view, value) {
	const change = docChange(view.state.doc.toString(), value);
	if (!change) return false;
	view.dispatch({ changes: change, annotations: isolateHistory.of('full') });
	return true;
}
