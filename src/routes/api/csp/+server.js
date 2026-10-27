/**
 * POST /api/csp: los reportes de la Content-Security-Policy en modo solo reporte (svelte.config.js;
 * docs/workers-migracion.md, «Headers de seguridad y CSP»). Loguea solo la directiva y el origen
 * de lo que se habría bloqueado (sin la ruta ni la query, que pueden llevar datos), para verlo en
 * los logs del Worker antes de aplicar la política. Nunca guarda nada. Siempre 204.
 */
import { createWindowLimiter } from '$lib/server/analytics/beacon.js';
import { readJsonCapped } from '$lib/server/http/body.js';

/** Como mucho tantos reportes logueados por minuto y por isolate. */
const limiter = createWindowLimiter({ limit: 60, windowMs: 60_000 });

const noContent = () =>
	new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });

/**
 * Solo el origen de una URL (o la palabra clave, como `inline` o `eval`).
 * @param {unknown} value
 */
function originOf(value) {
	if (typeof value !== 'string' || !value) return '';
	try {
		return new URL(value).origin;
	} catch {
		return value.slice(0, 40).replace(/[^a-z0-9:-]/gi, '');
	}
}

/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
	const read = await readJsonCapped(request, 8192);
	if (!read.ok || !limiter.hit()) return noContent();
	/** @type {any} */
	const report = /** @type {any} */ (read.value)?.['csp-report'] ?? {};
	const directive = String(report['effective-directive'] ?? report['violated-directive'] ?? '')
		.split(' ')[0]
		.slice(0, 40);
	const page = originOf(report['document-uri'])
		? new URL(report['document-uri']).pathname.split('/')[1]
		: '';
	console.log(
		`[csp] ${directive || '?'} bloquearía ${originOf(report['blocked-uri']) || '?'} (en /${String(page).slice(0, 30)})`
	);
	return noContent();
}
