/**
 * Los vínculos de la metadata pública (./vinculosPublicos.js): solo a perfiles y etiquetas que ve
 * cualquiera. Lo oculto, lo solo con cuenta, lo sin aprobar y lo borrado sale; lo público y lo no
 * listado queda; el panel (./repo.js) sigue viendo todo. D1 de miniflare; datos inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { saveObject } from '$lib/server/objects/index.js';
import { approveProfile } from '$lib/server/amigues/approvals.js';
import {
	allPublicLinkTargets,
	linkRefsOf,
	publicLinkTargets,
	publicLinksOf,
	withPublicLinks
} from './vinculosPublicos.js';
import { dehydrateContent } from './relaciones.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });
vi.mock('$env/dynamic/private', () => ({ env: {} }));

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
});
afterAll(async () => {
	await t?.dispose();
});
beforeEach(async () => {
	await resetDB(t.db);
	const { clearContentCache } = await import('./posts.js');
	clearContentCache();
});

const ADMIN = 'admin-inventade';

describe('withPublicLinks (pura)', () => {
	const targets = {
		profiles: new Set(['perfil-publico']),
		hiddenTags: new Set(['Etiqueta Oculta'])
	};

	it('saca las personas con un perfil que no está y las etiquetas ocultas; deja lo demás', () => {
		const meta = {
			title: 'Algo',
			authors: ['Nombre Suelto'],
			personas: [
				{ perfil: 'perfil-oculto', rol: 'Facilita' },
				{ perfil: 'perfil-publico', rol: 'Facilita' },
				{ nombre: 'Otra Persona', rol: 'Produce' }
			],
			tags: ['Etiqueta Oculta', 'Etiqueta Publica', 'texto suelto']
		};
		expect(withPublicLinks(meta, targets)).toEqual({
			title: 'Algo',
			authors: ['Nombre Suelto'],
			personas: [
				{ perfil: 'perfil-publico', rol: 'Facilita' },
				{ nombre: 'Otra Persona', rol: 'Produce' }
			],
			tags: ['Etiqueta Publica', 'texto suelto']
		});
		expect(meta.personas).toHaveLength(3);
	});

	it('sin nada que sacar, la misma metadata; sin personas que queden, sin `personas`', () => {
		const meta = { personas: [{ perfil: 'perfil-publico', rol: 'Facilita' }], tags: ['x'] };
		expect(withPublicLinks(meta, targets)).toBe(meta);
		expect(withPublicLinks({ personas: [{ perfil: 'otro', rol: 'Facilita' }] }, targets)).toEqual(
			{}
		);
	});

	it('linkRefsOf: las direcciones de perfil y los `key`', () => {
		expect(
			linkRefsOf({
				personas: [{ perfil: 'a', rol: 'R' }, { nombre: 'B', rol: 'R' }, null],
				tags: ['x', 3]
			})
		).toEqual({ slugs: ['a'], keys: ['x'] });
		expect(linkRefsOf({})).toEqual({ slugs: [], keys: [] });
	});
});

/**
 * @param {string} slug
 * @param {{ visibility?: 'public' | 'members' | 'hidden', approved?: boolean, deleted?: boolean, unlisted?: boolean }} [o]
 */
async function profile(
	slug,
	{ visibility = 'public', approved = true, deleted = false, unlisted = false } = {}
) {
	let p = await saveObject(
		t.db,
		{
			type: 'perfil',
			slug,
			title: slug,
			data: { kind: 'persona', ...(unlisted ? { unlisted: true } : {}) },
			visibility
		},
		{ actor: ADMIN }
	);
	if (approved) await approveProfile(t.db, p.id, ADMIN, { now: 1 });
	if (deleted) {
		p = await saveObject(
			t.db,
			{ id: p.id, type: 'perfil', version: p.version, deleted: true },
			{ actor: ADMIN }
		);
	}
	return p;
}

/**
 * @param {string} key
 * @param {{ visibility?: 'public' | 'members' | 'hidden', deleted?: boolean, slug?: string }} [o]
 */
async function tag(key, { visibility = 'public', deleted = false, slug } = {}) {
	const tg = await saveObject(
		t.db,
		{
			type: 'etiqueta',
			title: key,
			slug: slug ?? key.replaceAll(' ', '-'),
			data: { key },
			visibility
		},
		{ actor: ADMIN }
	);
	if (deleted) {
		await saveObject(
			t.db,
			{ id: tg.id, type: 'etiqueta', version: tg.version, deleted: true },
			{ actor: ADMIN }
		);
	}
	return tg;
}

async function seed() {
	await profile('perfil-publico');
	await profile('perfil-no-listado', { unlisted: true });
	await profile('perfil-oculto', { visibility: 'hidden' });
	await profile('perfil-solo-cuentas', { visibility: 'members' });
	await profile('perfil-sin-aprobar', { approved: false });
	await profile('perfil-borrado', { deleted: true });
	await tag('etiqueta publica');
	await tag('etiqueta oculta', { visibility: 'hidden' });
	await tag('etiqueta solo cuentas', { visibility: 'members' });
	await tag('etiqueta borrada', { deleted: true });
}

