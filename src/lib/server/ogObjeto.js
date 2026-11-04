/**
 * La vista previa de un objeto sin imagen propia (docs/compartir.md): lo que va en la imagen de un
 * evento, un material, un perfil o una entrada de la Kinkipedia como lo ve alguien sin cuenta (lo
 * que lee la ruta `/og/objeto/…` para dibujarla y comprobar el hash), los nombres de las etiquetas
 * y el dibujo con el dibujante del Worker. El diseño y el hash: src/lib/utils/ogObjeto.js.
 */
import { getDB } from '$lib/server/db';
import { siteContent, siteEvent } from '$lib/server/contenido/posts.js';
import { eventPageVenue } from '$lib/server/amigues/venues.js';
import { findProfileForPage } from '$lib/server/amigues/pages.js';
import { toPublic } from '$lib/server/amigues/asPost.js';
import { siteTagSource, tagManagerOf } from '$lib/server/etiquetas/source.js';
import { siteWikiEntry, wikiLinkedTags, wikiPost } from '$lib/server/wiki/site.js';
import { ANON } from '$lib/server/objects/visibility.js';
import { toBase64 } from '$lib/utils/base64.js';
import { OG_CARD_SIZE } from '$lib/utils/ogCards.js';
import { COLLAGE_FONTS, COLLAGE_LOGO } from '$lib/utils/ogCollage.js';
import {
	eventCardSpec,
	materialCardSpec,
	objectCardImage,
	objectCardTree,
	profileCardSpec,
	wikiCardSpec
} from '$lib/utils/ogObjeto.js';
import { staticFile } from './ogImage.js';

/** Quien mira sin cuenta: lo que ve la app que arma la vista previa. */
const ANON_LOCALS = /** @type {App.Locals} */ (/** @type {unknown} */ ({}));

/** La clave en R2 de una tarjeta ya dibujada. @param {string} hash */
export const objectCardStorageKey = (hash) => `og/objeto-${hash}.jpg`;

/**
 * Los nombres (como se ven) de las etiquetas de la tarjeta: las que tienen algo propio en la
 * Kinkipedia (las mismas cuyo chip lleva a la wiki, `wikiLinkedTags`), en su orden. Sin base,
 * ninguna.
 * @param {App.Platform | undefined} platform
 * @param {readonly string[] | null | undefined} wikiTags lo que devolvió `wikiLinkedTags`
 */
export async function cardTagNames(platform, wikiTags) {
	if (!wikiTags?.length) return [];
	const tags = tagManagerOf(await siteTagSource(platform));
	return wikiTags.map((id) => tags.get(id)?.visible_name ?? id);
}

/**
 * El árbol de etiquetas del sitio (para el nombre del formato de un material).
 * @param {App.Platform | undefined} platform
 */
export async function siteTags(platform) {
	return tagManagerOf(await siteTagSource(platform));
}

/**
 * La imagen de la vista previa de un evento sin portada, para `SeoHead` (`card`). Con lo que la
 * página ya leyó: la meta, el lugar según su privacidad y las etiquetas de la Kinkipedia.
 * @param {App.Platform | undefined} platform
 * @param {string} slug
 * @param {{ meta: Record<string, any>, venue?: any, wikiTags?: readonly string[] }} page
 */
export async function eventCard(platform, slug, { meta, venue, wikiTags }) {
	if (meta?.featured) return null;
	const tagNames = await cardTagNames(platform, wikiTags);
	return objectCardImage('evento', slug, eventCardSpec({ meta, venue, tagNames }));
}

/**
 * La de un material sin portada.
 * @param {App.Platform | undefined} platform
 * @param {string} slug
 * @param {{ meta: Record<string, any>, wikiTags?: readonly string[] }} page
 */
export async function materialCard(platform, slug, { meta, wikiTags }) {
	if (meta?.featured) return null;
	const [tagNames, tagManager] = await Promise.all([
		cardTagNames(platform, wikiTags),
		siteTags(platform)
	]);
	return objectCardImage('material', slug, materialCardSpec({ meta, tagManager, tagNames }));
}

/**
 * La de un perfil sin imagen. Un perfil que pidió no aparecer en buscadores sigue con la tarjeta
 * del sitio (sin nada propio en la vista previa, docs/amigues.md): ninguna.
 * @param {App.Platform | undefined} platform
 * @param {string} slug la dirección de la página
 * @param {{ profile: Record<string, any>, noindex?: boolean, wikiTags?: readonly string[] }} page
 */
