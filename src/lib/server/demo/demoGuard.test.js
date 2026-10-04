/**
 * Guardas del modo demo (docs/demo.md): los datos de prueba nunca llegan a producción.
 *
 * - El seed solo corre en un deploy de preview (POST /api/preview-seed da 404 en cualquier otro
 *   lado, y el módulo solo se importa dentro de `if (PREVIEW_BUILD && isPreviewDeploy())`).
 * - Todo lo que inventa usa dominios reservados para ejemplos (RFC 2606/6761).
 * - wrangler.toml no prende el modo demo en producción ni le da la base de producción a los
 *   previews.
 * - scripts/demo/guard.js (lo corre CI) detecta eventos de prueba en los posts y el seed en el
 *   bundle de producción.
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PREVIEW_BUILD, PRODUCTION_BRANCH, isPreviewDeploy } from '../deploy.js';
import { deployBranchFromEnv } from '../deployBranch.js';
import { POST } from '../../../routes/api/preview-seed/+server.js';
import { DEMO_PERSONAS } from './personas.js';
import { DEMO_ACCOUNTS } from './seedProfiles.js';
import {
	EVENT_MARKER,
	N3_SERIES_SUBSCRIBERS,
	SECTIONS,
	buildData,
	eventMarkdown,
	seedSql
} from './seed.js';
import {
	SEED_BUNDLE_MARKERS,
	findDemoPosts,
	seedMarkersIn
} from '../../../../scripts/demo/guard.js';

const ROOT = path.resolve(import.meta.dirname, '../../../..');
const read = (/** @type {string} */ rel) => readFileSync(path.join(ROOT, rel), 'utf8');

