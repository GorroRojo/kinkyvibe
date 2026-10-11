/**
 * Estado de los prototipos de navegación, en la URL: `s` sección, `t` pestaña, `e` evento abierto,
 * `et` pestaña del evento, `w` ancho simulado y `v` variante. Así cada pantalla tiene su link y
 * «atrás» funciona como en el panel de verdad.
 */

/** Anchos para simular (el marco del prototipo se achica; en un celu de verdad ya es angosto). */
export const ANCHOS = [
	{ value: 'auto', label: 'Este ancho' },
	{ value: '1440', label: 'Compu (1440)' },
	{ value: '1100', label: 'Compu angosta (1100)' },
	{ value: '820', label: 'Tablet (820)' },
	{ value: '390', label: 'Celu (390)' }
];

/**
 * @typedef {{ s: string, t: string, e: string, et: string, w: string, v: string }} Estado
 */

/**
 * @param {URL} url
 * @returns {Estado}
 */
export function leerEstado(url) {
	const q = url.searchParams;
	const w = q.get('w') ?? 'auto';
	return {
		s: q.get('s') || 'inicio',
		t: q.get('t') ?? '',
		e: q.get('e') ?? '',
		et: q.get('et') ?? '',
		w: ANCHOS.some((a) => a.value === w) ? w : 'auto',
		v: q.get('v') ?? ''
	};
}

/**
 * Link a otra pantalla del mismo prototipo: cambia lo que se pasa y conserva el ancho y la
 * variante. Ir a otra sección borra la pestaña y el evento (salvo que se pasen).
 * @param {Estado} estado
 * @param {Partial<Estado>} cambios
 */
export function enlace(estado, cambios) {
	const sigue = cambios.s === undefined || cambios.s === estado.s;
	/** @type {Estado} */
	const next = {
		s: cambios.s ?? estado.s,
		t: cambios.t ?? (sigue && cambios.e === undefined ? estado.t : ''),
		e: cambios.e ?? (sigue && cambios.t === undefined ? estado.e : ''),
		et: cambios.et ?? '',
		w: cambios.w ?? estado.w,
		v: cambios.v ?? estado.v
	};
	const q = new URLSearchParams();
	for (const k of /** @type {(keyof Estado)[]} */ (['s', 't', 'e', 'et', 'w', 'v'])) {
		const val = next[k];
		if (!val || (k === 'w' && val === 'auto') || (k === 's' && val === 'inicio' && !next.t))
			continue;
		q.set(k, val);
	}
	const qs = q.toString();
	return qs ? `?${qs}` : '?';
}

/**
 * La pestaña elegida de una sección (la primera si no hay, o si la de la URL no existe). En
 * Ajustes, una página suelta (`cobros`) cuenta como su grupo (`plata`).
 * @param {import('./datos.js').Seccion | undefined} seccion
 * @param {string} t
 */
export function pestanaActiva(seccion, t) {
	if (!seccion) return '';
	if (t === 'crear' || t === 'importar') return t;
	for (const tab of seccion.tabs) {
		if (tab.id === t || tab.partes?.some((p) => p.id === t)) return tab.id;
	}
	return seccion.tabs[0]?.id ?? '';
}
