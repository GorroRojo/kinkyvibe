<script>
	import { enhance } from '$app/forms';
	import QrScanner from '$lib/components/QrScanner.svelte';
	import { tick } from 'svelte';

	let { data, form } = $props();

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
					<p>{r.holder} · {r.type}</p>
					{#if r.ticketId}
						<form method="POST" action="?/undo" use:enhance>
							<input type="hidden" name="ticket" value={r.ticketId} />
							<button type="submit" class="undo">Deshacer</button>
						</form>
					{/if}
				{:else if r.result === 'already'}
					<p class="big">⚠️ Ya ingresó</p>
					<p>{r.holder} · {r.type}</p>
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
			<span>Código de la entrada (o link del QR)</span>
			<input
				name="token"
				bind:value={token}
				autocomplete="off"
				autocapitalize="off"
				spellcheck="false"
				required
			/>
		</label>
		<button type="submit" disabled={busy}>Validar</button>
	</form>

	<h2>Buscar por nombre o email</h2>
	<form method="GET" class="search" data-sveltekit-keepfocus>
		<input
			type="search"
			name="q"
			value={data.q}
			placeholder="Nombre, email o comienzo del código"
			aria-label="Buscar entrada"
		/>
		<button type="submit">Buscar</button>
	</form>

	{#if data.q}
		{#if data.results.length === 0}
			<p>Sin resultados para “{data.q}”.</p>
		{/if}
		<ul class="results">
			{#each data.results as t (t.id)}
				<li class:inside={t.checkedInAt}>
					<div>
						<strong>{t.holder}</strong> · {t.type}<br />
						<small>{t.email}</small>
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
		border: 2px solid #bbb;
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
		background: white;
		border-radius: 0.7em;
		outline: 2px solid #ddd;
		overflow-wrap: anywhere;
	}
	.results li.inside {
		opacity: 0.7;
	}
	.done {
		font-size: var(--step--1);
		text-align: right;
	}
</style>
