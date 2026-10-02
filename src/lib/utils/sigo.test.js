import { describe, expect, it } from 'vitest';
import { toCsv } from '$lib/admin/csv.js';
import {
	DEFAULT_FOLLOW_OPTIONS,
	FOLLOW_CSV_COLUMNS,
	followKindLabel,
	optionsFromForm,
	optionsFromRow,
	parseTarget,
	sortFollows,
	wantsMail
} from './sigo.js';

describe('parseTarget', () => {
	it('acepta etiquetas por nombre (sin espacios en las puntas)', () => {
		expect(parseTarget('etiqueta', '  Rancheadita Kinky ')).toEqual({
			kind: 'etiqueta',
			key: 'Rancheadita Kinky'
		});
	});
	it('acepta perfiles solo por id numérico', () => {
		expect(parseTarget('perfil', '42')).toEqual({ kind: 'perfil', key: '42' });
		expect(parseTarget('perfil', 'gorrite')).toBeNull();
		expect(parseTarget('perfil', '0')).toBeNull();
		expect(parseTarget('perfil', '-3')).toBeNull();
	});
	it('rechaza clases desconocidas, vacíos, saltos de línea y claves largas', () => {
		expect(parseTarget('cuenta', 'x')).toBeNull();
		expect(parseTarget('etiqueta', '   ')).toBeNull();
		expect(parseTarget('etiqueta', 'a\nb')).toBeNull();
		expect(parseTarget('etiqueta', 'x'.repeat(101))).toBeNull();
		expect(parseTarget('etiqueta', 'x'.repeat(100))).not.toBeNull();
		expect(parseTarget(undefined, 'x')).toBeNull();
		expect(parseTarget('etiqueta', 3)).toBeNull();
	});
});

describe('opciones', () => {
	it('lee las casillas de un formulario (sin marcar = apagada)', () => {
		const form = new URLSearchParams({ calendario: 'on', recordatorio: 'on' });
		expect(optionsFromForm(form)).toEqual({
			calendario: true,
			mail_nuevo: false,
			recordatorio: true
		});
		expect(optionsFromForm(new URLSearchParams())).toEqual({
			calendario: false,
			mail_nuevo: false,
			recordatorio: false
		});
	});
	it('lee una fila de la base', () => {
		expect(optionsFromRow({ in_calendar: 1, mail_new: 0, mail_reminder: 1 })).toEqual({
			calendario: true,
			mail_nuevo: false,
			recordatorio: true
		});
	});
	it('por defecto: calendario y mail de lo nuevo, sin recordatorio', () => {
		expect(DEFAULT_FOLLOW_OPTIONS).toEqual({
			calendario: true,
			mail_nuevo: true,
			recordatorio: false
		});
		expect(wantsMail(DEFAULT_FOLLOW_OPTIONS)).toBe(true);
		expect(wantsMail({ calendario: true, mail_nuevo: false, recordatorio: false })).toBe(false);
	});
});

describe('followKindLabel', () => {
	it('nombra cada clase', () => {
		expect(followKindLabel('etiqueta')).toBe('Etiqueta');
		expect(followKindLabel('perfil', 'lugar')).toBe('Lugar');
		expect(followKindLabel('perfil', 'proyecto')).toBe('Proyecto');
		expect(followKindLabel('perfil', 'persona')).toBe('Perfil');
		expect(followKindLabel('perfil')).toBe('Perfil');
	});
});

/** @param {Partial<import('./sigo.js').FollowView>} o */
const view = (o) => ({
	kind: /** @type {const} */ ('etiqueta'),
	key: 'k',
	title: 'T',
	href: '/wiki/k',
	label: 'Etiqueta',
	available: true,
	options: DEFAULT_FOLLOW_OPTIONS,
	createdAt: Date.parse('2026-10-01T12:00:00Z'),
	...o
});

describe('sortFollows y CSV', () => {
	it('primero lo disponible, después por clase y nombre', () => {
		const sorted = sortFollows([
			view({ key: 'z', title: 'zeta' }),
			view({ key: 'gone', title: 'Ya no está disponible', available: false, href: null }),
			view({ key: '1', kind: 'perfil', label: 'Lugar', title: 'Un lugar' }),
			view({ key: 'a', title: 'Árbol' })
		]);
		expect(sorted.map((f) => f.key)).toEqual(['a', 'z', '1', 'gone']);
	});
	it('arma el CSV con las opciones como sí/no', () => {
		const csv = toCsv([view({ title: 'Shibari', href: '/wiki/shibari' })], FOLLOW_CSV_COLUMNS, {
			bom: false
		});
		const [head, row] = csv.trim().split('\r\n');
		expect(head).toBe(
			'qué es,nombre,link,en mi calendario,mail cuando se anuncia algo nuevo,recordatorio el día antes,desde'
		);
		expect(row).toBe('Etiqueta,Shibari,https://kinkyvibe.ar/wiki/shibari,sí,sí,no,2026-10-01');
	});
});
