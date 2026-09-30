/**
 * Cron de KinkyVibe: cada 15 minutos le pide al sitio que mande los recordatorios de entradas
 * que tocan (POST /api/cron/recordatorios con el header x-cron-secret). El sitio hace todo el
 * trabajo (y es idempotente); este Worker solo lo despierta.
 *
 * Bindings: SITE_URL (var, en wrangler.toml) y CRON_SECRET (secret, `wrangler secret put`).
 */
export default {
	/**
	 * @param {ScheduledController} controller
	 * @param {{ SITE_URL: string, CRON_SECRET: string }} env
	 * @param {ExecutionContext} ctx
	 */
	async scheduled(controller, env, ctx) {
		ctx.waitUntil(run(env));
	},

	/** Para probarlo a mano: `npx wrangler dev --test-scheduled` y abrir /__scheduled. */
	async fetch() {
		return new Response('kinkyvibe-cron: solo corre por el cron.', { status: 404 });
	}
};

/** @param {{ SITE_URL: string, CRON_SECRET: string }} env */
async function run(env) {
	if (!env.CRON_SECRET) {
		console.error('Falta el secret CRON_SECRET (npx wrangler secret put CRON_SECRET)');
		return;
	}
	const url = `${env.SITE_URL.replace(/\/+$/, '')}/api/cron/recordatorios`;
	const res = await fetch(url, {
		method: 'POST',
		headers: { 'x-cron-secret': env.CRON_SECRET, accept: 'application/json' }
	});
	const body = await res.text();
	if (!res.ok) console.error(`${url} → ${res.status}: ${body.slice(0, 300)}`);
	else console.log(`${url} → ${body.slice(0, 300)}`);
}
