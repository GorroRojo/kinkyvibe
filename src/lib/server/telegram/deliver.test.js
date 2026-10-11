/**
 * Cómo se manda cada pantalla: privado contra grupo (efímeros), editar contra mandar, foto contra
 * texto, y el plan de un solo método sin token.
 */
import { describe, expect, it } from 'vitest';
import { answerOnly, deliverScreen, singleMethod } from './deliver.js';

/** @type {import('./screens.js').Screen} */
const TEXT = { text: '<b>Hola</b>', keyboard: [[{ text: '🏠 Inicio', callback_data: 'h' }]] };
/** @type {import('./screens.js').Screen} */
const CARD = {
	...TEXT,
	photo: 'https://ejemplo.test/media/a.jpg',
	preview: 'https://ejemplo.test/calendario/a'
};
const LINK = 'https://t.me/BotDePrueba?start=semana';

describe('chat privado', () => {
	it('un comando manda un mensaje; con token y foto, sendPhoto (y si falla, texto)', () => {
		const plain = deliverScreen(TEXT, { kind: 'command', chatId: 1, group: false });
		expect(plain.steps).toEqual([
			{
				method: 'sendMessage',
				chat_id: 1,
				text: '<b>Hola</b>',
				parse_mode: 'HTML',
				link_preview_options: { is_disabled: true },
				reply_markup: { inline_keyboard: TEXT.keyboard }
			}
		]);
		const photo = deliverScreen(
			CARD,
			{ kind: 'command', chatId: 1, group: false },
			{ media: true }
		);
		expect(photo.steps[0]).toMatchObject({
			method: 'sendPhoto',
			photo: CARD.photo,
			caption: CARD.text
		});
		expect(photo.fallback?.[0]).toMatchObject({
			method: 'sendMessage',
			link_preview_options: { url: CARD.preview, prefer_large_media: true, show_above_text: true }
		});
	});

	it('sin token nunca hay foto: vista previa grande', () => {
		const p = deliverScreen(CARD, { kind: 'command', chatId: 1, group: false });
		expect(p.steps[0].method).toBe('sendMessage');
		expect(p.steps[0].link_preview_options.prefer_large_media).toBe(true);
	});

	it('un botón edita el mismo mensaje y contesta el botón', () => {
		const where = /** @type {const} */ ({
			kind: 'callback',
			callbackId: 'cb',
			chatId: 1,
			group: false,
			messageId: 9
		});
		const p = deliverScreen(TEXT, where);
		expect(p.steps).toHaveLength(1);
		expect(p.steps[0]).toMatchObject({ method: 'editMessageText', chat_id: 1, message_id: 9 });
		expect(p.fallback?.[0].method).toBe('sendMessage');
		expect(p.callback).toEqual({ id: 'cb' });
	});

	it('texto → foto con editMessageMedia; foto → texto borra y manda de nuevo', () => {
		const base = /** @type {const} */ ({
			kind: 'callback',
			callbackId: 'cb',
			chatId: 1,
			group: false,
			messageId: 9
		});
		const toPhoto = deliverScreen(CARD, base, { media: true });
		expect(toPhoto.steps[0]).toMatchObject({
			method: 'editMessageMedia',
			media: { type: 'photo', media: CARD.photo, caption: CARD.text, parse_mode: 'HTML' }
		});
		expect(toPhoto.fallback?.[0].method).toBe('editMessageText');
		const back = deliverScreen(TEXT, { ...base, isPhoto: true }, { media: true });
		expect(back.steps.map((s) => s.method)).toEqual(['deleteMessage', 'sendMessage']);
		const photoToPhoto = deliverScreen(CARD, { ...base, isPhoto: true }, { media: true });
		expect(photoToPhoto.steps[0].method).toBe('editMessageMedia');
		expect(photoToPhoto.fallback?.map((s) => s.method)).toEqual(['deleteMessage', 'sendMessage']);
	});

	it('Buscar va siempre en un mensaje nuevo con force_reply', () => {
		const p = deliverScreen(
			{ ...TEXT, forceReply: true },
			{ kind: 'callback', callbackId: 'cb', chatId: 1, group: false, messageId: 9 }
		);
		expect(p.steps[0]).toMatchObject({
			method: 'sendMessage',
			reply_markup: { inline_keyboard: TEXT.keyboard, force_reply: true }
		});
	});

	it('sin botones no manda reply_markup', () => {
		const p = deliverScreen(
			{ text: 'hola', keyboard: [] },
			{ kind: 'command', chatId: 1, group: false }
		);
		expect(p.steps[0]).not.toHaveProperty('reply_markup');
	});
});

