import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { gitBlobSha, publishNote, saveAgendaRow } from './agenda.js';
import { FileChangedError } from './github.js';
import { eventTagGroups } from '$lib/utils/adminTags.js';

const PLACES = eventTagGroups().places;
const PATH = 'src/lib/posts/calendario/ejemplo.md';
const RAW = `---
title: 'Evento de ejemplo'
tags:
  - español
  - AMBA
category: calendario
status: abierto
start: 2026-12-12T21:00-03:00
end: 2026-12-13T02:00-03:00
location_name: Lugar de prueba
---
Texto.
`;
const BEFORE = {
	date: '2026-12-12',
	startTime: '21:00',
	endTime: '02:00',
	title: 'Evento de ejemplo',
	locationName: 'Lugar de prueba',
	place: 'AMBA',
	state: 'publicado'
};

/** Cliente de repo falso: un archivo, y registra los commits. */
function fakeClient(
	files = /** @type {Record<string, string>} */ ({ [PATH]: RAW }),
	{ failWith = /** @type {Error | null} */ (null) } = {}
) {
	/** @type {any[]} */
	const commits = [];
	return {
		commits,
		getFile: async (/** @type {string} */ _t, /** @type {string} */ path) => files[path] ?? null,
		commitFiles: async (/** @type {string} */ _t, /** @type {any} */ opts) => {
			if (failWith) throw failWith;
			commits.push(opts);
			return { sha: 'abc', url: 'https://example.com/commit/abc' };
		}
	};
}

/** @param {Partial<Parameters<typeof saveAgendaRow>[0]>} over */
const save = (over) =>
	saveAgendaRow({
		client: fakeClient(),
		token: 't',
		author: 'Admin',
		slug: 'ejemplo',
		before: BEFORE,
		after: BEFORE,
		places: PLACES,
		...over
	});

describe('gitBlobSha', () => {
	it('es el sha de blob de git (como `git hash-object`)', async () => {
		const text = 'hola ñandú\n';
		const expected = createHash('sha1')
			.update(`blob ${Buffer.byteLength(text)}\0${text}`)
			.digest('hex');
		expect(await gitBlobSha(text)).toBe(expected);
	});
});

describe('saveAgendaRow', () => {
	it('sin cambios no hace commit', async () => {
		const client = fakeClient();
		const r = await save({ client });
		expect(r).toMatchObject({ ok: true, status: 200, changed: [] });
		expect(client.commits).toHaveLength(0);
	});

	it('valida antes de tocar el repo', async () => {
		const client = fakeClient();
		const r = await save({
			client,
			after: { ...BEFORE, title: '', date: '2026-13-01', place: 'Marte', state: 'x' }
		});
		expect(r.status).toBe(400);
		expect(Object.keys(r.errors ?? {}).sort()).toEqual(['date', 'place', 'state', 'title']);
		expect(client.commits).toHaveLength(0);
	});

	it('rechaza slugs raros', async () => {
		const r = await save({ slug: '../../etc/passwd', after: { ...BEFORE, title: 'x' } });
		expect(r).toMatchObject({ status: 400, ok: false });
	});

	it('404 si el evento no existe', async () => {
		const r = await save({ slug: 'otro', after: { ...BEFORE, title: 'Nuevo' } });
		expect(r.status).toBe(404);
	});

	it('guarda solo lo que cambió, con un commit que comprueba que el archivo no cambió', async () => {
		const client = fakeClient();
		const r = await save({
			client,
			after: { ...BEFORE, title: 'Nuevo título', startTime: '22:00' }
		});
		expect(r).toMatchObject({ ok: true, status: 200 });
		expect(r.changed?.sort()).toEqual(['startTime', 'title']);
		expect(client.commits).toHaveLength(1);
		const c = client.commits[0];
		expect(c.message).toBe(
			'[admin] Admin editó calendario/ejemplo desde la agenda (empieza, título)'
		);
		expect(c.files).toHaveLength(1);
		expect(c.files[0].path).toBe(PATH);
		expect(c.files[0].content).toContain("title: 'Nuevo título'");
		expect(c.files[0].content).toContain('start: 2026-12-12T22:00-03:00');
		expect(c.files[0].content).toContain('Texto.\n');
		expect(c.unchanged).toEqual([{ path: PATH, sha: await gitBlobSha(RAW) }]);
	});

	it('conflicto si otra persona cambió el mismo campo', async () => {
		const client = fakeClient({
			[PATH]: RAW.replace('Evento de ejemplo', 'Cambiado por otra persona')
		});
		const r = await save({ client, after: { ...BEFORE, title: 'Mío' } });
		expect(r.status).toBe(409);
		expect(r.message).toMatch(/título/);
		expect(r.current?.title).toBe('Cambiado por otra persona');
		expect(client.commits).toHaveLength(0);
	});

	it('si el archivo cambia entre la lectura y el commit, avisa (409)', async () => {
		const client = fakeClient(undefined, { failWith: new FileChangedError(PATH) });
		const r = await save({ client, after: { ...BEFORE, title: 'Otro' } });
		expect(r.status).toBe(409);
	});

	it('la región vacía se acepta solo si ya estaba vacía', async () => {
		const noPlace = RAW.replace('  - AMBA\n', '');
		const client = fakeClient({ [PATH]: noPlace });
		const r = await save({
			client,
			before: { ...BEFORE, place: '' },
			after: { ...BEFORE, place: '', title: 'Otro' }
		});
		expect(r.ok).toBe(true);
		const bad = await save({ after: { ...BEFORE, place: '' } });
		expect(bad.status).toBe(400);
	});
});

describe('publishNote', () => {
	const pr = { number: 7, url: 'u', branch: 'b', stacked: false };
	it('avisa que se publica cuando pasen las pruebas', () => {
		expect(publishNote({ ...pr, state: 'auto' })).toBe(
			' Se publica cuando pasen las pruebas (PR #7).'
		);
		expect(publishNote({ ...pr, state: 'merged' })).toBe(' Publicado (PR #7).');
		expect(publishNote({ ...pr, state: 'open', problem: 'sin permiso' })).toBe(
			' Quedó en el PR #7 sin publicarse solo: sin permiso.'
		);
		// dev:admin / demo: sin PR
		expect(publishNote(undefined)).toBe('');
	});
});
