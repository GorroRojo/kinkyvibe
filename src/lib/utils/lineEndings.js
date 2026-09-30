/**
 * Line endings of a post file. Browsers send textarea contents with CRLF, so a post saved from
 * the panel would turn every line of an LF file into a change. The editors send the line ending of
 * the file they loaded (`eol`) and the server writes the content back with it.
 */

/**
 * @param {string} text
 * @returns {'crlf'|'lf'}
 */
export function lineEndingOf(text) {
	return text.includes('\r\n') ? 'crlf' : 'lf';
}

/**
 * @param {string} text
 * @param {unknown} eol `'crlf'` keeps CRLF; anything else (a missing field too) means LF
 * @returns {string}
 */
export function withLineEnding(text, eol) {
	const lf = text.replace(/\r\n?/g, '\n');
	return eol === 'crlf' ? lf.replace(/\n/g, '\r\n') : lf;
}
