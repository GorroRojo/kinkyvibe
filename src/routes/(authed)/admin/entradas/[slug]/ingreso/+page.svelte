<script>
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import QrScanner from '$lib/components/QrScanner.svelte';
	import { tick } from 'svelte';

	let { data, form } = $props();

	// --- Buscador con sugerencias (combobox accesible: flechas, Enter, Escape) ---
	/**
	 * @typedef {{ id: string, token: string, code: string, holder: string, pronouns: string,
	 *   buyer: string, email: string, dni: string, type: string, checkedInAt: number | null,
	 *   match: { field: string, label: string, value: string } | null }} Suggestion
	 */
	// svelte-ignore state_referenced_locally
	let query = $state(data.q);
	/** @type {Suggestion[]} */
	let suggestions = $state([]);
	let active = $state(-1);
	let open = $state(false);
	let searched = $state('');
	/** @type {AbortController | null} */
	let inflight = null;
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let debounce;

	function suggest() {
		clearTimeout(debounce);
		const q = query.trim();
		if (q.length < 2) {
			inflight?.abort();
			suggestions = [];
			open = false;
			active = -1;
			searched = '';
			return;
		}
		debounce = setTimeout(async () => {
			inflight?.abort();
			const controller = new AbortController();
			inflight = controller;
			try {
				const res = await fetch(
					`/admin/entradas/${data.slug}/ingreso/buscar?q=${encodeURIComponent(q)}`,
					{ signal: controller.signal, headers: { accept: 'application/json' } }
				);
				if (!res.ok) return;
				const body = await res.json();
				if (controller.signal.aborted) return;
				suggestions = body.results;
				searched = q;
				active = -1;
				open = true;
			} catch {
				// abortada o sin conexión: se puede seguir buscando con el botón
			}
		}, 150);
	}

	/** @param {Suggestion} s */
	function choose(s) {
		open = false;
		active = -1;
		// La búsqueda por código (o token) muestra exactamente esa entrada, con "Marcar ingreso".
		query = s.code || s.token;
		goto(`?q=${encodeURIComponent(query)}`, { keepFocus: true, noScroll: true });
	}

	/** @param {KeyboardEvent} e */
	function onkeydown(e) {
		if (e.key === 'ArrowDown' && suggestions.length) {
			e.preventDefault();
			open = true;
			active = (active + 1) % suggestions.length;
		} else if (e.key === 'ArrowUp' && suggestions.length) {
			e.preventDefault();
			open = true;
			active = active <= 0 ? suggestions.length - 1 : active - 1;
		} else if (e.key === 'Enter' && open && active >= 0) {
			e.preventDefault();
			choose(suggestions[active]);
		} else if (e.key === 'Escape' && open) {
			e.preventDefault();
			open = false;
			active = -1;
		}
	}

	/** @type {HTMLFormElement | undefined} */
	let checkinForm = $state();
	let token = $state('');
	let busy = $state(false);

	let r = $derived(form?.checkin);

	/** @param {string} value */
	async function onscan(value) {
		if (busy || !checkinForm) return;
		token = value;
		// Esperamos a que el input tenga el valor nuevo antes de enviar.
		await tick();
		checkinForm?.requestSubmit();
	}

	/** @param {string | null | undefined} dni */
	function formatDni(dni) {
		return dni ? `DNI ${Number(dni).toLocaleString('es-AR')}` : 'sin DNI';
	}

	/** @param {number | null | undefined} ms */
	function time(ms) {
		return ms
			? new Date(ms).toLocaleTimeString('es-AR', {
					hour: '2-digit',
					minute: '2-digit',
					hourCycle: 'h23',
					timeZone: 'America/Argentina/Buenos_Aires'
				})
			: '';
	}
</script>

<svelte:head>
	<title>Ingreso · {data.title} - KV Admin</title>
</svelte:head>

