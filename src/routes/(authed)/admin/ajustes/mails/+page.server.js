/**
 * Ajustes → Mails: remitente y dirección de respuesta de los mails de entradas, y los
 * recordatorios antes de cada evento. En D1 (`ticket_settings`). Solo admins.
 */
import { env as privateEnv } from '$env/dynamic/private';
import { requireAdmin } from '$lib/server/auth';
import { loadSettings, saveSectionAction } from '$lib/server/admin/settingsForm.js';
import {
	DEFAULT_REMINDERS,
	MAX_REMINDERS,
	describeReminder,
	parseReminders
} from '$lib/server/tickets/reminders.js';
import { DEFAULT_FROM_EMAIL, DEFAULT_REPLY_TO } from '$lib/server/tickets/settings.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const { db, settings } = await loadSettings(platform);
	return {
		dbAvailable: Boolean(db && settings),
		settings,
		// Recordatorios configurados (vacío = los de por defecto) y cómo se leen.
		reminders: parseReminders(settings?.reminders).map((r) => ({
			...r,
			text: describeReminder(r)
		})),
		remindersDefault: !settings?.reminders,
		defaultReminders: DEFAULT_REMINDERS.map(describeReminder),
		maxReminders: MAX_REMINDERS,
		cronConfigured: Boolean(privateEnv.CRON_SECRET),
		// Remitente y respuesta que se usan si los campos quedan vacíos.
		emailDefaults: {
			from: privateEnv.TICKETS_FROM_EMAIL?.trim() || DEFAULT_FROM_EMAIL,
			replyTo: privateEnv.TICKETS_REPLY_TO?.trim() || DEFAULT_REPLY_TO
		}
	};
}

/** @type {import('./$types').Actions} */
export const actions = { save: saveSectionAction('mails') };
