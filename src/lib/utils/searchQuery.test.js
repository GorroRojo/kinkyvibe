import { describe, expect, it } from 'vitest';
import {
	allowsKind,
	eventInWhen,
	foldQuery,
	foldedRank,
	hasRecordCriteria,
	matchTerms,
	orderStatusWord,
	parseSearchQuery,
	parseWhen,
	splitQuery,
	whenRange
} from './searchQuery.js';

/** Sábado 10 de octubre de 2026, 15:00 en Argentina. */
const SAT = Date.parse('2026-10-10T15:00:00-03:00');
/** Martes 13 de octubre de 2026, 23:30 en Argentina (ya es miércoles en UTC). */
const TUE_NIGHT = Date.parse('2026-10-13T23:30:00-03:00');

describe('foldQuery', () => {
	it('saca tildes, mayúsculas y espacios de más', () => {
		expect(foldQuery('  Ñandú   JOSÉ ')).toBe('nandu jose');
		expect(foldQuery(null)).toBe('');
	});
});

describe('splitQuery', () => {
	it('separa por espacios y respeta las comillas', () => {
		expect(
			splitQuery('ana "dos palabras" -no -"sin esto"').map((t) => [t.neg, t.value, t.quoted])
		).toEqual([
			[false, 'ana', false],
			[false, 'dos palabras', true],
			[true, 'no', false],
			[true, 'sin esto', true]
		]);
	});

	it('clave con valor entre comillas', () => {
		const [t] = splitQuery('lugar:"Club Inventado"');
		expect(t).toMatchObject({ key: 'lugar', value: 'Club Inventado', quoted: true });
	});

	it('una comilla sin cerrar llega hasta el final', () => {
		expect(splitQuery('"sin cerrar acá').map((t) => t.value)).toEqual(['sin cerrar acá']);
	});

	it('vacío, solo espacios o guiones sueltos', () => {
		expect(splitQuery('')).toEqual([]);
		expect(splitQuery('   ')).toEqual([]);
		expect(splitQuery(' - ').map((t) => t.value)).toEqual(['-']);
	});
});

describe('parseSearchQuery: texto', () => {
	it('sin operadores: palabras sueltas, sin tildes ni mayúsculas', () => {
		const pq = parseSearchQuery('José  PÉREZ');
		expect(pq.words).toEqual(['jose', 'perez']);
		expect(pq.text).toBe('José PÉREZ');
		expect(pq.kinds).toBeNull();
		expect(pq.operators).toBe(false);
	});

	it('vacío', () => {
		const pq = parseSearchQuery('');
		expect(pq).toMatchObject({ words: [], phrases: [], exclude: [], kinds: null, text: '' });
		expect(hasRecordCriteria(pq)).toBe(false);
		expect(hasRecordCriteria(parseSearchQuery('   '))).toBe(false);
		expect(hasRecordCriteria(parseSearchQuery(/** @type {any} */ (undefined)))).toBe(false);
	});

	it('"frase exacta"', () => {
		const pq = parseSearchQuery('"Atadura Básica" taller');
		expect(pq.phrases).toEqual(['atadura basica']);
		expect(pq.words).toEqual(['taller']);
		expect(pq.text).toBe('Atadura Básica taller');
		expect(pq.operators).toBe(true);
	});

	it('-palabra y -"frase" excluyen', () => {
		const pq = parseSearchQuery('fiesta -Látex -"de día"');
		expect(pq.words).toEqual(['fiesta']);
		expect(pq.exclude).toEqual(['latex', 'de dia']);
	});

	it('un guion adentro de la palabra no excluye (KV-…, nombres compuestos)', () => {
		expect(parseSearchQuery('KV-1A2B3C4D').words).toEqual(['kv-1a2b3c4d']);
		expect(parseSearchQuery('ana-maría').words).toEqual(['ana-maria']);
		expect(parseSearchQuery('KV-1A2B3C4D').text).toBe('KV-1A2B3C4D');
	});

	it('un `algo:` que no es operador queda como texto', () => {
		const pq = parseSearchQuery('foo:bar 20:30 https://x.example');
		expect(pq.words).toEqual(['foo:bar', '20:30', 'https://x.example']);
		expect(pq.kinds).toBeNull();
		expect(pq.operators).toBe(false);
	});

	it('emails: la arroba en el medio es texto', () => {
		const pq = parseSearchQuery('ana@example.com');
		expect(pq.words).toEqual(['ana@example.com']);
		expect(pq.kinds).toBeNull();
	});

	it('malformado: no falla', () => {
		for (const q of [
			'"',
			'""',
			'-"',
			'#',
			'@',
			'e:',
			'tipo:',
			':',
			'::',
			'>',
			'-#',
			'lugar:""',
			'"-'
		]) {
			expect(() => parseSearchQuery(q)).not.toThrow();
		}
		expect(parseSearchQuery('""').phrases).toEqual([]);
		expect(parseSearchQuery('#').tags).toEqual([]);
		expect(parseSearchQuery(':').words).toEqual([':']);
	});
});

