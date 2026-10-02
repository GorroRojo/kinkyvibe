/**
 * Mi rincón → Lo que sigo (interruptores `lo_que_sigo` y `cuentas`; decisión 0025): las
 * etiquetas (y series), perfiles y lugares que sigue la cuenta, con «en mi calendario», «mail
 * cuando se anuncia algo nuevo» y «recordatorio el día antes» por cada una. Ver
 * docs/lo-que-sigo.md.
 *
 * Cada cosa seguida trae su emoji o imagen y su próximo evento; «Agregar» busca etiquetas,
 * series y (con `perfiles_publicos`) perfiles y lugares para seguirlos sin salir de la página.
 *
 * Es también el lugar de «Tu calendario» (el .ics personal): qué entra además de lo seguido y,
 * con el interruptor `series`, el link secreto para suscribirse (crear uno nuevo o revocarlo,
 * ?/crearLink, ?/revocarLink). Mi rincón → Calendario (/mi-rincon/calendario) era otra página
 * para lo mismo: con «Lo que sigo» prendido manda acá.
 *
 * Los botones «Seguir» de las páginas de etiquetas y perfiles mandan acá (?/seguir, ?/dejar).
 * Sin sesión, a /ingresar (y de vuelta a la página de donde vino, si es de este sitio).
 * Todo es privado: `no-store`, `noindex`, y nada de otra cuenta.
 */
import { error, fail } from '@sveltejs/kit';
import { safeRedirect } from '$lib/server/auth.js';
import { logDBError } from '$lib/server/db';
import { siteTagManager } from '$lib/server/etiquetas/source.js';
import { sitePosts } from '$lib/server/contenido/posts.js';
import { perfilesPublicosEnabled, seriesEnabled } from '$lib/server/flags.js';
import { createFeedToken, feedInfo, revokeFeeds } from '$lib/server/series/feeds.js';
import { migrateAccountSubscriptions } from '$lib/server/sigo/avisame.js';
import {
	follow,
	getCalendarPrefs,
	listFollows,
	setCalendarPrefs,
	setFollowOptions,
	unfollow,
	SIGO_MESSAGES
} from '$lib/server/sigo/follows.js';
import { upcomingEvents } from '$lib/server/sigo/notify.js';
import {
	describeFollows,
	followableProfiles,
	followableTags,
	resolveTarget
} from '$lib/server/sigo/targets.js';
import { SIGO_PATH, requireSigoMember } from '$lib/server/sigo/web.js';
import { DEFAULT_FOLLOW_OPTIONS, optionsFromForm, parseTarget } from '$lib/utils/sigo.js';

/** @param {FormData} form @param {string} key */
const field = (form, key) => {
	const v = form.get(key);
	return typeof v === 'string' ? v.slice(0, 300) : '';
};

/**
 * La cuenta, la base y el formulario. Sin sesión, a /ingresar y de vuelta a `volver` (la página
 * del botón «Seguir»), si es una ruta de este sitio.
 *
 * @param {import('./$types').RequestEvent} event
 */
async function actionContext(event) {
	const form = await event.request.formData();
	const back = safeRedirect(field(form, 'volver'), event.url.origin, SIGO_PATH);
	const { db, member } = await requireSigoMember(event, back);
	return { db, member, form };
}

/**
 * Los eventos próximos (listados, sin cancelar), del más cercano al más lejano.
 *
 * @param {App.Platform | undefined} platform
 */
async function nextEvents(platform) {
	const posts = await sitePosts(platform);
	return upcomingEvents(posts, Date.now()).sort(
		(a, b) => new Date(a.meta.start).getTime() - new Date(b.meta.start).getTime()
	);
}