const SLUGS = [
	'perfil-publico',
	'perfil-no-listado',
	'perfil-oculto',
	'perfil-solo-cuentas',
	'perfil-sin-aprobar',
	'perfil-borrado',
	'perfil-que-no-existe'
];
const KEYS = [
	'etiqueta publica',
	'etiqueta oculta',
	'etiqueta solo cuentas',
	'etiqueta borrada',
	'texto suelto'
];

describe('publicLinkTargets', () => {
	it('quedan los perfiles públicos y los no listados; salen ocultos, solo con cuenta, sin aprobar y borrados', async () => {
		await seed();
		const targets = await publicLinkTargets(t.db, { slugs: SLUGS, keys: KEYS });
		expect([...targets.profiles].sort()).toEqual(['perfil-no-listado', 'perfil-publico']);
		expect([...targets.hiddenTags].sort()).toEqual([
			'etiqueta borrada',
			'etiqueta oculta',
			'etiqueta solo cuentas'
		]);
	});

	it('una etiqueta borrada con el mismo `key` que una viva y pública no la tapa', async () => {
		await tag('repetida', { deleted: true });
		await tag('repetida', { slug: 'repetida-nueva' });
		const targets = await publicLinkTargets(t.db, { slugs: [], keys: ['repetida'] });
		expect([...targets.hiddenTags]).toEqual([]);
	});

	it('allPublicLinkTargets (sin la lista de lo nombrado) decide lo mismo que publicLinkTargets', async () => {
		await seed();
		await tag('repetida', { deleted: true });
		await tag('repetida', { slug: 'repetida-nueva' });
		const all = await allPublicLinkTargets(t.db);
		const asked = await publicLinkTargets(t.db, { slugs: SLUGS, keys: [...KEYS, 'repetida'] });
		for (const slug of SLUGS) expect(all.profiles.has(slug)).toBe(asked.profiles.has(slug));
		for (const key of [...KEYS, 'repetida'])
			expect(all.hiddenTags.has(key)).toBe(asked.hiddenTags.has(key));
		const meta = { personas: SLUGS.map((perfil) => ({ perfil, rol: 'Facilita' })), tags: KEYS };
		expect(withPublicLinks(meta, all)).toEqual(withPublicLinks(meta, asked));
	});

	it('publicLinksOf: todas las metadatas, en orden', async () => {
		await seed();
		const metas = [
			{ personas: SLUGS.map((perfil) => ({ perfil, rol: 'Facilita' })), tags: KEYS },
			{ title: 'Sin vínculos' }
		];
		const out = await publicLinksOf(t.db, metas);
		expect(out[0]).toEqual({
			personas: [
				{ perfil: 'perfil-publico', rol: 'Facilita' },
				{ perfil: 'perfil-no-listado', rol: 'Facilita' }
			],
			tags: ['etiqueta publica', 'texto suelto']
		});
		expect(out[1]).toBe(metas[1]);
	});
});

describe('lo público filtra, el panel ve todo', () => {
	/** Un evento público que nombra a todos (como lo guarda el panel: edges y texto). */
	async function event() {
		await seed();
		const data = {
			summary: 'Un evento inventado',
			published_date: '2031-01-01T00:00-03:00',
			start: '2031-03-01T20:00-03:00',
			tags: KEYS,
			personas: SLUGS.map((profile) => ({ profile, role: 'Facilita' }))
		};
		const split = await dehydrateContent(t.db, 'calendario', data);
		await saveObject(
			t.db,
			{
				type: 'evento',
				slug: 'evento-con-vinculos',
				title: 'Evento con vínculos',
				data: split.data,
				edges: split.edges
			},
			{ actor: ADMIN }
		);
	}
	const profilesOf = (/** @type {Record<string, any>} */ meta) =>
		(meta.personas ?? []).map((/** @type {any} */ p) => p.perfil);

	it('las listas y la página pública: solo lo que ve cualquiera, también para admins', async () => {
		await event();
		const { sitePosts, siteEvent } = await import('./posts.js');
		const listed = (await sitePosts(t.platform)).find(
			(p) => p.meta.postID === 'evento-con-vinculos'
		);
		expect(profilesOf(listed?.meta ?? {})).toEqual(['perfil-publico', 'perfil-no-listado']);
		expect(listed?.meta.tags).not.toContain('etiqueta oculta');
		expect(listed?.meta.tags).not.toContain('etiqueta solo cuentas');
		expect(listed?.meta.tags).not.toContain('etiqueta borrada');
		for (const viewer of [
			undefined,
			{ role: /** @type {const} */ ('member'), id: 'cuenta-inventada' },
			{ role: /** @type {const} */ ('admin'), id: ADMIN }
		]) {
			const page = await siteEvent(t.platform, 'evento-con-vinculos', {
				viewer,
				shallow: true,
				html: false
			});
			expect(profilesOf(page?.meta ?? {})).toEqual(['perfil-publico', 'perfil-no-listado']);
			expect(page?.meta.tags).toEqual(['etiqueta publica', 'texto suelto']);
		}
	});

	it('el panel (repo.js) lee la lista entera', async () => {
		await event();
		const { findDbPostObject } = await import('./repo.js');
		const found = await findDbPostObject(t.db, 'calendario', 'evento-con-vinculos');
		const data = /** @type {Record<string, any>} */ (found?.object.data);
		expect(data.personas.map((/** @type {any} */ p) => p.profile)).toEqual(SLUGS);
		expect(data.tags).toEqual(KEYS);
	});
});
