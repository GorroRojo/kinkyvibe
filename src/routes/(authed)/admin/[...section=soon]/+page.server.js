/**
 * Página genérica "Próximamente": la que abren las URLs reservadas de las secciones aprobadas que
 * todavía no existen (`soon: true` en `$lib/admin/nav.js`; el matcher `soon` deja pasar solo
 * esas). Dice qué va a hacer la sección y en qué fase llega. Solo admins, como todo el panel.
 */
import { error } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { navArea, soonItemAt } from '$lib/admin/nav.js';

/** @type {import('./$types').PageServerLoad} */
export function load({ locals, url }) {
	requireAdmin(locals, url);
	const item = soonItemAt(url.pathname);
	if (!item) error(404, 'Not found');
	return {
		soon: {
			id: item.id,
			label: item.label,
			phase: item.phase ?? null,
			text: item.soonText ?? '',
			area: navArea(item.area)?.label ?? ''
		}
	};
}