/** @type {import('./$types').PageServerLoad} */
export async function load(event) {
	event.setHeaders({ 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' });
	const { db, member } = await requireSigoMember(event);
	// Los «Avisame si se repite» que la cuenta pidió antes de prender esto: a la lista ya, sin
	// esperar al cron (avisame.js). Si falla, los pasa el cron igual.
	try {
		await migrateAccountSubscriptions(db, { accountId: member.id });
	} catch (e) {
		logDBError('lo que sigo: pasar avisos de la cuenta', e);
	}
	const [tags, events, profilesOn, seriesOn] = await Promise.all([
		siteTagManager(event.platform),
		nextEvents(event.platform),
		perfilesPublicosEnabled(event.platform),
		seriesEnabled(event.platform)
	]);
	return {
		follows: await describeFollows(
			{ db, tags, accountId: member.id, events },
			await listFollows(db, member.id)
		),
		// Qué más va al calendario personal (además de lo seguido).
		calendar: await getCalendarPrefs(db, member.id),
		// El link del calendario personal: lo sirve /ics/mio/<token>.ics, que necesita `series`.
		seriesOn,
		feed: seriesOn ? await feedInfo(db, member.id) : null,
		// Para «Agregar»: las etiquetas y series del árbol y, con perfiles públicos, los perfiles.
		add: {
			tags: followableTags(tags, events),
			profiles: profilesOn ? await followableProfiles(db, member.id) : []
		}
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	seguir: async (event) => {
		const { db, member, form } = await actionContext(event);
		const target = parseTarget(field(form, 'tipo'), field(form, 'clave'));
		const tags = await siteTagManager(event.platform);
		const found = target && (await resolveTarget({ db, tags, accountId: member.id }, target));
		if (!found) return fail(404, { action: 'seguir', error: SIGO_MESSAGES.notFound });
		const r = await follow(db, member.id, found.target, { options: DEFAULT_FOLLOW_OPTIONS });
		if (!r.ok) return fail(r.status, { action: 'seguir', error: r.message });
		return {
			action: 'seguir',
			ok: true,
			title: found.title,
			kind: found.target.kind,
			key: found.target.key,
			options: DEFAULT_FOLLOW_OPTIONS
		};
	},
	dejar: async (event) => {
		const { db, member, form } = await actionContext(event);
		// Sin resolver: se puede dejar de seguir algo que ya no existe o no se ve.
		const target = parseTarget(field(form, 'tipo'), field(form, 'clave'));
		if (!target) return fail(400, { action: 'dejar', error: SIGO_MESSAGES.notFound });
		const r = await unfollow(db, member.id, target);
		if (!r.ok) return fail(r.status, { action: 'dejar', error: r.message });
		return { action: 'dejar', ok: true, kind: target.kind, key: target.key };
	},
	calendario: async (event) => {
		const { db, member, form } = await actionContext(event);
		const on = (/** @type {string} */ k) => form.get(k) === 'on';
		const prefs = { entradas: on('entradas'), participo: on('participo') };
		await setCalendarPrefs(db, member.id, prefs);
		return { action: 'calendario', ok: true, calendar: prefs };
	},
	// El link secreto del calendario personal (como en Mi rincón → Calendario): se ve una sola
	// vez, al crearlo; crear uno nuevo revoca el anterior.
	crearLink: async (event) => {
		const { db, member } = await actionContext(event);
		if (!(await seriesEnabled(event.platform))) error(404, 'Not found');
		const token = await createFeedToken(db, member.id);
		return { action: 'link', ok: true, url: `${event.url.origin}/ics/mio/${token}.ics` };
	},
	revocarLink: async (event) => {
		const { db, member } = await actionContext(event);
		if (!(await seriesEnabled(event.platform))) error(404, 'Not found');
		await revokeFeeds(db, member.id);
		return { action: 'revocarLink', ok: true };
	},
	opciones: async (event) => {
		const { db, member, form } = await actionContext(event);
		const target = parseTarget(field(form, 'tipo'), field(form, 'clave'));
		if (!target) return fail(400, { action: 'opciones', error: SIGO_MESSAGES.notFound });
		const options = optionsFromForm(form);
		const r = await setFollowOptions(db, member.id, target, options);
		if (!r.ok) return fail(r.status, { action: 'opciones', error: r.message, key: target.key });
		return { action: 'opciones', ok: true, kind: target.kind, key: target.key, options };
	}
};
