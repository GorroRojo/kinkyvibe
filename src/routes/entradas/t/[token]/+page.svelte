<script>
	import { enhance } from '$app/forms';
	import { eventHref } from '$lib/admin/nav.js';

	let { data, form } = $props();

	const stateText = {
		valid: 'Válida',
		used: 'Ya se usó para ingresar',
		void: 'Anulada',
		refunded: 'Reembolsada (ya no es válida)'
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
	{#if data.event.parts?.lines.length}
		<section class="parts" aria-labelledby="parts-title">
			<h2 id="parts-title">{data.event.parts.title}</h2>
			<ul>
				{#each data.event.parts.lines as line, i (i)}
					<li>{line}</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if data.event.online}
		<div class="stream">
			{#if data.streamLink}
				<p class="stream-title">Link de la transmisión</p>
				<a class="stream-link" href={data.streamLink} target="_blank" rel="noopener noreferrer"
					>Entrar a la transmisión</a
				>
				<p class="stream-url">{data.streamLink}</p>
				<p class="hint">Es personal: no lo compartas.</p>
			{:else if data.ticket.state !== 'void' && data.ticket.state !== 'refunded'}
				<p class="stream-title">Evento online</p>
				<p>
					Todavía no está el link de la transmisión. Te lo mandamos por mail antes del evento y
					también va a aparecer acá.
				</p>
			{/if}
		</div>
	{:else}
		<div class="qr-row">
			<div class="qr" role="img" aria-label="Código QR de la entrada">
				<!-- SVG generado en el servidor a partir de la URL de esta entrada. -->
				{@html data.qr}
			</div>
			{#if data.ticket.code}
				<div class="code">
					<span class="code-label">Código</span>
					<strong class="code-value"
						>{data.ticket.code.slice(0, 3)}<span class="code-gap"></span>{data.ticket.code.slice(
							3
						)}</strong
					>
					<span class="code-hint">si el QR no se puede escanear</span>
				</div>
			{/if}
		</div>
	{/if}

	<dl>
		<dt>Nombre</dt>
		<dd>{data.ticket.holder}</dd>
		{#if data.ticket.pronouns}
			<dt>Pronombres</dt>
			<dd>{data.ticket.pronouns}</dd>
		{/if}
		<dt>Entrada</dt>
		<dd>{data.ticket.type}</dd>
		<dt>Estado</dt>
		<dd class="state">
			<!-- {' '}: Svelte saca el espacio del borde del {#if} y salía «ingresar(2/10/26, 13:14)». -->
			{stateText[data.ticket.state]}{#if data.ticket.state === 'used'}{' '}({time(
					data.ticket.checkedInAt
				)}){/if}
		</dd>
	</dl>
	{#if !data.event.online}
		<p class="hint">
			Mostrá este QR en la puerta (o dictá el código). Sirve para una sola persona y un solo
			ingreso: no lo compartas.
		</p>
	{/if}

	{#if data.isAdmin && !data.event.online}
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
			<a href={eventHref(data.event.slug, 'ingreso')}>Ir al modo puerta</a>
		</form>
	{/if}
</article>

<style>
	.ticket {
		background: white;
		border-radius: var(--radius-m);
		padding: 1.2em;
		outline: 3px dashed var(--1);
		text-align: center;
	}
	.ticket {
		box-shadow: var(--shadow);
	}
	.ticket-used,
	.ticket-void,
	.ticket-refunded {
		outline-color: var(--muted);
	}
	h1 {
		font-size: var(--step-2);
		margin: 0 0 0.3em;
	}
	.when,
	.where {
		margin: 0.2em 0;
	}
	.parts {
		margin: 0.8em 0;
		padding: 0.6em 1em;
		border-radius: var(--round);
		background: var(--2-tint);
		text-align: left;
	}
	.parts h2 {
		font-size: var(--step-0);
		margin: 0 0 0.3em;
	}
	.parts ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.parts li {
		margin: 0.15em 0;
	}
	.qr-row {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1em;
		margin: 1em auto;
	}
	.qr {
		flex: 0 1 16rem;
		min-width: 0;
	}
	.code {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.2em;
		flex-shrink: 0;
	}
	.code-label {
		font-size: var(--step--1);
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}
	.code-value {
		font-family: ui-monospace, 'Courier New', monospace;
		font-size: clamp(1.8rem, 7vw, 2.8rem);
		letter-spacing: 0.08em;
		line-height: 1;
		white-space: nowrap;
		user-select: all;
	}
	.code-gap {
		display: inline-block;
		width: 0.3em;
	}
	.code-hint {
		font-size: var(--step--2);
		color: var(--muted);
		max-width: 8em;
	}
	@media (max-width: 420px) {
		.qr-row {
			flex-direction: column;
			gap: 0.5em;
		}
		.qr {
			flex-basis: auto;
			width: 100%;
			max-width: 16rem;
		}
		.code-hint {
			max-width: none;
		}
	}
	.stream {
		margin: 1em 0;
		padding: 1em;
		border-radius: var(--round);
		background: var(--2-tint);
	}
	.stream-title {
		font-weight: bold;
		margin: 0 0 0.5em;
	}
	.stream-link {
		display: block;
		padding: 0.8em 1em;
		border-radius: var(--round-pill);
		background: var(--2);
		color: white;
		font-weight: bold;
		text-decoration: none;
	}
	.stream-url {
		font-size: var(--step--1);
		overflow-wrap: anywhere;
		margin: 0.5em 0 0;
	}
	.qr :global(svg) {
		width: 100%;
		height: auto;
		display: block;
	}
	.ticket-void .qr-row,
	.ticket-refunded .qr-row,
	.ticket-used .qr-row {
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
		color: var(--3-ink);
		font-weight: bold;
	}
	.hint {
		font-size: var(--step--1);
		color: var(--muted);
	}
	.admin {
		margin-top: 1em;
		padding-top: 1em;
		border-top: 2px solid var(--line);
	}
	.admin button {
		font: inherit;
		font-weight: bold;
		width: 100%;
		min-height: 3.5em;
		border: 0;
		border-radius: var(--round-pill);
		background: var(--3-ink);
		color: white;
		cursor: pointer;
	}
	.result {
		font-size: var(--step-1);
		font-weight: bold;
	}
</style>
