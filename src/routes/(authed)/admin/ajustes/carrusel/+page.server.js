/**
 * Ajustes › Comunicación › Carrusel de la portada (docs/estilo.md, «Carrusel de la portada»):
 *
 * - **Estilo**: «Rotar» (cada diapositiva con un estilo distinto, en orden) o uno de los cinco
 *   fijo para todo el carrusel. En `ticket_settings` (src/lib/server/carrusel.js). Cada evento
 *   puede elegir el suyo en Editar → Datos (manda sobre esto).
 * - **Qué entra**: de cuántos días para atrás es «nuevo» (material, perfiles, la Kinkipedia) y
 *   cuántas diapositivas como mucho.
 * - **Cómo se ve ahora**: lo que entra hoy, con su estilo y sus colores.
 * - **Colores de los flyers**: las imágenes subidas antes de que se calcularan los colores; el
 *   navegador de le admin los calcula («Calcular los colores que faltan») y los manda de a tandas
 *   (`?/colores`). Al subir una imagen nueva se calculan solos.
 *
 * Solo admins; cada guardado del estilo queda en el registro de actividad.
 */
import { fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { getDB, logDBError } from '$lib/server/db';
import { carruselPortadaEnabled } from '$lib/server/flags.js';
import { currentSitePosts } from '$lib/server/contenido/posts.js';
import {
	carruselSlides,
	readCarruselAjustes,
	saveCarruselCantidad,
	saveCarruselModo
} from '$lib/server/carrusel.js';
import { siteWikiPosts } from '$lib/server/wiki/site.js';
import { CARRUSEL_DIAS_RANGO, CARRUSEL_MAXIMO_RANGO, CARRUSEL_TIPOS } from '$lib/utils/carrusel.js';
import { imagesWithoutColors, saveImageColors } from '$lib/server/media/library.js';
import { carruselModo, estiloDelEvento, nombreDelEstilo } from '$lib/utils/carruselEstilos.js';

/** Cuántas imágenes entran en una tanda de `?/colores`. */
const COLORS_PER_POST = 40;

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const db = getDB(platform);
	const saved = await readCarruselAjustes(db);
	const [enabled, posts, wiki, missing] = await Promise.all([
		carruselPortadaEnabled(platform),
		currentSitePosts(platform).catch(() => []),
		siteWikiPosts(platform).catch(() => []),
		db
			? imagesWithoutColors(db).catch((error) => {
					logDBError('imágenes sin colores', error);
					return { total: 0, images: [] };
				})
			: { total: 0, images: [] }
	]);
	const slides = await carruselSlides(platform, [...posts, ...wiki], { ajustes: saved });
	return {
		dbAvailable: Boolean(db),
		enabled,
		modo: saved.modo,
		dias: saved.dias,
		maximo: saved.maximo,
		rangos: { dias: CARRUSEL_DIAS_RANGO, maximo: CARRUSEL_MAXIMO_RANGO },
		updatedAt: saved.updatedAt,
		updatedBy: saved.updatedBy,
		slides: slides.map((s) => {
			const postID = s.path.split('/').filter(Boolean).pop() ?? '';
			const evento = s.meta.category === 'calendario';
			return {
				path: s.path,
				title: String(s.meta.title ?? ''),
				tipo: CARRUSEL_TIPOS[/** @type {keyof typeof CARRUSEL_TIPOS} */ (s.meta.category)] ?? '',
				featured: typeof s.meta.featured === 'string' ? s.meta.featured : null,
				start: evento ? (s.meta.start ?? null) : null,
				estiloDelEvento: evento ? estiloDelEvento(s.meta) : null,
				colors: s.colors,
				// El estilo por evento solo existe en los eventos; lo demás usa el de Ajustes.
				editHref: evento ? `/admin/eventos/${encodeURIComponent(postID)}/editar#sec-datos` : null
			};
		}),
		missing
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	save: async ({ locals, url, platform, request }) => {
		const admin = requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { error: 'Sin base de datos.' });
		const modo = carruselModo((await request.formData()).get('modo'));
		const before = (await readCarruselAjustes(db)).modo;
		try {
			await saveCarruselModo(db, modo, { by: admin.login });
		} catch (error) {
			logDBError('guardar el estilo del carrusel', error);
			return fail(500, { error: 'No se pudo guardar. Probá de nuevo.' });
		}
		await logAdminAction(db, locals, {
			action: 'settings.save',
			targetType: 'settings',
			targetId: 'carrusel_estilo',
			summary:
				before === modo
					? 'Guardó el estilo del carrusel de la portada (sin cambios)'
					: `Cambió el estilo del carrusel de la portada: ${nombreDelEstilo(before)} → ${nombreDelEstilo(modo)}`,
			detail: { before, after: modo }
		});
		return { ok: true, message: 'Guardado. La portada lo muestra en menos de un minuto.' };
	},

	cantidad: async ({ locals, url, platform, request }) => {
		const admin = requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { error: 'Sin base de datos.' });
		const form = await request.formData();
		const values = {
			dias: String(form.get('dias') ?? ''),
			maximo: String(form.get('maximo') ?? '')
		};
		const dias = Number(values.dias);
		const maximo = Number(values.maximo);
		/** @type {Record<string, string>} */
		const errors = {};
		const { dias: rd, maximo: rm } = { dias: CARRUSEL_DIAS_RANGO, maximo: CARRUSEL_MAXIMO_RANGO };
		if (!Number.isInteger(dias) || dias < rd.min || dias > rd.max)
			errors.dias = `Escribí un número de días entre ${rd.min} y ${rd.max}.`;
		if (!Number.isInteger(maximo) || maximo < rm.min || maximo > rm.max)
			errors.maximo = `Escribí un número entre ${rm.min} y ${rm.max}.`;
		if (Object.keys(errors).length) {
			return fail(400, { cantidad: true, error: 'Revisá lo marcado.', errors, values });
		}
		const before = await readCarruselAjustes(db);
		try {
			await saveCarruselCantidad(db, { dias, maximo }, { by: admin.login });
		} catch (error) {
			logDBError('guardar qué entra en el carrusel', error);
			return fail(500, { cantidad: true, error: 'No se pudo guardar. Probá de nuevo.', values });
		}
		await logAdminAction(db, locals, {
			action: 'settings.save',
			targetType: 'settings',
			targetId: 'carrusel_cantidad',
			summary: `Cambió qué entra en el carrusel de la portada: lo nuevo de ${dias} días, hasta ${maximo}`,
			detail: { before: { dias: before.dias, maximo: before.maximo }, after: { dias, maximo } }
		});
		return {
			cantidad: true,
			ok: true,
			message: 'Guardado. La portada lo muestra en menos de un minuto.'
		};
	},

	colores: async ({ locals, url, platform, request }) => {
		const admin = requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { error: 'Sin base de datos.' });
		let items;
		try {
			items = JSON.parse(String((await request.formData()).get('items') ?? '[]'));
		} catch {
			return fail(400, { error: 'No llegaron los colores. Probá de nuevo.' });
		}
		if (!Array.isArray(items) || items.length > COLORS_PER_POST) {
			return fail(400, { error: 'No llegaron los colores. Probá de nuevo.' });
		}
		const result = await saveImageColors(db, items, { actor: admin.login });
		return { ok: true, ...result };
	}
};
