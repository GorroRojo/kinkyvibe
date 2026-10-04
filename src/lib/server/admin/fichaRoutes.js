/**
 * El `load` y las actions de la ficha de una persona (src/lib/server/admin/ficha.js), compartidos
 * por sus dos direcciones: /admin/comunidad/personas/<id> (por el mail) y
 * /admin/comunidad/cuentas/<id> (por la cuenta). Las dos muestran la misma ficha, así que los
 * links viejos (del panel, de Actividad o de mails ya mandados) siguen andando.
 *
 * Solo admins: el `load` y cada action llaman a `requireAdmin`. Lo que cambia algo o muestra un
 * DNI queda en el registro de actividad, sin mails, sin el texto de las notas y sin el DNI.
 */
import { error, fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { setProfilePermission } from '$lib/server/admin/cuentas.js';
import { addNote, deleteNote, personId, validateNote } from '$lib/server/admin/people.js';
import { orderReference } from '$lib/utils/tickets.js';
import { accountIdOf, loadFicha, revealDni } from './ficha.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('./ficha.js').FichaKey} FichaKey */
/** @typedef {(db: D1Database, params: Record<string, string>) => Promise<FichaKey | null>} ResolveKey */

/** Cabeceras de la ficha: nada en caché ni en el Referer. */
const HEADERS = { 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' };

/**
 * El `load` de la ficha.
 * @param {ResolveKey} resolve
 * @param {string} notFound
 */
export function fichaLoad(resolve, notFound) {
	/** @param {import('@sveltejs/kit').ServerLoadEvent<Record<string, string>, any, any>} event */
	return async ({ locals, url, params, platform, setHeaders }) => {
		requireAdmin(locals, url);
		setHeaders(HEADERS);
		const db = getDB(platform);
		if (!db) error(503, 'No hay base de datos disponible.');
		const key = await resolve(db, params);
		const data = key ? await loadFicha(db, key) : null;
		if (!data) error(404, notFound);
		return data;
	};
}

/**
 * Las actions de la ficha: el permiso «puede tener perfiles», las notas y «Mostrar» un DNI.
 * @param {ResolveKey} resolve
 */
export function fichaActions(resolve) {
	/**
	 * La base y la persona, o la respuesta de error de la action.
	 * @param {import('@sveltejs/kit').RequestEvent} event
	 * @param {string} form la clave de la respuesta (`permiso`, `note`, `dni`)
	 */
	async function open({ platform, params }, form) {
		const db = getDB(platform);
		if (!db) return { failed: fail(503, { [form]: { ok: false, message: 'Sin base de datos.' } }) };
		const key = await resolve(db, params);
		if (!key) {
			return {
				failed: fail(404, { [form]: { ok: false, message: 'No encontramos a esa persona.' } })
			};
		}
		return { db, key };
	}

	return {
		// Prender o apagar «puede tener perfiles».
		/** @param {import('@sveltejs/kit').RequestEvent} event */
		permiso: async (event) => {
			requireAdmin(event.locals, event.url);
			const o = await open(event, 'permiso');
			if (!o.db) return o.failed;
			const value = (await event.request.formData()).get('valor');
			if (value !== '1' && value !== '0') {
				return fail(400, { permiso: { ok: false, message: 'No sabemos qué cambiar.' } });
			}
			const on = value === '1';
			const accountId = await accountIdOf(o.db, o.key);
			const result = accountId ? await setProfilePermission(o.db, accountId, on) : 'not_found';
			if (result === 'not_found') {
				return fail(404, {
					permiso: { ok: false, message: 'Esa cuenta no existe o está borrada.' }
				});
			}
			if (result === 'changed') {
				await logAdminAction(o.db, event.locals, {
					action: 'account.profiles_permission',
					targetType: 'account',
					targetId: accountId,
					summary: on
						? 'Le dio a una cuenta el permiso para tener perfiles'
						: 'Le sacó a una cuenta el permiso para tener perfiles',
					detail: { canHaveProfiles: on }
				});
			}
			return {
				permiso: {
					ok: true,
					message: on
						? 'Listo: esta cuenta puede tener perfiles.'
						: 'Listo: esta cuenta ya no puede tener perfiles (no los ve, pero quedan guardados).'
				}
			};
		},

		/** @param {import('@sveltejs/kit').RequestEvent} event */
		addNote: async (event) => {
			const admin = requireAdmin(event.locals, event.url);
			const o = await open(event, 'note');
			if (!o.db) return o.failed;
			if (!o.key.email) {
				return fail(400, {
					note: { ok: false, message: 'Sin mail (cuenta borrada) no se pueden guardar notas.' }
				});
			}
			const v = validateNote(
				String((await event.request.formData()).get('body') ?? '').slice(0, 3000)
			);
			if (!v.ok) return fail(400, { note: { ok: false, message: v.error } });
			await addNote(o.db, { email: o.key.email, body: v.body, by: admin.login });
			// El texto de la nota no va al registro (puede ser sensible): solo que se agregó.
			await logAdminAction(o.db, event.locals, {
				action: 'person.note.add',
				targetType: 'person',
				targetId: await personId(o.key.email),
				summary: 'Agregó una nota a una persona'
			});
			return { note: { ok: true, message: 'Nota guardada.' } };
		},

		/** @param {import('@sveltejs/kit').RequestEvent} event */
		deleteNote: async (event) => {
			requireAdmin(event.locals, event.url);
			const o = await open(event, 'note');
			if (!o.db) return o.failed;
			const id = Number((await event.request.formData()).get('id'));
			if (
				!o.key.email ||
				!Number.isSafeInteger(id) ||
				!(await deleteNote(o.db, { email: o.key.email, id }))
			) {
				return fail(404, { note: { ok: false, message: 'Esa nota ya no está.' } });
			}
			await logAdminAction(o.db, event.locals, {
				action: 'person.note.delete',
				targetType: 'person',
				targetId: await personId(o.key.email),
				summary: 'Borró una nota de una persona'
			});
			return { note: { ok: true, message: 'Nota borrada.' } };
		},

		// «Mostrar» un DNI: el de una orden (`orden`) o el guardado en «Mis datos» (`guardado`).
		// Cada vez queda en Actividad, sin el DNI.
		/** @param {import('@sveltejs/kit').RequestEvent} event */
		dni: async (event) => {
			requireAdmin(event.locals, event.url);
			const o = await open(event, 'dni');
			if (!o.db) return o.failed;
			const form = await event.request.formData();
			const orderId = String(form.get('orden') ?? '');
			const saved = form.get('guardado') === '1';
			if (!orderId && !saved) {
				return fail(400, { dni: { ok: false, key: '', message: 'No sabemos qué DNI mostrar.' } });
			}
			const key = saved ? 'guardado' : `orden:${orderId}`;
			const value = await revealDni(o.db, o.key, saved ? { saved: true } : { orderId });
			if (!value) return fail(404, { dni: { ok: false, key, message: 'No hay DNI.' } });
			if (saved) {
				await logAdminAction(o.db, event.locals, {
					action: 'person.dni.reveal',
					targetType: 'account',
					targetId: await accountIdOf(o.db, o.key),
					summary: 'Miró el DNI guardado en «Mis datos» de una cuenta'
				});
			} else {
				await logAdminAction(o.db, event.locals, {
					action: 'person.dni.reveal',
					targetType: 'order',
					targetId: orderId,
					summary: `Miró el DNI de la compra ${orderReference(orderId)}`
				});
			}
			return { dni: { ok: true, key, value } };
		}
	};
}
