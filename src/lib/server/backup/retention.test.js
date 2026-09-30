import { describe, expect, it } from 'vitest';
import { manualBackupKey, nightlyBackupKey, selectExpiredBackups } from './retention.js';

/**
 * Claves nocturnas de todos los días entre dos fechas (inclusive).
 *
 * @param {string} from
 * @param {string} to
 */
function daily(from, to) {
	const keys = [];
	for (let t = Date.parse(from); t <= Date.parse(to); t += 86400000) {
		keys.push(nightlyBackupKey(new Date(t)));
	}
	return keys;
}

describe('claves', () => {
	it('nocturna: d1/AAAA-MM-DD.sql.gz (fecha UTC)', () => {
		expect(nightlyBackupKey(new Date('2026-10-01T06:00:00Z'))).toBe('d1/2026-10-01.sql.gz');
		expect(nightlyBackupKey(new Date('2026-10-01T23:59:59Z'))).toBe('d1/2026-10-01.sql.gz');
	});

	it('manual: en d1/manual/, con hora', () => {
		expect(manualBackupKey(new Date('2026-10-01T14:03:09.123Z'))).toBe(
			'd1/manual/2026-10-01T14-03-09Z.sql.gz'
		);
	});
});

describe('selectExpiredBackups', () => {
	const now = new Date('2026-10-15T06:00:00Z');

	it('guarda los últimos 30 días', () => {
		const keys = daily('2026-09-16', '2026-10-15');
		expect(keys).toHaveLength(30);
		expect(selectExpiredBackups(keys, now)).toEqual([]);
	});

	it('pasados 30 días, guarda solo el primero de cada mes', () => {
		const keys = daily('2026-08-01', '2026-10-15');
		const expired = selectExpiredBackups(keys, now);
		// Se borran agosto (salvo el 1) y septiembre hasta el 15 (salvo el 1).
		expect(expired).not.toContain('d1/2026-08-01.sql.gz');
		expect(expired).not.toContain('d1/2026-09-01.sql.gz');
		expect(expired).toContain('d1/2026-08-02.sql.gz');
		expect(expired).toContain('d1/2026-09-15.sql.gz');
		expect(expired).not.toContain('d1/2026-09-16.sql.gz');
		expect(expired).toHaveLength(30 + 14);
	});

	it('si falta el día 1, el mensual es el primero que haya en ese mes', () => {
		const keys = ['d1/2026-05-03.sql.gz', 'd1/2026-05-04.sql.gz', 'd1/2026-10-15.sql.gz'];
		expect(selectExpiredBackups(keys, now)).toEqual(['d1/2026-05-04.sql.gz']);
	});

	it('los mensuales duran 12 meses; el primero de cada año, para siempre', () => {
		const keys = [
			'd1/2024-01-01.sql.gz',
			'd1/2024-02-01.sql.gz',
			'd1/2025-01-01.sql.gz',
			'd1/2025-10-01.sql.gz', // hace 12 meses: ya no
			'd1/2025-11-01.sql.gz', // hace 11 meses: sí
			'd1/2026-10-15.sql.gz'
		];
		expect(selectExpiredBackups(keys, now)).toEqual([
			'd1/2024-02-01.sql.gz',
			'd1/2025-10-01.sql.gz'
		]);
	});

	it('el primero de cada año se guarda aunque no sea del 1 de enero', () => {
		const keys = ['d1/2025-10-01.sql.gz', 'd1/2025-10-02.sql.gz', 'd1/2026-10-15.sql.gz'];
		expect(selectExpiredBackups(keys, now)).toEqual(['d1/2025-10-02.sql.gz']);
	});

	it('nunca borra lo que no es un backup nocturno', () => {
		const keys = [
			'd1/manual/2020-01-02T10-00-00Z.sql.gz',
			'd1/2020-02-31.sql.gz',
			'd1/notas.txt',
			'd1/2020-03-01.sql',
			'otra/2020-03-02.sql.gz'
		];
		expect(selectExpiredBackups(keys, now)).toEqual([]);
	});

	it('fechas futuras (reloj raro) no se borran', () => {
		expect(selectExpiredBackups(['d1/2027-01-01.sql.gz'], now)).toEqual([]);
	});

	it('sin backups no hay nada que borrar', () => {
		expect(selectExpiredBackups([], now)).toEqual([]);
	});
});
