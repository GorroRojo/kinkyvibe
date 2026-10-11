/**
 * La tarjeta «Telegram» y la grilla de Lo que sigo con Telegram (fase 2 del bot), render del
 * servidor (lo que se ve sin JavaScript): sin conectar, con el código, conectada y silenciada;
 * en Lo que sigo, la columna Telegram andando solo con el chat vinculado. Datos inventados.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import TelegramCard from '$lib/components/sigo/TelegramCard.svelte';
import SigoPage from '../sigo/+page.svelte';
import TelegramPage from './+page.svelte';

/** @param {Partial<import('$lib/server/telegram/web.js').TelegramCardData>} [o] */
const card = (o = {}) => ({
	linked: false,
	muted: false,
	linkedAt: null,
	botUsername: null,
	...o
});

/** @param {Record<string, any>} props */
const html = (props) => render(TelegramCard, { props: /** @type {any} */ (props) }).body;

describe('TelegramCard', () => {
	it('sin conectar: explica qué llega y ofrece «Conectar Telegram»', () => {
		const out = html({ telegram: card() });
		expect(out).toContain('data-state="sin-conectar"');
		expect(out).toContain('título, fecha y link');
		expect(out).toMatch(/<form[^>]*action="\/mi-rincon\/telegram\?\/codigo"/);
		expect(out).toContain('Conectar Telegram');
		expect(out).not.toContain('Desconectar');
	});

	it('con el código (sin JavaScript, lo que devolvió la acción): /vincular y cuándo vence', () => {
		const expiresAt = Date.parse('2031-01-10T21:15:00-03:00');
		const out = html({
			telegram: card(),
			result: { action: 'codigo', ok: true, code: 'ABCD-2345', expiresAt }
		});
		expect(out).toContain('/vincular ABCD-2345');
		expect(out).toContain('vence a las 21:15');
		expect(out).toContain('una sola vez');
		expect(out).toContain('En grupos el bot no conecta');
		// Sin el usuario del bot configurado, no hay link a t.me.
		expect(out).not.toContain('t.me/');
	});

	it('con el usuario del bot: link que abre el bot con el código', () => {
		const out = html({
			telegram: card({ botUsername: 'BotInventadoBot' }),
			result: { action: 'codigo', ok: true, code: 'ABCD-2345', expiresAt: Date.now() }
		});
		expect(out).toContain('href="https://t.me/BotInventadoBot?start=ABCD2345"');
	});

	it('el error de la acción se muestra', () => {
		const out = html({
			telegram: card(),
			result: { action: 'codigo', error: 'Pediste muchos códigos seguidos.' }
		});
		expect(out).toMatch(/role="alert"[^>]*>Pediste muchos códigos seguidos\./);
	});

	it('conectada: desde cuándo, el horario de silencio y «Desconectar»', () => {
		const out = html({
			telegram: card({ linked: true, linkedAt: Date.parse('2031-01-10T12:00:00-03:00') })
		});
		expect(out).toContain('data-state="conectado"');
		expect(out).toContain('10 de enero de 2031');
		expect(out).toContain('entre las 23 y las 9');
		expect(out).toMatch(/<form[^>]*action="\/mi-rincon\/telegram\?\/desconectar"/);
		expect(out).not.toContain('Conectar Telegram</button>');
		expect(out).not.toContain('data-state="silenciado"');
	});

	it('silenciada: cómo reanudar', () => {
		const out = html({ telegram: card({ linked: true, muted: true, linkedAt: 0 }) });
		expect(out).toContain('data-state="silenciado"');
		expect(out).toContain('/reanudar');
	});

	it('la página /mi-rincon/telegram muestra la misma tarjeta', () => {
		const out = render(TelegramPage, {
			props: /** @type {any} */ ({ data: { telegram: card() }, form: null })
		}).body;
		expect(out).toContain('Conectar Telegram');
		expect(out).toContain('href="/mi-rincon/sigo"');
	});
});

const OPTIONS = { calendario: true, mail_nuevo: true, recordatorio: false };

/** @param {Record<string, any>} [options] */
const follow = (options = OPTIONS) => ({
	kind: 'etiqueta',
	key: 'shibari',
	title: '🪢 shibari',
	name: 'shibari',
	icon: '🪢',
	color: 'red',
	href: '/wiki/shibari',
	label: 'Etiqueta',
	available: true,
	series: false,
	profileKind: null,
	image: null,
	next: null,
	options,
	createdAt: 0
});

/** @param {any} telegram @param {Record<string, any>} [options] */
const sigoPage = (telegram, options) =>
	render(SigoPage, {
		props: /** @type {any} */ ({
			data: {
				follows: [follow(options)],
				calendar: { entradas: true, participo: true },
				add: { tags: [], profiles: [] },
				telegram
			},
			form: null
		})
	}).body;

/** @param {string} out */
const switches = (out) => [...out.matchAll(/<input[^>]*role="switch"[^>]*>/g)].map((m) => m[0]);

describe('Lo que sigo con Telegram', () => {
	it('con el chat vinculado: la columna Telegram anda, con sus casillas', () => {
		const out = sigoPage(card({ linked: true, linkedAt: 0 }), {
			...OPTIONS,
			telegram_nuevo: false,
			telegram_recordatorio: true
		});
		const inputs = switches(out);
		expect(inputs.filter((i) => i.includes('disabled'))).toEqual([]);
		const named = (/** @type {string} */ n) => inputs.filter((i) => i.includes(`name="${n}"`));
		expect(named('telegram_nuevo')[0]).not.toContain('checked');
		expect(named('telegram_recordatorio')[0]).toContain('checked');
		expect(out).toContain('name="canal" value="telegram"');
		expect(out).not.toContain('Próximamente');
		expect(out).not.toContain('Sin conectar');
		expect(out).toContain('data-state="conectado"');
	});

	it('con el bot y sin chat: sin columna apagada en cada fila, la nota (una vez) y la tarjeta', () => {
		const out = sigoPage(card());
		const off = switches(out).filter((i) => !i.includes('name='));
		expect(off).toHaveLength(0);
		expect(out).not.toContain('data-channel="telegram"');
		expect(out.match(/conectá tu cuenta con el bot/g)).toHaveLength(1);
		expect(out).not.toContain('name="canal" value="telegram"');
		expect(out).toContain('Conectar Telegram');
	});

	it('sin el bot (telegram null): la nota de lo que viene (una vez) y sin tarjeta', () => {
		const out = sigoPage(null);
		expect(out).not.toContain('data-channel="telegram"');
		expect(out.match(/Vas a poder recibir esto por Telegram/g)).toHaveLength(1);
		expect(out).not.toContain('Conectar Telegram');
		expect(out).not.toContain('id="telegram-title"');
	});
});
