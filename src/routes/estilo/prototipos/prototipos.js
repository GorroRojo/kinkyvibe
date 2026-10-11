/**
 * Los prototipos de /estilo/prototipos: cada uno con su carpeta (`<slug>/+page.js`, con la
 * condición de compilación de /estilo) y una línea de qué explora. Lo usan el índice y
 * prototipos.test.js (que controla que cada uno dé 404 en producción).
 */

/** @type {{ slug: string, nombre: string, explora: string }[]} */
export const PROTOTIPOS = [
	{
		slug: 'filtros-celu',
		nombre: 'Filtros en el celu',
		explora:
			'Una barra fija y corta con las etiquetas más usadas y «Más filtros» en una hoja con buscador, en vez del panel largo de «Filtrar por etiquetas».'
	},
	{
		slug: 'lista-de-espera',
		nombre: 'Lista de espera',
		explora:
			'«Avisame si se libera un lugar» cuando se agotan las entradas: anotarse, el aviso con 24 h para comprar y la lista por evento en el panel.'
	}
];
