#!/usr/bin/env node
// Informe de impacto visual (docs/ui-impacto.md): saca capturas de las páginas principales en la
// base (una rama o commit) y en el árbol actual, las compara y escribe ui-impacto/index.html.
//
//   npm run ui:impacto -- --base origin/main
//
// Opciones:
//   --base <ref>      contra qué comparar (por defecto origin/main)
//   --out <carpeta>   dónde escribir el informe (por defecto ui-impacto)
//   --solo <ids>      solo esas páginas, separadas por coma (los ids de pages.js)
//   --ahora <fecha>   el «hoy» simulado, ISO (por defecto hoy a las 12:00 de Argentina)
//   --umbral <n>      píxeles distintos que se toleran antes de decir «cambió» (por defecto 0)
//   --conservar       no borra las copias temporales (para investigar)
//
// Cada lado corre en su propia copia temporal (git worktree) con su propio `npm ci` y su propia
// base D1 local (nunca la de `npm run dev`, nunca una remota): migraciones + contenido de los .md
// + datos de prueba del modo demo (./seed.js). El árbol actual incluye los cambios sin commitear
// y los archivos nuevos que git no ignora. Se sirve con `vite dev` y la sesión de admin falsa
// (ADMIN_DEV_MOCK, como `npm run dev:admin`) y Mercado Pago simulado: nada sale de la compu.
import { execFileSync, spawn } from 'node:child_process';
import {
	appendFileSync,
	copyFileSync,
	cpSync,
	createWriteStream,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { diffPng, statusOf, summarize } from './compare.js';
import { PAGES } from './pages.js';
import { renderHtml, renderMarkdown, headline } from './report.js';
import { setupSide } from './setup.js';
import { launch, shootAll, warmUp } from './shoot.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLOCK = pathToFileURL(path.join(HERE, 'clock.js')).href;
const SEED = path.join(HERE, 'seed.js');

/** @param {string[]} argv */
export function parseArgs(argv) {
	/** @type {Record<string, string | boolean>} */
	const out = {};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (!a.startsWith('--')) continue;
		const [k, v] = a.slice(2).split(/=(.*)/s);
		if (v !== undefined) out[k] = v;
		else if (argv[i + 1] && !argv[i + 1].startsWith('--')) out[k] = argv[++i];
		else out[k] = true;
	}
	return out;
}

/**
 * El «hoy» simulado por defecto: hoy (en Argentina) a las 12:00 de Argentina (15:00 UTC). Así un
 * informe no depende de la hora a la que se corre, y la base y el cambio ven lo mismo.
 * @param {number} [realNow]
 */
export function defaultNow(realNow = Date.now()) {
	const day = new Date(realNow - 3 * 3600_000).toISOString().slice(0, 10);
	return Date.parse(`${day}T15:00:00Z`);
}

/**
 * @param {string} cmd
 * @param {string[]} args
 * @param {import('node:child_process').ExecFileSyncOptions} [opts]
 */
const sh = (cmd, args, opts = {}) =>
	String(
		execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts })
	).trim();

/** Un puerto libre (el sistema elige uno). */
function freePort() {
	return new Promise((resolve, reject) => {
		const s = net.createServer();
		s.once('error', reject);
		s.listen(0, '127.0.0.1', () => {
			const port = /** @type {net.AddressInfo} */ (s.address()).port;
			s.close(() => resolve(port));
		});
	});
}

/**
 * Corre un comando y guarda su salida en el registro; falla si termina mal.
 * @param {string} cmd
 * @param {string[]} args
 * @param {{ cwd: string, env?: NodeJS.ProcessEnv, log: import('node:fs').WriteStream }} o
 */