export async function profileCard(platform, slug, { profile, noindex, wikiTags }) {
	if (noindex || profile?.noindex || profile?.image) return null;
	const tagNames = await cardTagNames(platform, wikiTags);
	return objectCardImage(
		'perfil',
		slug,
		profileCardSpec({ title: profile?.title, kind: profile?.kind, bio: profile?.bio, tagNames })
	);
}

/**
 * La de una entrada de la Kinkipedia.
 * @param {string} slug la dirección de la entrada
 * @param {{ title?: unknown, summary?: unknown }} meta
 */
export function wikiCard(slug, meta) {
	return objectCardImage(
		'wiki',
		slug,
		wikiCardSpec({ title: meta?.title, summary: meta?.summary })
	);
}

/**
 * Lo que va en la imagen de un objeto como lo ve alguien sin cuenta, o `null` si no existe, no se
 * ve sin cuenta o no lleva tarjeta propia (tiene imagen, o es un perfil fuera de los buscadores).
 * Lo lee la ruta de la imagen: la página arma lo mismo con lo que ya tiene (las funciones de
 * arriba), así el hash coincide.
 * @param {App.Platform | undefined} platform
 * @param {import('$lib/utils/ogObjeto.js').ObjectCardKind} kind
 * @param {string} slug
 * @returns {Promise<import('$lib/utils/ogObjeto.js').ObjectCardSpec | null>}
 */
export async function objectCardSpecFor(platform, kind, slug) {
	if (kind === 'evento') {
		const [post, venue] = await Promise.all([
			siteEvent(platform, slug, { viewer: ANON, html: false }),
			eventPageVenue(getDB(platform), slug, ANON_LOCALS)
		]);
		if (!post || post.meta.featured || post.meta.redirect) return null;
		const tagNames = await cardTagNames(platform, await wikiLinkedTags(platform, post.meta.tags));
		return eventCardSpec({ meta: post.meta, venue, tagNames });
	}
	if (kind === 'material') {
		const post = await siteContent(platform, 'material', slug, { viewer: ANON, html: false });
		if (!post || post.meta.featured || post.meta.redirect) return null;
		const [tagNames, tagManager] = await Promise.all([
			wikiLinkedTags(platform, post.meta.tags).then((ids) => cardTagNames(platform, ids)),
			siteTags(platform)
		]);
		return materialCardSpec({ meta: post.meta, tagManager, tagNames });
	}
	if (kind === 'perfil') {
		const db = getDB(platform);
		if (!db) return null;
		const found = await findProfileForPage(db, slug, ANON_LOCALS);
		if (!found) return null;
		const profile = await toPublic(found.object, found.legacySlug, found.avatarKey ?? undefined);
		if (profile.noindex || profile.image) return null;
		const tagNames = await cardTagNames(platform, await wikiLinkedTags(platform, profile.tags));
		return profileCardSpec({
			title: profile.title,
			kind: profile.kind,
			bio: profile.bio,
			tagNames
		});
	}
	if (kind === 'wiki') {
		const { entry, tags } = await siteWikiEntry(platform, slug);
		if (!entry) return null;
		const { meta } = wikiPost(entry, tags);
		return wikiCardSpec({ title: meta.title, summary: meta.summary });
	}
	return null;
}

/**
 * Dibuja la tarjeta de un objeto (JPEG), con las fuentes y el logo de los archivos estáticos y el
 * dibujante del Worker (`OG_RENDER`), que mide los textos para repartir el lugar.
 * @param {import('$lib/utils/ogObjeto.js').ObjectCardSpec} spec
 * @param {{ env: import('./ogImage.js').OgEnv, fetch: typeof fetch, origin: string }} ctx
 */
export async function renderObjectCard(spec, { env, fetch: fetchFn, origin }) {
	const render = env.OG_RENDER;
	if (!render) throw new Error('Sin dibujante (OG_RENDER)');
	const [fonts, logo] = await Promise.all([
		Promise.all(
			COLLAGE_FONTS.map(async (f) => ({
				name: f.name,
				weight: f.weight,
				data: await staticFile(env, fetchFn, origin, f.file)
			}))
		),
		staticFile(env, fetchFn, origin, COLLAGE_LOGO)
	]);
	const logoSrc = `data:image/png;base64,${toBase64(logo)}`;
	/** @param {import('../../../worker/og-render.js').OgMeasure} measure */
	const build = (measure) => objectCardTree(spec, { logo: logoSrc, measure });
	return render(build, {
		...OG_CARD_SIZE,
		fonts
	});
}
