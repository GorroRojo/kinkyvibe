/**
 * Ajustes → Mails: remitente y dirección de respuesta de los mails de entradas, el pie de todos
 * los mails (contacto y firma), los recordatorios antes de cada evento y de a cuántos mails se
 * mandan los envíos masivos. En D1 (`ticket_settings`). Solo admins.
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
import {
	DEFAULT_FROM_EMAIL,
	DEFAULT_REPLY_TO,
	MAIL_FOOTER_LIMITS
} from '$lib/server/tickets/settings.js';
import { DEFAULT_MAIL_FOOTER, defaultMailContact } from '$lib/server/email/layout.js';
import {
	DEFAULT_MAIL_BATCH_SIZE,
	MAX_MAIL_BATCH_SIZE,
	MIN_MAIL_BATCH_SIZE
} from '$lib/server/tickets/batchSize.js';

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
		// "De a cuántos": mails por tanda en recordatorios y "Enviar el link a todes".
		batch: {
			default: DEFAULT_MAIL_BATCH_SIZE,
			min: MIN_MAIL_BATCH_SIZE,
			max: MAX_MAIL_BATCH_SIZE
		},
		// Remitente y respuesta que se usan si los campos quedan vacíos.
		emailDefaults: {
			from: privateEnv.TICKETS_FROM_EMAIL?.trim() || DEFAULT_FROM_EMAIL,
			replyTo: privateEnv.TICKETS_REPLY_TO?.trim() || DEFAULT_REPLY_TO
		},
		// Pie de todos los mails: lo que sale si los campos quedan vacíos.
		footer: {
			contact: DEFAULT_MAIL_FOOTER.contact,
			signoff: DEFAULT_MAIL_FOOTER.signoff,
			contactEmail: defaultMailContact(),
			limits: MAIL_FOOTER_LIMITS
		}
	};
}

/** @type {import('./$types').Actions} */
export const actions = { save: saveSectionAction('mails') };