function runLogged(cmd, args, { cwd, env, log }) {
	return new Promise((resolve, reject) => {
		log.write(`\n$ ${cmd} ${args.join(' ')}\n`);
		const p = spawn(cmd, args, { cwd, env: env ?? process.env, stdio: ['ignore', 'pipe', 'pipe'] });
		p.stdout.pipe(log, { end: false });
		p.stderr.pipe(log, { end: false });
		p.on('error', reject);
		p.on('close', (code) =>
			code === 0
				? resolve(null)
				: reject(new Error(`${cmd} ${args.join(' ')} terminó con ${code} (ver ${log.path})`))
		);
	});
}

/** @param {string} url @param {number} timeoutMs */
async function waitForServer(url, timeoutMs) {
	const until = Date.now() + timeoutMs;
	let last = '';
	while (Date.now() < until) {
		try {
			const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
			if (r.status < 500) return;
			last = `HTTP ${r.status}`;
		} catch (e) {
			last = String(/** @type {Error} */ (e).message);
		}
		await new Promise((r) => setTimeout(r, 1000));
	}
	throw new Error(`El servidor no respondió en ${url} (${last})`);
}

async function main() {
	const started = Date.now();
	const say = (/** @type {string} */ msg) => {
		const t = Math.round((Date.now() - started) / 1000);
		console.log(
			`[${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}] ${msg}`
		);
	};
	const args = parseArgs(process.argv.slice(2));
	const repo = sh('git', ['rev-parse', '--show-toplevel']);
	const baseRef = typeof args.base === 'string' ? args.base : 'origin/main';
	const outDir = path.resolve(typeof args.out === 'string' ? args.out : 'ui-impacto');
	const minPixels = Number(args.umbral ?? 0) || 0;
	const fixedNow = typeof args.ahora === 'string' ? Date.parse(args.ahora) : defaultNow();
	if (!Number.isFinite(fixedNow)) throw new Error('--ahora no es una fecha válida');
	const only =
		typeof args.solo === 'string' ? new Set(args.solo.split(',').map((s) => s.trim())) : null;
	const pages = only ? PAGES.filter((p) => only.has(p.id)) : PAGES;
	if (!pages.length)
		throw new Error(`--solo no coincide con ninguna página (${PAGES.map((p) => p.id).join(', ')})`);

	const baseSha = sh('git', ['rev-parse', '--verify', `${baseRef}^{commit}`], { cwd: repo });
	const headSha = sh('git', ['rev-parse', 'HEAD'], { cwd: repo });
	// Los cambios sin commitear como un commit suelto (no toca el stash ni el árbol). Si git no
	// tiene nombre configurado (una máquina de CI), uno de relleno: ese commit no va a ningún lado.
	const dirtySha = sh('git', ['stash', 'create'], {
		cwd: repo,
		env: {
			...process.env,
			GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME || 'ui-impacto',
			GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL || 'ui-impacto@example.invalid',
			GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME || 'ui-impacto',
			GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL || 'ui-impacto@example.invalid'
		}
	});
	const untracked = sh('git', ['ls-files', '--others', '--exclude-standard', '-z'], { cwd: repo })
		.split('\0')
		.filter(Boolean);
	const newSha = dirtySha || headSha;
	const newLabel = `${headSha.slice(0, 7)}${dirtySha || untracked.length ? ' + cambios sin commitear' : ''}`;
	const baseLabel = `${baseRef} (${baseSha.slice(0, 7)})`;

	const tmp = mkdtempSync(path.join(os.tmpdir(), 'kv-ui-impacto-'));
	rmSync(path.join(outDir, 'capturas'), { recursive: true, force: true });
	mkdirSync(path.join(outDir, 'capturas'), { recursive: true });
	mkdirSync(path.join(outDir, 'registro'), { recursive: true });
	console.log(`ui-impacto: base ${baseLabel} · nuevo ${newLabel}`);
	say(`«hoy» simulado ${new Date(fixedNow).toISOString()} · copias en ${tmp}`);

	/** @type {Set<import('node:child_process').ChildProcess>} */
	const servers = new Set();
	/** @type {string[]} */
	const worktrees = [];
	const cleanup = () => {
		for (const s of servers) {
			try {
				if (s.pid) process.kill(-s.pid, 'SIGTERM');
			} catch {
				// ya terminó
			}
		}
		if (args.conservar) return;
		for (const w of worktrees) {
			try {
				sh('git', ['worktree', 'remove', '--force', w], { cwd: repo });
			} catch {
				// se limpia con el prune de abajo
			}
		}
		try {
			sh('git', ['worktree', 'prune'], { cwd: repo });
		} catch {
			// nada
		}
		rmSync(tmp, { recursive: true, force: true });
	};
	process.on('SIGINT', () => {
		cleanup();
		process.exit(130);
	});

	// Si los dos lados tienen los mismos datos (migraciones, contenido, código del servidor y
	// scripts, salvo esta herramienta), la base local se arma una vez y se copia: el resultado es el
	// mismo y tarda la mitad.
	const DATA_PATHS = ['migrations', 'src/lib/posts', 'src/lib/server', 'scripts', 'wrangler.toml'];
	const sameData =
		!untracked.some(
			(f) =>
				!f.startsWith('scripts/ui-impacto/') &&
				DATA_PATHS.some((d) => f === d || f.startsWith(`${d}/`))
		) &&
		(() => {
			try {
				execFileSync(
					'git',
					['diff', '--quiet', baseSha, newSha, '--', ...DATA_PATHS, ':(exclude)scripts/ui-impacto'],
					{
						cwd: repo
					}
				);
				return true;
			} catch {
				return false;
			}
		})();

	/**
	 * Copia y dependencias de un lado.
	 * @param {'base' | 'nuevo'} side
	 * @param {string} sha
	 */
	async function checkout(side, sha) {
		const dir = path.join(tmp, side);
		const log = createWriteStream(path.join(outDir, 'registro', `${side}.log`));
		sh('git', ['worktree', 'add', '--detach', dir, sha], { cwd: repo });
		worktrees.push(dir);
		if (side === 'nuevo') {
			for (const f of untracked) {
				mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
				copyFileSync(path.join(repo, f), path.join(dir, f));
			}
		}
		say(`${side}: npm ci…`);
		await runLogged('npm', ['ci', '--no-audit', '--no-fund'], { cwd: dir, log });
		return { side, dir, log, ctx: /** @type {Record<string, any>} */ ({}) };
	}

	/**
	 * La base local de un lado (./seed.js con el código de ese lado).
	 * @param {Awaited<ReturnType<typeof checkout>>} s
	 */
	async function seed(s) {
		say(`${s.side}: base local (migraciones, contenido y datos de prueba)…`);
		const ctxFile = path.join(tmp, `${s.side}.ctx.json`);
		await runLogged('node', ['--import', CLOCK, SEED, `--out=${ctxFile}`], {
			cwd: s.dir,
			env: { ...process.env, UI_IMPACTO_NOW: String(fixedNow) },
			log: s.log
		});
		s.ctx = JSON.parse(readFileSync(ctxFile, 'utf8'));
		return s;
	}

	/**
	 * Levanta `vite dev` en la copia de un lado y saca sus capturas. Si el servidor se cae en el
	 * medio (o alguien lo mata), se levanta de nuevo y se repite esa captura.
	 * @param {Awaited<ReturnType<typeof checkout>>} s
	 * @param {import('@playwright/test').Browser} browser
	 */
	async function shootSide(s, browser) {
		const port = await freePort();
		const baseURL = `http://localhost:${port}`;
		/** @type {import('node:child_process').ChildProcess | null} */
		let server = null;
		let spawnedAt = Date.now();
		const stop = () => {
			if (!server) return;
			try {
				if (server.pid) process.kill(-server.pid, 'SIGTERM');
			} catch {
				// ya terminó
			}
			servers.delete(server);
			server = null;
		};
		const start = async () => {
			stop();
			s.log.write(`\n$ vite dev --port ${port}\n`);
			spawnedAt = Date.now();
			const proc = spawn('npx', ['vite', 'dev', '--port', String(port), '--strictPort'], {
				cwd: s.dir,
				detached: true,
				stdio: ['ignore', 'pipe', 'pipe'],
				env: {
					...process.env,
					NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import=${CLOCK}`.trim(),
					UI_IMPACTO_NOW: String(fixedNow),
					// Lo mismo que `npm run dev:tickets`: admin falso, Mercado Pago simulado, sin red.
					ADMIN_DEV_MOCK: '1',
					ADMIN_DEV_MOCK_DIR: path.join(tmp, `${s.side}-commits`),
					MP_MOCK: '1',
					TICKETS_MP_FEE_PERCENT: '2',
					TICKETS_TRANSFER_INFO: 'Alias: EJEMPLO.ALIAS.PRUEBA\\nTitular: Nombre de ejemplo',
					FONDO_PERCENT_OVERRIDE: '20',
					MP_ACCESS_TOKEN: '',
					RESEND_API_KEY: ''
				}
			});
			proc.stdout?.pipe(s.log, { end: false });
			proc.stderr?.pipe(s.log, { end: false });
			proc.on('exit', (code, signal) => s.log.write(`\n[vite dev terminó: ${signal ?? code}]\n`));
			server = proc;
			servers.add(proc);
			await waitForServer(`${baseURL}/`, 300_000);
		};
		const alive = () => Boolean(server && server.exitCode === null && server.signalCode === null);
		try {
			await start();
			// El reloj del servidor arrancó en `fixedNow` cuando arrancó el proceso.
			const now = () => fixedNow + (Date.now() - spawnedAt);
			const log = (/** @type {string} */ line) => s.log.write(`${line}\n`);
			say(`${s.side}: datos desde el panel…`);
			s.ctx.skipped = [...(s.ctx.skipped ?? []), ...(await setupSide(baseURL, s.ctx))];
			say(`${s.side}: calentando ${baseURL}…`);
			const paths = [...new Set(pages.map((p) => p.path(s.ctx)).filter(Boolean))];
			await warmUp(browser, { baseURL, paths: /** @type {string[]} */ (paths), now: now(), log });
			say(`${s.side}: capturas…`);
			return await shootAll(browser, {
				baseURL,
				outDir: path.join(tmp, `${s.side}-capturas`),
				ctx: s.ctx,
				pages,
				now,
				ensureServer: async () => {
					if (alive()) return false;
					say(`${s.side}: el servidor se cayó; lo levanto de nuevo…`);
					await start();
					return true;
				},
				log: (line) => {
					log(line);
					if (line.includes('✗')) say(`${s.side}:${line}`);
				}
			});
		} finally {
			stop();
		}
	}

	try {
		say(
			sameData
				? 'mismos datos en los dos lados: la base local se arma una vez'
				: 'datos distintos: una base local por lado'
		);
		/** @type {[Awaited<ReturnType<typeof checkout>>, Awaited<ReturnType<typeof checkout>>]} */
		let sides;
		if (sameData) {
			const [b, n] = await Promise.all([
				checkout('base', baseSha).then(seed),
				checkout('nuevo', newSha)
			]);
			cpSync(path.join(b.dir, '.wrangler'), path.join(n.dir, '.wrangler'), { recursive: true });
			n.ctx = structuredClone(b.ctx);
			sides = [b, n];
		} else {
			sides = await Promise.all([
				checkout('base', baseSha).then(seed),
				checkout('nuevo', newSha).then(seed)
			]);
		}
		const [base, nuevo] = sides;
		const browser = await launch();
		/** @type {Record<'base' | 'nuevo', import('./shoot.js').RawShot[]>} */
		const raw = { base: [], nuevo: [] };
		try {
			raw.base = await shootSide(base, browser);
			raw.nuevo = await shootSide(nuevo, browser);
		} finally {
			await browser.close();
		}

		console.log('  comparando…');
		const dest = (/** @type {string} */ name) => path.join(outDir, 'capturas', name);
		const rel = (/** @type {string} */ name) => `capturas/${name}`;
		/** @type {import('./compare.js').Shot[]} */
		const shots = [];
		for (const def of pages) {
			for (const b of raw.base.filter((x) => x.pageId === def.id)) {
				const n = raw.nuevo.find((x) => x.pageId === def.id && x.viewport === b.viewport);
				const key = `${def.id}-${b.viewport}`;
				const hasBase = Boolean(b.file);
				const hasNew = Boolean(n?.file);
				/** @type {import('./compare.js').Shot} */
				const shot = {
					pageId: def.id,
					title: def.title,
					group: def.group,
					path: n?.path ?? b.path,
					viewport: b.viewport,
					status: 'error',
					sizes: { base: b.size, nuevo: n?.size ?? null },
					errors: { base: b.error, nuevo: n?.error ?? null }
				};
				if (hasBase && hasNew) {
					const d = diffPng(
						readFileSync(/** @type {string} */ (b.file)),
						readFileSync(/** @type {string} */ (n?.file))
					);
					shot.diffPixels = d.diffPixels;
					shot.ratio = d.ratio;
					shot.status = statusOf({
						hasBase,
						hasNew,
						diffPixels: d.diffPixels,
						sizeChanged: d.sizeChanged,
						minPixels
					});
					if (shot.status === 'igual') {
						copyFileSync(/** @type {string} */ (n?.file), dest(`${key}.png`));
						shot.nuevo = rel(`${key}.png`);
					} else {
						copyFileSync(/** @type {string} */ (b.file), dest(`${key}-base.png`));
						copyFileSync(/** @type {string} */ (n?.file), dest(`${key}-nuevo.png`));
						writeFileSync(dest(`${key}-diff.png`), d.png);
						Object.assign(shot, {
							base: rel(`${key}-base.png`),
							nuevo: rel(`${key}-nuevo.png`),
							diff: rel(`${key}-diff.png`)
						});
					}
				} else {
					shot.status = statusOf({ hasBase, hasNew });
					if (hasBase) {
						copyFileSync(/** @type {string} */ (b.file), dest(`${key}-base.png`));
						shot.base = rel(`${key}-base.png`);
					}
					if (hasNew) {
						copyFileSync(/** @type {string} */ (n?.file), dest(`${key}-nuevo.png`));
						shot.nuevo = rel(`${key}-nuevo.png`);
					}
				}
				shots.push(shot);
			}
		}

		const summary = summarize(shots);
		const meta = {
			base: baseLabel,
			nuevo: newLabel,
			generatedAt: new Date().toLocaleString('es-AR', {
				timeZone: 'America/Argentina/Buenos_Aires',
				hourCycle: 'h23'
			}),
			simulatedNow: new Date(fixedNow).toLocaleString('es-AR', {
				timeZone: 'America/Argentina/Buenos_Aires',
				hourCycle: 'h23'
			}),
			durationMs: Date.now() - started,
			skipped: { base: base.ctx.skipped ?? [], nuevo: nuevo.ctx.skipped ?? [] }
		};
		writeFileSync(path.join(outDir, 'index.html'), renderHtml(summary, meta));
		const md = renderMarkdown(summary, {
			...meta,
			artifact: process.env.UI_IMPACTO_ARTIFACT_NOTE || undefined
		});
		writeFileSync(path.join(outDir, 'resumen.md'), md);
		writeFileSync(path.join(outDir, 'resumen.json'), JSON.stringify({ meta, ...summary }, null, 2));
		if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
		console.log(`\n${headline(summary)}`);
		for (const p of summary.changedPages) say(`· ${p.title} (${p.status})`);
		console.log(
			`\nInforme: ${path.join(outDir, 'index.html')} (${Math.round((Date.now() - started) / 1000)} s)`
		);
		if (summary.total && summary.counts.error === summary.total) process.exitCode = 1;
	} finally {
		cleanup();
	}
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch((e) => {
		console.error(`ui-impacto: ${e?.stack ?? e}`);
		process.exit(1);
	});
}
