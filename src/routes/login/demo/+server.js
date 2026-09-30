import { error, redirect } from '@sveltejs/kit';
import { isPreviewDeploy } from '$lib/server/deploy.js';
import { startDemoSession } from '$lib/server/demo/login.js';

/**
 * POST /login/demo: sesión de "admin de prueba", solo en deploys de preview (docs/demo.md).
 * SvelteKit rechaza los POST de formularios de otros sitios (chequeo de origen).
 * @type {import('./$types').RequestHandler}
 */
export async function POST({ request, cookies, url }) {
	const data = await request.formData().catch(() => null);
	const target = startDemoSession({
		preview: isPreviewDeploy(),
		cookies,
		url,
		redirectTo: data?.get('redirectTo')
	});
	if (!target) error(404, 'Not found');
	redirect(303, target);
}
