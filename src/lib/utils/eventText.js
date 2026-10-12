/**
 * Cómo se presenta un evento en una línea: «Cancelado» si se canceló y la fecha y hora a la
 * argentina, y lo que siga (el lugar, el resumen). La usan la vista previa al compartir
 * (`eventDescription` en ./seo.js) y las entradas de los feeds (`feedEntry` en ./feeds.js), así
 * dicen lo mismo.
 */
import { argDateTimeLong } from './dates.js';

/** @param {string} s */
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * «Cancelado · Viernes 2 de octubre de 2026, 15:00 · …»: las partes que haya, con « · ».
 *
 * @param {Record<string, any> | null | undefined} meta la metadata del evento
 * @param {{ capitalized?: boolean, rest?: readonly unknown[] }} [opts] `capitalized`: la fecha con
 *   mayúscula (sola en una línea); `rest`: lo que va después (vacíos se saltean)
 */
export function eventLead(meta, { capitalized = false, rest = [] } = {}) {
	const when = meta?.start ? argDateTimeLong(meta.start) : '';
	return [
		meta?.status === 'cancelado' ? 'Cancelado' : '',
		capitalized ? capitalize(when) : when,
		...rest
	]
		.filter(Boolean)
		.join(' · ');
}