describe('parseSearchQuery: operadores', () => {
	it('>: solo acciones', () => {
		const pq = parseSearchQuery('>tema');
		expect(pq.kinds).toEqual(['actions']);
		expect(pq.actionText).toBe('tema');
		expect(hasRecordCriteria(pq)).toBe(false);
		// Solo al comienzo.
		expect(parseSearchQuery('a >b').kinds).toBeNull();
	});

	it('#etiqueta y etiqueta: (sin tildes ni mayúsculas)', () => {
		for (const q of ['#Shibari', 'etiqueta:shibari', 'Etiqueta:SHIBARI', 'etiqueta:"Shibari"']) {
			const pq = parseSearchQuery(q);
			expect(pq.tags).toEqual(['shibari']);
			expect(pq.kinds?.sort()).toEqual(['events', 'tags']);
			expect(pq.words).toEqual([]);
			expect(hasRecordCriteria(pq)).toBe(true);
		}
		expect(parseSearchQuery('#Español').tags).toEqual(['espanol']);
		expect(parseSearchQuery('etiqueta:"juego de rol"').tags).toEqual(['juego de rol']);
	});

	it('-#etiqueta excluye eventos con esa etiqueta', () => {
		const pq = parseSearchQuery('fiesta -#latex');
		expect(pq.excludeTags).toEqual(['latex']);
		expect(pq.words).toEqual(['fiesta']);
	});

	it('@persona y persona:', () => {
		const pq = parseSearchQuery('@Ana');
		expect(pq.kinds?.sort()).toEqual(['people', 'profiles']);
		expect(pq.words).toEqual(['ana']);
		expect(parseSearchQuery('@ana@example.com').words).toEqual(['ana@example.com']);
		expect(parseSearchQuery('persona:"Ana Inventada"').phrases).toEqual(['ana inventada']);
	});

	it('e: y evento:, con palabra de pestaña al final', () => {
		expect(parseSearchQuery('e:latex').kinds).toEqual(['events']);
		const pq = parseSearchQuery('e:fiesta inventada puerta');
		expect(pq.words).toEqual(['fiesta', 'inventada']);
		expect(pq.tab).toBe('ingreso');
		expect(pq.text).toBe('fiesta inventada');
		expect(parseSearchQuery('evento:latex Órdenes').tab).toBe('ordenes');
		expect(parseSearchQuery('e:latex mail').tab).toBe('mail');
		expect(parseSearchQuery('e:latex duplicar').tab).toBe('duplicar');
		// Sola, la palabra es lo buscado (un evento puede llamarse así).
		expect(parseSearchQuery('e:puerta').tab).toBeNull();
		// Sin e:, no es pestaña.
		expect(parseSearchQuery('latex puerta').tab).toBeNull();
	});

	it('orden: y estado:', () => {
		expect(parseSearchQuery('orden:ana')).toMatchObject({
			kinds: ['orders'],
			words: ['ana'],
			status: null
		});
		expect(parseSearchQuery('orden:pendiente')).toMatchObject({
			kinds: ['orders'],
			words: [],
			status: 'pending'
		});
		expect(parseSearchQuery('estado:Transferencia ana')).toMatchObject({
			kinds: ['orders'],
			words: ['ana'],
			status: 'awaiting_transfer'
		});
		expect(parseSearchQuery('estado:aprobadas').status).toBe('approved');
		expect(hasRecordCriteria(parseSearchQuery('estado:vencida'))).toBe(true);
		// Un estado que no existe: texto.
		expect(parseSearchQuery('estado:feliz')).toMatchObject({
			status: null,
			words: ['estado:feliz'],
			kinds: null
		});
	});

	it('tipo:, con varios separados por coma y en plural', () => {
		expect(parseSearchQuery('tipo:evento ana').kinds).toEqual(['events']);
		expect(parseSearchQuery('tipo:Órdenes').kinds).toEqual(['orders']);
		expect(parseSearchQuery('tipo:entrada,codigo').kinds?.sort()).toEqual(['codes', 'tickets']);
		expect(parseSearchQuery('tipo:accion').kinds).toEqual(['actions']);
		expect(parseSearchQuery('tipo:amigues').kinds).toEqual(['profiles']);
		// Desconocido: texto.
		expect(parseSearchQuery('tipo:pizza')).toMatchObject({ kinds: null, words: ['tipo:pizza'] });
	});

	it('-tipo: saca ese tipo', () => {
		const pq = parseSearchQuery('ana -tipo:orden');
		expect(allowsKind(pq, 'orders')).toBe(false);
		expect(allowsKind(pq, 'people')).toBe(true);
	});

	it('lugar:', () => {
		const pq = parseSearchQuery('lugar:Palermo');
		expect(pq).toMatchObject({ places: ['palermo'], kinds: ['events'] });
		expect(parseSearchQuery('lugar:"Club Inventado"').places).toEqual(['club inventado']);
		expect(parseSearchQuery('lugar:').places).toEqual([]);
	});

	it('palabras de fecha sueltas: filtran eventos y dejan las acciones', () => {
		const pq = parseSearchQuery('hoy');
		expect(pq.when).toEqual({ kind: 'hoy' });
		expect(pq.kinds?.sort()).toEqual(['actions', 'events']);
		expect(pq.words).toEqual([]);
		expect(pq.actionText).toBe('hoy');
		expect(parseSearchQuery('Mañana').when).toEqual({ kind: 'manana' });
		expect(parseSearchQuery('finde').when).toEqual({ kind: 'finde' });
	});

	it('«esta semana»: el «esta» no queda como texto', () => {
		const pq = parseSearchQuery('esta semana');
		expect(pq.when).toEqual({ kind: 'semana' });
		expect(pq.words).toEqual([]);
		expect(pq.text).toBe('');
	});

	it('una palabra de fecha entre comillas es texto', () => {
		const pq = parseSearchQuery('"semana"');
		expect(pq.when).toBeNull();
		expect(pq.phrases).toEqual(['semana']);
	});

	it('cuando: con día de la semana o fecha', () => {
		expect(parseSearchQuery('cuando:sábado').when).toEqual({ kind: 'weekday', weekday: 6 });
		expect(parseSearchQuery('cuando:sab').when).toEqual({ kind: 'weekday', weekday: 6 });
		expect(parseSearchQuery('cuando:15/10').when).toEqual({ kind: 'date', day: 15, month: 10 });
		expect(parseSearchQuery('cuando:15-10-26').when).toEqual({
			kind: 'date',
			day: 15,
			month: 10,
			year: 2026
		});
		expect(parseSearchQuery('cuando:hoy').kinds).toEqual(['events']);
		expect(parseSearchQuery('cuando:40/13')).toMatchObject({ when: null, words: ['cuando:40/13'] });
	});

	it('combinaciones', () => {
		const pq = parseSearchQuery('#shibari hoy lugar:palermo "atadura básica" -avanzado');
		expect(pq).toMatchObject({
			tags: ['shibari'],
			when: { kind: 'hoy' },
			places: ['palermo'],
			phrases: ['atadura basica'],
			exclude: ['avanzado'],
			kinds: ['events']
		});
		// Filtros que no comparten ningún tipo: no sale nada.
		expect(parseSearchQuery('estado:pendiente #shibari').kinds).toEqual([]);
		// Alcance y filtro: se cruzan.
		expect(parseSearchQuery('tipo:evento,orden estado:pendiente').kinds).toEqual(['orders']);
	});
});

