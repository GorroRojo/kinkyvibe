<script>
	/**
	 * La puerta con el escáner de QR de Telegram (`showScanQrPopup`, core.telegram.org/bots/webapps;
	 * decisión 0036). Cada código escaneado va a `api`, que valida el `initData` y los permisos en
	 * el servidor. Fuera de Telegram no hace nada.
	 */
	import { onMount } from 'svelte';

	/** @type {import('./$types').PageData} */
	export let data;

	/** @type {any} */
	let tg = null;
	let slug = data.slug;
	/** @type {{ tone: 'ok' | 'warn' | 'error', text: string } | null} */
	let last = null;
	let busy = false;

	/** @type {Record<string, { tone: 'ok' | 'warn' | 'error', text: string }>} */
	const RESULTS = {
		ok: { tone: 'ok', text: 'Adelante: ingreso marcado.' },
		already: { tone: 'warn', text: 'Esta entrada ya ingresó.' },
		'wrong-event': { tone: 'error', text: 'Es de otro evento.' },
		void: { tone: 'error', text: 'La orden no está aprobada.' },
		invalid: { tone: 'error', text: 'No es una entrada válida.' }
	};

	onMount(() => {
		const app = /** @type {any} */ (window).Telegram?.WebApp;
		if (app?.initData) {
			tg = app;
			tg.ready();
		}
	});

	/** @param {string} code */
	async function send(code) {
		busy = true;
		try {
			const res = await fetch('/telegram/puerta/api', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ initData: tg.initData, evento: slug, codigo: code })
			});
			const body = await res.json().catch(() => ({}));
			if (res.status === 403 && body.reason === 'stale')
				last = {
					tone: 'error',
					text: 'Pasó más de una hora desde que abriste la puerta: cerrala y volvé a abrirla desde el bot.'
				};
			else if (res.status === 403)
				last = {
					tone: 'error',
					text: 'Este Telegram no está vinculado a une admin. Vinculalo en el panel: Ajustes → Admins.'
				};
			else if (res.status === 429) last = { tone: 'warn', text: 'Más despacio 🙂' };
			else if (!res.ok) last = { tone: 'error', text: 'Algo salió mal. Probá de nuevo.' };
			else {
				const r = RESULTS[body.result] ?? RESULTS.invalid;
				last = { tone: r.tone, text: body.holder ? `${r.text} ${body.holder}` : r.text };
			}
		} catch {
			// Sin conexión o el servidor no contestó: no se marcó nada.
			last = { tone: 'error', text: 'No hay conexión: no se marcó. Probá de nuevo.' };
		} finally {
			tg.HapticFeedback?.notificationOccurred?.(last?.tone === 'ok' ? 'success' : 'error');
			busy = false;
		}
	}

	function scan() {
		if (!tg || !slug) return;
		tg.showScanQrPopup({ text: 'Escaneá el QR de la entrada' }, (/** @type {string} */ text) => {
			send(text);
			return true;
		});
	}
</script>

<svelte:head>
	<title>Puerta · Kinky Vibe</title>
	<meta name="robots" content="noindex" />
	<script src="https://telegram.org/js/telegram-web-app.js?64"></script>
</svelte:head>

<main>
	<h1>Puerta</h1>
	{#if !tg}
		<p>
			Esto se abre desde el bot de Telegram, con el Telegram vinculado en el panel (Ajustes →
			Admins).
		</p>
	{:else}
		<label>
			Evento (dirección)
			<input bind:value={slug} autocomplete="off" spellcheck="false" />
		</label>
		<button type="button" on:click={scan} disabled={busy || !slug}>📷 Escanear entrada</button>
		{#if last}
			<p class="result {last.tone}" role="status">{last.text}</p>
		{/if}
	{/if}
</main>

<style>
	main {
		background: var(--tg-theme-bg-color, #fff);
		color: var(--tg-theme-text-color, #1a1a1a);
		font:
			16px/1.4 -apple-system,
			'Segoe UI',
			Roboto,
			sans-serif;
		padding: 16px;
		max-width: 480px;
		margin: 0 auto;
	}
	label {
		display: grid;
		gap: 4px;
		margin: 12px 0;
	}
	input {
		font: inherit;
		padding: 8px;
	}
	button {
		width: 100%;
		padding: 14px;
		font: inherit;
		font-weight: 600;
		border: 0;
		border-radius: 12px;
		background: var(--tg-theme-button-color, #d61f8a);
		color: var(--tg-theme-button-text-color, #fff);
	}
	.result {
		margin-top: 16px;
		padding: 14px;
		border-radius: 12px;
		font-weight: 600;
	}
	.ok {
		background: #d8f5dd;
		color: #135c25;
	}
	.warn {
		background: #fff1c2;
		color: #6b4e00;
	}
	.error {
		background: #fde0e0;
		color: #8a1414;
	}
</style>
