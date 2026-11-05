/**
 * Las tres guías «Cómo buscar» (sitio, bot y panel) leen sus líneas y sus frases de
 * searchSyntax.js, la fuente única (docs/buscar.md, «Dónde vive cada texto de la guía»): lo que
 * muestra cada una es lo que arma el registro para ese buscador, y ningún archivo que las muestra
 * escribe a mano una línea o una frase. La guía del sitio se prueba montada en
 * src/lib/components/SearchPalette.dom.test.js.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HELP_ROWS, OPERATORS, SEARCH_GUIDE_TEXT, searchHelp } from './searchSyntax.js';
import { SEARCH_HELP_COMMAND, SEARCH_TIPS } from '$lib/admin/paletteActions.js';
import { searchHelpLine, searchHelpScreen } from '$lib/server/telegram/screens.js';
import { botTextField } from './botTexts.js';
import { SEARCH_SCOPE, SEARCH_SCOPE_BEYOND_WIKI } from './searchScope.js';

/** Los archivos que muestran las guías (y el de los textos del bot). */
const RENDERERS = [
	'src/lib/components/SearchPalette.svelte',
	'src/lib/components/admin/panel/SearchBox.svelte',
	'src/lib/admin/paletteActions.js',
	'src/lib/server/telegram/screens.js',
	'src/lib/utils/botTexts.js'
];

/** @param {string} path */
const source = (path) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

describe('las guías «Cómo buscar» salen del registro', () => {
	it('el registro arma una guía por buscador, con lo de solo el panel en la del panel', () => {
		const ids = (/** @type {'sitio' | 'bot' | 'panel'} */ e) => searchHelp(e).map((r) => r.id);
		expect(ids('bot')).toEqual(ids('sitio'));
		for (const def of HELP_ROWS) {
			for (const engine of /** @type {const} */ (['sitio', 'bot', 'panel'])) {
				expect(ids(engine).includes(def.id), `${engine}: ${def.id}`).toBe(
					def.engines.includes(engine)
				);
			}
		}
		// La pestaña y `>` son líneas del registro, al final de la guía del panel.
		expect(ids('panel').slice(-2)).toEqual(['pestana', 'acciones']);
	});

	it('panel: cada línea de «Cómo buscar» es la del registro, sin agregados', () => {
		expect(SEARCH_TIPS).toEqual(
			searchHelp('panel').map((r) => ({
				q: r.example,
				...(r.label === undefined ? {} : { label: r.label }),
				text: r.help
			}))
		);
		expect(SEARCH_HELP_COMMAND.hint).toBe(SEARCH_GUIDE_TEXT.panel.commandHint);
	});

	it('el título es el mismo en las tres guías', () => {
		expect(SEARCH_GUIDE_TEXT.title).toBe('¿Cómo buscar?');
		expect(source('src/lib/components/admin/panel/SearchBox.svelte')).toContain(
			'>{SEARCH_GUIDE_TEXT.title}</h3>'
		);
		expect(botTextField('sitio.como_buscar')?.value).toContain(`🔎 ${SEARCH_GUIDE_TEXT.title}`);
	});

	it('qué cubre el buscador: una fuente (searchScope.js) y las copias del bot dicen lo mismo', () => {
		expect(SEARCH_GUIDE_TEXT.scope).toBe(SEARCH_SCOPE);
		// Los textos del bot se editan desde el panel: tienen su copia, que tiene que coincidir.
		expect(botTextField('inicio.ayuda')?.value).toContain(
			`/buscar <texto>: buscá en todo el sitio (${SEARCH_SCOPE})`
		);
		expect(botTextField('comandos.buscar')?.value).toBe(`Buscá en todo el sitio: ${SEARCH_SCOPE}`);
		// El sitio lo lee de searchScope.js, sin escribir la lista.
		const palette = source('src/lib/components/SearchPalette.svelte');
		expect(palette).toContain('placeholder="Buscar {SEARCH_SCOPE}…"');
		expect(palette).toContain('Buscá en todo el sitio: {SEARCH_SCOPE}.');
		expect(source('src/routes/(content)/wiki/+page.svelte')).toContain(
			'buscalo en todo el sitio: {SEARCH_SCOPE_BEYOND_WIKI}.'
		);
		expect(SEARCH_SCOPE).toContain(SEARCH_SCOPE_BEYOND_WIKI.replace(' y eventos', ', eventos'));
	});

	it('bot: «🔎 Cómo buscar» lista exactamente las líneas del registro', () => {
		const { text } = searchHelpScreen();
		const rows = searchHelp('bot');
		expect(text).toContain(rows.map(searchHelpLine).join('\n'));
		expect(text.match(/^• /gm)).toHaveLength(rows.length);
	});

	it('bot: la muestra de {lista} en «Textos del bot» es la línea de `evento:` del registro', () => {
		const field = botTextField('sitio.como_buscar');
		const sample = field?.vars?.find((v) => v.name === 'lista')?.sample;
		const evento = searchHelp('bot').find((r) => r.id === 'evento');
		expect(evento).toBeDefined();
		expect(sample).toBe(searchHelpLine(/** @type {any} */ (evento)));
	});

	it('ningún archivo que muestra una guía escribe a mano una línea o una frase', () => {
		const rows = [
			...HELP_ROWS,
			...OPERATORS.flatMap((op) => [
				{ id: op.id, example: op.example, help: op.help },
				...Object.values(op.helpFor ?? {})
					.filter((h) => typeof h === 'string')
					.map((h) => ({ id: op.id, example: '', help: /** @type {string} */ (h) }))
			])
		];
		const phrases = [
			SEARCH_GUIDE_TEXT.sitio.intro,
			SEARCH_GUIDE_TEXT.panel.intro,
			SEARCH_GUIDE_TEXT.panel.outro,
			SEARCH_GUIDE_TEXT.panel.combined,
			SEARCH_GUIDE_TEXT.panel.commandHint,
			SEARCH_SCOPE
		];
		const evento = searchHelpLine(
			/** @type {any} */ (searchHelp('bot').find((r) => r.id === 'evento'))
		);
		for (const path of RENDERERS) {
			// La muestra de {lista} (la línea de `evento:`, chequeada arriba) es la única copia.
			let src = source(path);
			if (path.endsWith('botTexts.js')) src = src.replace(JSON.stringify(evento).slice(1, -1), '');
			for (const row of rows) {
				expect(src, `${path}: «${row.help}» (${row.id})`).not.toContain(row.help);
				// Los ejemplos, solo en los que muestran la guía: en botTexts.js hay otras muestras
				// (`@gorrite` es la de les admins de una conexión).
				if (!row.example || path.endsWith('botTexts.js')) continue;
				// El ejemplo como texto: entre comillas o en el HTML.
				for (const quoted of [`'${row.example}'`, `"${row.example}"`, `>${row.example}<`]) {
					expect(src, `${path}: ${quoted} (${row.id})`).not.toContain(quoted);
				}
			}
			for (const phrase of phrases) {
				// El bot tiene su copia de qué cubre el buscador (chequeada arriba).
				if (phrase === SEARCH_SCOPE && path.endsWith('botTexts.js')) continue;
				expect(src, `${path}: «${phrase}»`).not.toContain(phrase);
			}
		}
	});
});
