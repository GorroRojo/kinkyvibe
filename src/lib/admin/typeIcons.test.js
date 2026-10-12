import { describe, expect, it } from 'vitest';
import { BookOpen, CalendarDays, MapPin, Repeat, User, Users } from '@lucide/svelte';
import { typeIcon } from './typeIcons.js';

describe('typeIcon', () => {
	it('evento, serie y material', () => {
		expect(typeIcon('evento')).toBe(CalendarDays);
		expect(typeIcon('serie')).toBe(Repeat);
		expect(typeIcon('material')).toBe(BookOpen);
	});

	it('perfiles según su tipo; un lugar lleva el pin', () => {
		expect(typeIcon('perfil', 'persona')).toBe(User);
		expect(typeIcon('perfil', 'proyecto')).toBe(Users);
		expect(typeIcon('perfil', 'lugar')).toBe(MapPin);
		expect(typeIcon('amigues')).toBe(User);
	});

	it('un tipo de perfil desconocido cae en persona', () => {
		expect(typeIcon('perfil', 'otro')).toBe(User);
	});
});