describe('orderStatusWord y parseWhen', () => {
	it('estados por su comienzo, desde 4 letras', () => {
		expect(orderStatusWord('pend')).toBe('pending');
		expect(orderStatusWord('pen')).toBeNull();
		expect(orderStatusWord('reembolsadas')).toBe('refunded');
		expect(orderStatusWord('cancelado')).toBe('cancelled');
	});
	it('fechas que no son', () => {
		expect(parseWhen('ayer')).toBeNull();
		expect(parseWhen('0/10')).toBeNull();
		expect(parseWhen('lu')).toBeNull();
	});
});

describe('matchTerms', () => {
	it('todas las palabras, en cualquier orden y sin tildes', () => {
		const pq = parseSearchQuery('perez jose');
		expect(matchTerms(pq, 'José Pérez')).toBeGreaterThan(0);
		expect(matchTerms(pq, 'José Gómez')).toBe(-1);
		expect(matchTerms(pq, 'José', 'perez@example.com')).toBeGreaterThan(0);
	});

	it('igual y junto es 0; al comienzo 1', () => {
		expect(matchTerms(parseSearchQuery('JOSÉ PÉREZ'), 'José Pérez')).toBe(0);
		expect(matchTerms(parseSearchQuery('jose'), 'José Pérez')).toBe(1);
		expect(matchTerms(parseSearchQuery('perez'), 'José Pérez')).toBe(2);
		expect(matchTerms(parseSearchQuery('ere'), 'José Pérez')).toBe(3);
	});

	it('frase: juntas y en orden', () => {
		expect(matchTerms(parseSearchQuery('"perez jose"'), 'José Pérez')).toBe(-1);
		expect(matchTerms(parseSearchQuery('"jose perez"'), 'José Pérez')).toBe(0);
	});

	it('excluidas', () => {
		expect(matchTerms(parseSearchQuery('fiesta -latex'), 'Fiesta Látex')).toBe(-1);
		expect(matchTerms(parseSearchQuery('fiesta -latex'), 'Fiesta de cuerdas')).toBe(1);
		expect(matchTerms(parseSearchQuery('-latex'), 'Fiesta de cuerdas')).toBe(3);
	});

	it('sin texto (solo filtros) cumple', () => {
		expect(matchTerms(parseSearchQuery('#shibari'), 'lo que sea')).toBe(3);
	});

	it('foldedRank', () => {
		expect(foldedRank('ana', ['ana@example.com'])).toBe(1);
		expect(foldedRank('example', ['ana@example.com'])).toBe(2);
		expect(foldedRank('x', [])).toBe(-1);
	});
});

