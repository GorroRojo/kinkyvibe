/**
 * Lo que no depende de CodeMirror en la sincronización entre el texto del formulario y el
 * editor (markdownEditor.js, BodySection): se prueba sin navegador.
 */

/**
 * El cambio mínimo que lleva `from` a `to`: el tramo del medio que difiere (sin el principio y el
 * final que tienen en común), o `null` si son iguales. No corta un par sustituto (emojis).
 * @param {string} from
 * @param {string} to
 * @returns {{ from: number, to: number, insert: string } | null}
 */
export function docChange(from, to) {
	if (from === to) return null;
	const max = Math.min(from.length, to.length);
	let start = 0;
	while (start < max && from.charCodeAt(start) === to.charCodeAt(start)) start++;
	// No empezar en la segunda mitad de un par sustituto.
	if (start > 0 && isLowSurrogate(from.charCodeAt(start))) start--;
	let endFrom = from.length;
	let endTo = to.length;
	while (
		endFrom > start &&
		endTo > start &&
		from.charCodeAt(endFrom - 1) === to.charCodeAt(endTo - 1)
	) {
		endFrom--;
		endTo--;
	}
	// Ni terminar entre las dos mitades de un par.
	if (endFrom < from.length && isLowSurrogate(from.charCodeAt(endFrom))) {
		endFrom++;
		endTo++;
	}
	return { from: start, to: endFrom, insert: to.slice(start, endTo) };
}

/** @param {number} code */
function isLowSurrogate(code) {
	return code >= 0xdc00 && code <= 0xdfff;
}

/**
 * El guardián del eco entre el `value` del formulario y el editor: recuerda el último texto que
 * se sabe que tienen los dos. El editor avisa lo que se escribe con `fromEditor` (y eso no vuelve
 * a entrar); un `value` nuevo de afuera pasa por `incoming`, que dice si hay que ponerlo en el
 * editor (solo si cambió desde lo último que se vio, en cualquiera de los dos sentidos).
 * @param {string} initial
 */
export function valueGuard(initial) {
	let known = initial;
	return {
		/** @param {string} text lo que quedó en el editor */
		fromEditor(text) {
			known = text;
		},
		/** @param {string} value el `value` actual del formulario @returns {boolean} */
		incoming(value) {
			if (value === known) return false;
			known = value;
			return true;
		}
	};
}
