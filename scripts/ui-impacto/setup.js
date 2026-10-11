// Datos que se cargan a través del servidor ya levantado de un lado (docs/ui-impacto.md), con la
// sesión de admin falsa de `vite dev` (ADMIN_DEV_MOCK): lo que no se puede escribir desde
// ./seed.js porque el código usa los alias de SvelteKit ($lib, $env).

/**
 * Llama a una action de SvelteKit como lo haría el formulario (mismo origen, `x-sveltekit-action`).
 * @param {string} baseURL
 * @param {string} path dirección con la action (`/admin/...?/nombre`)
 * @param {Record<string, string>} fields
 */
export async function postAction(baseURL, path, fields) {
	const res = await fetch(new URL(path, baseURL), {
		method: 'POST',
		headers: {
			origin: baseURL,
			accept: 'application/json',
			'x-sveltekit-action': 'true',
			'content-type': 'application/x-www-form-urlencoded'
		},
		body: new URLSearchParams(fields),
		signal: AbortSignal.timeout(120_000)
	});
	const body = await res.json().catch(() => null);
	return { ok: res.ok && body?.type === 'success', status: res.status, type: body?.type ?? null };
}

/**
 * Carga lo que falta y devuelve lo que no se pudo (para anotarlo en el informe).
 * @param {string} baseURL
 * @param {Record<string, any>} ctx lo que escribió ./seed.js
 * @returns {Promise<string[]>}
 */
export async function setupSide(baseURL, ctx) {
	/** @type {string[]} */
	const skipped = [];
	// El taller de prueba que viene, con una segunda parte una semana después.
	if (ctx.workshop && ctx.workshopPartStart) {
		const fields = /** @type {Record<string, string>} */ ({ start: ctx.workshopPartStart });
		if (ctx.workshopPartEnd) fields.end = ctx.workshopPartEnd;
		const r = await postAction(
			baseURL,
			`/admin/eventos/${ctx.workshop}/editar?/partes_crear`,
			fields
		).catch((e) => ({ ok: false, status: 0, type: String(e?.message ?? e) }));
		if (!r.ok) skipped.push(`partes del taller (${r.status} ${r.type ?? ''})`.trim());
	} else skipped.push('partes del taller');
	return skipped;
}
