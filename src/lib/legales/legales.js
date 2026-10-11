/**
 * Borrador de la página legal mínima (/legales, docs/legales.md). Solo lo importa, de forma
 * dinámica y dentro de la condición de compilación, src/routes/(content)/legales/+page.js: en
 * producción nada de esto entra en el bundle y la página da 404 (como la galería /estilo).
 */

/**
 * Contacto general de la organización (lo eligió gorrite para esta página). Es público: ya
 * aparece en varios eventos. No es el de las entradas (`DEFAULT_CONTACT_EMAIL`).
 */
export const CONTACTO_LEGALES = 'kinkyvibeargentina@gmail.com';

/**
 * Lo que necesita la página: el componente y el título.
 *
 * @returns {Promise<{ Componente: any, titulo: string }>}
 */
export async function cargarLegales() {
	const { default: Componente } = await import('./Legales.svelte');
	return { Componente, titulo: 'Legales' };
}
