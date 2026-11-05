import { describe, expect, it } from 'vitest';
import { ALT_MAX, cleanAlt, imagesWithoutAlt, setImageAlt, textImages } from './imageAlt.js';

const BODY = `<script>
  import foto1 from './media/Ejemplo/2.webp';
</script>

## Fotos de prueba

<img alt="" src={foto1} />

<img src="/media/img/aaa.webp" alt="Una soga roja sobre una mesa">

<!-- <img alt="" src="/media/img/oculta.webp"> -->

![](/media/img/bbb.webp)

<IMG SRC='/media/img/ccc.webp'>

\`\`\`
<img alt="" src="/media/img/codigo.webp">
\`\`\`
`;

describe('textImages', () => {
	it('encuentra las imágenes que se ven, en orden, con su src y su alt', () => {
		const found = textImages(BODY);
		expect(found.map((i) => [i.index, i.kind, i.src, i.alt, i.hasAlt])).toEqual([
			[0, 'html', '{foto1}', '', true],
			[1, 'html', '/media/img/aaa.webp', 'Una soga roja sobre una mesa', true],
			[2, 'md', '/media/img/bbb.webp', '', true],
			[3, 'html', '/media/img/ccc.webp', '', false]
		]);
	});

	it('sin texto, nada', () => {
		expect(textImages('')).toEqual([]);
		expect(textImages(undefined)).toEqual([]);
		expect(textImages('Solo texto, sin fotos.')).toEqual([]);
	});

	it('no confunde data-alt con alt', () => {
		expect(textImages('<img data-alt="x" src="/media/img/a.webp">')[0].hasAlt).toBe(false);
	});
});

describe('imagesWithoutAlt', () => {
	it('solo las que no tienen descripción', () => {
		expect(imagesWithoutAlt(BODY).map((i) => i.index)).toEqual([0, 2, 3]);
	});
});

describe('setImageAlt', () => {
	it('escribe el alt vacío de una etiqueta HTML y no toca nada más', () => {
		const out = setImageAlt(BODY, 0, 'Texto de prueba', { src: '{foto1}' });
		expect(out).toBe(
			BODY.replace('<img alt="" src={foto1} />', '<img alt="Texto de prueba" src={foto1} />')
		);
	});

	it('suma el atributo si la etiqueta no lo tiene', () => {
		const out = setImageAlt(BODY, 3, 'Otra prueba');
		expect(out).toContain(`<IMG alt="Otra prueba" SRC='/media/img/ccc.webp'>`);
	});

	it('en markdown, entre los corchetes (escapados)', () => {
		const out = setImageAlt(BODY, 2, 'Prueba [con] corchetes');
		expect(out).toContain('![Prueba \\[con\\] corchetes](/media/img/bbb.webp)');
		expect(textImages(out)[2].alt).toBe('Prueba [con] corchetes');
	});

	it('escapa comillas y < > en HTML, y la vuelve a leer igual', () => {
		const out = /** @type {string} */ (setImageAlt(BODY, 0, 'Dice "hola" <a> & chau'));
		expect(out).toContain('alt="Dice &quot;hola&quot; &lt;a&gt; &amp; chau"');
		expect(textImages(out)[0].alt).toBe('Dice "hola" <a> & chau');
	});

	it('no guarda si la imagen cambió, no está o la descripción está vacía', () => {
		expect(setImageAlt(BODY, 0, 'x', { src: '{foto2}' })).toBeNull();
		expect(setImageAlt(BODY, 9, 'x')).toBeNull();
		expect(setImageAlt(BODY, 0, '   ')).toBeNull();
	});
});

describe('cleanAlt', () => {
	it('una línea, sin espacios de más, con tope', () => {
		expect(cleanAlt('  dos\n líneas  ')).toBe('dos líneas');
		expect(cleanAlt('a'.repeat(ALT_MAX + 50))).toHaveLength(ALT_MAX);
	});
});
