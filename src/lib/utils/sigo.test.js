import { describe, expect, it } from 'vitest';
import { toCsv } from '$lib/admin/csv.js';
import {
	DEFAULT_FOLLOW_OPTIONS,
	FOLLOW_CSV_COLUMNS,
	NOTIFY_CHANNELS,
	NOTIFY_KINDS,
	followEmoji,
	followGroupOf,
	followKindLabel,
	groupFollows,
	searchProfiles,
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

describe('grupos de la página', () => {
	const f = (/** @type {any} */ extra) => ({ kind: 'perfil', profileKind: 'persona', ...extra });
	it('etiquetas y series · perfiles (personas y proyectos) · lugares', () => {
		expect(followGroupOf(f({ kind: 'etiqueta', profileKind: null }))).toBe('temas');
		expect(followGroupOf(f({}))).toBe('perfiles');
		expect(followGroupOf(f({ profileKind: 'proyecto' }))).toBe('perfiles');
		expect(followGroupOf(f({ profileKind: 'lugar' }))).toBe('lugares');
		// Lo que ya no está disponible no sabe qué perfil era: queda con los perfiles.
		expect(followGroupOf(f({ profileKind: undefined }))).toBe('perfiles');
	});
	it('en orden fijo, sin grupos vacíos, sin cambiar el orden de adentro', () => {
		const items = [
			f({ key: 'b', profileKind: 'lugar' }),
			f({ key: 'a', kind: 'etiqueta' }),
			f({ key: 'c', profileKind: 'lugar' })
		];
		expect(groupFollows(items).map((g) => [g.title, g.items.map((i) => i.key)])).toEqual([
			['Etiquetas y series', ['a']],
			['Lugares', ['b', 'c']]
		]);
		expect(groupFollows([])).toEqual([]);
	});
	it('emoji: el de la etiqueta, si no uno por tipo', () => {
		expect(followEmoji({ kind: 'etiqueta', icon: '🪢' })).toBe('🪢');
		expect(followEmoji({ kind: 'etiqueta', icon: '' })).toBe('🏷️');
		expect(followEmoji({ kind: 'etiqueta', series: true })).toBe('🔁');
		expect(followEmoji({ kind: 'perfil', profileKind: 'lugar' })).toBe('📍');
		expect(followEmoji({ kind: 'perfil', profileKind: 'proyecto' })).toBe('✨');
		expect(followEmoji({ kind: 'perfil', profileKind: 'persona' })).toBe('👤');
	});
});

describe('grilla de avisos', () => {
	it('mail prendido con sus dos casillas; telegram apagado, sin casillas y con su nota', () => {
		expect(NOTIFY_KINDS.map((k) => k.label)).toEqual(['Algo nuevo', 'Recordatorio el día antes']);
		const [mail, telegram] = NOTIFY_CHANNELS;
		expect(mail).toMatchObject({
			label: 'Mail',
			enabled: true,
			fields: { nuevo: 'mail_nuevo', recordatorio: 'recordatorio' }
		});
		expect(telegram).toMatchObject({ label: 'Telegram', enabled: false, fields: {} });
		expect(telegram.note).toMatch(/Telegram cuando conectes tu cuenta/);
	});
	it('cada casilla de la grilla es una opción que entiende el formulario', () => {
		const names = NOTIFY_CHANNELS.flatMap((c) => Object.values(c.fields));
		const form = new URLSearchParams(names.map((n) => [n, 'on']));
		const opts = optionsFromForm(form);
		for (const n of names) expect(opts[/** @type {keyof typeof opts} */ (n)]).toBe(true);
	});
});

describe('searchProfiles', () => {
	const profiles = [
		{ key: '1', name: 'Lugar Inventado', kind: 'lugar' },
		{ key: '2', name: 'Persona de Prueba', kind: 'persona' },
		{ key: '3', name: 'Proyecto Ínventado', kind: 'proyecto' }
	];
	it('sin tildes ni mayúsculas, primero lo que empieza así; sin texto, nada', () => {
		expect(searchProfiles(profiles, 'invent').map((p) => p.key)).toEqual(['1', '3']);
		expect(searchProfiles(profiles, 'p').map((p) => p.key)).toEqual(['2', '3']);
		// «prueba» está en el medio: también aparece, después de lo que empieza así.
		expect(searchProfiles(profiles, 'Pr').map((p) => p.key)).toEqual(['3', '2']);
		expect(searchProfiles(profiles, '  ')).toEqual([]);
	});
	it('sin lo que ya sigue, y con tope', () => {
		expect(searchProfiles(profiles, 'invent', { taken: new Set(['1']) }).map((p) => p.key)).toEqual(
			['3']
		);
		expect(searchProfiles(profiles, 'o', { limit: 1 })).toHaveLength(1);
	});
});
