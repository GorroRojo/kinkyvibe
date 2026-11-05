/**
 * POST /api/interno/deploy: lo llama el workflow `.github/workflows/aviso-deploy.yml` cuando
 * termina el build de producción de un push a `main`. Manda el aviso «Cada deploy» por Telegram a
 * les admins que lo prendieron (src/lib/server/deploy/aviso.js).
 *
 * Protegido con el header `x-deploy-secret` = DEPLOY_NOTIFY_SECRET (secreto del Worker; el mismo
 * valor, como secreto de GitHub Actions), comparado en tiempo constante. Sin el secreto
 * configurado: 503.
 */
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getDB } from '$lib/server/db';
import {
	MIN_DEPLOY_SECRET_LENGTH,
	isValidDeploySecret,
	parseDeploy,
	runDeployNotice
} from '$lib/server/deploy/aviso.js';

/** Hasta cuántos caracteres el cuerpo del pedido. */
const BODY_MAX_BYTES = 256 * 1024;

const NO_STORE = { 'cache-control': 'no-store' };

/** @type {import('./$types').RequestHandler} */
export async function POST({ request, platform, fetch }) {
	const secret = env.DEPLOY_NOTIFY_SECRET;
	if (!secret || secret.length < MIN_DEPLOY_SECRET_LENGTH) {
		return json({ error: 'DEPLOY_NOTIFY_SECRET no está configurado' }, { status: 503 });
	}
	if (!(await isValidDeploySecret(request.headers.get('x-deploy-secret'), secret))) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}
	const raw = await request.text();
	if (raw.length > BODY_MAX_BYTES) return json({ error: 'muy grande' }, { status: 413 });
	/** @type {unknown} */
	let input;
	try {
		input = JSON.parse(raw);
	} catch {
		return json({ error: 'JSON inválido' }, { status: 400 });
	}
	const deploy = parseDeploy(input);
	if (!deploy) return json({ error: 'pedido inválido' }, { status: 400 });
	const db = getDB(platform);
	if (!db) return json({ error: 'sin base de datos' }, { status: 503 });
	const result = await runDeployNotice({ db, deploy, fetch });
	return json(
		{ outcome: deploy.outcome, items: deploy.items.length, ...result },
		{ headers: NO_STORE }
	);
}
