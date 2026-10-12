/**
 * Buscar sin resultados (noResults.js): qué se ofrece (parecidos, la sección más cercana, lo que
 * viene, «Seguir» si es una etiqueta) y cómo se ve la pantalla. Índice y árbol inventados.
 */
import { describe, expect, it } from 'vitest';
import { renderBotText } from '$lib/utils/botTexts.js';
import { byteLength, CALLBACK_MAX_BYTES, decodeNav, shortHash } from './nav.js';
import { noResultsHelp, noResultsScreen, offersFollow, UPCOMING_MAX } from './noResults.js';
import { ctxOf, manager, NOW, ORIGIN, source } from './noResults.fixtures.js';

/** @param {import('./screens.js').Screen} screen */
const buttons = (screen) => screen.keyboard.flat();

describe('noResultsHelp', () => {
	it('una etiqueta que todavía no usa nada: sus parientes, la sección filtrada y «Seguir»', () => {
		const help = noResultsHelp(source, 'shibari', NOW, manager());
		expect(help.suggestions.map((s) => s.query)).toEqual(['suspensión', 'nudos', 'cuerdas']);
		expect(help.tag).toEqual({ key: 'shibari', title: '🪢 shibari', hash: shortHash('shibari') });
		// Material tiene más cosas de la familia; la primera de la familia que está en Material.
		expect(help.section).toEqual({ id: 'm', tag: shortHash('suspensión') });
	});

	it('un alias de la etiqueta la encuentra igual (sin tildes ni mayúsculas)', () => {
		expect(noResultsHelp(source, 'KINBAKU', NOW, manager()).tag?.key).toBe('shibari');
	});

	it('sin árbol de etiquetas: sugiere igual, sin «Seguir»', () => {
		const help = noResultsHelp(source, 'querdaz', NOW);
		expect(help.suggestions[0]).toEqual({ query: 'cuerdas', count: 2 });
		expect(help.tag).toBeNull();
		// Empate entre Material y Kinkipedia: Material.
		expect(help.section?.id).toBe('m');
	});

	it('sin parecidos: sin sección, pero con lo que viene', () => {
		const help = noResultsHelp(source, 'xqxqxq', NOW, manager());
		expect(help.suggestions).toEqual([]);
		expect(help.tag).toBeNull();
		expect(help.section).toBeNull();
		expect(help.upcoming.map((d) => d.t)).toEqual([
			'Taller inventado',
			'Fiesta inventada',
			'Charla inventada'
		]);
		expect(help.upcoming).toHaveLength(UPCOMING_MAX);
	});

	it('si lo parecido son eventos, la sección es el calendario', () => {
		const help = noResultsHelp(source, 'chorlx', NOW, manager());
		expect(help.suggestions[0]?.query).toBe('charla');
		expect(help.section).toEqual({ id: 'calendario' });
	});
});

