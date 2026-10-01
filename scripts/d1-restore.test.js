import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCAL_DIR, parseArgs, readStats, resolveSource } from './d1-restore.js';

describe('parseArgs', () => {
	it('simulacro local', () => {
		expect(parseArgs(['2026-10-01', '--local'])).toEqual({
			source: '2026-10-01',
			mode: 'local',
			to: '',
			persistTo: DEFAULT_LOCAL_DIR
		});
		expect(parseArgs(['b.sql.gz', '--local', '--persist-to', 'x']).persistTo).toBe('x');
	});

	it('remoto: hace falta --to', () => {
		expect(parseArgs(['2026-10-01', '--remote', '--to', 'kinkyvibe-restaurada'])).toMatchObject({
			mode: 'remote',
			to: 'kinkyvibe-restaurada'
		});
		expect(() => parseArgs(['2026-10-01', '--remote'])).toThrow(/--to/);
	});

	it('nunca encima de la base de producción', () => {
		expect(() => parseArgs(['2026-10-01', '--remote', '--to', 'kinkyvibe'])).toThrow(/Time Travel/);
	});

	it('errores de uso', () => {
		expect(() => parseArgs(['2026-10-01'])).toThrow(/--local/);
		expect(() => parseArgs(['--local'])).toThrow(/Falta el backup/);
		expect(() => parseArgs(['a', 'b', '--local'])).toThrow(/Falta el backup/);
		expect(() => parseArgs(['a', '--local', '--remote'])).toThrow(/no las dos/);
		expect(() => parseArgs(['a', '--local', '--force'])).toThrow(/desconocida/);
	});
});

describe('resolveSource', () => {
	const none = () => false;

	it('archivo que existe', () => {
		expect(resolveSource('bajado.sql.gz', () => true)).toEqual({
			kind: 'file',
			path: 'bajado.sql.gz'
		});
	});

	it('fecha → backup nocturno del bucket', () => {
		expect(resolveSource('2026-10-01', none)).toEqual({ kind: 'r2', key: 'd1/2026-10-01.sql.gz' });
	});

	it('clave del bucket', () => {
		expect(resolveSource('d1/manual/2026-10-02T12-00-00Z.sql.gz', none)).toEqual({
			kind: 'r2',
			key: 'd1/manual/2026-10-02T12-00-00Z.sql.gz'
		});
	});

	it('cualquier otra cosa: error', () => {
		expect(() => resolveSource('ayer', none)).toThrow();
		expect(() => resolveSource('d1/../secreto.sql.gz', none)).toThrow();
		expect(() => resolveSource('otra/2026-10-01.sql.gz', none)).toThrow();
	});
});

describe('readStats', () => {
	it('lee las cantidades del comentario final', () => {
		const sql = [
			'-- Backup',
			"INSERT INTO t VALUES ('-- kinkyvibe-backup-stats no es este');",
			'-- kinkyvibe-backup-stats {"tables":1,"rows":2,"perTable":{"t":2},"rebuilt":[],"skipped":[]}',
			''
		].join('\n');
		expect(readStats(sql)).toEqual({
			tables: 1,
			rows: 2,
			perTable: { t: 2 },
			rebuilt: [],
			skipped: []
		});
	});

	it('sin comentario: null', () => {
		expect(readStats('SELECT 1;')).toBeNull();
	});
});
