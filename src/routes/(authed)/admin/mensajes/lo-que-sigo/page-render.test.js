/**
 * Mensajes › Lo que sigo (la página): los interruptores, los números, los avisos, «Avisame»,
 * Telegram, «Lo más seguido» (arriba, debajo de Estado) con su link al panel y «Quiénes» lo siguen,
 * «Por persona» y los links a donde se configura. Con el interruptor apagado explica qué pasa al
 * prenderlo. Datos inventados.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import Page from './+page.svelte';

const NOW = Date.parse('2026-06-01T12:00:00-03:00');

/** @param {number} total */
const counts = (total) => ({ d7: total, d30: total, total });

/** @param {number} i */
const fakeFollower = (i) => ({
	id: `cuenta-inventada-${i}`,
	email: `persona-${i}@example.com`,
	href: `/admin/comunidad/cuentas/cuenta-inventada-${i}#sigue`
});

/** @param {any} [over] */
function data(over = {}) {
	return {
		dbAvailable: true,
		now: NOW,
		flags: { lo_que_sigo: true, telegram_bot: true },
		telegramConfig: { secretOk: true, tokenOk: true },
		stats: {
			accounts: 12,
			follows: { total: 31, etiqueta: 20, perfil: 8, lugar: 3 },
			options: { inCalendar: 25, mailNew: 18, mailReminder: 4, tgNew: 6, tgReminder: 2 },
			notices: {
				nuevo: { mail: counts(40), telegram: counts(7) },
				recordatorio: { mail: counts(9), telegram: counts(0) },
				last: NOW - 3600_000
			},
			failures: {
				d7: { total: 5, mail: 2, telegram: 3, blocked: 1 },
				d30: { total: 14, mail: 6, telegram: 8, blocked: 2 }
			},
			avisame: { migrated: 5, pendingWithAccount: 2, withoutAccount: 11 },
			telegram: { linked: 4, muted: 1 },
			ranking: {
				etiqueta: [
					{
						group: 'etiqueta',
						key: 'shibari',
						title: '🪢 Shibari',
						href: '/admin/etiquetas?etiqueta=shibari',
						series: false,
						profileKind: null,
						state: null,
						count: 9
					}
				],
				perfil: [
					{
						group: 'perfil',
						key: '41',
						title: 'Perfil Inventado',
						href: '/admin/comunidad/cuentas/perfiles/41',
						series: false,
						profileKind: 'persona',
						state: 'oculto',
						count: 1
					}
				],
				lugar: []
			}
		},
		followers: {
			byTarget: {
				'etiqueta:shibari': [fakeFollower(1), fakeFollower(2)],
				'perfil:41': [fakeFollower(2)]
			},
			people: [
				{
					...fakeFollower(2),
					count: 2,
					items: [
						{ group: 'etiqueta', title: '🪢 Shibari' },
						{ group: 'perfil', title: 'Perfil Inventado' }
					]
				},
				{ ...fakeFollower(1), count: 1, items: [{ group: 'etiqueta', title: '🪢 Shibari' }] }
			],
			truncated: false
		},
		...over
	};
}

/** @param {any} d */
const html = (d) => render(Page, { props: { data: d } }).body;

