/**
 * La tarjeta compacta como mensaje enriquecido (`telegram_enriquecido`): cómo se manda
 * (deliver.js: `sendRichMessage` o `editMessageText` con `rich_message`, y la de texto si Telegram
 * la rechaza) y cuándo (router.js: solo por chat privado y con el token; en grupos y sin token, la
 * de siempre). Datos inventados.
 */
import { describe, expect, it } from 'vitest';
import { deliverScreen } from './deliver.js';
import { makeInlineSource } from './inlineSource.js';
import { shortHash } from './nav.js';
import { planUpdate } from './router.js';

const NOW = Date.parse('2031-01-10T12:00:00-03:00');
const ORIGIN = 'https://kinkyvibe.ar';

/** @type {import('./screens.js').Screen} */
const SCREEN = {
	text: '<b>Cuerdas</b>',
	keyboard: [[{ text: 'Ver en el sitio', url: `${ORIGIN}/wiki/x` }]],
	rich: { html: '<h3>Cuerdas</h3>' }
};
const RICH = { html: '<h3>Cuerdas</h3>' };
const MARKUP = { inline_keyboard: SCREEN.keyboard };

describe('deliverScreen con una pantalla enriquecida', () => {
	it('un comando por privado, con token: sendRichMessage; si falla, el texto', () => {
		const plan = deliverScreen(
			SCREEN,
			{ kind: 'command', chatId: 5, group: false },
			{ media: true }
		);
		expect(plan.steps).toEqual([
			{ method: 'sendRichMessage', chat_id: 5, rich_message: RICH, reply_markup: MARKUP }
		]);
		expect(plan.fallback).toEqual([expect.objectContaining({ method: 'sendMessage', chat_id: 5 })]);
	});

	it('un botón: edita el mismo mensaje con rich_message; si falla, lo edita como texto', () => {
		const plan = deliverScreen(
			SCREEN,
			{ kind: 'callback', callbackId: 'cb', chatId: 5, group: false, messageId: 9 },
			{ media: true }
		);
		expect(plan.steps).toEqual([
			{
				method: 'editMessageText',
				chat_id: 5,
				message_id: 9,
				rich_message: RICH,
				reply_markup: MARKUP
			}
		]);
		expect(plan.fallback).toEqual([
			expect.objectContaining({
				method: 'editMessageText',
				chat_id: 5,
				message_id: 9,
				text: '<b>Cuerdas</b>'
			})
		]);
		expect(plan.fallback?.[0]).not.toHaveProperty('rich_message');
		expect(plan.callback).toEqual({ id: 'cb' });
	});

	it('desde una foto: la borra y manda el enriquecido; si falla, un texto', () => {
		const plan = deliverScreen(
			SCREEN,
			{ kind: 'callback', callbackId: 'cb', chatId: 5, group: false, messageId: 9, isPhoto: true },
			{ media: true }
		);
		expect(plan.steps.map((s) => s.method)).toEqual(['deleteMessage', 'sendRichMessage']);
		expect(plan.fallback?.map((s) => s.method)).toEqual(['sendMessage']);
	});

	it('en un grupo o sin token: la pantalla de texto de siempre', () => {
		const { rich, ...plain } = SCREEN;
		expect(rich).toBeTruthy();
		const group = { kind: 'command', chatId: -5, group: true, userId: 3, ephemeralId: 4 };
		expect(deliverScreen(SCREEN, /** @type {any} */ (group), { media: true })).toEqual(
			deliverScreen(plain, /** @type {any} */ (group), { media: true })
		);
		const priv = /** @type {const} */ ({ kind: 'command', chatId: 5, group: false });
		expect(deliverScreen(SCREEN, priv, { media: false })).toEqual(
			deliverScreen(plain, priv, { media: false })
		);
	});
});

describe('el router: la tarjeta compacta de Buscar', () => {
	/** @type {import('$lib/utils/search').SearchDoc} */
	const doc = {
		c: 'wiki',
		h: '/wiki/cuerdas-inventadas',
		t: 'Cuerdas inventadas',
		s: 'Una definición inventada.',
		b: 'Un texto inventado.'
	};
	const source = makeInlineSource(
		{ raw: { v: 1, docs: [doc], tags: {} }, posts: [], wikiPosts: [], profiles: [] },
		{}
	);

	/**
	 * Tocar el resultado de «cuerdas».
	 *
	 * @param {{ rich?: boolean, media?: boolean, group?: boolean }} opts
	 */
	const tap = ({ rich = false, media = false, group = false }) =>
		planUpdate(
			{
				callback_query: {
					id: 'cb',
					from: { id: 9 },
					data: `r:${shortHash(doc.h)}:0:cuerdas`,
					message: {
						message_id: 3,
						chat: group ? { id: -9, type: 'supergroup' } : { id: 9, type: 'private' }
					}
				}
			},
			{
				listUpcoming: async () => [],
				origin: ORIGIN,
				now: () => NOW,
				media,
				inline: { source: async () => source, ...(rich ? { rich: true } : {}) }
			}
		);

	it('con el interruptor y el token, por privado: enriquecida, con el texto del índice', async () => {
		const plan = await tap({ rich: true, media: true });
		const [step] = /** @type {any[]} */ (plan?.steps ?? []);
		expect(step.method).toBe('editMessageText');
		expect(step.rich_message.html).toContain('<p>Un texto inventado.</p>');
		expect(step.rich_message.html).toContain('<h3>📖 Cuerdas inventadas</h3>');
	});

	it('sin el interruptor, sin token o en un grupo: la de siempre', async () => {
		for (const opts of [
			{ media: true },
			{ rich: true, media: false },
			{ rich: true, media: true, group: true }
		]) {
			expect(JSON.stringify(await tap(opts)), JSON.stringify(opts)).not.toContain('rich_message');
		}
	});
});