<div class="ingreso">
	<p class="back"><a href="/admin/entradas/{data.slug}">← {data.title}</a></p>
	<h1>Control de ingreso</h1>
	<p class="progress" aria-live="polite">
		Ingresaron <strong>{data.progress.inside}</strong> de {data.progress.total}
	</p>

	{#if r}
		{#key r.stamp}
			<div class="result result-{r.result}" role="status" aria-live="assertive">
				{#if r.result === 'ok'}
					<p class="big">✅ Adelante</p>
					<p>
						<strong>{r.holder}</strong>{#if r.pronouns}
							({r.pronouns}){/if} · {r.type}{#if r.code}&nbsp;· {r.code}{/if}
					</p>
					<p class="buyer">Compró: {r.buyer} · <span class="dni">{formatDni(r.dni)}</span></p>
					{#if r.ticketId}
						<form method="POST" action="?/undo" use:enhance>
							<input type="hidden" name="ticket" value={r.ticketId} />
							<button type="submit" class="undo">Deshacer</button>
						</form>
					{/if}
				{:else if r.result === 'already'}
					<p class="big">⚠️ Ya ingresó</p>
					<p>{r.holder} · {r.type}</p>
					<p class="buyer">Compró: {r.buyer} · <span class="dni">{formatDni(r.dni)}</span></p>
					<p>A las {time(r.at)} (marcó {r.by})</p>
				{:else if r.result === 'wrong-event'}
					<p class="big">❌ Es de otro evento</p>
					<p>Esta entrada es para: {r.otherEvent}</p>
				{:else if r.result === 'void'}
					<p class="big">❌ Entrada anulada</p>
					<p>{r.holder} · la compra fue reembolsada o cancelada.</p>
				{:else if r.result === 'invalid'}
					<p class="big">❌ QR inválido</p>
					<p>No existe ninguna entrada con ese código.</p>
				{:else}
					<p class="big">❌ Error</p>
					<p>Probá de nuevo.</p>
				{/if}
			</div>
		{/key}
	{/if}
	{#if form?.undo}
		<p class="flash">{form.undo.ok ? 'Ingreso deshecho.' : 'No se pudo deshacer.'}</p>
	{/if}

	<QrScanner {onscan} />

	<form
		bind:this={checkinForm}
		method="POST"
		action="?/checkin"
		class="manual"
		use:enhance={() => {
			busy = true;
			return async ({ update }) => {
				await update({ reset: false });
				token = '';
				busy = false;
			};
		}}
	>
		<label>
			<span>Código de la entrada (el de al lado del QR) o link del QR</span>
			<input
				name="token"
				bind:value={token}
				autocomplete="off"
				autocapitalize="off"
				spellcheck="false"
				placeholder="7HQ 4XM"
				required
			/>
		</label>
		<button type="submit" disabled={busy}>Validar</button>
	</form>

	<h2 id="buscar-titulo">Buscar</h2>
	<form
		method="GET"
		class="search"
		data-sveltekit-keepfocus
		onsubmit={() => {
			open = false;
		}}
	>
		<div class="combo">
			<input
				type="search"
				name="q"
				bind:value={query}
				oninput={suggest}
				{onkeydown}
				onfocus={() => {
					if (suggestions.length && query.trim() === searched) open = true;
				}}
				onblur={() => setTimeout(() => (open = false), 150)}
				placeholder="Nombre, pronombres, email, DNI o código"
				aria-label="Buscar entrada"
				aria-describedby="buscar-ayuda"
				role="combobox"
				aria-autocomplete="list"
				aria-expanded={open}
				aria-controls="sugerencias"
				aria-activedescendant={open && active >= 0 ? `sugerencia-${active}` : undefined}
				autocomplete="off"
				autocapitalize="off"
				spellcheck="false"
			/>
			<ul id="sugerencias" role="listbox" aria-label="Sugerencias" hidden={!open}>
				{#each suggestions as s, i (s.id)}
					<!-- svelte-ignore a11y_click_events_have_key_events (el teclado va por el input: flechas + Enter) -->
					<li
						id="sugerencia-{i}"
						role="option"
						aria-selected={i === active}
						class:active={i === active}
						class:inside={s.checkedInAt}
						onmousedown={(e) => e.preventDefault()}
						onclick={() => choose(s)}
					>
						<span class="s-main">
							<strong>{s.holder}</strong>{#if s.pronouns}&nbsp;({s.pronouns}){/if}
							<span class="s-code">{s.code}</span>
						</span>
						<span class="s-match">
							{#if s.match}coincide con <em>{s.match.label}</em>: {s.match.field === 'dni'
									? Number(s.match.value).toLocaleString('es-AR')
									: s.match.value}{/if}{#if s.checkedInAt}&nbsp;· ya ingresó{/if}
						</span>
					</li>
				{:else}
					<li class="empty" role="option" aria-selected="false" aria-disabled="true">
						Sin coincidencias para “{searched}”.
					</li>
				{/each}
			</ul>
		</div>
		<button type="submit">Buscar</button>
	</form>
	<small id="buscar-ayuda" class="hint">
		Sugerencias mientras escribís (sin importar tildes). Flechas para elegir, Enter para abrir la
		entrada.
	</small>
	<p class="sr-only" aria-live="polite">
		{open
			? suggestions.length
				? `${suggestions.length} ${suggestions.length === 1 ? 'sugerencia' : 'sugerencias'}`
				: 'Sin coincidencias'
			: ''}
	</p>

	{#if data.q}
		{#if data.results.length === 0}
			<p>Sin resultados para “{data.q}”.</p>
		{/if}
		<ul class="results">
			{#each data.results as t (t.id)}
				<li class:inside={t.checkedInAt}>
					<div>
						<strong>{t.holder}</strong>{#if t.pronouns}&nbsp;({t.pronouns}){/if} · {t.type}{#if t.code}&nbsp;·
							<span class="code">{t.code}</span>{/if}<br />
						<small>Compró {t.buyer} · <span class="dni">{formatDni(t.dni)}</span> · {t.email}</small
						>
					</div>
					{#if t.checkedInAt}
						<span class="done">Ingresó {time(t.checkedInAt)} ({t.checkedInBy})</span>
					{:else}
						<form method="POST" action="?/checkin" use:enhance>
							<input type="hidden" name="token" value={t.token} />
							<button type="submit">Marcar ingreso</button>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.ingreso {
		max-width: 32rem;
		margin: 0 auto;
		padding: 0 16px 3em;
		display: flex;
		flex-direction: column;
		gap: 0.8em;
	}
	.back {
		margin: 0;
	}
	h1 {
		margin: 0;
		font-size: var(--step-2);
	}
	h2 {
		font-size: var(--step-1);
		margin: 0.8em 0 0;
	}
	.progress {
		margin: 0;
		font-size: var(--step-1);
	}
	.result {
		border-radius: 1em;
		padding: 0.8em 1em;
		color: white;
		text-align: center;
		animation: pop 0.25s ease-out;
	}
	.result p {
		margin: 0.2em 0;
		font-size: var(--step-1);
	}
	.result .big {
		font-size: var(--step-4);
		font-weight: bold;
	}
	.result-ok {
		background: hsl(145, 70%, 32%);
	}
	.result-already {
		background: hsl(35, 95%, 42%);
	}
	.result-wrong-event,
	.result-void,
	.result-invalid,
	.result-error {
		background: hsl(0, 75%, 42%);
	}
	@keyframes pop {
		from {
			transform: scale(0.94);
			opacity: 0.4;
		}
	}
	.undo {
		background: rgba(0, 0, 0, 0.25);
		min-height: 2.4em;
		font-size: var(--step-0);
	}
	.flash {
		background: var(--3-light);
		padding: 0.5em;
		border-radius: 0.5em;
		margin: 0;
	}
	.manual,
	.search {
		display: flex;
		gap: 0.5em;
		align-items: flex-end;
	}
	.manual label {
		flex: 1;
		display: flex;
		flex-direction: column;
		font-size: var(--step--1);
	}
	input {
		font: inherit;
		font-size: var(--step-0);
		padding: 0.6em;
		min-height: 3em;
		border-radius: 0.6em;
		border: 2px solid var(--line, #bbb);
		min-width: 0;
		flex: 1;
	}
	button {
		font: inherit;
		font-weight: bold;
		min-height: 3em;
		padding: 0 1.1em;
		border: 0;
		border-radius: 0.6em;
		background: var(--3-dark);
		color: white;
		cursor: pointer;
	}
	.results {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5em;
	}
	.results li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.6em;
		padding: 0.6em 0.8em;
		background: var(--surface, white);
		border-radius: 0.7em;
		outline: 2px solid var(--line, #ddd);
		overflow-wrap: anywhere;
	}
	.results li.inside {
		opacity: 0.7;
	}
	.done {
		font-size: var(--step--1);
		text-align: right;
	}
	.dni,
	.code {
		font-family: ui-monospace, monospace;
		font-weight: bold;
	}
	.combo {
		position: relative;
		flex: 1;
		min-width: 0;
		display: flex;
	}
	.combo input {
		width: 100%;
	}
	[role='listbox'] {
		position: absolute;
		z-index: 10;
		top: calc(100% + 0.3em);
		left: 0;
		right: 0;
		margin: 0;
		padding: 0.3em;
		list-style: none;
		background: var(--surface, white);
		border-radius: 0.6em;
		box-shadow: 0 0.3em 1.2em rgba(0, 0, 0, 0.2);
		max-height: 60vh;
		overflow-y: auto;
	}
	[role='option'] {
		display: flex;
		flex-direction: column;
		gap: 0.1em;
		padding: 0.55em 0.7em;
		min-height: 2.8em;
		border-radius: 0.4em;
		cursor: pointer;
		overflow-wrap: anywhere;
	}
	[role='option'].active,
	[role='option']:hover {
		background: color-mix(in srgb, var(--3) 18%, var(--surface, white));
		outline: 2px solid var(--3-dark);
	}
	[role='option'].inside {
		opacity: 0.75;
	}
	[role='option'].empty {
		cursor: default;
		color: var(--muted, #555);
		background: none;
		outline: none;
	}
	.s-code {
		font-family: ui-monospace, monospace;
		font-size: var(--step--1);
		color: var(--muted, #555);
		margin-left: 0.4em;
	}
	.s-match {
		font-size: var(--step--1);
		color: var(--muted, #444);
	}
	.hint {
		font-size: var(--step--1);
		color: var(--muted, #555);
		margin-top: -0.4em;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
