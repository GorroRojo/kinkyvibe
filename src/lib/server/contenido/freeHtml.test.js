/**
 * El HTML libre (./freeHtml.js) se arma como lo armaba mdsvex. Cuando se sacó mdsvex (decisión
 * 0032), 48 de los 571 textos viejos se veían distinto; cada caso de abajo es una de esas causas,
 * con un texto inventado. Lo esperado es lo que daba mdsvex con el mismo texto (sin el índice vacío
 * ni los íconos de las anclas).
 */
import { describe, expect, it } from 'vitest';
import { renderFreeBody, smartypants } from './freeHtml.js';

/** @param {string} md */
async function html(md) {
	const out = (await renderFreeBody(md)).html;
	return out
		.replace(/<svg[\s\S]*?<\/svg>/g, '')
		.replace('<nav class="toc"><ol class="toc-level toc-level-1"></ol></nav>', '')
		.replace(/\n/g, '');
}

describe('el HTML escrito a mano queda como está (en mdsvex era un nodo `raw`)', () => {
	it('un bloque de HTML: sin comillas tipográficas, menciones, wiki, anclas ni nofollow', async () => {
		const out = await html(
			'<small>"Nota" de @alguien en [[bondage]], <a href="https://ejemplo.org">link</a></small>\n\n' +
				'<h3>Título a mano</h3>\n\n' +
				'Texto con <small>"suelto" de @otre</small>.'
		);
		expect(out).toBe(
			'<small>"Nota" de @alguien en [[bondage]], <a href="https://ejemplo.org">link</a></small>' +
				'<h3>Título a mano</h3>' +
				// Entre etiquetas sueltas, en un párrafo, el texto sí es markdown.
				'<p>Texto con <small>“suelto” de <a class="mention" href="/amigues/otre">@otre</a></small>.</p>'
		);
	});

	it('una línea que empieza con una etiqueta corta el párrafo, también en una cita', async () => {
		expect(
			await html(
				'Una imagen:\n<small>Epígrafe "inventado"</small>\n\n> <small>"Cita" chica</small>'
			)
		).toBe(
			'<p>Una imagen:</p><small>Epígrafe "inventado"</small><blockquote><small>"Cita" chica</small></blockquote>'
		);
	});

	it('`<video … />` se cierra como en Svelte (no se traga lo que sigue)', async () => {
		expect(
			await html('<div class="col">\n<video src="/x.mp4" controls/>\n<p>Al lado.</p>\n</div>')
		).toBe('<div class="col"><video src="/x.mp4" controls></video><p>Al lado.</p></div>');
	});

	it('una etiqueta sin cerrar se cierra adentro del texto', async () => {
		expect(await html('<div class="caja">\n\nTexto adentro')).toBe(
			'<div class="caja"><p>Texto adentro</p></div>'
		);
	});
});

describe('el énfasis con `*` como lo leía remark', () => {
	it('pegado a una palabra y con un espacio después (`Dom* … Sub*`)', async () => {
		expect(await html('Para cada Dom* que llega: ¿Qué tipo de Sub* hay?')).toBe(
			'<p>Para cada Dom<em> que llega: ¿Qué tipo de Sub</em> hay?</p>'
		);
	});

	it('`** @alguien **` (espacios adentro) es negrita, con la mención', async () => {
		expect(await html('Lo armó ** @Fulane **, con ganas.')).toBe(
			'<p>Lo armó <strong> <a class="mention" href="/amigues/Fulane">@Fulane</a> </strong>, con ganas.</p>'
		);
	});

	it('`***así***` es negrita por fuera; lo demás, como siempre', async () => {
		expect(await html('Sentir ***todo ya***. Pero a * b queda y *esto* también.')).toBe(
			'<p>Sentir <strong><em>todo ya</em></strong>. Pero a <em> b queda y </em>esto* también.</p>'
		);
		expect(await html('Un *énfasis* y **negrita** normales; `a * b*` en código.')).toBe(
			'<p>Un <em>énfasis</em> y <strong>negrita</strong> normales; <code>a * b*</code> en código.</p>'
		);
	});
});

describe('las comillas, como retext-smartypants (por oración)', () => {
	it('una comilla seguida de un signo cierra; los casos raros quedan como en mdsvex', async () => {
		expect(
			await html(
				'Dijo "*sí*", y después "*no*". Contesta "¡Rojo!". Algo ""raro"". Plata, comida, etc.". Una ---- raya.'
			)
		).toBe(
			'<p>Dijo ”<em>sí</em>”, y después ”<em>no</em>”. Contesta “¡Rojo!“. Algo ""raro"". Plata, comida, etc.”. Una ---- raya.</p>'
		);
	});

	it('lo de siempre sigue igual', () => {
		expect(smartypants(`"hola" y 'chau', it's -- ... --- . . .`)).toBe(
			'“hola” y ‘chau’, it’s – … — …'
		);
	});
});

describe('código y listas', () => {
	it('en el código en línea las entidades valen; en un bloque de código, no', async () => {
		expect(await html('Usá `uno&nbsp;dos <tres>` así.\n\n```sh\nuno&nbsp;dos\n```')).toBe(
			'<p>Usá <code>uno dos &#x3C;tres></code> así.</p>' +
				'<pre class="language-sh"><code class="language-sh">uno&#x26;nbsp;dos</code></pre>'
		);
	});

	it('otra viñeta es otra lista; un ítem vacío toma la línea siguiente', async () => {
		expect(
			await html('Lista:\n- uno\n- dos\n\n+ otra lista\n\nY otra:\n- tres\n- \n(4) cuatro')
		).toBe(
			'<p>Lista:</p><ul><li>uno</li><li>dos</li></ul><ul><li>otra lista</li></ul>' +
				'<p>Y otra:</p><ul><li>tres</li><li>(4) cuatro</li></ul>'
		);
	});
});
