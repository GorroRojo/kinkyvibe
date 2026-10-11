import { readFileSync } from 'node:fs';

/** Datos de transferencia INVENTADOS para las pruebas (nunca poner datos reales en el repo). */
export const TRANSFER_INFO = 'Alias: EJEMPLO.ALIAS.PRUEBA\\nTitular: Nombre de ejemplo';

/** Comisión de Mercado Pago que se simula en las pruebas (TICKETS_MP_FEE_PERCENT). */
export const MP_FEE_PERCENT = '2';

/** La semilla de eventos de la base local (src/lib/server/semilla, scripts/semilla.js). */
const SEED_EVENTS = 'src/lib/server/semilla/calendario.json';

/**
 * Eventos publicados reales de la semilla que sirven para la prueba E2E (la semilla puede cambiar,
 * así que los buscamos). Las entradas se las agregan TICKETS_DEV_FIXTURE /
 * TICKETS_DEV_FIXTURE_GORRA solo en `vite dev`, sin tocar la base.
 */
function candidates() {
	/** @type {{ legacySlug: string, raw: string }[]} */
	const events = JSON.parse(readFileSync(SEED_EVENTS, 'utf8'));
	return events
		.filter(({ legacySlug }) => !legacySlug.startsWith('_'))
		.sort((a, b) => a.legacySlug.localeCompare(b.legacySlug))
		.filter(({ raw: text }) => {
			return (
				!/^force_unpublished:\s*true/m.test(text) &&
				!/^redirect:/m.test(text) &&
				!/^tickets:/m.test(text) &&
				/^start:/m.test(text)
			);
		})
		.map(({ legacySlug }) => legacySlug);
}

/** Evento presencial con fondo (General y Anticipada) para la prueba E2E. */
export function ticketsE2EEvent() {
	const slug = candidates()[0];
	if (!slug) throw new Error('No encontré un evento para la prueba de entradas');
	return slug;
}

/** Otro evento, online y "a la gorra", para la prueba E2E de la gorra. */
export function ticketsE2EGorraEvent() {
	const slug = candidates()[1];
	if (!slug) throw new Error('No encontré un segundo evento para la prueba de la gorra');
	return slug;
}
