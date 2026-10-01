/**
 * Pegamento de las páginas de perfiles (/mi-rincon/perfiles) con SvelteKit. Las reglas están en
 * perfiles.js; acá solo se lee el formulario y se exige sesión.
 */
import { redirect } from '@sveltejs/kit';
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
 * La cuenta de la sesión, o redirect a /ingresar (y 404 con el interruptor apagado).
 *
 * @param {import('@sveltejs/kit').RequestEvent} event
 */
export async function requireMember(event) {
	const db = await requireCuentas(event.platform);
	const member = event.locals.member;
	if (!member) redirect(303, `/ingresar?next=${encodeURIComponent(event.url.pathname)}`);
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
		show_members: form.get('show_members') === 'on'
	};
}
