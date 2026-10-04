/**
 * Ficha de una persona (por el mail, con un id corto en la dirección: nunca el mail), la misma que
 * Comunidad › Cuentas › <cuenta>. Todo sale de src/lib/server/admin/ficha.js; el `load` y las
 * actions, de fichaRoutes.js (solo admins). Sirve para quien compró sin cuenta y para una cuenta
 * sin compras.
 */
import { findPersonEmail } from '$lib/server/admin/ficha.js';
import { fichaActions, fichaLoad } from '$lib/server/admin/fichaRoutes.js';

/** @type {import('$lib/server/admin/fichaRoutes.js').ResolveKey} */
async function resolve(db, params) {
	const email = await findPersonEmail(db, params.id ?? '');
	return email ? { email, accountId: '' } : null;
}

/** @type {import('./$types').PageServerLoad} */
export const load = fichaLoad(resolve, 'No encontramos a esa persona.');

/** @type {import('./$types').Actions} */
export const actions = fichaActions(resolve);
