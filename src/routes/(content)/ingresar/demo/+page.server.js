/**
 * «Entrar como persona de prueba» (docs/demo.md): solo en deploys de preview, con la misma
 * condición que «Entrar como admin de prueba» (`isPreviewDeploy()`). En cualquier otro lado (y
 * con el interruptor `cuentas` apagado) la página y su action dan 404.
 *
 * Solo entra a las cuentas que creó el seed de la demo (ver src/lib/server/demo/personas.js).
 * SvelteKit rechaza los POST de formularios de otros sitios (chequeo de origen).
 */
import { error, redirect } from '@sveltejs/kit';
import { isPreviewDeploy } from '$lib/server/deploy.js';
import { requireCuentas } from '$lib/server/cuentas/web.js';
import { listDemoPersonas, startDemoPersonaSession } from '$lib/server/demo/personas.js';

/** Sin preview, 404 antes de mirar nada más. */
function requirePreview() {
	if (isPreviewDeploy() !== true) error(404, 'Not found');
}

/** @type {import('./$types').PageServerLoad} */
export async function load({ platform, setHeaders }) {
	requirePreview();
	const db = await requireCuentas(platform);
	setHeaders({ 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' });
	return { personas: await listDemoPersonas(db) };
}

/** @type {import('./$types').Actions} */
export const actions = {
	default: async (event) => {
		requirePreview();
		const db = await requireCuentas(event.platform);
		const form = await event.request.formData().catch(() => null);
		const ok = await startDemoPersonaSession({
			preview: isPreviewDeploy(),
			event,
			db,
			key: form?.get('persona')
		});
		if (!ok) error(404, 'Not found');
		redirect(303, '/mi-rincon');
	}
};