describe('grupos', () => {
	it('comando efímero: la respuesta es efímera, para quien preguntó', () => {
		const p = deliverScreen(
			CARD,
			{ kind: 'command', chatId: -100, group: true, userId: 77, ephemeralId: 5 },
			{ media: true }
		);
		expect(p.steps).toEqual([
			expect.objectContaining({
				method: 'sendMessage',
				chat_id: -100,
				ephemeral_message_parameters: { receiver_user_id: 77 },
				reply_parameters: { ephemeral_message_id: 5 }
			})
		]);
		// Nunca foto en un grupo (un efímero de foto no podría volver a texto).
		expect(p.steps[0].method).not.toBe('sendPhoto');
	});

	it('comando común: una sola respuesta pública, sin foto', () => {
		const p = deliverScreen(
			CARD,
			{ kind: 'command', chatId: -100, group: true, userId: 77 },
			{ media: true }
		);
		expect(p.steps).toHaveLength(1);
		expect(p.steps[0].method).toBe('sendMessage');
		expect(p.steps[0]).not.toHaveProperty('ephemeral_message_parameters');
	});

	it('botón de un mensaje efímero: editEphemeralMessageText, solo para quien tocó', () => {
		const p = deliverScreen(
			TEXT,
			{ kind: 'callback', callbackId: 'cb', chatId: -100, group: true, userId: 77, ephemeralId: 5 },
			{ privateLink: LINK }
		);
		expect(p.steps[0]).toMatchObject({
			method: 'editEphemeralMessageText',
			chat_id: -100,
			receiver_user_id: 77,
			ephemeral_message_id: 5
		});
		expect(p.callback?.onFail?.url).toBe(LINK);
	});

	it('botón de un mensaje público: efímero en su lugar, nunca edita el mensaje de todes', () => {
		const p = deliverScreen(
			TEXT,
			{ kind: 'callback', callbackId: 'cb', chatId: -100, group: true, userId: 77, messageId: 9 },
			{ privateLink: LINK, media: true }
		);
		expect(p.steps).toHaveLength(1);
		expect(p.steps[0]).toMatchObject({
			method: 'sendMessage',
			ephemeral_message_parameters: {
				receiver_user_id: 77,
				callback_query_id: 'cb',
				replace_callback_query_message: true
			}
		});
		expect(JSON.stringify(p)).not.toContain('editMessage');
		// Si el cliente no puede (sin efímeros): el botón abre el chat privado.
		expect(p.callback?.onFail).toEqual({
			text: 'Abrí el bot por privado para ver esto.',
			url: LINK
		});
	});

	it('sin saber quién tocó: solo el link al privado', () => {
		const p = deliverScreen(
			TEXT,
			{ kind: 'callback', callbackId: 'cb', chatId: -100, group: true },
			{ privateLink: LINK }
		);
		expect(p.steps).toEqual([]);
		expect(p.callback?.url).toBe(LINK);
	});
});

describe('singleMethod (sin token)', () => {
	it('el primer paso, o contestar el botón', () => {
		const p = deliverScreen(TEXT, { kind: 'command', chatId: 1, group: false });
		expect(singleMethod(p)).toBe(p.steps[0]);
		expect(singleMethod(answerOnly('cb', 'Ese evento ya no está disponible.'))).toEqual({
			method: 'answerCallbackQuery',
			callback_query_id: 'cb',
			text: 'Ese evento ya no está disponible.'
		});
		expect(singleMethod(null)).toBeNull();
		expect(singleMethod({ steps: [] })).toBeNull();
	});
});
