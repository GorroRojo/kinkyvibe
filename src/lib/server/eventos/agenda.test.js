import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
	AGENDA_BATCH_MAX,
	gitBlobSha,
	publishNote,
	saveAgendaRow,
	saveAgendaRows
} from './agenda.js';
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

describe('saveAgendaRows (varias filas, un commit)', () => {
	const PATH_B = 'src/lib/posts/calendario/otro.md';
	const RAW_B = RAW.replace('Evento de ejemplo', 'Otro evento');
	const BEFORE_B = { ...BEFORE, title: 'Otro evento' };
	const files = () => ({ [PATH]: RAW, [PATH_B]: RAW_B });
	const MOVE_A = { slug: 'ejemplo', before: BEFORE, after: { ...BEFORE, date: '2026-12-19' } };
	const MOVE_B = { slug: 'otro', before: BEFORE_B, after: { ...BEFORE_B, date: '2026-12-20' } };

	/** @param {Partial<Parameters<typeof saveAgendaRows>[0]>} over */
	const saveMany = (over) =>
		saveAgendaRows({
			client: fakeClient(files()),
			token: 't',
			author: 'Admin',
			rows: [],
			places: PLACES,
			...over
		});

	it('dos eventos movidos: un solo commit con los dos archivos, cada uno con su sha', async () => {
		const client = fakeClient(files());
		const r = await saveMany({ client, rows: [MOVE_A, MOVE_B] });
		expect(r).toMatchObject({ ok: true, status: 200, commitUrl: 'https://example.com/commit/abc' });
		expect(r.message).toBe('Se guardaron 2 cambios en un commit.');
		expect(r.results.map((x) => [x.slug, x.ok, x.changed])).toEqual([
			['ejemplo', true, ['date']],
			['otro', true, ['date']]
		]);
		expect(client.commits).toHaveLength(1);
		const c = client.commits[0];
		expect(c.message).toBe(
			'[admin] Admin editó 2 eventos desde la agenda (calendario/ejemplo, calendario/otro)'
		);
		expect(c.files.map((/** @type {any} */ f) => f.path)).toEqual([PATH, PATH_B]);
		expect(c.files[0].content).toContain('start: 2026-12-19T21:00-03:00');
		expect(c.files[0].content).toContain('end: 2026-12-20T02:00-03:00');
		expect(c.files[1].content).toContain('start: 2026-12-20T21:00-03:00');
		expect(c.files[1].content).toContain("title: 'Otro evento'");
		expect(c.unchanged).toEqual([
			{ path: PATH, sha: await gitBlobSha(RAW) },
			{ path: PATH_B, sha: await gitBlobSha(RAW_B) }
		]);
		expect(c.pr).toEqual({ action: 'edita desde la agenda', who: 'Admin' });
	});

	it('con una sola fila, el mensaje del commit es el mismo que el de saveAgendaRow', async () => {
		const client = fakeClient(files());
		await saveMany({ client, rows: [MOVE_A] });
		expect(client.commits[0].message).toBe(
			'[admin] Admin editó calendario/ejemplo desde la agenda (fecha)'
		);
	});

	it('un conflicto en una fila no frena a las demás: esa vuelve con lo último del archivo', async () => {
		const client = fakeClient({
			[PATH]: RAW.replace('2026-12-12T21:00', '2026-12-15T21:00').replace(
				'2026-12-13T02:00',
				'2026-12-16T02:00'
			),
			[PATH_B]: RAW_B
		});
		const r = await saveMany({ client, rows: [MOVE_A, MOVE_B] });
		expect(r.ok).toBe(false);
		expect(r.status).toBe(409);
		expect(r.message).toBe('Se guardó 1 cambio. Uno no se pudo guardar: revisá los marcados.');
		expect(r.results[0]).toMatchObject({ slug: 'ejemplo', ok: false, status: 409 });
		expect(r.results[0].message).toMatch(/fecha/);
		expect(r.results[0].current).toMatchObject({ date: '2026-12-15', slug: 'ejemplo' });
		expect(r.results[1]).toMatchObject({ slug: 'otro', ok: true, changed: ['date'] });
		expect(client.commits).toHaveLength(1);
		expect(client.commits[0].files.map((/** @type {any} */ f) => f.path)).toEqual([PATH_B]);
	});

	it('valida cada fila igual que saveAgendaRow; si ninguna pasa, no hay commit', async () => {
		const client = fakeClient(files());
		const r = await saveMany({
			client,
			rows: [
				{ ...MOVE_A, after: { ...BEFORE, date: '2026-02-30' } },
				{ ...MOVE_A, slug: '../secreto' },
				{ ...MOVE_A, slug: 'no-existe' }
			]
		});
		expect(r.ok).toBe(false);
		expect(r.results.map((x) => x.status)).toEqual([400, 400, 404]);
		expect(r.results[0].errors).toEqual({ date: 'Fecha inválida.' });
		expect(r.message).toBe('3 no se pudieron guardar: revisá los marcados.');
		expect(r.commitUrl).toBeUndefined();
		expect(client.commits).toHaveLength(0);
	});

	it('si un archivo cambia entre la lectura y el commit, no se guarda ninguno (y se dice cuál)', async () => {
		const client = fakeClient(files(), { failWith: new FileChangedError(PATH_B) });
		const r = await saveMany({ client, rows: [MOVE_A, MOVE_B] });
		expect(r.ok).toBe(false);
		expect(r.results.map((x) => [x.ok, x.status])).toEqual([
			[false, 409],
			[false, 409]
		]);
		expect(r.results[0].message).toMatch(/otro evento cambió/);
		expect(r.results[1].message).toMatch(/cambió justo mientras guardabas/);
	});

	it('un error de GitHub en el commit: no queda ninguno guardado', async () => {
		const client = fakeClient(files(), { failWith: new Error('se cayó') });
		const r = await saveMany({ client, rows: [MOVE_A] });
		expect(r.results[0]).toMatchObject({ ok: false, status: 502 });
		expect(r.results[0].message).toMatch(/se cayó/);
	});

	it('el mismo evento dos veces: se guarda el primero y el segundo se rechaza', async () => {
		const client = fakeClient(files());
		const r = await saveMany({
			client,
			rows: [MOVE_A, { ...MOVE_A, after: { ...BEFORE, date: '2026-12-26' } }]
		});
		expect(r.results.map((x) => [x.ok, x.status])).toEqual([
			[true, 200],
			[false, 400]
		]);
		expect(client.commits[0].files).toHaveLength(1);
		expect(client.commits[0].files[0].content).toContain('start: 2026-12-19T21:00-03:00');
	});

	it('sin filas o sin cambios no hace commit; demasiadas filas se rechazan', async () => {
		const client = fakeClient(files());
		expect(await saveMany({ client })).toMatchObject({ ok: true, results: [] });
		const same = await saveMany({
			client,
			rows: [{ slug: 'ejemplo', before: BEFORE, after: BEFORE }]
		});
		expect(same).toMatchObject({ ok: true, message: 'No había cambios.' });
		const many = Array.from({ length: AGENDA_BATCH_MAX + 1 }, (_, i) => ({
			...MOVE_A,
			slug: `e-${i}`
		}));
		expect(await saveMany({ client, rows: many })).toMatchObject({ ok: false, status: 400 });
		expect(client.commits).toHaveLength(0);
	});

	it('avisa adónde fue el commit (PR de contenido)', async () => {
		const client = fakeClient(files());
		client.commitFiles = async (/** @type {string} */ _t, /** @type {any} */ opts) => {
			client.commits.push(opts);
			return {
				sha: 'abc',
				url: 'u',
				pr: { number: 7, url: 'p', branch: 'b', stacked: false, state: 'auto' }
			};
		};
		const r = await saveMany({ client, rows: [MOVE_A] });
		expect(r.message).toBe(
			'Se guardó 1 cambio en un commit. Se publica cuando pasen las pruebas (PR #7).'
		);
		expect(r.publish).toMatchObject({ number: 7 });
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
