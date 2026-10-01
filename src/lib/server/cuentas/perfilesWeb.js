/**
 * Pegamento de las páginas de perfiles (/mi-rincon/perfiles) con SvelteKit. Las reglas están en
 * perfiles.js; acá solo se lee el formulario y se exige sesión.
 */
import { error, redirect } from '@sveltejs/kit';
import { canHaveProfiles } from './accounts.js';
import { ACCOUNT_VENUE_FIELDS } from './perfiles.js';
import { mailSender, requireCuentas } from './web.js';

/**
 * Lo que necesita `inviteManager` para mandar el aviso por mail sin demorar la respuesta: el
 * mismo camino de mails que los códigos de ingreso (Resend, filtro EMAIL_ALLOWLIST de los
 * previews, remitente de los ajustes) y una forma de correrlo después de responder.
 *
 * En Cloudflare la tarea va a `ctx.waitUntil`: la respuesta sale sin esperarla y el worker
 * sigue vivo hasta que termine. Sin `ctx` (por ejemplo en `vite dev`) se la deja correr sola,
 * sin esperarla: nunca se hace `await`, así quien invita tarda lo mismo haya o no mail.
 *
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @returns {import('./perfiles.js').InviteNotice}
 */
export function inviteNotice(event, db) {
	return {
		send: mailSender(event, db),
		origin: event.url.origin,
		defer(task) {
			const ctx = event.platform?.ctx;
			if (ctx?.waitUntil) ctx.waitUntil(task);
			else task.catch((e) => console.error('[perfiles] aviso de invitación:', e));
		}
	};
}

/**
 * La cuenta de la sesión, o redirect a /ingresar (y 404 con el interruptor apagado). Es la
 * entrada de todas las páginas y actions de /mi-rincon/perfiles: si la cuenta no tiene el
 * permiso "puede tener perfiles" (lo dan les admins), 404, como si las páginas no existieran.
 *
 * @param {import('@sveltejs/kit').RequestEvent} event
 */
export async function requireMember(event) {
	const db = await requireCuentas(event.platform);
	const member = event.locals.member;
	if (!member) redirect(303, `/ingresar?next=${encodeURIComponent(event.url.pathname)}`);
	if (!(await canHaveProfiles(db, member.id))) error(404, 'Not found');
	return { db, member };
}

/**
 * Un campo de texto del formulario (recortado a `max`).
 *
 * @param {FormData} form
 * @param {string} key
 * @param {number} [max]
 */
export function field(form, key, max = 300) {
	const v = form.get(key);
	return typeof v === 'string' ? v.slice(0, max) : '';
}

/**
 * Lo editable de un perfil, como lo manda el formulario. Los largos se recortan con margen: los
 * límites de verdad los controla el tipo `perfil` (y los informa como error).
 *
 * @param {FormData} form
 */
export function profileForm(form) {
	return {
		title: field(form, 'title', 400),
		bio: field(form, 'bio', 2000),
		pronouns: field(form, 'pronouns', 100),
		links: field(form, 'links', 4000),
		visibility: field(form, 'visibility', 20),
		show_members: form.get('show_members') === 'on',
		// Solo el formulario de un lugar trae sus campos (sin ellos, quedan como estaban).
		...(form.has('venue_privacy') ? { venue: venueForm(form) } : {})
	};
}

/** @param {FormData} form */
function venueForm(form) {
	/** @type {Record<string, string>} */
	const venue = { venue_privacy: field(form, 'venue_privacy', 20) };
	for (const key of ACCOUNT_VENUE_FIELDS) venue[key] = field(form, key, 2000);
	return venue;
}
