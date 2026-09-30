/**
 * Códigos QR en JS puro (qrcode-generator), así funcionan en Cloudflare Workers.
 */
import qrcode from 'qrcode-generator';

/** @param {string} text */
function make(text) {
	const qr = qrcode(0, 'M');
	qr.addData(text);
	qr.make();
	return qr;
}

/**
 * SVG escalable (para mostrar en la página de la entrada).
 *
 * @param {string} text
 */
export function qrSvg(text) {
	return make(text).createSvgTag({ cellSize: 8, margin: 4, scalable: true });
}

/**
 * GIF (para el email: Gmail y otros no muestran SVG).
 *
 * @param {string} text
 * @returns {Uint8Array}
 */
export function qrGif(text) {
	const dataUrl = make(text).createDataURL(8, 4);
	const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
	return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
