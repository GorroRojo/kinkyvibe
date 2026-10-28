<script>
	import { enhance } from '$app/forms';
	import { argDateLong } from '$lib/utils/dates.js';
	import { formatARS } from '$lib/utils/money.js';

	export let data;
	export let form;

	$: inside = data.door ? data.door.filter((d) => d.inside).length : 0;
	$: totals = data.sales?.totals;
	$: soldText = totals
		? (totals.sold === 1 ? 'entrada vendida' : 'entradas vendidas') +
			(totals.capacity !== null ? ` de ${totals.capacity}` : '')
		: '';
</script>

<svelte:head>
	<title>{data.event.title} · Eventos que organizás · Kinky Vibe</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="rincon">
	<p class="back"><a href="/mi-rincon/organizo">← Eventos que organizás</a></p>
	<h1>{data.event.title}</h1>
	<p class="hint">
		{data.event.start ? `${argDateLong(data.event.start)} · ` : ''}organizás como
		{data.profiles.join(', ')} ·
		<a href="/calendario/{data.event.slug}">ver la página del evento</a>
	</p>

	<section class="surface-card" aria-labelledby="venta-title">
		<h2 id="venta-title">Cómo va la venta</h2>
		{#if !data.sales}
			<p>Este evento no vende entradas por el sitio.</p>
		{:else}
			{#if data.sales.cancelled}<p class="warn">El evento está cancelado.</p>{/if}
			<p class="big">
				<strong>{data.sales.totals.sold}</strong>
				{soldText}
			</p>
			{#if data.sales.totals.held}
				<p class="hint">
					{data.sales.totals.held}
					{data.sales.totals.held === 1 ? 'reservada' : 'reservadas'} sin pagar todavía (transferencias
					o pagos en curso).
				</p>
			{/if}
			<table>
				<thead>
					<tr><th scope="col">Tipo</th><th scope="col">Vendidas</th><th scope="col">Cupo</th></tr>
				</thead>
				<tbody>
					{#each data.sales.types as t, i (i)}
						<tr>
							<td>{t.name}</td>
							<td>
								{t.sold}
								{#if t.held}<span class="hint">(+{t.held} reservadas)</span>{/if}
							</td>
							<td>{t.capacity ?? 'sin límite'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
			<dl class="money">
				<dt>Recaudado</dt>
				<dd>{formatARS(data.sales.totals.revenue)}</dd>
				<dt>Comisión de Mercado Pago</dt>
				<dd>−{formatARS(data.sales.totals.mpFee)}</dd>
				<dt>Queda</dt>
				<dd><strong>{formatARS(data.sales.totals.net)}</strong></dd>
			</dl>
			<p class="hint">Solo compras confirmadas. Los gastos y el reparto no están acá todavía.</p>
		{/if}
	</section>

	<section class="surface-card" aria-labelledby="puerta-title">
		<h2 id="puerta-title">Lista para la puerta</h2>
		{#if data.door === null}
			<p>No pudimos leer la lista. Probá de nuevo en un rato.</p>
		{:else if data.door.length === 0}
			<p>Todavía no hay entradas confirmadas.</p>
		{:else}
			<p class="hint">
				{data.door.length}
				{data.door.length === 1 ? 'entrada' : 'entradas'} · {inside} ya
				{inside === 1 ? 'entró' : 'entraron'}. Solo el nombre que figura en cada entrada: es para
				organizar la puerta, no la compartas.
			</p>
			<ul class="door">
				{#each data.door as d, i (i)}
					<li>
						<span>
							{d.name}
							{#if d.pronouns}<span class="hint">({d.pronouns})</span>{/if}
						</span>
						<span class="hint">{d.inside ? `${d.type} · ✓ entró` : d.type}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="surface-card" aria-labelledby="texto-title">
		<h2 id="texto-title">Texto del evento</h2>
		{#if !data.text}
			<p>Este evento no se puede editar desde acá.</p>
		{:else}
			<form
				method="POST"
				action="?/texto"
				use:enhance={() =>
					({ update }) =>
						update({ reset: false })}
			>
				<input type="hidden" name="sha" value={data.text.sha} />
				<label for="body" class="hint">
					Lo que se lee en la página del evento (Markdown). El resto de los datos (fecha, lugar,
					entradas) lo cambian les admins.
				</label>
				<textarea id="body" name="body" rows="14" maxlength={data.bodyMax}
					>{form?.body ?? data.text.body}</textarea
				>
				{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
				{#if form?.saved}<p class="ok" role="status">Guardado.</p>{/if}
				<p><button class="pill-btn" type="submit">Guardar el texto</button></p>
			</form>
		{/if}
	</section>
</div>

<style>
	.rincon {
		display: grid;
		gap: 1em;
		/* 16px a los costados en el celu, como Mi rincón */
		width: min(40rem, calc(100% - 32px));
		margin: 1.5em auto;
	}
	h1 {
		margin: 0;
		font-size: var(--step-3);
		overflow-wrap: anywhere;
	}
	h2 {
		margin: 0 0 0.5em;
		font-size: var(--step-1);
	}
	section {
		display: grid;
		gap: 0.6em;
	}
	p {
		margin: 0;
	}
	.back a {
		color: var(--2-dark);
	}
	.hint {
		color: var(--muted);
		font-size: var(--step--1);
	}
	.big {
		font-size: var(--step-1);
	}
	.warn,
	.error {
		color: var(--1-ink);
		background: var(--1-tint);
		padding: 0.5em 0.8em;
	}
	table {
		border-collapse: collapse;
		width: 100%;
	}
	th,
	td {
		text-align: left;
		padding: 0.3em 0.4em;
		border-bottom: 1px solid var(--line);
	}
	.money {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0.2em 1em;
		margin: 0;
	}
	.money dd {
		margin: 0;
		text-align: right;
	}
	.door {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 0.3em;
	}
	.door li {
		display: flex;
		justify-content: space-between;
		gap: 1em;
		padding: 0.3em 0;
		border-bottom: 1px solid var(--line);
		overflow-wrap: anywhere;
	}
	textarea {
		width: 100%;
		font: inherit;
	}
	.pill-btn {
		min-height: var(--tap);
	}
</style>
