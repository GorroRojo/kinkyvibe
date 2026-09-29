import { readdirSync, readFileSync } from 'node:fs';

/** Datos de transferencia INVENTADOS para las pruebas (nunca poner datos reales en el repo). */
export const TRANSFER_INFO = 'Alias: EJEMPLO.ALIAS.PRUEBA\\nTitular: Nombre de ejemplo';

/** Comisión de Mercado Pago que se simula en las pruebas (TICKETS_MP_FEE_PERCENT). */
export const MP_FEE_PERCENT = '2';

const EVENTS_DIR = 'src/lib/posts/calendario';

/**
 * Eventos publicados reales del repo que sirven para la prueba E2E (el contenido cambia, así que
 * los buscamos). Las entradas se las agregan TICKETS_DEV_FIXTURE / TICKETS_DEV_FIXTURE_GORRA
 * solo en `vite dev`, sin tocar sus archivos.
 */
function candidates() {
	return readdirSync(EVENTS_DIR)
		.filter((f) => f.endsWith('.md') && !f.startsWith('_'))
		.sort()
		.filter((f) => {
			const text = readFileSync(`${EVENTS_DIR}/${f}`, 'utf8');
			return (
				!/^force_unpublished:\s*true/m.test(text) &&
				!/^redirect:/m.test(text) &&
				!/^tickets:/m.test(text) &&
				/^start:/m.test(text)
			);
		})
		.map((f) => f.replace(/\.md$/, ''));
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
