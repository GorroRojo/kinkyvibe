<script>
	/**
	 * La barra con link (decisión 0056): escanear el QR (o escribir el código, o buscar por nombre)
	 * de una entrada de este evento y entregar sus extras de a uno. Arriba, el resumen: por extra,
	 * cuántos se vendieron y cuántos se entregaron. De la persona, solo el nombre de la entrada.
	 * Ver +page.server.js. Necesita conexión (no hay lista sin conexión).
	 *
	 * Se ve como la puerta (DoorScreen): los mismos tokens oscuros, el escáner (DoorScanner), el
	 * bloque de resultado (el de DoorResult), las baldosas «Escribir código» / «Buscar persona» y sus
	 * hojas (Sheet), con los mismos valores de estilo.
	 */
	import { deserialize } from '$app/forms';
	import { tick } from 'svelte';
	import { CircleCheck, CircleX, Keyboard, Search } from '@lucide/svelte';
	import { argDateLog } from '$lib/utils/dates.js';
	import { extraSummaryText } from '$lib/utils/extras.js';
	import DoorScanner from '$lib/components/admin/door/DoorScanner.svelte';
	import ExtrasDelivery from '$lib/components/admin/door/ExtrasDelivery.svelte';
	import Sheet from '$lib/components/admin/door/Sheet.svelte';

	/** @type {import('./$types').PageData} */
	export let data;

	let summary = data.summary;
	/**
	 * La entrada a la vista.
	 * @type {{ ticketId: string, holder: string, approved: boolean,
	 *   extras: { id: string, name: string, quantity: number, delivered: number }[] } | null}
	 */
	let ticket = null;
	let message = '';
	let busy = false;
	let code = '';
	let q = '';
	let codeOpen = false;
	let searchOpen = false;
	/** @type {HTMLInputElement | undefined} */
	let codeInput;
	/** @type {HTMLInputElement | undefined} */
	let searchInput;
	/** @type {{ ticketId: string, holder: string }[]} */
	let results = [];
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let searchTimer;

	/**
	 * @param {string} name
	 * @param {Record<string, string>} fields
	 */
	async function post(name, fields) {
		const body = new FormData();
		for (const [k, v] of Object.entries(fields)) body.set(k, v);
		const res = await fetch(`?/${name}`, {
			method: 'POST',
			body,
			headers: { 'x-sveltekit-action': 'true', accept: 'application/json' }
		});
		if (res.status === 403) {
			message = 'El link de barra ya no anda (venció o lo revocaron).';
			return null;
		}
		return /** @type {any} */ (deserialize(await res.text()));
	}

	/** @param {string} raw */
	async function view(raw) {
		const value = String(raw ?? '').trim();
		if (!value || busy) return;
		busy = true;
		message = '';
		try {
			const r = await post('ver', { token: value });
			if (!r) return;
			if (r.type === 'success' && r.data?.ver?.ok) {
				ticket = r.data.ver.ticket;
				codeOpen = false;
				searchOpen = false;
				results = [];
				q = '';
				code = '';
				if (navigator.vibrate) navigator.vibrate(60);
			} else {
				ticket = null;
				message = r.data?.ver?.message ?? 'No se pudo buscar. Probá de nuevo.';
			}
		} catch {
			message = 'Sin conexión: la barra necesita conexión.';
		} finally {
			busy = false;
		}
	}

	/** @param {CustomEvent<string>} e */
	async function deliver(e) {
		if (!ticket || busy) return;
		busy = true;
		message = '';
		try {
			const r = await post('entregar', { ticket: ticket.ticketId, extra: e.detail });
			if (!r) return;
			if (r.type === 'success' && r.data?.deliver?.ok) {
				ticket = { ...ticket, extras: r.data.deliver.extras };
				if (r.data.summary) summary = r.data.summary;
			} else message = r.data?.deliver?.message ?? 'No se pudo entregar. Probá de nuevo.';
		} catch {
			message = 'Sin conexión: no se pudo entregar.';
		} finally {
			busy = false;
		}
	}

	function search() {
		clearTimeout(searchTimer);
		const text = q.trim();
		if (text.length < 2) {
			results = [];
			return;
		}
		searchTimer = setTimeout(async () => {
			try {
				const r = await post('buscar', { q: text });
				if (r?.type === 'success') results = r.data?.buscar?.results ?? [];
			} catch {
				results = [];
			}
		}, 250);
	}

	async function openCode() {
		codeOpen = true;
		await tick();
		codeInput?.focus();
	}
	async function openSearch() {
		searchOpen = true;
		await tick();
		searchInput?.focus();
	}
