import { describe, expect, it } from 'vitest';
import { addVideoExtras, hasVideo, isSubtitlesPath, transcriptHtml } from './videoExtras.js';

const VTT = `/media/file/${'a'.repeat(64)}.vtt`;
const MP4 = `/media/file/${'b'.repeat(64)}.mp4`;
const HTML = `<p>Antes</p><video src="${MP4}" controls></video><p>Después</p>`;
const TRACK = `<track kind="subtitles" src="${VTT}" srclang="es" label="Español" default>`;
/** @param {string} inner */
const details = (inner) =>
	`<details class="kv-transcripcion"><summary>Ver transcripción</summary><div class="kv-transcripcion-texto">${inner}</div></details>`;

describe('addVideoExtras', () => {
	it('pone los subtítulos en el video y la transcripción debajo', () => {
		const out = addVideoExtras(HTML, { transcript: 'Hola.\n\nSegundo párrafo', subtitles: VTT });
		expect(out).toBe(
			`<p>Antes</p><video src="${MP4}" controls>${TRACK}</video>` +
				details('<p>Hola.</p><p>Segundo párrafo</p>') +
				'<p>Después</p>'
		);
	});

	it('la transcripción se escapa: nunca es HTML', () => {
		const out = addVideoExtras(HTML, { transcript: '<script>alert(1)</script> & "x"' });
		expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;');
		expect(out).not.toContain('<script>');
	});

	it('unos subtítulos que no son un .vtt de la biblioteca no van', () => {
		const out = addVideoExtras(HTML, { subtitles: 'https://otro.sitio/x.vtt" onerror="x' });
		expect(out).toBe(HTML);
	});

	it('sin nada, el mismo HTML', () => {
		expect(addVideoExtras(HTML, {})).toBe(HTML);
		expect(addVideoExtras(HTML, { transcript: '   ' })).toBe(HTML);
	});

	it('sin <video>, la transcripción va al final (y los subtítulos no tienen dónde ir)', () => {
		const html = `<p><a href="${MP4}">El video</a></p>`;
		const out = addVideoExtras(html, { transcript: 'Texto', subtitles: VTT });
		expect(out).toBe(html + details('<p>Texto</p>'));
	});

	it('saltea un video comentado', () => {
		const html = `<!-- <video src="x"></video> --><video src="${MP4}"></video>`;
		const out = addVideoExtras(html, { subtitles: VTT });
		expect(out).toBe(`<!-- <video src="x"></video> --><video src="${MP4}">${TRACK}</video>`);
	});
});

describe('transcriptHtml', () => {
	it('párrafos y saltos de línea', () => {
		expect(transcriptHtml('uno\r\ndos\n\n\ntres')).toBe('<p>uno<br>dos</p><p>tres</p>');
	});
});

describe('hasVideo / isSubtitlesPath', () => {
	it('reconoce un <video> o un enlace a un video de la biblioteca', () => {
		expect(hasVideo('<video src={video} controls/>')).toBe(true);
		expect(hasVideo(`[Video](${MP4})`)).toBe(true);
		expect(hasVideo('Un videojuego')).toBe(false);
		expect(hasVideo(undefined)).toBe(false);
	});

	it('solo un .vtt de la biblioteca', () => {
		expect(isSubtitlesPath(VTT)).toBe(true);
		expect(isSubtitlesPath(` ${VTT} `)).toBe(true);
		expect(isSubtitlesPath(MP4)).toBe(false);
		expect(isSubtitlesPath('https://kinkyvibe.ar' + VTT)).toBe(false);
	});
});
