import { describe, expect, it } from 'vitest';
import { toCsv } from './csv.js';
import {
	PROFILES_HREF,
	PROFILE_CSV_COLUMNS,
	hasProfileFilters,
	parseProfileFilters,
	profileOrigin,
	profileRowHref,
	profileState,
	profilesHref
} from './perfiles.js';

const parse = (/** @type {string} */ qs) => parseProfileFilters(new URLSearchParams(qs));

describe('parseProfileFilters', () => {
	it('lee q, tipo, origen, estado y vista; lo desconocido se ignora', () => {
		expect(parse('')).toEqual({ q: '', kind: '', origin: '', state: '', view: '' });
		expect(parse('q=%20Yuyo%20&tipo=lugar&origen=cuenta&estado=rechazado&vista=pedidos')).toEqual({
			q: 'Yuyo',
			kind: 'lugar',
			origin: 'cuenta',
			state: 'rechazado',
			view: 'pedidos'
		});
		expect(parse('tipo=grupo&origen=x&estado=toString&vista=constructor')).toEqual({
			q: '',
			kind: '',
			origin: '',
			state: '',
			view: ''
		});
		expect(parse(`q=${'a'.repeat(300)}`).q).toHaveLength(200);
	});

	it('el viejo ?filtro= de Cuentas › Perfiles filtra igual; ?estado= le gana', () => {
		expect(parse('filtro=sin-revisar').state).toBe('sin-revisar');
		expect(parse('filtro=sin-aprobar').state).toBe('para-aprobar');
		expect(parse('filtro=ocultos').state).toBe('oculto');
		expect(parse('filtro=borrados').state).toBe('borrado');
		expect(parse('filtro=cualquiera').state).toBe('');
		expect(parse('filtro=ocultos&estado=aprobado').state).toBe('aprobado');
	});
});

describe('profilesHref', () => {
	it('arma el link con los filtros puestos y vuelve a leerse igual', () => {
		expect(profilesHref()).toBe(PROFILES_HREF);
		expect(profilesHref({ state: 'para-aprobar' })).toBe('/admin/amigues?estado=para-aprobar');
		const f = { q: 'casa y más', kind: 'lugar', origin: 'panel', state: 'oculto', view: '' };
		const href = profilesHref(f);
		expect(parse(href.split('?')[1])).toEqual(f);
	});

	it('hasProfileFilters: solo los filtros de la lista (no la vista)', () => {
		expect(hasProfileFilters(parse('vista=pedidos'))).toBe(false);
		expect(hasProfileFilters(parse('origen=ficha'))).toBe(true);
	});
});

describe('profileOrigin', () => {
	it('ficha si se importó; cuenta si lo creó una cuenta (aunque se haya borrado); si no, panel', () => {
		expect(profileOrigin({ imported: true, createdBy: 'admin-de-prueba' })).toBe('ficha');
		expect(profileOrigin({ imported: true, createdBy: 'cuenta:abc' })).toBe('ficha');
		expect(profileOrigin({ imported: false, createdBy: 'cuenta:abc' })).toBe('cuenta');
		expect(profileOrigin({ imported: false, createdBy: 'cuenta:borrada' })).toBe('cuenta');
		expect(profileOrigin({ imported: false, createdBy: 'gorrite' })).toBe('panel');
	});
});

describe('profileState', () => {
	const base = { deletedAt: null, visibility: 'public', approved: false, rejected: false };
	it('borrado > oculto > aprobado > rechazado > para aprobar', () => {
		expect(profileState({ ...base, deletedAt: 1, visibility: 'hidden', approved: true })).toBe(
			'borrado'
		);
		expect(profileState({ ...base, visibility: 'hidden', approved: true })).toBe('oculto');
		expect(profileState({ ...base, approved: true, rejected: true })).toBe('aprobado');
		expect(profileState({ ...base, rejected: true })).toBe('rechazado');
		expect(profileState(base)).toBe('para-aprobar');
		expect(profileState({ ...base, visibility: 'members', approved: true })).toBe('aprobado');
	});
});

describe('profileRowHref', () => {
	it('abre el editor (con la dirección vieja si vino de una ficha); un borrado, su ficha', () => {
		expect(
			profileRowHref({ id: 3, slug: 'gorro-rojo', legacySlug: 'Gorro_Rojo', deletedAt: null })
		).toBe('/admin/amigues/Gorro_Rojo');
		expect(profileRowHref({ id: 4, slug: 'casa inventada', deletedAt: null })).toBe(
			'/admin/amigues/casa%20inventada'
		);
		expect(profileRowHref({ id: 5, slug: 'x', deletedAt: 1 })).toBe('/admin/cuentas/perfiles/5');
	});
});

describe('CSV', () => {
	it('lleva tipo, origen, estado, visibilidad, quiénes lo gestionan y la fecha de borrado', () => {
		const csv = toCsv(
			[
				{
					title: 'Lugar Inventado',
					slug: 'lugar-inventado',
					legacySlug: null,
					kind: 'lugar',
					origin: 'cuenta',
					visibility: 'public',
					approved: false,
					rejected: true,
					createdAt: Date.UTC(2026, 9, 1),
					deletedAt: null,
					managers: [
						{ email: 'alguien@example.com', role: 'owner' },
						{ email: null, role: 'manager' }
					]
				}
			],
			PROFILE_CSV_COLUMNS,
			{ bom: false }
		);
		const [head, row] = csv.trim().split('\r\n');
		expect(head).toBe(
			'nombre,direccion,tipo,origen,estado,visibilidad,creado,lo_gestionan,borrado'
		);
		expect(row).toBe(
			'Lugar Inventado,lugar-inventado,Lugar,Creado por una cuenta,Rechazado,Público,2026-10-01,alguien@example.com (Dueñe) / cuenta borrada (Gestiona),'
		);
	});
});
