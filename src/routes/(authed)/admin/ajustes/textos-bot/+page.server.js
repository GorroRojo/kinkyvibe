/**
 * Ajustes › Comunicación › Textos del bot: todo lo que dice el bot de Telegram (mensajes, botones,
 * avisos de los botones y las descripciones del menú «/»), cada texto con su original, «Volver al
 * texto original», sus variables y una vista previa. Se guardan en `ticket_settings`
 * (src/lib/server/telegram/texts.js); los originales y la validación, en
 * src/lib/utils/botTexts.js. Solo admins (`requireAdmin` en el `load` y en la action); cada
 * guardado queda en el registro de actividad (solo qué claves cambiaron). Ver docs/telegram.md.
 */
import { fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { getDB, logDBError } from '$lib/server/db';
import { readBotTextOverrides, saveBotTextOverrides } from '$lib/server/telegram/texts.js';
import {
	BOT_TEXT_FIELDS,
	BOT_TEXT_KIND_LABELS,
	BOT_TEXT_SECTIONS,
	validateBotTexts
} from '$lib/utils/botTexts.js';

/** Un poco más que el texto más largo que se puede guardar (el resto lo avisa la validación). */
const RAW_MAX = 4200;

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const db = getDB(platform);
	const saved = await readBotTextOverrides(db);
	return {
		dbAvailable: Boolean(db),
		sections: BOT_TEXT_SECTIONS,
		fields: BOT_TEXT_FIELDS,
		kinds: BOT_TEXT_KIND_LABELS,
		saved: saved.overrides,
		updatedAt: saved.updatedAt,
		updatedBy: saved.updatedBy
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	save: async ({ locals, url, platform, request }) => {
		const admin = requireAdmin(locals, url);
		const db = getDB(platform);
		const form = Object.fromEntries(
			[...(await request.formData())].map(([k, v]) => [k, String(v).slice(0, RAW_MAX)])
		);
		const valid = validateBotTexts(form);
		if (!valid.ok) {
			return fail(400, { error: 'Revisá lo marcado.', errors: valid.errors, values: valid.values });
		}
		if (!db) return fail(503, { error: 'Sin base de datos.', errors: {}, values: form });
		const before = (await readBotTextOverrides(db)).overrides;
		try {
			await saveBotTextOverrides(db, valid.value, { by: admin.login });
		} catch (error) {
			logDBError('guardar textos del bot', error);
			return fail(500, { error: 'No se pudo guardar. Probá de nuevo.', errors: {}, values: form });
		}
		const changed = BOT_TEXT_FIELDS.map((f) => f.key).filter(
			(k) => (before[k] ?? null) !== (valid.value[k] ?? null)
		);
		const commands = changed.some((k) => k.startsWith('comandos.'));
		// En el registro: solo qué claves cambiaron (nunca el texto, que podría traer cualquier cosa).
		await logAdminAction(db, locals, {
			action: 'settings.save',
			targetType: 'settings',
			targetId: 'telegram_bot_texts',
			summary: changed.length
				? `Cambió ${changed.length === 1 ? 'un texto' : `${changed.length} textos`} del bot de Telegram`
				: 'Guardó los textos del bot de Telegram (sin cambios)',
			detail: { changed, custom: Object.keys(valid.value) }
		});
		return {
			ok: true,
			message: commands
				? 'Guardado: el bot ya contesta así. Los comandos del menú «/» se registran solos en la próxima corrida (hasta 15 minutos), o ya con «Actualizar comandos del bot» en Automatizaciones.'
				: 'Guardado: el bot ya contesta así.'
		};
	}
};
