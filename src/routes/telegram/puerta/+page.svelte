<script>
	/**
	 * La puerta con el escáner de QR de Telegram (`showScanQrPopup`, core.telegram.org/bots/webapps;
	 * decisión 0037). Cada código escaneado va a `api`, que valida el `initData` y los permisos en
	 * el servidor. Fuera de Telegram no hace nada.
	 *
	 * El evento se elige de una lista (los de hoy y los de los próximos días, de `eventos`, con los
	 * mismos permisos); con uno solo hoy, queda elegido. `?evento=` sigue andando y, para uno que no
	 * está en la lista, se puede escribir la dirección.
	 *
	 * Avisos de puerta (decisión 0051): si la respuesta trae `notice`, se muestra solo
	 * `DOOR_NOTICE_TEXT` debajo del resultado; el ingreso ya se marcó igual.
	 */
	import { onMount } from 'svelte';
	import { defaultDoorSlug, doorEventWhen } from '$lib/utils/doorEvents.js';
	import { DOOR_NOTICE_TEXT } from '$lib/utils/doorNotices.js';

	/** @type {import('./$types').PageData} */
	export let data;

	/** @type {any} */
	let tg = null;
	let slug = data.slug;
	/** @type {{ tone: 'ok' | 'warn' | 'error', text: string, notice?: boolean } | null} */
	let last = null;
	let busy = false;
	/** @type {import('$lib/utils/doorEvents.js').DoorEvent[]} */
	let events = [];
	/** @type {'loading' | 'ready' | 'error'} */
	let listState = 'loading';
	/** Escribir la dirección a mano (un evento que no está en la lista). */
	let typing = false;

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
			loadEvents();
		}
	});

	async function loadEvents() {
		try {
			const res = await fetch('/telegram/puerta/eventos', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ initData: tg.initData })
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok || !Array.isArray(body.events)) throw new Error('lista');
			events = body.events;
			slug = defaultDoorSlug(events, slug);
			typing = Boolean(slug) && !events.some((e) => e.slug === slug);
			listState = 'ready';
		} catch {
			// Sin lista: queda escribir la dirección, como antes.
			listState = 'error';
			typing = true;
		}
	}

	/** @param {string} value */
	function pick(value) {
		slug = value;
		last = null;
	}

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
				last = {
					tone: r.tone,
					text: body.holder ? `${r.text} ${body.holder}` : r.text,
					notice: body.notice === true
				};
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
		{#if listState === 'loading'}
			<p class="hint">Buscando los eventos de hoy…</p>
		{:else if listState === 'ready'}
			{#if events.length}
				<fieldset>
					<legend>Evento</legend>
					{#each events as event (event.slug)}
						<button
							type="button"
							class="event"
							class:selected={!typing && slug === event.slug}
							aria-pressed={!typing && slug === event.slug}
							on:click={() => {
								typing = false;
								pick(event.slug);
							}}
						>
							<span class="when">{doorEventWhen(event)}</span>
							<span>{event.title}</span>
						</button>
					{/each}
				</fieldset>
			{:else}
				<p class="hint">No hay eventos con entradas hoy ni en los próximos días.</p>
			{/if}
			{#if !typing}
				<button
					type="button"
					class="link"
					on:click={() => {
						typing = true;
						pick('');
					}}>Otro evento: escribir la dirección</button
				>
			{/if}
		{:else}
			<p class="hint">No pude traer la lista de eventos: escribí la dirección.</p>
		{/if}
		{#if typing}
			<label>
				Evento (dirección)
				<input bind:value={slug} autocomplete="off" spellcheck="false" />
			</label>
		{/if}
		<button type="button" on:click={scan} disabled={busy || !slug}>📷 Escanear entrada</button>
		{#if last}
			<p class="result {last.tone}" role="status">{last.text}</p>
			{#if last.notice}
				<p class="result notice" role="alert">⚠️ {DOOR_NOTICE_TEXT}</p>
			{/if}
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
	fieldset {
		border: 0;
		padding: 0;
		margin: 12px 0;
		display: grid;
		gap: 8px;
	}
	legend {
		margin-bottom: 4px;
	}
	.event {
		display: grid;
		gap: 2px;
		text-align: left;
		font-weight: 400;
		background: var(--tg-theme-secondary-bg-color, #f2f2f2);
		color: var(--tg-theme-text-color, #1a1a1a);
		border: 2px solid transparent;
	}
	.event.selected {
		border-color: var(--tg-theme-button-color, #d61f8a);
		font-weight: 600;
	}
	.when {
		font-size: 14px;
		color: var(--tg-theme-hint-color, #666);
	}
	.link {
		background: none;
		color: var(--tg-theme-link-color, #d61f8a);
		padding: 8px 0;
		font-weight: 400;
		text-decoration: underline;
	}
	.hint {
		color: var(--tg-theme-hint-color, #666);
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
	.notice {
		margin-top: 8px;
		background: #fff1c2;
		color: #4d3800;
		border: 2px solid #6b4e00;
	}
</style>
