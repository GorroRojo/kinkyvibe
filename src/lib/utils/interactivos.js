/**
 * Componentes interactivos del contenido (decisión 0004: «los interactivos se hacen en código,
 * como componente registrado»). En la base, el texto de una publicación nombra un interactivo con
 * una etiqueta propia, sola, sin atributos ni contenido:
 *
 *     <kv-donde-golpear-un-cuerpo></kv-donde-golpear-un-cuerpo>
 *
 * Solo las etiquetas de {@link INTERACTIVE_TAGS} se muestran (como su componente de Svelte, ver
 * $lib/components/interactivos/index.js); cualquier otra `<kv-…>` se muestra escapada, como texto.
 * Un interactivo nuevo necesita un PR: se suma acá y en el mapa de componentes.
 *
 * Los .md del repo usan el componente con un `import` en su `<script>` (`legacy`). La importación
 * pasa esa forma a la etiqueta del registro ({@link toRegisteredTags}) y «Descargar todo» la vuelve a
 * armar ({@link toLegacyComponents}), así el .md descargado es el mismo que el del repo.
 *
 * Funciones puras, sin imports: las usan el servidor, la importación (sin Vite) y las pruebas.
 */

/**
 * @typedef {{
 *   label: string,
 *   legacy?: { name: string, from: string }
 * }} InteractiveDef
 */

/** Los interactivos registrados, por etiqueta. @type {Readonly<Record<string, InteractiveDef>>} */
export const INTERACTIVE_TAGS = Object.freeze({
	'kv-donde-golpear-un-cuerpo': {
		label: 'Dónde y con qué golpear un cuerpo (gráfico interactivo)',
		legacy: {
			name: 'DondeGolpearUnCuerpo',
			from: '$lib/components/interactivos/DondeGolpearUnCuerpo.svelte'
		}
	}
});

/** @param {string} tag */
export const isInteractiveTag = (tag) => Object.hasOwn(INTERACTIVE_TAGS, tag.toLowerCase());

/**
 * Aplica `fn` solo a lo que está fuera de los bloques y los fragmentos de código (``` … ```,
 * `~~~ … ~~~`, `` `…` ``): ahí una etiqueta es texto y se deja como está.
 *
 * @param {string} text
 * @param {(part: string) => string} fn
 */
export function outsideCode(text, fn) {
	return text
		.split(/(^(?:`{3,}|~{3,})[^\n]*\n[\s\S]*?^(?:`{3,}|~{3,})[ \t]*$)/m)
		.map((block, i) => (i % 2 ? block : outsideInlineCode(block, fn)))
		.join('');
}

/**
 * @param {string} text
 * @param {(part: string) => string} fn
 */
