<script>
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	const stateText = {
		valid: 'Válida',
		used: 'Ya se usó para ingresar',
		void: 'Anulada'
	};

	/** @param {number | null | undefined} ms */
	function time(ms) {
		return ms
			? new Date(ms).toLocaleString('es-AR', {
					dateStyle: 'short',
					timeStyle: 'short',
					hourCycle: 'h23',
					timeZone: 'America/Argentina/Buenos_Aires'
				})
			: '';
	}
</script>

<svelte:head>
	<title>Entrada · {data.event.title} - KinkyVibe.ar</title>
</svelte:head>

<article class="ticket ticket-{data.ticket.state}">
	<h1>{data.event.title}</h1>
	{#if data.event.when}<p class="when">{data.event.when}</p>{/if}
	{#if data.event.where}<p class="where">{data.event.where}</p>{/if}

	<div class="qr" role="img" aria-label="Código QR de la entrada">
		<!-- SVG generado en el servidor a partir de la URL de esta entrada. -->
		{@html data.qr}
	</div>

	<dl>
		<dt>Nombre</dt>
		<dd>{data.ticket.holder}</dd>
		<dt>Entrada</dt>
		<dd>{data.ticket.type}</dd>
		<dt>Estado</dt>
		<dd class="state">
			{stateText[data.ticket.state]}{#if data.ticket.state === 'used'}
				({time(data.ticket.checkedInAt)}){/if}
		</dd>
	</dl>
	<p class="hint">
		Mostrá este QR en la puerta. Sirve para una sola persona y un solo ingreso: no lo compartas.
	</p>

	{#if data.isAdmin}
		<form method="POST" action="?/checkin" use:enhance class="admin">
			<p><strong>Admin:</strong> marcar ingreso de esta entrada</p>
			<button type="submit">Marcar ingreso</button>
			{#if form?.checkin}
				{@const r = form.checkin}
				<p class="result result-{r.result}" role="status">
					{#if r.result === 'ok'}✅ Ingreso registrado.
					{:else if r.result === 'already'}⚠️ Ya ingresó ({time(r.at)}, por {r.by}).
					{:else if r.result === 'void'}❌ Entrada anulada.
					{:else}❌ Entrada inválida.{/if}
				</p>
			{/if}
			<a href="/admin/entradas/{data.event.slug}/ingreso">Ir al control de ingreso</a>
		</form>
	{/if}
</article>

<style>
	.ticket {
		background: white;
		border-radius: 1em;
		padding: 1.2em;
		outline: 3px dashed var(--1);
		text-align: center;
	}
	.ticket-used,
	.ticket-void {
		outline-color: #888;
	}
	h1 {
		font-size: var(--step-2);
		margin: 0 0 0.3em;
	}
	.when,
	.where {
		margin: 0.2em 0;
	}
	.qr {
		max-width: 20rem;
		margin: 1em auto;
	}
	.qr :global(svg) {
		width: 100%;
		height: auto;
		display: block;
	}
	.ticket-void .qr,
	.ticket-used .qr {
		opacity: 0.35;
	}
	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.3em 1em;
		text-align: left;
	}
	dt {
		font-weight: bold;
	}
	dd {
		margin: 0;
	}
	.ticket-valid .state {
		color: var(--3-dark);
		font-weight: bold;
	}
	.hint {
		font-size: var(--step--1);
		color: #555;
	}
	.admin {
		margin-top: 1em;
		padding-top: 1em;
		border-top: 2px solid #ddd;
	}
	.admin button {
		font: inherit;
		font-weight: bold;
		width: 100%;
		min-height: 3.5em;
		border: 0;
		border-radius: 0.6em;
		background: var(--3-dark);
		color: white;
		cursor: pointer;
	}
	.result {
		font-size: var(--step-1);
		font-weight: bold;
	}
</style>
