/**
 * Los prototipos de /estilo/prototipos: cada uno con su carpeta (`<slug>/+page.js`, con la
 * condición de compilación de /estilo) y una línea de qué explora. `paginas` (opcional): las
 * sub-páginas del prototipo (`<slug>/<página>/+page.js`), con la misma condición. Lo usan el índice
 * y prototipos.test.js (que controla que cada página dé 404 en producción).
 */

/** @type {{ slug: string, nombre: string, explora: string, paginas?: string[] }[]} */
export const PROTOTIPOS = [
	{
		slug: 'panel-nav',
		nombre: 'Navegación del panel (3 opciones)',
		explora:
			'Una barra lateral que no abrume: solo secciones con pestañas adentro, una grilla de tejas, o secciones con «+ Crear» e «Ir a… ⌘K». Con la investigación que las respalda.',
		paginas: ['secciones', 'grilla', 'propuesta', 'investigacion']
	}
];
