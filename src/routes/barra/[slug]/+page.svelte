<script>
	/**
	 * La barra con link (decisión 0056): escanear el QR (o escribir el código, o buscar por nombre)
	 * de una entrada de este evento y entregar sus extras de a uno. Arriba, el resumen: por extra,
	 * cuántos se vendieron y cuántos se entregaron. De la persona, solo el nombre de la entrada.
	 * Ver +page.server.js. Necesita conexión (no hay lista sin conexión).
	 */
	import { deserialize } from '$app/forms';
	import { argDateLog } from '$lib/utils/dates.js';
	import { extraSummaryText } from '$lib/utils/extras.js';
	import DoorScanner from '$lib/components/admin/door/DoorScanner.svelte';
	import ExtrasDelivery from '$lib/components/admin/door/ExtrasDelivery.svelte';

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
</script>

<svelte:head>
	<title>Barra · {data.title}</title>
	<meta name="theme-color" content="#16121a" />
</svelte:head>

<div class="bar-root">
	<main class="bar-page">
		<header>
			<h1>{data.title}</h1>
			<p class="link-note">
				Link de barra{data.link.label ? ` «${data.link.label}»` : ''} · anda hasta el {argDateLog(
					data.link.expiresAt
				)}
			</p>
		</header>

		<section class="summary" aria-label="Resumen de extras">
			{#if summary.length}
				<ul>
					{#each summary as x (x.id)}<li>{extraSummaryText(x)}</li>{/each}
				</ul>
			{:else}
				<p class="muted">Todavía no se vendió ningún extra.</p>
			{/if}
		</section>

		<DoorScanner onscan={view} cameraApp={false}>
			{#if ticket}
				<div class="result" role="status" aria-live="polite">
					<p class="who"><strong>{ticket.holder}</strong></p>
					{#if !ticket.approved}
						<p class="warn">
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
						<p class="muted">Esta compra no tiene extras.</p>
					{/if}
				</div>
			{/if}
		</DoorScanner>

		{#if message}<p class="error" role="alert">{message}</p>{/if}

		<form class="row" on:submit|preventDefault={() => view(code)}>
			<label>
				<span>Escribir código</span>
				<input
					bind:value={code}
					autocomplete="off"
					autocapitalize="characters"
					spellcheck="false"
					placeholder="Las 6 letras y números del QR"
				/>
			</label>
			<button type="submit" class="go" disabled={busy || !code.trim()}>Ver</button>
		</form>

		<div class="search">
			<label>
				<span>Buscar por nombre</span>
				<input
					type="search"
					bind:value={q}
					on:input={search}
					autocomplete="off"
					placeholder="El nombre de la entrada"
				/>
			</label>
			{#if results.length}
				<ul class="results">
					{#each results as r (r.ticketId)}
						<li>
							<button type="button" on:click={() => view(`ticket:${r.ticketId}`)}>{r.holder}</button
							>
						</li>
					{/each}
				</ul>
			{:else if q.trim().length >= 2}
				<p class="muted small">Nadie con extras con ese nombre.</p>
			{/if}
		</div>
	</main>
</div>

<style>
	/* Oscuro, como la puerta. */
	.bar-root {
		--bg: #16121a;
		--surface: #221c28;
		--surface-2: #2c2533;
		--line: #3a3242;
		--text: #f1ecf4;
		--muted: #a9a0b0;
		--accent: hsl(319, 90%, 60%);
		--warn: hsl(50, 100%, 70%);
		--bad: hsl(330, 100%, 78%);
		--accent-ink: white;
		color-scheme: dark;
		color: var(--text);
		background: var(--bg);
		min-height: 100dvh;
		font-family: 'Lato', sans-serif;
	}
	:global(html:has(.bar-root)),
	:global(body:has(.bar-root)) {
		background: #16121a;
	}
	.bar-page {
		max-width: 40rem;
		margin: 0 auto;
		padding: calc(env(safe-area-inset-top, 0px) + 0.8rem) 16px 1.5rem;
		display: grid;
		gap: 0.8rem;
		box-sizing: border-box;
	}
	h1,
	p {
		margin: 0;
	}
	h1 {
		font-size: var(--text-base, 1rem);
		line-height: 1.2;
	}
	.link-note {
		color: var(--warn);
		font-size: var(--text-sm, 0.9rem);
	}
	.summary {
		padding: 0.6rem 0.8rem;
		border-radius: 0.8rem;
		background: var(--surface);
	}
	.summary ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.2rem;
		font-weight: 700;
	}
	.result {
		display: grid;
		gap: 0.5rem;
		padding: 0.7rem 0.8rem;
		border-radius: 0.8rem;
		background: var(--surface);
		box-shadow: 0 6px 20px rgb(0 0 0 / 0.35);
	}
	.who {
		font-size: var(--text-lg, 1.2rem);
	}
	.warn {
		color: var(--warn);
	}
	.error {
		color: var(--bad);
		font-weight: 700;
	}
	.muted {
		color: var(--muted);
	}
	.small {
		font-size: var(--text-sm, 0.9rem);
	}
	label {
		display: grid;
		gap: 0.25rem;
		flex: 1;
		min-width: 0;
	}
	label span {
		font-size: var(--text-sm, 0.9rem);
		color: var(--muted);
	}
	input {
		min-height: 48px;
		padding: 0 0.8rem;
		border-radius: 0.6rem;
		border: 1px solid var(--line);
		background: var(--surface-2);
		color: var(--text);
		font: inherit;
		box-sizing: border-box;
		width: 100%;
	}
	.row {
		display: flex;
		align-items: end;
		gap: 0.5rem;
	}
	.go {
		min-height: 48px;
		padding: 0 1.1rem;
		border: 0;
		border-radius: 999px;
		background: var(--accent);
		color: var(--accent-ink);
		font: inherit;
		font-weight: 700;
	}
	.go:disabled {
		background: var(--line);
		color: var(--muted);
	}
	.search {
		display: grid;
		gap: 0.4rem;
	}
	.results {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.3rem;
	}
	.results button {
		width: 100%;
		min-height: 44px;
		text-align: left;
		padding: 0 0.8rem;
		border: 1px solid var(--line);
		border-radius: 0.6rem;
		background: var(--surface);
		color: var(--text);
		font: inherit;
	}
</style>
