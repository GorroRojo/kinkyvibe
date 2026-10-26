/**
 * Suspender cuentas (./suspension.js): el motivo y el aviso. Lo que hacen las actions del panel y
 * el ingreso está en cuentas-admin.test.js y cuentas-routes.test.js.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SUSPEND_REASON_MAX, cleanSuspendReason, suspendedMessage } from './suspension.js';

describe('cleanSuspendReason', () => {
	it('vacío o algo que no es texto queda sin motivo', () => {
		for (const v of [undefined, null, '', '   \n ', 3, {}])
			expect(cleanSuspendReason(v)).toBeNull();
	});

	it('saca espacios de más y recorta al largo máximo', () => {
		expect(cleanSuspendReason('  acoso por mensajes\r\n  ')).toBe('acoso por mensajes');
		expect(cleanSuspendReason('x'.repeat(SUSPEND_REASON_MAX + 50))).toHaveLength(
			SUSPEND_REASON_MAX
		);
	});
});

it('el aviso de la persona suspendida lleva el contacto, en voseo', () => {
	expect(suspendedMessage('contacto@example.com')).toBe(
		'Tu cuenta está suspendida. Si creés que es un error, escribinos a contacto@example.com.'
	);
});

/** @param {string} dir @returns {Promise<string[]>} */
async function files(dir) {
	const out = [];
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) out.push(...(await files(full)));
		else if (/\.(js|svelte)$/.test(entry.name) && !/\.test\.js$/.test(entry.name)) out.push(full);
	}
	return out;
}

it('el motivo solo lo leen el panel de admins y quien lo guarda o lo borra', async () => {
	// Si otra parte del código lo necesita, que sea a propósito: nunca a la persona, a Actividad
	// ni a una página pública.
	const allowed = new Set([
		'src/lib/server/cuentas/suspension.js',
		'src/lib/server/cuentas/accounts.js',
		'src/lib/server/admin/ficha.js',
		'src/lib/components/admin/personas/Ficha.svelte'
	]);
	const found = [];
	for (const f of await files('src')) {
		const text = await readFile(f, 'utf8');
		if (/suspended_reason|suspendedReason/.test(text)) found.push(f.split(path.sep).join('/'));
	}
	expect(found.filter((f) => !allowed.has(f))).toEqual([]);
	expect(found.length).toBeGreaterThan(0);
});