/** Dominios reservados para ejemplos: nunca son de nadie. */
const FAKE_DOMAIN = /^(?:[a-z0-9-]+\.)*example\.(?:invalid|com|org|net)$/i;
const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g;
const URL_HOST = /https?:\/\/([^/\s'"`)<>]+)/g;

/** @param {string} text */
const emailDomains = (text) => [...text.matchAll(EMAIL)].map((m) => m[1]);
/** @param {string} text */
const urlHosts = (text) => [...text.matchAll(URL_HOST)].map((m) => m[1]);

/** El seed completo (todas las tablas) para un día dado. */
function fullSeed(/** @type {string} */ today) {
	const now = Date.parse(`${today}T15:00:00Z`);
	const data = buildData({ today, now });
	const tables = new Set(SECTIONS.flatMap((s) => s.requires ?? [s.table]));
	return { data, sql: seedSql(data, { tables }) };
}

describe('demo guard: the seed only runs in a preview deploy', () => {
	it('production, local and test builds are not previews', () => {
		expect(PRODUCTION_BRANCH).toBe('main');
		expect(isPreviewDeploy('')).toBe(false);
		expect(isPreviewDeploy('main')).toBe(false);
		expect(isPreviewDeploy('demo')).toBe(true);
		expect(deployBranchFromEnv({})).toBe('');
		expect(deployBranchFromEnv({ WORKERS_CI_BRANCH: 'main' })).toBe('main');
		// In vitest (as in the production build) there is no deploy branch.
		expect(PREVIEW_BUILD).toBe(false);
		expect(isPreviewDeploy()).toBe(false);
	});

	it('POST /api/preview-seed is a 404 outside previews, for any admin and any runtime env', async () => {
		const admins = [
			{ id: -1, login: 'demo', name: 'Admin de prueba' },
			{ id: 1, login: 'GorroRojo', name: 'gorrite' }
		];
		// Runtime variables can't turn it on: the deploy branch is fixed when compiling.
		const envs = [{}, { WORKERS_CI_BRANCH: 'demo', CF_PAGES_BRANCH: 'demo', DEMO: '1' }];
		for (const user of admins) {
			for (const env of envs) {
				const event = /** @type {any} */ ({ platform: { env }, locals: { user } });
				await expect(POST(event)).rejects.toMatchObject({ status: 404 });
			}
		}
	});

	it('the endpoint imports the seed only inside the preview gate', () => {
		const src = read('src/routes/api/preview-seed/+server.js');
		// No static import of the demo seed (it would end up in the production bundle).
		const staticImports = src.match(/^import\s[^;]*;/gms) ?? [];
		for (const line of staticImports)
			expect(line).not.toMatch(/demo\/(seed|seedProfiles|seedEvents)/);
		const gate = src.indexOf('if (PREVIEW_BUILD && isPreviewDeploy())');
		expect(gate).toBeGreaterThan(-1);
		expect(src.indexOf("import('$lib/server/demo/seed.js')")).toBeGreaterThan(gate);
	});

	it('nothing else in the app imports the seed or the reload button', () => {
		/** @type {string[]} */
		const offenders = [];
		const dir = path.join(ROOT, 'src');
		for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
			if (!entry.isFile() || !/\.(js|ts|svelte)$/.test(entry.name)) continue;
			if (/\.test\.js$/.test(entry.name)) continue;
			const full = path.join(entry.parentPath, entry.name);
			const rel = path.relative(ROOT, full);
			const text = readFileSync(full, 'utf8');
			const importsSeed =
				/from\s+['"][^'"]*demo\/(seed|seedProfiles|seedEvents)\.js['"]|import\(\s*['"][^'"]*demo\/(seed|seedEvents)\.js['"]/.test(
					text
				);
			const importsButton = /DemoReload\.svelte/.test(text);
			const allowed = [
				'src/lib/server/demo/seed.js', // imports ./seedProfiles.js and ./seedEvents.js
				'src/routes/api/preview-seed/+server.js', // dynamic, inside the gate (above)
				'src/routes/+layout.svelte' // dynamic, inside `if (PREVIEW)` (below)
			];
			if ((importsSeed || importsButton) && !allowed.includes(rel)) offenders.push(rel);
		}
		expect(offenders).toEqual([]);
		const layout = read('src/routes/+layout.svelte');
		expect(layout).toMatch(
			/const PREVIEW = __DEPLOY_BRANCH__ !== '' && __DEPLOY_BRANCH__ !== 'main';\s[\s\S]*?if \(PREVIEW\) \{\s*import\('\$lib\/components\/admin\/DemoReload\.svelte'\)/
		);
	});
});

describe('demo guard: everything the seed invents is obviously fake', () => {
	it('every email and URL in the seed (any day) uses a reserved example domain', () => {
		for (const today of ['2026-10-04', '2027-02-28', '2027-07-15']) {
			const { data, sql } = fullSeed(today);
			const text = sql + data.events.map(eventMarkdown).join('\n');
			const domains = emailDomains(text);
			expect(domains.length).toBeGreaterThan(100);
			for (const d of domains) expect(d).toMatch(FAKE_DOMAIN);
			for (const h of urlHosts(text)) expect(h).toMatch(FAKE_DOMAIN);
		}
	});

	it('demo accounts, personas and series subscribers are @example.invalid', () => {
		const emails = [
			...Object.values(DEMO_ACCOUNTS).map((a) => a.email),
			...N3_SERIES_SUBSCRIBERS.map((s) => s.email),
			...DEMO_PERSONAS.map((p) => /** @type {any} */ (p).email)
		];
		expect(emails.length).toBeGreaterThan(5);
		for (const e of emails) expect(e).toMatch(/^[a-z0-9._-]+@example\.invalid$/);
	});

	it('the demo SQL and scripts in scripts/demo only use reserved example domains', () => {
		const dir = path.join(ROOT, 'scripts/demo');
		for (const name of readdirSync(dir)) {
			if (!/\.(sql|js)$/.test(name)) continue;
			const text = readFileSync(path.join(dir, name), 'utf8');
			for (const d of emailDomains(text)) expect(d).toMatch(FAKE_DOMAIN);
		}
	});

	it('every invented event is marked and titled as demo', () => {
		const { data } = fullSeed('2026-10-04');
		for (const e of data.events) {
			expect(e.slug).toMatch(/^demo-/);
			expect(e.title).toMatch(/\(demo\)$/);
			expect(eventMarkdown(e)).toContain(EVENT_MARKER);
		}
	});
});

describe('demo guard: wrangler.toml', () => {
	/**
	 * Tablas de wrangler.toml con sus claves (`[a.b]` y `[[a.b]]`; lo de antes de la primera tabla
	 * es '').
	 *
	 * @returns {{ table: string, keys: Record<string, string> }[]}
	 */
	function tomlTables() {
		/** @type {{ table: string, keys: Record<string, string> }[]} */
		const out = [{ table: '', keys: {} }];
		for (const raw of read('wrangler.toml').split('\n')) {
			const line = raw.replace(/\s+#.*$/, '').trim();
			if (!line || line.startsWith('#')) continue;
			const header = line.match(/^\[\[?([^\]]+)\]\]?$/);
			if (header) {
				out.push({ table: header[1].trim(), keys: {} });
				continue;
			}
			const kv = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.*)$/);
			if (kv) out[out.length - 1].keys[kv[1]] = kv[2].replace(/^"(.*)"$/, '$1');
		}
		return out;
	}
	const isPreviewTable = (/** @type {string} */ t) => t === 'previews' || t.startsWith('previews.');

	it('production config sets no deploy branch and no demo or preview switch', () => {
		const production = tomlTables().filter((t) => !isPreviewTable(t.table));
		// Production variables (`[vars]`, `[env.*.vars]`): none may fake a deploy branch or turn
		// on a demo/preview switch. (The rest live in the dashboard: docs/demo.md.)
		for (const { table, keys } of production.filter((t) => /(^|\.)vars$/.test(t.table))) {
			for (const key of Object.keys(keys)) {
				expect(`${table}.${key}`).not.toMatch(/WORKERS_CI_BRANCH|CF_PAGES_BRANCH|DEMO|PREVIEW/i);
			}
		}
		// Nor may any table outside [previews] set them under another name.
		for (const { table } of production) expect(table).not.toMatch(/demo/i);
		// Production keeps the production database; previews never get it.
		const prodDb = production.find((t) => t.table === 'd1_databases');
		expect(prodDb?.keys.database_name).toBe('kinkyvibe');
		const previewDbs = tomlTables().filter((t) => t.table === 'previews.d1_databases');
		expect(previewDbs.length).toBeGreaterThan(0);
		for (const t of previewDbs) {
			expect(t.keys.database_name).not.toBe('kinkyvibe');
			expect(t.keys.database_id).not.toBe(prodDb?.keys.database_id);
		}
	});
});

describe('demo guard: scripts/demo/guard.js (run by CI)', () => {
	it('finds demo events among posts', () => {
		const dir = mkdtempSync(path.join(tmpdir(), 'kv-demo-guard-'));
		try {
			mkdirSync(path.join(dir, 'calendario'));
			writeFileSync(path.join(dir, 'calendario', 'evento-real.md'), '---\ntitle: Real\n---\n');
			expect(findDemoPosts(dir)).toEqual([]);
			const { data } = fullSeed('2026-10-04');
			writeFileSync(path.join(dir, 'calendario', 'x.md'), eventMarkdown(data.events[0]));
			expect(findDemoPosts(dir)).toEqual([path.join('calendario', 'x.md')]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('its bundle markers really come from the seed and the reload button', () => {
		const sources = [
			read('src/lib/server/demo/seed.js'),
			read('src/lib/server/demo/seedProfiles.js'),
			read('src/lib/server/demo/seedEvents.js'),
			read('src/lib/components/admin/DemoReload.svelte')
		].join('\n');
		for (const m of SEED_BUNDLE_MARKERS) expect(sources).toContain(m);
		expect(seedMarkersIn(fullSeed('2026-10-04').sql).length).toBeGreaterThan(0);
		expect(seedMarkersIn('export default { fetch() {} }')).toEqual([]);
	});
});