describe('noResultsScreen', () => {
	it('privado con «Lo que sigo»: parecidos, «Seguir», sección, buscar otra cosa e inicio', () => {
		const help = noResultsHelp(source, 'shibari', NOW, manager());
		const screen = noResultsScreen('shibari', help, ctxOf());
		expect(screen.text).toContain(renderBotText('sitio.sin_resultados', { busqueda: 'shibari' }));
		expect(screen.text).toContain(renderBotText('sitio.sugerencias'));
		expect(screen.text).toContain(renderBotText('sitio.seguir_etiqueta', { nombre: '🪢 shibari' }));
		expect(screen.text).toContain(renderBotText('sitio.proximos'));
		expect(screen.text).toContain(`<a href="${ORIGIN}/calendario/primero">Taller inventado</a>`);
		expect(screen.text).not.toContain('Jam inventada');
		expect(screen.keyboard).toEqual([
			[
				{
					text: renderBotText('sitio.boton_sugerencia', { busqueda: 'suspensión', cantidad: 1 }),
					callback_data: 'q:0:suspensión'
				}
			],
			[
				{
					text: renderBotText('sitio.boton_sugerencia', { busqueda: 'nudos', cantidad: 1 }),
					callback_data: 'q:0:nudos'
				}
			],
			[
				{
					text: renderBotText('sitio.boton_sugerencia', { busqueda: 'cuerdas', cantidad: 2 }),
					callback_data: 'q:0:cuerdas'
				}
			],
			[
				{
					text: renderBotText('sitio.boton_seguir', { nombre: '🪢 shibari' }),
					callback_data: `sf:${shortHash('shibari')}:shibari`
				}
			],
			[
				{
					text: renderBotText('secciones.boton_material'),
					callback_data: `c:m:0:${shortHash('suspensión')}`
				}
			],
			[
				{ text: renderBotText('eventos.boton_buscar_otra'), callback_data: 's' },
				{ text: renderBotText('inicio.boton_inicio'), callback_data: 'h' }
			]
		]);
	});

	it('cada botón entra en los 64 bytes y lo entiende la navegación', () => {
		const long = 'una etiqueta con un nombre larguísimo ññ';
		const help = noResultsHelp(source, 'shibari', NOW, manager());
		const screen = noResultsScreen(
			long,
			{ ...help, tag: { ...help.tag, title: long.repeat(3) } },
			ctxOf()
		);
		for (const b of buttons(screen)) {
			if (!b.callback_data) continue;
			expect(byteLength(b.callback_data)).toBeLessThanOrEqual(CALLBACK_MAX_BYTES);
			expect(decodeNav(b.callback_data)).not.toBeNull();
		}
	});

	it('ya la sigue: el botón queda deshabilitado', () => {
		const help = noResultsHelp(source, 'shibari', NOW, manager());
		const screen = noResultsScreen('shibari', help, ctxOf(), { following: true });
		expect(buttons(screen)).toContainEqual({
			text: renderBotText('seguir.boton_ya', { nombre: '🪢 shibari' }),
			disabled: {}
		});
		expect(JSON.stringify(screen)).not.toContain('"sf:');
	});

	it('en un grupo o con «Lo que sigo» apagado: sin «Seguir» ni su línea', () => {
		const help = noResultsHelp(source, 'shibari', NOW, manager());
		for (const ctx of [ctxOf('group'), ctxOf('private', false)]) {
			expect(offersFollow(help, ctx)).toBe(false);
			const screen = noResultsScreen('shibari', help, ctx);
			expect(JSON.stringify(screen)).not.toContain('"sf:');
			expect(screen.text).not.toContain('Seguila');
			// Lo demás sigue: los parecidos y la sección.
			expect(buttons(screen).map((b) => b.callback_data)).toContain('q:0:nudos');
		}
	});

	it('el calendario: la Mini App en privado (como el inicio) y la lista de próximos en un grupo', () => {
		const help = noResultsHelp(source, 'chorlx', NOW, manager());
		const text = renderBotText('inicio.boton_calendario');
		expect(buttons(noResultsScreen('x', help, ctxOf()))).toContainEqual({
			text,
			web_app: { url: `${ORIGIN}/telegram/app` }
		});
		expect(buttons(noResultsScreen('x', help, ctxOf('group')))).toContainEqual({
			text,
			callback_data: 'l:p:0'
		});
	});

	it('sin nada para ofrecer: lo dice, lo que viene, buscar otra cosa e inicio', () => {
		const help = noResultsHelp(source, 'xqxqxq', NOW, manager());
		const screen = noResultsScreen('xqxqxq', help, ctxOf());
		expect(screen.text).not.toContain(renderBotText('sitio.sugerencias'));
		expect(screen.keyboard).toHaveLength(1);
		const empty = noResultsScreen('xqxqxq', { ...help, upcoming: [] }, ctxOf());
		expect(empty.text).toBe(renderBotText('sitio.sin_resultados', { busqueda: 'xqxqxq' }));
	});
});