function outsideInlineCode(text, fn) {
	const span = /(`+)[\s\S]*?\1/g;
	let out = '';
	let last = 0;
	for (let m = span.exec(text); m; m = span.exec(text)) {
		out += fn(text.slice(last, m.index)) + m[0];
		last = m.index + m[0].length;
	}
	return out + fn(text.slice(last));
}

/** Una etiqueta del registro, sola: `<kv-x></kv-x>`, `<kv-x />` o `<kv-x/>`. */
const OWN_TAG = /<(kv-[a-z0-9-]+)\s*(?:\/>|>\s*<\/\1\s*>)/gi;
/** Cualquier etiqueta `<kv-…`, de apertura o de cierre. */
const ANY_KV = /<(\/?)(kv-[a-z0-9-]*)/gi;

/**
 * El texto con cada interactivo registrado cambiado por lo que devuelve `replace(tag, i)` y toda
 * otra `<kv-…` escapada (`&lt;kv-…`), fuera del código.
 *
 * @param {string} body
 * @param {(tag: string, index: number) => string} replace
 * @returns {{ text: string, tags: string[] }}
 */
export function markInteractive(body, replace) {
	/** @type {string[]} */
	const tags = [];
	const text = outsideCode(String(body ?? ''), (part) =>
		part
			.replace(OWN_TAG, (whole, tag) => {
				const key = String(tag).toLowerCase();
				if (!isInteractiveTag(key)) return whole;
				tags.push(key);
				return replace(key, tags.length - 1);
			})
			.replace(ANY_KV, (_, slash, tag) => `&lt;${slash}${tag}`)
	);
	return { text, tags };
}

/** El primer bloque `<script>` del texto (el de mdsvex, no `context="module"`). */
const SCRIPT = /^<script(?![^>]*context=)[^>]*>\n?([\s\S]*?)<\/script>[ \t]*\n?/im;

/** @param {string} s */
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * La forma de los .md del repo → la de la base: cada componente registrado que el `<script>`
 * importa (`import DondeGolpearUnCuerpo from '…'`) pasa a su etiqueta (`<kv-…></kv-…>`) y su import
 * sale del `<script>` (si el `<script>` queda vacío, sale entero). Lo demás queda igual.
 *
 * @param {string} body
 */
export function toRegisteredTags(body) {
	let text = String(body ?? '');
	const script = SCRIPT.exec(text);
	if (!script) return text;
	let code = script[1];
	let changed = false;
	for (const [tag, def] of Object.entries(INTERACTIVE_TAGS)) {
		if (!def.legacy) continue;
		const { name, from } = def.legacy;
		const line = new RegExp(
			`^[ \\t]*import\\s+${escapeRe(name)}\\s+from\\s+['"]${escapeRe(from)}['"];?[ \\t]*\\n?`,
			'm'
		);
		if (!line.test(code)) continue;
		code = code.replace(line, '');
		changed = true;
		const use = new RegExp(`<${escapeRe(name)}\\s*(?:\\/>|>\\s*<\\/${escapeRe(name)}\\s*>)`, 'g');
		text = text.replace(use, `<${tag}></${tag}>`);
	}
	if (!changed) return text;
	const start = text.indexOf(script[0]);
	if (start < 0) return text;
	const rest = text.slice(start + script[0].length);
	const before = text.slice(0, start);
	if (code.trim()) {
		const open = /** @type {RegExpMatchArray} */ (script[0].match(/^<script[^>]*>\n?/i))[0];
		return `${before}${open}${code}</script>\n${rest}`;
	}
	// Sin nada más en el `<script>`: sale entero, con la línea en blanco que lo separaba.
	return before + rest.replace(/^[ \t]*\n/, '');
}

/**
 * La forma de la base → la de los .md del repo (para «Descargar todo»): cada etiqueta registrada
 * con `legacy` vuelve a ser su componente, importado en el `<script>`. Es la inversa de
 * {@link toRegisteredTags} para los .md del repo (la prueba de paridad lo verifica).
 *
 * @param {string} body
 */
export function toLegacyComponents(body) {
	let text = String(body ?? '');
	/** @type {string[]} */
	const imports = [];
	for (const [tag, def] of Object.entries(INTERACTIVE_TAGS)) {
		if (!def.legacy) continue;
		const own = new RegExp(`<${escapeRe(tag)}\\s*(?:\\/>|>\\s*<\\/${escapeRe(tag)}\\s*>)`, 'gi');
		if (!own.test(text)) continue;
		own.lastIndex = 0;
		text = text.replace(own, `<${def.legacy.name} />`);
		imports.push(`  import ${def.legacy.name} from '${def.legacy.from}'\n`);
	}
	if (!imports.length) return text;
	const script = SCRIPT.exec(text);
	if (script) {
		const open = /** @type {RegExpMatchArray} */ (script[0].match(/^<script[^>]*>\n?/i))[0];
		const at = text.indexOf(script[0]) + open.length;
		return text.slice(0, at) + imports.join('') + text.slice(at);
	}
	return `<script>\n${imports.join('')}</script>\n\n${text}`;
}
