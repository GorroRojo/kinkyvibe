/**
 * Borradores de las páginas legales (/legales, docs/legales.md). Solo los importa, de forma
 * dinámica y dentro de la condición de compilación, src/routes/(content)/legales/[[pagina]]/+page.js:
 * en producción nada de esto entra en el bundle y la página da 404 (como la galería /estilo).
 */

/**
 * @typedef {object} PaginaLegal
 * @property {string} slug la dirección: /legales/<slug>
 * @property {string} titulo
 * @property {string} resumen una frase, para el índice
 */

/** @type {readonly PaginaLegal[]} */
export const PAGINAS = Object.freeze([
	{
		slug: 'privacidad',
		titulo: 'Política de privacidad',
		resumen:
			'Qué datos guardamos, para qué, dónde, por cuánto tiempo, quién más los procesa y cómo pedir verlos, corregirlos o borrarlos.'
	},
	{
		slug: 'terminos',
		titulo: 'Términos y condiciones',
		resumen:
			'Cómo se usa el sitio, las cuentas y los perfiles de la comunidad, de quién es lo que se publica y qué no se puede hacer.'
	},
	{
		slug: 'entradas',
		titulo: 'Entradas y devoluciones',
		resumen:
			'Lo que ya dicen el formulario de compra y los mails: reservas, el Fondo, cambios de titular, devoluciones y cambios de fecha.'
	},
	{
		slug: 'convivencia',
		titulo: 'Código de convivencia',
		resumen:
			'Cómo nos cuidamos en los eventos, en el sitio y en la comunidad. Esqueleto a partir de los códigos de ¡AUCH!.'
	}
]);

/**
 * El componente de cada página (import dinámico: cada texto es su propio pedazo).
 *
 * @type {Record<string, () => Promise<{ default: any }>>}
 */
const COMPONENTES = {
	privacidad: () => import('./Privacidad.svelte'),
	terminos: () => import('./Terminos.svelte'),
	entradas: () => import('./Entradas.svelte'),
	convivencia: () => import('./Convivencia.svelte')
};

/**
 * Lo que necesita la página: el componente, el título y la lista de páginas. Sin `slug`, el
 * índice; con uno que no existe, `null` (404).
 *
 * @param {string | undefined} slug
 * @returns {Promise<{ Componente: any, titulo: string, slug: string, paginas: readonly PaginaLegal[] } | null>}
 */
export async function cargarLegal(slug) {
	if (!slug) {
		const { default: Componente } = await import('./Indice.svelte');
		return { Componente, titulo: 'Legales', slug: '', paginas: PAGINAS };
	}
	const pagina = PAGINAS.find((p) => p.slug === slug);
	const cargar = pagina && COMPONENTES[pagina.slug];
	if (!pagina || !cargar) return null;
	const { default: Componente } = await cargar();
	return { Componente, titulo: pagina.titulo, slug: pagina.slug, paginas: PAGINAS };
}
