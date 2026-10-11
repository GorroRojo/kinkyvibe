/**
 * Tiempo de lectura (idea de JorgeT10, PR #46): palabras del texto guardado en la base, a unas
 * 200 por minuto, redondeado para arriba. Textos inventados.
 */
import { describe, expect, it } from 'vitest';
import {
	MIN_WORDS_TO_SHOW,
	WORDS_PER_MINUTE,
	countWords,
	pageReadingMinutes,
	readingMinutes,
	readingTimeLabel
} from './readingTime.js';

/** @param {number} n */
const words = (n) => Array.from({ length: n }, (_, i) => `palabra${i}`).join(' ');

describe('countWords', () => {
	it('cuenta las palabras de un texto en castellano (tildes, ñ, signos)', () => {
		expect(countWords('¿Querés saber qué es el bondage? ¡Seguí leyendo, compañere!')).toBe(9);
		expect(countWords('Les organizadores — todes — llegan… a las 20 h.')).toBe(8);
	});

	it('saca las etiquetas HTML y decodifica las entidades', () => {
		const html =
			'<h2 id="que-es">Qué&nbsp;es</h2><p>Un <strong>texto</strong> de&#160;prueba &amp; algo más.</p>';
		// «Qué es Un texto de prueba algo más»: «&» suelto no es una palabra.
		expect(countWords(html)).toBe(8);
		expect(countWords('<p><br></p><!-- un comentario largo que no se lee --><p>&nbsp;</p>')).toBe(
			0
		);
	});

	it('no cuenta <style>, <script> ni los interactivos', () => {
		const html =
			'<style>.a { color: red; }</style><script>let x = 1;</script><kv-donde-golpear-un-cuerpo></kv-donde-golpear-un-cuerpo>Dos palabras';
		expect(countWords(html)).toBe(2);
	});

	it('no cuenta los bloques de código (con cercas o <pre>)', () => {
		const md = [
			'Antes del código.',
			'',
			'```js',
			'const muchas = "palabras que no se leen de corrido";',
			'```',
			'',
			'~~~',
			'otro bloque más',
			'~~~',
			'',
			'<pre><code>y uno en HTML</code></pre>',
			'Después del código.'
		].join('\n');
		expect(countWords(md)).toBe(6);
		// Una cerca sin cerrar llega hasta el final.
		expect(countWords('Hola.\n\n```\nsin cerrar nunca')).toBe(1);
	});

	it('no cuenta las imágenes ni las URLs, sí el texto de los links', () => {
		const md =
			'![una descripción larga de la foto](./media/x/1.webp) <img src="/a.webp" alt="otra foto"> Mirá [esta guía de nudos](https://ejemplo.invalid/guia) o https://ejemplo.invalid/suelta';
		expect(countWords(md)).toBe(6);
	});

	it('vacío o sin texto: 0', () => {
		expect(countWords('')).toBe(0);
		expect(countWords('   \n  ')).toBe(0);
		expect(countWords(undefined)).toBe(0);
		expect(countWords(null)).toBe(0);
		expect(countWords(42)).toBe(0);
	});
});

describe('readingMinutes', () => {
	it('a unas 200 palabras por minuto, redondeado para arriba', () => {
		expect(WORDS_PER_MINUTE).toBe(200);
		expect(readingMinutes(words(200))).toBe(1);
		expect(readingMinutes(words(201))).toBe(2);
		expect(readingMinutes(words(1000))).toBe(5);
		expect(readingMinutes(`<p>${words(450)}</p>`)).toBe(3);
	});

	it('mínimo 1 minuto si hay algo para leer; 0 si no hay texto', () => {
		expect(readingMinutes('Una palabra')).toBe(1);
		expect(readingMinutes('')).toBe(0);
		expect(readingMinutes('<img src="/a.webp">')).toBe(0);
	});

	it('otra velocidad, y una inválida vuelve a 200', () => {
		expect(readingMinutes(words(300), 100)).toBe(3);
		expect(readingMinutes(words(300), 0)).toBe(2);
		expect(readingMinutes(words(300), NaN)).toBe(2);
	});
});

describe('pageReadingMinutes', () => {
	it('un texto corto no muestra nada (0)', () => {
		expect(MIN_WORDS_TO_SHOW).toBe(100);
		expect(pageReadingMinutes(words(MIN_WORDS_TO_SHOW - 1))).toBe(0);
		expect(pageReadingMinutes('')).toBe(0);
	});

	it('desde el mínimo, los minutos de siempre', () => {
		expect(pageReadingMinutes(words(MIN_WORDS_TO_SHOW))).toBe(1);
		expect(pageReadingMinutes(words(650))).toBe(4);
	});
});

describe('readingTimeLabel', () => {
	it('«X min de lectura», o nada', () => {
		expect(readingTimeLabel(1)).toBe('1 min de lectura');
		expect(readingTimeLabel(12)).toBe('12 min de lectura');
		expect(readingTimeLabel(0)).toBe('');
		expect(readingTimeLabel(undefined)).toBe('');
		expect(readingTimeLabel('x')).toBe('');
	});
});
