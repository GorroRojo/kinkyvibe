import { describe, it, expect } from 'vitest';
import { estimateReadingTime } from './readingTime';

const words = (/** @type {number} */ n) => Array.from({ length: n }, () => 'palabra').join(' ');

describe('estimateReadingTime', () => {
	it('cuenta ~200 palabras por minuto', () => {
		expect(estimateReadingTime(words(200))).toBe(1);
		expect(estimateReadingTime(words(500))).toBe(3); // 2.5 -> 3
		expect(estimateReadingTime(words(1000))).toBe(5);
	});

	it('devuelve al menos 1 minuto', () => {
		expect(estimateReadingTime('hola mundo')).toBe(1);
		expect(estimateReadingTime('')).toBe(1);
		expect(estimateReadingTime(undefined)).toBe(1);
	});

	it('ignora el frontmatter YAML', () => {
		const md = `---\ntitle: Algo\ntags: [a, b, c]\nsummary: ${words(50)}\n---\n\n${words(400)}`;
		expect(estimateReadingTime(md)).toBe(2); // 400/200, sin contar el frontmatter
	});

	it('ignora <script>, código e imágenes', () => {
		const md = [
			'<script>',
			"  import Algo from './Algo.svelte';",
			'</' + 'script>',
			'',
			'```js',
			'const x = ' + words(300),
			'```',
			'',
			'![un poster muy largo con mucho texto alt](/media/1.png)',
			'',
			words(200)
		].join('\n');
		expect(estimateReadingTime(md)).toBe(1); // solo cuentan las 200 palabras del cuerpo
	});

	it('respeta un wpm custom', () => {
		expect(estimateReadingTime(words(300), 150)).toBe(2);
	});
});
