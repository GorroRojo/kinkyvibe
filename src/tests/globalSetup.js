/**
 * Una vez por corrida de vitest (en el proceso principal, antes de las pruebas): arma en segundo
 * plano la plantilla de la base de prueba, una base con todas las migraciones aplicadas. Así cada
 * `createTestDB()` copia ese SQLite en vez de aplicar las migraciones de nuevo (ver
 * src/lib/server/db/testing.js). Si no está lista o falla, cada archivo migra como siempre.
 */
import { startTemplateDB } from '../lib/server/db/testing.js';

export default function setup() {
	return startTemplateDB();
}