describe('/admin/mensajes/lo-que-sigo (página)', () => {
	it('muestra cada parte, con los números', () => {
		const body = html(data());
		for (const title of [
			'Estado',
			'En números',
			'Avisos mandados',
			'«Avisame si se repite»',
			'Telegram',
			'Lo más seguido',
			'Dónde se configura'
		])
			expect(body).toContain(title);
		expect(body).toContain('Cuentas que siguen algo');
		expect(body).toMatch(/>12</);
		expect(body).toContain('Desde el principio');
		expect(body).not.toContain('Próximamente');
	});

	it('avisos que fallaron: los de 7 días por canal, los bloqueados y los de 30 días', () => {
		const text = html(data())
			.replace(/<!--[^]*?-->/g, '')
			.replace(/<[^>]+>/g, '')
			.replace(/\s+/g, ' ');
		expect(text).toContain(
			'Avisos que fallaron: 5 en los últimos 7 días (por mail: 2; por Telegram: 3, 1 porque el chat ya no recibe).'
		);
		expect(text).toContain('En 30 días: 14.');
	});

	it('sin avisos que fallaron no muestra el detalle por canal', () => {
		const zero = { total: 0, mail: 0, telegram: 0, blocked: 0 };
		const d = data();
		d.stats.failures = { d7: zero, d30: zero };
		const text = html(d)
			.replace(/<!--[^]*?-->/g, '')
			.replace(/<[^>]+>/g, '')
			.replace(/\s+/g, ' ');
		expect(text).toContain('Avisos que fallaron: 0 en los últimos 7 días.');
		expect(text).not.toContain('por mail:');
	});

	it('sin el contador de fallos (migración sin aplicar) lo dice y lo demás se ve', () => {
		const d = data();
		d.stats.failures = null;
		const body = html(d);
		expect(body).toContain('No se pudieron contar los avisos que fallaron.');
		expect(body).toContain('Desde el principio');
	});

	it('lo más seguido: link al panel, el número aunque sea 1, y el estado', () => {
		const body = html(data());
		expect(body).toContain('href="/admin/etiquetas?etiqueta=shibari"');
		expect(body).toContain('href="/admin/comunidad/cuentas/perfiles/41"');
		expect(body).toContain('Perfil Inventado');
		expect(body).toContain('persona · oculto');
		expect(body).toContain('Nadie sigue ninguno todavía.');
	});

	it('«Lo más seguido» va arriba, justo debajo de Estado', () => {
		const body = html(data());
		// Los títulos de las tarjetas, solos (no «Bot de Telegram» de Estado).
		const at = (/** @type {string} */ t) => body.indexOf(`>${t}<`);
		expect(at('Estado')).toBeGreaterThan(-1);
		expect(at('Lo más seguido')).toBeGreaterThan(at('Estado'));
		expect(at('Por persona')).toBeGreaterThan(at('Lo más seguido'));
		for (const later of ['En números', 'Avisos mandados', 'Telegram'])
			expect(at(later)).toBeGreaterThan(at('Por persona'));
	});

	it('cada cosa de «Lo más seguido» se abre y lista quiénes la siguen, con link a su ficha', () => {
		const body = html(data());
		expect(body).toContain('Quiénes (2)');
		expect(body).toContain('Quiénes (1)');
		expect(body).toContain('href="/admin/comunidad/cuentas/cuenta-inventada-1#sigue"');
		expect(body).toContain('persona-1@example.com');
		expect(body).toContain('Solo lo ven les admins');
		expect(body).not.toMatch(/nunca quiénes/i);
	});

	it('«Por persona»: cada cuenta con cuántas cosas y cuáles; «Ver más» si son muchas', () => {
		const body = html(data());
		expect(body).toContain('2 cosas');
		expect(body).toContain('1 cosa<');
		expect(body).toContain('🪢 Shibari · Perfil Inventado');
		expect(body).not.toContain('Ver 0 más');

		const people = Array.from({ length: 23 }, (_, i) => ({
			...fakeFollower(i + 10),
			count: 1,
			items: [{ group: 'etiqueta', title: '🪢 Shibari' }]
		}));
		const many = html(data({ followers: { byTarget: {}, people, truncated: true } }));
		expect(many).toContain('Ver 3 más');
		expect(many).toContain('persona-32@example.com');
		expect(many).toContain('muestran solo una parte');
	});

	it('los links a donde se configura cada cosa', () => {
		const body = html(data());
		for (const href of [
			'/admin/ajustes/interruptores',
			'/admin/ajustes/automatizaciones',
			'/admin/eventos/series',
			'/admin/ajustes/textos-bot',
			'/mi-rincon/sigo'
		])
			expect(body).toContain(`href="${href}"`);
	});

	it('con el interruptor apagado explica qué pasa al prenderlo', () => {
		const off = html(data({ flags: { lo_que_sigo: false, telegram_bot: false } }));
		expect(off).toContain('Apagado');
		expect(off).toContain('no sale una tanda de mails');
		expect(html(data())).not.toContain('no sale una tanda de mails');
	});

	it('bot prendido sin configurar: lo avisa', () => {
		const body = html(data({ telegramConfig: { secretOk: true, tokenOk: false } }));
		expect(body).toContain('falta configurarlo');
		expect(body).toContain('el token para mandar avisos');
	});

	it('sin base: lo dice y muestra rayas en lugar de números', () => {
		const body = html(
			data({
				dbAvailable: false,
				stats: {
					accounts: null,
					follows: null,
					options: null,
					notices: null,
					failures: null,
					avisame: { migrated: null, pendingWithAccount: null, withoutAccount: null },
					telegram: null,
					ranking: null
				},
				followers: null
			})
		);
		expect(body).toContain('No hay base de datos disponible');
		expect(body).toContain('—');
	});
});
