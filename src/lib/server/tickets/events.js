/**
 * Lee la configuración de entradas de los eventos (frontmatter de src/lib/posts/calendario).
 */
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { isValidEventSlug } from '$lib/server/db/interest.js';
import { parseTicketConfig } from './config.js';

const eventFiles = import.meta.glob('/src/lib/posts/calendario/*.md');

/**
 * DEV ONLY: `TICKETS_DEV_FIXTURE=slug1,slug2` agrega entradas de prueba a esos eventos sin tocar
 * sus archivos (para probar la compra en local y en Playwright). `dev` es `false` en el build,
 * así que en producción esto no existe.
 *
 * @param {string} slug
 * @returns {Record<string, any> | null}
 */
function devFixture(slug) {
	if (!dev) return null;
	const slugs = (env.TICKETS_DEV_FIXTURE ?? '').split(',').map((s) => s.trim());
	if (!slugs.includes(slug)) return null;
	return {
		status: 'abierto',
		tickets: [
			{ id: 'general', name: 'General', price: 8000, capacity: 500 },
			{ id: 'reducida', name: 'Reducida', price: 5000, capacity: 3 }
		],
		tickets_close: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
	};
}

/**
 * @param {string} slug
 * @returns {Promise<Record<string, any> | null>} frontmatter de un evento publicado
 */
async function loadMeta(slug) {
	if (!isValidEventSlug(slug) || slug.startsWith('_')) return null;
	const importer = eventFiles[`/src/lib/posts/calendario/${slug}.md`];
	if (!importer) return null;
	const mod = /** @type {{ metadata?: Record<string, any> }} */ (await importer());
	const meta = mod.metadata;
	if (!meta || meta.force_unpublished) return null;
	const fixture = devFixture(slug);
	return fixture ? { ...meta, ...fixture } : meta;
}

/**
 * Configuración de entradas de un evento publicado, o `null` si no vende entradas (o si la
 * configuración es inválida, en cuyo caso se loguea el motivo).
 *
 * @param {string} slug
 * @returns {Promise<import('./config.js').EventTickets | null>}
 */
export async function getEventTickets(slug) {
	const meta = await loadMeta(slug);
	if (!meta) return null;
	try {
		return parseTicketConfig(meta);
	} catch (error) {
		console.error(
			`[tickets] configuración inválida en ${slug}:`,
			/** @type {Error} */ (error).message
		);
		return null;
	}
}

/**
 * Todos los eventos publicados que venden entradas.
 *
 * @returns {Promise<{ slug: string, config: import('./config.js').EventTickets }[]>}
 */
export async function listTicketedEvents() {
	const out = [];
	for (const path of Object.keys(eventFiles)) {
		const slug = path.split('/').pop()?.replace(/\.md$/, '') ?? '';
		const config = await getEventTickets(slug);
		if (config) out.push({ slug, config });
	}
	out.sort((a, b) => String(b.config.start ?? '').localeCompare(String(a.config.start ?? '')));
	return out;
}
