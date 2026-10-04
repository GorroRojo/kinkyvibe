/**
 * Ficha de una cuenta del público: es la misma ficha de la persona que Comunidad › Personas ›
 * <persona> (src/lib/server/admin/ficha.js), encontrada por la cuenta (también borrada, que ya
 * no tiene mail) y por su mail. Esta dirección sigue andando para los links de Cuentas, Perfiles,
 * Actividad y mails ya mandados. Solo admins (fichaRoutes.js). El permiso «puede tener perfiles»
 * queda en el registro de actividad, sin el mail.
 */
import { accountKey } from '$lib/server/admin/ficha.js';
import { fichaActions, fichaLoad } from '$lib/server/admin/fichaRoutes.js';

/** @type {import('$lib/server/admin/fichaRoutes.js').ResolveKey} */
const resolve = (db, params) => accountKey(db, params.id ?? '');

/** @type {import('./$types').PageServerLoad} */
export const load = fichaLoad(resolve, 'No encontramos esa cuenta.');

/** @type {import('./$types').Actions} */
export const actions = fichaActions(resolve);
