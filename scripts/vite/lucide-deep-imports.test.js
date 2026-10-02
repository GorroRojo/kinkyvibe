import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readIconMap, rewriteLucideImports } from './lucide-deep-imports.js';

const require = createRequire(import.meta.url);
const dist = path.dirname(require.resolve('@lucide/svelte'));
const icons = readIconMap(dist);

describe('lucideDeepImports', () => {
	it('arma el mapa con íconos y alias, y cada archivo existe', () => {
		expect(icons.size).toBeGreaterThan(1000);
		expect(icons.get('CalendarRange')).toBe('calendar-range');
		expect(icons.get('LucideTicket')).toBe('ticket');
		expect(icons.get('TicketIcon')).toBe('ticket');
		for (const file of new Set(icons.values()))
			expect(existsSync(path.join(dist, 'icons', `${file}.js`))).toBe(true);
	});

	it('cambia los imports con nombre por imports directos (con alias locales)', () => {
		const code =
			"import { Ticket, CalendarRange as Cal,\n\tX, } from '@lucide/svelte';\nlet a = 1;";
		expect(rewriteLucideImports(code, icons)).toBe(
			"import Ticket from '@lucide/svelte/icons/ticket'; import Cal from '@lucide/svelte/icons/calendar-range'; import X from '@lucide/svelte/icons/x';\nlet a = 1;"
		);
	});

	it('deja igual lo que no es un ícono, y el código sin el paquete', () => {
		expect(rewriteLucideImports("import { Icon, X } from '@lucide/svelte';", icons)).toBeNull();
		expect(rewriteLucideImports("import X from '@lucide/svelte/icons/x';", icons)).toBeNull();
		expect(rewriteLucideImports('const a = 1;', icons)).toBeNull();
	});
});
