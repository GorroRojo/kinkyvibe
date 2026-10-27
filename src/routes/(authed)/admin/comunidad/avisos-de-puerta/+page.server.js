/**
 * Comunidad › Avisos de puerta (decisión 0051, docs/tickets.md «Avisos de puerta»): personas que
 * la organización no admite en los eventos que organiza Kinky Vibe. Solo admins: el `load` y cada
 * acción llaman a `requireAdmin`. Es el único lugar donde se ve el motivo.
 *
 * - `agregar`: por mail (si es de una cuenta, queda en la cuenta), con vencimiento obligatorio y
 *   motivo opcional.
 * - `renovar`: vence de nuevo desde hoy.
 * - `quitar`: lo borra.
 * - `buscar`: ¿hay un aviso para este mail? Por POST, para que el mail no quede en la dirección.
 *
 * Cada cambio queda en el registro de actividad, sin el mail ni el motivo.
 */
import { fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB, logDBError } from '$lib/server/db';
import {
	addDoorNotice,
	listDoorNotices,
	removeDoorNotice,
	renewDoorNotice
} from '$lib/server/tickets/doorNotices.js';
import {
	DOOR_NOTICE_PRESETS,
	DOOR_NOTICE_REASON_MAX,
	DOOR_NOTICE_REMIND_DAYS,
	DOOR_NOTICE_TEXT,
	doorNoticeMaxDate
} from '$lib/utils/doorNotices.js';

const NO_STORE = { 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' };

/** @type {Record<string, string>} */
const ERRORS = {
	email: 'Escribí un mail válido.',
	expiry: 'Elegí cuándo vence: 6 meses, 1 año o una fecha de hasta 2 años.',
	exists: 'Ya hay un aviso vigente para ese mail o esa cuenta: renovalo desde la lista.',
	missing: 'Ese aviso ya no existe (lo quitaron o venció).'
};

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders(NO_STORE);
	const now = Date.now();
	const base = {
		text: DOOR_NOTICE_TEXT,
		presets: DOOR_NOTICE_PRESETS.map((p) => ({ id: p.id, label: p.label })),
		maxDate: doorNoticeMaxDate(now),
		reasonMax: DOOR_NOTICE_REASON_MAX,
		remindDays: DOOR_NOTICE_REMIND_DAYS
	};
	const db = getDB(platform);
	if (!db) return { ...base, dbAvailable: false, notices: [] };
	try {
		return { ...base, dbAvailable: true, notices: await listDoorNotices(db, { now }) };
	} catch (error) {
		// Sin la migración 0066 todavía: la página lo dice en vez de romperse.
		logDBError('panel: avisos de puerta', error);
		return { ...base, dbAvailable: false, notices: [] };
	}
}

/** @type {import('./$types').Actions} */
export const actions = {
	agregar: async ({ locals, url, platform, request }) => {
		requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { add: { error: 'No hay base de datos disponible.' } });
		const form = await request.formData();
		const expiry = String(form.get('vence') ?? '');
		const r = await addDoorNotice(db, locals, {
			email: form.get('mail'),
			expiry: expiry === 'fecha' ? form.get('fecha') : expiry,
			reason: form.get('motivo')
		});
		// El mail y el motivo no vuelven en la respuesta: si falla, se vuelven a escribir.
		if (!r.ok) return fail(400, { add: { error: ERRORS[r.error] } });
		return {
			add: {
				message: r.byAccount
					? 'Listo: el aviso quedó en la cuenta con ese mail.'
					: 'Listo: el aviso quedó para ese mail.'
			}
		};
	},
	renovar: async ({ locals, url, platform, request }) => {
		requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { row: { error: 'No hay base de datos disponible.' } });
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const r = await renewDoorNotice(db, locals, { id, expiry: form.get('vence') });
		if (!r.ok) return fail(400, { row: { id, error: ERRORS[r.error] } });
		return { row: { id, message: 'Renovado.' } };
	},
	quitar: async ({ locals, url, platform, request }) => {
		requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { row: { error: 'No hay base de datos disponible.' } });
		const id = String((await request.formData()).get('id') ?? '');
		if (!(await removeDoorNotice(db, locals, { id }))) {
			return fail(404, { row: { id, error: ERRORS.missing } });
		}
		return { removed: { message: 'Aviso quitado.' } };
	},
	buscar: async ({ locals, url, platform, request }) => {
		requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { search: { error: 'No hay base de datos disponible.' } });
		const email = String((await request.formData()).get('mail') ?? '');
		const found = await listDoorNotices(db, { email });
		return { search: { ids: found.map((n) => n.id), none: found.length === 0 } };
	}
};