describe('fechas de eventos', () => {
	const ev = (/** @type {string} */ start, end = '') => ({ start, end });

	it('whenRange en hora de Argentina', () => {
		expect(whenRange({ kind: 'hoy' }, SAT)).toEqual({ from: '2026-10-10', to: '2026-10-10' });
		expect(whenRange({ kind: 'manana' }, SAT)).toEqual({ from: '2026-10-11', to: '2026-10-11' });
		expect(whenRange({ kind: 'semana' }, SAT)).toEqual({ from: '2026-10-10', to: '2026-10-11' });
		expect(whenRange({ kind: 'finde' }, SAT)).toEqual({ from: '2026-10-10', to: '2026-10-11' });
		// Martes 23:30 en Argentina: todavía es martes, aunque en UTC ya sea miércoles.
		expect(whenRange({ kind: 'hoy' }, TUE_NIGHT)).toEqual({ from: '2026-10-13', to: '2026-10-13' });
		expect(whenRange({ kind: 'semana' }, TUE_NIGHT)).toEqual({
			from: '2026-10-13',
			to: '2026-10-18'
		});
		expect(whenRange({ kind: 'finde' }, TUE_NIGHT)).toEqual({
			from: '2026-10-16',
			to: '2026-10-18'
		});
		expect(whenRange({ kind: 'weekday', weekday: 6 }, TUE_NIGHT)).toEqual({
			from: '2026-10-17',
			to: '2026-10-17'
		});
		expect(whenRange({ kind: 'weekday', weekday: 6 }, SAT)).toEqual({
			from: '2026-10-10',
			to: '2026-10-10'
		});
		expect(whenRange({ kind: 'date', day: 15, month: 10, year: 2026 })).toEqual({
			from: '2026-10-15',
			to: '2026-10-15'
		});
		expect(whenRange({ kind: 'date', day: 15, month: 10 })).toBeNull();
	});

	it('eventInWhen: un día, varios días, sin fecha', () => {
		expect(eventInWhen(ev('2026-10-10T21:00-03:00'), { kind: 'hoy' }, SAT)).toBe(true);
		expect(eventInWhen(ev('2026-10-11T21:00-03:00'), { kind: 'hoy' }, SAT)).toBe(false);
		expect(
			eventInWhen(ev('2026-10-08T10:00-03:00', '2026-10-12T20:00-03:00'), { kind: 'hoy' }, SAT)
		).toBe(true);
		expect(eventInWhen(ev(''), { kind: 'hoy' }, SAT)).toBe(false);
		expect(eventInWhen(ev('2031-10-15T20:00-03:00'), { kind: 'date', day: 15, month: 10 })).toBe(
			true
		);
		expect(eventInWhen(ev('2026-10-17T20:00-03:00'), { kind: 'finde' }, TUE_NIGHT)).toBe(true);
		expect(eventInWhen(ev('2026-10-14T20:00-03:00'), { kind: 'finde' }, TUE_NIGHT)).toBe(false);
	});
});