</script>

<svelte:head>
	<title>Barra · {data.title}</title>
	<meta name="theme-color" content="#16121a" />
</svelte:head>

<div class="door-root">
	<div class="door">
		<header class="bar">
			<div class="heading">
				<h1>{data.title}</h1>
				<p>Barra · solo extras</p>
				<p class="link-note">
					Link de barra{data.link.label ? ` «${data.link.label}»` : ''} · anda hasta el {argDateLog(
						data.link.expiresAt
					)}
				</p>
			</div>
		</header>

		<section class="counter" aria-label="Resumen de extras">
			{#if summary.length}
				<ul class="types">
					{#each summary as x (x.id)}<li>{extraSummaryText(x)}</li>{/each}
				</ul>
			{:else}
				<p class="muted">Todavía no se vendió ningún extra.</p>
			{/if}
		</section>

		<DoorScanner onscan={view} cameraApp={false}>
			{#if ticket}
				<div class="result" class:ok={ticket.approved} class:bad={!ticket.approved} role="status">
					<p class="title">
						{#if ticket.approved}<CircleCheck size={34} strokeWidth={2.5} />{:else}<CircleX
								size={34}
								strokeWidth={2.5}
							/>{/if}
						<span>{ticket.holder}</span>
					</p>
					{#if !ticket.approved}
						<p class="who">
							Esta compra no está aprobada (reembolsada o sin pagar): no se entrega.
						</p>
					{/if}
					{#if ticket.extras.length}
						<ExtrasDelivery
							extras={ticket.extras}
							{busy}
							disabled={!ticket.approved}
							on:deliver={deliver}
						/>
					{:else}
						<p class="who">Esta compra no tiene extras.</p>
					{/if}
				</div>
			{/if}
		</DoorScanner>

		{#if message}<p class="warn-note" role="alert">{message}</p>{/if}

		<div class="actions">
			<button type="button" class="tile" on:click={openCode}>
				<Keyboard size={30} /> Escribir código
			</button>
			<button type="button" class="tile" on:click={openSearch}>
				<Search size={30} /> Buscar persona
			</button>
		</div>
	</div>

	<Sheet bind:open={codeOpen} title="Escribir código">
		<form class="stack" on:submit|preventDefault={() => view(code)}>
			<label class="field">
				<span>Código de la entrada (el de al lado del QR) o link del QR</span>
				<input
					bind:this={codeInput}
					bind:value={code}
					class="code-input"
					autocomplete="off"
					autocapitalize="characters"
					spellcheck="false"
					placeholder="Ej.: 7HQ 4XM"
					required
				/>
			</label>
			<button type="submit" class="primary" disabled={busy}>Ver</button>
		</form>
	</Sheet>

	<Sheet bind:open={searchOpen} title="Buscar persona">
		<div class="stack">
			<input
				bind:this={searchInput}
				type="search"
				bind:value={q}
				on:input={search}
				placeholder="El nombre de la entrada"
				aria-label="Buscar por el nombre de la entrada"
				autocomplete="off"
				autocapitalize="off"
				spellcheck="false"
			/>
			<ul class="suggestions" aria-label="Sugerencias">
				{#each results as r (r.ticketId)}
					<li>
						<button type="button" class="option" on:click={() => view(`ticket:${r.ticketId}`)}
							><strong>{r.holder}</strong></button
						>
					</li>
				{:else}
					{#if q.trim().length >= 2}<li class="muted">Nadie con extras con ese nombre.</li>{/if}
				{/each}
			</ul>
		</div>
	</Sheet>
</div>

<style>
	/* Los mismos tokens y valores que la puerta (DoorScreen.svelte, DoorResult.svelte). */
	.door-root {
		--bg: #16121a;
		--surface: #221c28;
		--surface-2: #2c2533;
		--line: #3a3242;
		--text: #f1ecf4;
		--muted: #a9a0b0;
		--accent: hsl(319, 90%, 60%);
		--accent-dark: hsl(319, 100%, 35%);
		--link: hsl(262, 100%, 82%);
		--ok: hsl(165, 70%, 62%);
		--ok-bg: hsl(165, 40%, 14%);
		--warn: hsl(50, 100%, 70%);
		--bad: hsl(330, 100%, 78%);
		--bad-bg: hsl(325, 55%, 20%);
		--warn-bg: hsl(45, 45%, 22%);
		--accent-ink: white;
		color-scheme: dark;
		color: var(--text);
		background: var(--bg);
		min-height: 100dvh;
		font-family: 'Lato', sans-serif;
	}
	.door {
		background: var(--bg);
		color: var(--text);
		padding: calc(env(safe-area-inset-top, 0px) + 0.8rem) 16px
			calc(env(safe-area-inset-bottom, 0px) + 1.5rem);
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		max-width: 40rem;
		margin: 0 auto;
		box-sizing: border-box;
	}
	:global(html:has(.door-root)),
	:global(body:has(.door-root)) {
		background: #16121a;
	}
	h1,
	p {
		margin: 0;
	}
	.bar {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
	}
	.heading {
		flex: 1;
		min-width: 0;
	}
	h1 {
		font-size: var(--text-base);
		font-weight: 700;
		line-height: 1.2;
	}
	.heading p {
		color: var(--muted);
		font-size: var(--text-sm);
	}
	.heading .link-note {
		color: var(--warn);
	}
	.counter {
		background: var(--surface);
		border-radius: var(--radius-l);
		padding: var(--space-xs) var(--space-s);
	}
	.types {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-3xs);
		font-weight: 700;
	}
	.muted {
		color: var(--muted);
	}
	/* El bloque de resultado de DoorResult.svelte. */
	.result {
		border-radius: var(--radius-l);
		padding: var(--space-xs) var(--space-s) var(--space-xs);
		display: flex;
		flex-direction: column;
		gap: var(--space-3xs);
		animation: pop 0.22s ease-out;
		box-shadow: var(--shadow-3);
	}
	.ok {
		background: var(--3);
		color: #032a1f;
	}
	.bad {
		background: var(--1-dark-fixed, hsl(319, 100%, 40%));
		color: #fff;
	}
	.title {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 0.45rem;
		font-size: var(--text-2xl);
		font-weight: 700;
		line-height: 1.1;
		overflow-wrap: anywhere;
	}
	.who {
		font-size: var(--text-base);
		overflow-wrap: anywhere;
	}
	@keyframes pop {
		from {
			transform: scale(0.95);
			opacity: 0.5;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.result {
			animation: none;
		}
	}
	.warn-note {
		display: flex;
		gap: var(--space-2xs);
		align-items: flex-start;
		margin: 0;
		padding: var(--space-2xs) var(--space-xs);
		border-radius: var(--radius-m);
		background: color-mix(in srgb, var(--warn) 18%, var(--surface));
		color: var(--text);
	}
	.actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-2xs);
	}
	.tile {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.4rem;
		padding: var(--space-s) var(--space-2xs);
		border-radius: var(--radius-l);
		border: 0;
		background: var(--surface-2);
		color: var(--text);
		font-weight: 700;
		font-size: var(--text-base);
		cursor: pointer;
	}
	.stack {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-3xs);
		font-size: var(--text-sm);
		color: var(--muted);
		min-width: 0;
	}
	input {
		font: inherit;
		font-size: var(--text-field);
		padding: var(--space-2xs) var(--space-xs);
		min-height: 3rem;
		border-radius: var(--radius-m);
		border: 2px solid var(--line);
		background: var(--surface-2);
		color: var(--text);
		width: 100%;
		box-sizing: border-box;
	}
	.code-input {
		font-size: var(--text-lg) !important;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		text-align: center;
	}
	.primary {
		font: inherit;
		font-weight: 700;
		font-size: var(--text-base);
		min-height: 3.2rem;
		border: 0;
		border-radius: 2em;
		background: var(--accent);
		color: #fff;
		cursor: pointer;
	}
	.primary:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.suggestions {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-3xs);
	}
	.option {
		display: flex;
		width: 100%;
		text-align: left;
		font: inherit;
		color: var(--text);
		border: 0;
		padding: var(--space-2xs) var(--space-xs);
		min-height: 2.8rem;
		border-radius: var(--radius-m);
		background: var(--surface-2);
		cursor: pointer;
		overflow-wrap: anywhere;
	}
	.option:hover,
	.option:focus-visible {
		outline: 2px solid var(--link);
	}
</style>
