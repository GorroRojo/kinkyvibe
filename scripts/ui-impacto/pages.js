// Las páginas que fotografía el informe de impacto visual (docs/ui-impacto.md), en este orden.
// Para sumar una: un `id` corto y estable (es el nombre de las capturas), un `title` legible y
// `path(ctx)` con la dirección (null = este lado no la tiene: se anota y se sigue). `ctx` es lo
// que escribió ./seed.js (direcciones de los eventos de prueba, la sesión de Mi rincón...).
// `prepare(page, ctx)` hace lo que haga falta antes de la captura (tocar un botón, completar un
// formulario con datos inventados) y `member: true` entra como la persona de prueba.

/** @typedef {import('@playwright/test').Page} Page */
/**
 * @typedef {{
 *   id: string,
 *   title: string,
 *   group: 'sitio' | 'panel' | 'estilo',
 *   path: (ctx: Record<string, any>) => string | null,
 *   prepare?: (page: Page, ctx: Record<string, any>) => Promise<void>,
 *   member?: boolean
 * }} UiPage
 */

/** Tamaños de pantalla: celu y compu. */
export const VIEWPORTS = Object.freeze([
	Object.freeze({ id: 'celu', width: 390, height: 844 }),
	Object.freeze({ id: 'compu', width: 1280, height: 800 })
]);

/**
 * Primer link de la página que empieza con `prefix` (y no es exactamente `prefix`), para las
 * fichas cuya dirección sale de los datos (una persona, un perfil, una etiqueta).
 * @param {Page} page
 * @param {string} prefix
 */
async function firstLink(page, prefix) {
	const hrefs = await page
		.locator(`a[href^="${prefix}"]`)
		.evaluateAll((els) => els.map((a) => a.getAttribute('href') ?? ''));
	return (
		hrefs.find((h) => h.length > prefix.length && !h.slice(prefix.length).includes('?')) ?? null
	);
}

/**
 * La compra hasta «Tus datos» (sin pagar), con datos inventados.
 * @param {Page} page
 */
async function buyToStep2(page) {
	const block = page.locator('#entradas');
	await block.getByRole('radio').first().check();
	await block.getByRole('button', { name: /^Continuar/ }).click();
	await block.getByRole('heading', { name: /^Paso 2 de 3/ }).waitFor();
	await block.getByLabel('Tu nombre').fill('Persona de Prueba');
	await block.getByLabel('Tus pronombres').fill('elle');
	await block.getByLabel(/^Email/).fill('persona.prueba@example.invalid');
	await block.getByLabel(/^DNI/).fill('99.999.999');
	await page.locator(':focus').evaluate((el) => /** @type {HTMLElement} */ (el).blur());
}

