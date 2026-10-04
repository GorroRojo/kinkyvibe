/**
 * Aviso anónimo de un paso de la compra (docs/analiticas.md): `{ step, slug }` con `step` en
 * `datos` o `pagar`. Lo manda TicketPurchase.svelte con `navigator.sendBeacon`. No usa cookies
 * ni guarda la IP: escribe un punto en Analytics Engine (sin el binding, no hace nada).
 */
import { isBot } from '$lib/server/analytics/classify.js';
import { trackFunnel } from '$lib/server/analytics/track.js';
import {
	BEACON_LIMIT,
	MAX_BEACON_BYTES,
	createWindowLimiter,
	parseBeacon
} from '$lib/server/analytics/beacon.js';

const limiter = createWindowLimiter(BEACON_LIMIT);

const noStore = { 'cache-control': 'no-store' };

/** @type {import('./$types').RequestHandler} */
export async function POST({ request, url, platform }) {
	// Solo desde el propio sitio.
	const origin = request.headers.get('origin');
	const site = request.headers.get('sec-fetch-site');
	if ((origin && origin !== url.origin) || (site && site !== 'same-origin')) {
		return new Response(null, { status: 403, headers: noStore });
	}
	const length = Number(request.headers.get('content-length') ?? 0);
	if (length > MAX_BEACON_BYTES) return new Response(null, { status: 413, headers: noStore });
	const text = (await request.text()).slice(0, MAX_BEACON_BYTES + 1);
	const parsed = parseBeacon(text);
	if (!parsed.ok) return new Response(null, { status: 400, headers: noStore });
	if (isBot(request.headers.get('user-agent'))) {
		return new Response(null, { status: 204, headers: noStore });
	}
	if (!limiter.hit()) return new Response(null, { status: 429, headers: noStore });
	trackFunnel(platform?.env, { slug: parsed.slug, step: parsed.step });
	return new Response(null, { status: 204, headers: noStore });
}
