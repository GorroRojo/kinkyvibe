// `npm run test:related`: corre solo las pruebas de vitest relacionadas con lo que cambiaste
// respecto de origin/main (lo commiteado en la rama + lo que todavía no commiteaste + los archivos
// nuevos sin agregar). Es para las corridas locales de las sesiones: la CI siempre corre todas.
//
//   npm run test:related                       # contra origin/main
//   npm run test:related -- --maxWorkers=2     # lo que va después de `--` se le pasa a vitest
//   TEST_RELATED_BASE=origin/otra-rama npm run test:related
//
// «Relacionadas» = las que importan (directa o indirectamente) algún archivo cambiado, más las
// pruebas cambiadas (`vitest related`). Los archivos borrados se ignoran (quien los importaba
// también cambió). Si cambió algo que vitest no ve como import pero afecta a todas las pruebas
// (la configuración, las dependencias, las migraciones, el setup de las pruebas), corre todas.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * Archivos que, si cambian, piden la suite entera: vitest no los ve como imports de las pruebas
 * (o los ve de todas).
 */
export const RUN_ALL = [
	/^package(-lock)?\.json$/,
	/^\.node-version$/,
	/^(vite|svelte)\.config\.js$/,
	/^jsconfig\.json$/,
	/^wrangler\.toml$/,
	/^migrations\//,
	/^src\/tests\//,
	/^src\/app\.d\.ts$/,
	/^scripts\/vitest\//,
	/^scripts\/test-related\.js$/
];

/**
 * @param {string[]} changed rutas cambiadas (relativas a la raíz del repo, con `/`)
 * @param {(file: string) => boolean} [exists]
 * @returns {{ mode: 'none' } | { mode: 'all', reason: string } | { mode: 'related', files: string[] }}
 */
export function planRelated(changed, exists = existsSync) {
	const files = [...new Set(changed.map((f) => f.trim()).filter(Boolean))].filter((f) => exists(f));
	if (!files.length) return { mode: 'none' };
	const global = files.find((f) => RUN_ALL.some((re) => re.test(f)));
	if (global) return { mode: 'all', reason: global };
	return { mode: 'related', files: files.sort() };
}

/** @param {string[]} args */
function git(args) {
	const r = spawnSync('git', args, { encoding: 'utf8' });
	if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr.trim()}`);
	return r.stdout.split('\n').filter(Boolean);
}

/** @param {string} base */
function changedFiles(base) {
	return [
		// lo commiteado en la rama desde que se separó de la base
		...git(['diff', '--name-only', `${base}...HEAD`]),
		// lo que todavía no está commiteado (en el índice o no)
		...git(['diff', '--name-only', 'HEAD']),
		// archivos nuevos que git todavía no sigue
		...git(['ls-files', '--others', '--exclude-standard'])
	];
}

/** @param {string[]} args */
function vitest(args) {
	const r = spawnSync('npx', ['vitest', ...args], {
		stdio: 'inherit',
		shell: process.platform === 'win32'
	});
	return r.status ?? 1;
}

function main() {
	const base = process.env.TEST_RELATED_BASE || 'origin/main';
	const extra = process.argv.slice(2);
	try {
		git(['rev-parse', '--verify', '--quiet', base]);
	} catch {
		console.error(`No encuentro ${base}. Traelo con: git fetch origin main`);
		return 1;
	}
	const plan = planRelated(changedFiles(base));
	if (plan.mode === 'none') {
		console.log(`Nada cambió respecto de ${base}: no hay pruebas para correr.`);
		return 0;
	}
	if (plan.mode === 'all') {
		console.log(`Cambió ${plan.reason}: eso afecta a todas las pruebas, corren todas.`);
		return vitest(['run', ...extra]);
	}
	console.log(
		`Pruebas relacionadas con ${plan.files.length} archivo(s) cambiado(s) desde ${base}.`
	);
	return vitest(['related', '--run', '--passWithNoTests', ...extra, ...plan.files]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main();