/** @type {UiPage[]} */
export const PAGES = [
	{ id: 'inicio', title: 'Inicio', group: 'sitio', path: () => '/' },
	{ id: 'calendario', title: 'Calendario (lista)', group: 'sitio', path: () => '/calendario' },
	{
		id: 'calendario-grilla',
		title: 'Calendario (grilla)',
		group: 'sitio',
		path: () => '/calendario',
		prepare: async (page) => {
			await page.locator('label:has(#display-type-grid)').click();
		}
	},
	{
		id: 'evento',
		title: 'Página de un evento',
		group: 'sitio',
		path: (c) => (c.tonight ? `/calendario/${c.tonight}` : null)
	},
	{
		id: 'taller-partes',
		title: 'Taller en varias partes',
		group: 'sitio',
		path: (c) => (c.workshop ? `/calendario/${c.workshop}` : null)
	},
	{
		id: 'compra-paso-1',
		title: 'Compra: paso 1 (Entradas)',
		group: 'sitio',
		path: (c) => (c.workshop ? `/calendario/${c.workshop}/entradas` : null)
	},
	{
		id: 'compra-paso-2',
		title: 'Compra: paso 2 (Tus datos)',
		group: 'sitio',
		path: (c) => (c.workshop ? `/calendario/${c.workshop}/entradas` : null),
		prepare: buyToStep2
	},
	{
		id: 'mi-rincon',
		title: 'Mi rincón',
		group: 'sitio',
		path: () => '/mi-rincon',
		member: true
	},
	{ id: 'wiki', title: 'Kinkipedia', group: 'sitio', path: () => '/wiki' },
	{
		id: 'wiki-pagina',
		title: 'Una página de la Kinkipedia',
		group: 'sitio',
		path: () => '/wiki',
		prepare: async (page) => {
			const href = await firstLink(page, '/wiki/');
			if (!href) throw new Error('No hay páginas en la Kinkipedia');
			await page.goto(href, { waitUntil: 'networkidle' });
		}
	},
	{ id: 'amigues', title: 'Amigues', group: 'sitio', path: () => '/amigues' },
	{
		id: 'amigues-perfil',
		title: 'Un perfil de amigues',
		group: 'sitio',
		path: () => '/amigues',
		prepare: async (page) => {
			const href = await firstLink(page, '/amigues/');
			if (!href) throw new Error('No hay perfiles en Amigues');
			await page.goto(href, { waitUntil: 'networkidle' });
		}
	},
	{ id: 'panel-inicio', title: 'Panel: Inicio', group: 'panel', path: () => '/admin' },
	{
		id: 'panel-evento-editar',
		title: 'Panel: evento › Editar',
		group: 'panel',
		path: (c) => (c.tonight ? `/admin/eventos/${c.tonight}/editar` : null)
	},
	{
		id: 'panel-evento-resumen',
		title: 'Panel: evento › Resumen',
		group: 'panel',
		path: (c) => (c.tonight ? `/admin/eventos/${c.tonight}` : null)
	},
	{
		id: 'panel-puerta',
		title: 'Panel: evento › Puerta',
		group: 'panel',
		path: (c) => (c.tonight ? `/admin/eventos/${c.tonight}/ingreso` : null)
	},
	{
		id: 'panel-personas',
		title: 'Panel: Comunidad › Personas',
		group: 'panel',
		path: () => '/admin/comunidad/personas'
	},
	{
		id: 'panel-persona-ficha',
		title: 'Panel: ficha de una persona',
		group: 'panel',
		path: () => '/admin/comunidad/personas',
		prepare: async (page) => {
			const href = await firstLink(page, '/admin/comunidad/personas/');
			if (!href) throw new Error('No hay personas en Comunidad › Personas');
			await page.goto(href, { waitUntil: 'networkidle' });
		}
	},
	{
		id: 'panel-etiquetas',
		title: 'Panel: Etiquetas',
		group: 'panel',
		path: () => '/admin/etiquetas'
	},
	{
		id: 'panel-interruptores',
		title: 'Panel: Ajustes › Interruptores',
		group: 'panel',
		path: () => '/admin/ajustes/interruptores'
	},
	{
		id: 'panel-plantillas',
		title: 'Panel: Mensajes › Plantillas',
		group: 'panel',
		path: () => '/admin/mensajes/plantillas'
	},
	{
		id: 'panel-estadisticas',
		title: 'Panel: Estadísticas',
		group: 'panel',
		path: () => '/admin/estadisticas'
	},
	// La galería de componentes (docs/estilo.md, «Componentes»): solo existe en dev y en previews,
	// y el informe corre con `vite dev`. Así un cambio en un componente compartido se ve acá aunque
	// ninguna de las páginas de arriba lo use.
	{
		id: 'estilo',
		title: 'Galería de componentes (/estilo)',
		group: 'estilo',
		path: () => '/estilo'
	},
	{
		id: 'estilo-sitio',
		title: 'Galería de componentes (/estilo, aspecto del sitio)',
		group: 'estilo',
		path: () => '/estilo?superficie=sitio'
	},
	{
		id: 'estilo-oscuro',
		title: 'Galería de componentes (/estilo, panel oscuro)',
		group: 'estilo',
		path: () => '/estilo?tema=oscuro'
	}
];
