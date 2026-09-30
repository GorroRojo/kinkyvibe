/**
 * Tipo núcleo `lugar` (venue): donde pasan los eventos. Los eventos apuntan acá con un edge
 * `lugar`; "los eventos de este lugar" son los edges entrantes.
 */

/**
 * @typedef {{
 *   address?: string,
 *   city?: string,
 *   map_url?: string,
 *   accessibility?: string,
 *   description?: string
 * }} LugarData
 */

/** @type {import('./index.js').CoreType} */
const lugar = {
	type: 'lugar',
	label: 'Lugar',
	fields: {
		address: { kind: 'text', label: 'Dirección' },
		city: { kind: 'text', label: 'Ciudad', max: 100 },
		map_url: { kind: 'url', label: 'Link al mapa' },
		accessibility: { kind: 'longtext', label: 'Accesibilidad', max: 5000 },
		description: { kind: 'longtext', label: 'Descripción' }
	},
	edges: {},
	searchText(data) {
		return [data.address, data.city, data.description].filter(Boolean).join('\n');
	}
};

export default lugar;
