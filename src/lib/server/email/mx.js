/**
 * ¿El dominio de un mail recibe correo? Consulta el MX por DNS sobre HTTPS (la API JSON del
 * resolver 1.1.1.1 de Cloudflare) antes de mandar el mail de las entradas, para no mandar a un
 * dominio que no existe (un tipeo como `gmail.con`): ese envío rebota seguro y el rebote pesa
 * sobre la cuenta de Resend, la misma que manda las entradas (docs/mails.md, «Rebotes y quejas»).
 *
 * Solo dice que no ante una respuesta segura: el dominio no existe (NXDOMAIN, `Status` 3) o
 * publica el MX nulo del RFC 7505 (`0 .`, «no recibo correo»). Un dominio sin MX pero con
 * dirección sigue recibiendo (MX implícito), así que pasa. Cualquier otra cosa (error de red,
 * tiempo agotado, SERVFAIL, respuesta rara) también pasa: ante la duda, el mail sale.
 *
 * El resultado queda un día en la caché de Cloudflare del centro de datos (`caches.default`),
 * con el dominio en la clave. Donde no hay esa caché (vitest, `vite dev`, el build) no consulta
 * nada y devuelve `true`: el chequeo corre solo en Cloudflare.
 */

/** El resolver de Cloudflare (1.1.1.1) con la API JSON; un Worker no puede pedirle a una IP. */
const DOH_URL = 'https://cloudflare-dns.com/dns-query';

/** Lo que esperamos al resolver: corto, el mail no puede quedar colgado de esto. */
const DOH_TIMEOUT_MS = 1500;

/** Un día. */
const CACHE_MAX_AGE = 86400;

/** Tipo MX en las respuestas DoH. */
const TYPE_MX = 15;

/**
 * La caché de Cloudflare del centro de datos, o `null` donde no hay.
 * @returns {Cache | null}
 */
function edgeCache() {
	if (typeof caches === 'undefined') return null;
	const all = /** @type {any} */ (caches);
	return all.default ?? null;
}

/**
 * El dominio de una dirección, en minúsculas, o `''`.
 * @param {string} email
 */
export function mailDomain(email) {
	const at = String(email ?? '').lastIndexOf('@');
	if (at < 0) return '';
	return String(email)
		.slice(at + 1)
		.trim()
		.replace(/\.$/, '')
		.toLowerCase();
}

/**
 * Lee una respuesta DoH en JSON: `false` solo si el dominio no existe o publica el MX nulo.
 * @param {unknown} answer
 */
export function acceptsMailFromDoh(answer) {
	const data = /** @type {{ Status?: number, Answer?: { type?: number, data?: string }[] }} */ (
		answer
	);
	if (!data || typeof data !== 'object') return true;
	if (data.Status === 3) return false;
	if (data.Status !== 0) return true;
	const mx = (data.Answer ?? []).filter((a) => a?.type === TYPE_MX);
	if (mx.length === 0) return true;
	// MX nulo: un solo registro, prioridad 0 y destino «.».
	return !mx.every((a) => /^0\s+\.?$/.test(String(a.data ?? '').trim()));
}

/**
 * `false` solo si es seguro que el dominio de `email` no recibe correo (ver arriba).
 *
 * @param {string} email
 * @param {{ fetch?: typeof fetch, cache?: Cache | null }} [deps] para los tests
 * @returns {Promise<boolean>}
 */
export async function domainAcceptsMail(email, { fetch: fetchFn = fetch, cache } = {}) {
	const store = cache === undefined ? edgeCache() : cache;
	if (!store) return true;
	const domain = mailDomain(email);
	if (!domain || !/^[a-z0-9.-]+$/.test(domain)) return true;
	const key = `https://kinkyvibe.ar/__mx/${encodeURIComponent(domain)}`;
	try {
		const hit = await store.match(key);
		if (hit) return (await hit.text()) !== 'no';
	} catch {
		// Sin caché: se consulta igual.
	}
	let ok = true;
	try {
		const res = await fetchFn(`${DOH_URL}?name=${encodeURIComponent(domain)}&type=MX`, {
			headers: { accept: 'application/dns-json' },
			signal: AbortSignal.timeout(DOH_TIMEOUT_MS)
		});
		if (!res.ok) return true;
		ok = acceptsMailFromDoh(await res.json());
	} catch {
		return true;
	}
	try {
		await store.put(
			key,
			new Response(ok ? 'si' : 'no', {
				headers: { 'cache-control': `max-age=${CACHE_MAX_AGE}` }
			})
		);
	} catch {
		// No guardarlo no cambia la respuesta.
	}
	return ok;
}
