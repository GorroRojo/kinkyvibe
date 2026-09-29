// Aplica las migraciones de D1 pendientes a la base local (.wrangler/state) antes de `npm run dev`.
// Es no interactivo (CI=true evita la confirmación de wrangler) y nunca frena el arranque:
// si falla, el sitio funciona igual pero sin las funciones que usan la base de datos.
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const result = spawnSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'kinkyvibe', '--local'], {
	stdio: ['ignore', 'inherit', 'inherit'],
	env: { ...process.env, CI: 'true' },
	shell: process.platform === 'win32'
});

if (result.status !== 0) {
	console.warn(
		'\n⚠️  No se pudieron aplicar las migraciones locales de D1 (ver el error de arriba).\n' +
			'   El sitio va a arrancar igual, pero las funciones con base de datos van a estar ocultas.\n' +
			'   Probá a mano con: npm run db:migrate:local\n'
	);
}
