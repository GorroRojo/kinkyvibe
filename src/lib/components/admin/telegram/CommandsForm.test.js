/**
 * «Actualizar comandos del bot», render del servidor: el botón, el aviso sin token y lo que quedó
 * registrado (o el error) después de tocarlo.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import CommandsForm from './CommandsForm.svelte';
import { textOf } from '$lib/testing/html.js';

/** @param {Record<string, unknown>} props */
const html = (props) => render(CommandsForm, { props }).body;

describe('CommandsForm', () => {
	it('el botón manda ?/comandos', () => {
		const h = html({ tokenOk: true });
		expect(h).toContain('action="?/comandos"');
		expect(textOf(h)).toContain('Actualizar comandos del bot');
		expect(textOf(h)).not.toContain('Falta el token');
	});

	it('sin token: lo avisa', () => {
		expect(textOf(html({ tokenOk: false }))).toContain('Falta el token del bot');
	});

	it('después: qué quedó registrado en cada alcance', () => {
		const text = textOf(
			html({
				tokenOk: true,
				form: {
					commandsOk: true,
					commandsResults: [
						{
							scope: 'default',
							label: 'Para todes (grupos y chats)',
							commands: ['proximos', 'ayuda'],
							ok: true
						},
						{
							scope: 'all_private_chats',
							label: 'En chats privados',
							commands: ['vincular'],
							ok: true
						}
					]
				}
			})
		);
		expect(text).toContain('Listo: Telegram ya tiene los comandos.');
		expect(text).toContain('Para todes (grupos y chats):');
		expect(text).toContain('/proximos, /ayuda');
		expect(text).toContain('/vincular');
	});

	it('si falló: el error de cada alcance', () => {
		const text = textOf(
			html({
				tokenOk: true,
				form: {
					commandsError: 'Telegram no aceptó los comandos.',
					commandsResults: [
						{
							scope: 'default',
							label: 'Para todes (grupos y chats)',
							commands: ['ayuda'],
							ok: false,
							error: 'Telegram respondió 401.'
						}
					]
				}
			})
		);
		expect(text).toContain('Telegram no aceptó los comandos.');
		expect(text).toContain('no se registró (Telegram respondió 401.)');
	});
});
