/**
 * Conector de Claude: la pantalla de permiso de OAuth (docs/conector-claude.md). Claude manda acá a
 * le admin; sin sesión, `requireAdmin` le lleva a entrar con GitHub y le trae de vuelta. Con
 * «Permitir», vuelve a Claude con un código de un solo uso (60 s); con «Cancelar», con
 * `access_denied`. Solo admins de la lista (le admin de prueba, solo en un preview).
 * Apagado, 404.
 */
import { error, redirect } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { connectorDB } from '$lib/server/mcp/http.js';
import {
	adminById,
	authorizeRedirect,
	isLoopbackRedirect,
	issueCode,
	parseAuthorizeRequest
} from '$lib/server/mcp/oauth.js';

/**
 * Le admin con sesión que puede conectar (`adminById`: les de la lista; le de prueba, solo en un
 * preview), o 403.
 * @param {App.Locals} locals
 * @param {URL} url
 */
function realAdmin(locals, url) {
	const user = requireAdmin(locals, url);
	const admin = adminById(user.id);
	if (!admin) error(403, 'El conector de Claude es solo para les admins de la lista.');
	return admin;
}

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	await connectorDB(platform);
	setHeaders({ 'cache-control': 'private, no-store' });
	const parsed = parseAuthorizeRequest(url.searchParams, url.origin);
	if (!parsed.ok && !parsed.redirect) error(400, parsed.message);
	const admin = realAdmin(locals, url);
	if (!parsed.ok) redirect(303, /** @type {string} */ (parsed.redirect));
	const { req } = parsed;
	return {
		login: admin.login,
		destination: new URL(req.redirectUri).host,
		loopback: isLoopbackRedirect(req.redirectUri),
		// Lo que vuelve en el formulario, tal cual llegó (se controla otra vez al permitir).
		fields: Object.fromEntries(
			[
				'response_type',
				'client_id',
				'redirect_uri',
				'code_challenge',
				'code_challenge_method',
				'state',
				'scope',
				'resource'
			]
				.map((k) => [k, url.searchParams.get(k)])
				.filter(([, v]) => v !== null)
		)
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	permitir: async ({ request, locals, url, platform }) => {
		const db = await connectorDB(platform);
		const form = await request.formData();
		const parsed = parseAuthorizeRequest(form, url.origin);
		if (!parsed.ok && !parsed.redirect) error(400, parsed.message);
		const admin = realAdmin(locals, url);
		if (!parsed.ok) redirect(303, /** @type {string} */ (parsed.redirect));
		const code = await issueCode(db, admin, parsed.req);
		const destination = new URL(parsed.req.redirectUri).host;
		await logAdminAction(
			db,
			{ user: admin },
			{
				action: 'conector.autorizar',
				summary: `Conector de Claude: autorizó una conexión (vuelve a ${destination})`
			}
		);
		redirect(
			303,
			authorizeRedirect(parsed.req.redirectUri, url.origin, { code, state: parsed.req.state })
		);
	},

	cancelar: async ({ request, locals, url, platform }) => {
		await connectorDB(platform);
		const form = await request.formData();
		const parsed = parseAuthorizeRequest(form, url.origin);
		if (!parsed.ok && !parsed.redirect) error(400, parsed.message);
		realAdmin(locals, url);
		const target = parsed.ok
			? authorizeRedirect(parsed.req.redirectUri, url.origin, {
					error: 'access_denied',
					error_description: 'Le admin no dio permiso.',
					state: parsed.req.state
				})
			: /** @type {string} */ (parsed.redirect);
		redirect(303, target);
	}
};
