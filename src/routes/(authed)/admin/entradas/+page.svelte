<script>
	import { formatARS } from '$lib/utils/money.js';

	let { data } = $props();

	/** @param {string | null} start */
	function date(start) {
		if (!start) return '';
		const d = new Date(start);
		return Number.isNaN(d.getTime())
			? start
			: d.toLocaleDateString('es-AR', {
					dateStyle: 'medium',
					timeZone: 'America/Argentina/Buenos_Aires'
				});
	}
</script>

<svelte:head>
	<title>Entradas - KV Admin</title>
</svelte:head>

<div class="admin-entradas">
	<h1>Entradas</h1>
	<p class="links"><a href="/admin/entradas/codigos">🏷️ Códigos de descuento</a></p>
	{#if !data.dbAvailable}
		<p class="warn">No hay base de datos disponible: no se pueden mostrar ventas.</p>
	{/if}
	{#if data.events.length === 0}
		<p>
			Ningún evento vende entradas todavía. Para activarlo, agregá <code>tickets:</code> al
			frontmatter del evento (ver <code>docs/tickets.md</code>).
		</p>
	{/if}
	<ul class="events">
		{#each data.events as e (e.slug)}
			<li>
				<a class="event" href="/admin/entradas/{e.slug}">
					<span class="title">{e.title}</span>
					<span class="date">{date(e.start)}{e.status ? ` · ${e.status}` : ''}</span>
					<table>
						<thead>
							<tr><th>Tipo</th><th>Vendidas</th><th>Reservadas</th><th>Cobrado</th></tr>
						</thead>
						<tbody>
							{#each e.types as t (t.id)}
								<tr class:over={t.sold > t.capacity}>
									<td>
										{t.name}
										<small
											>({formatARS(t.price)}{t.fondo ? `, fondo ${formatARS(t.fondo)}` : ''})</small
										>
									</td>
									<td>{t.sold}/{t.capacity}</td>
									<td>{t.held}</td>
									<td>{formatARS(t.revenue)}</td>
								</tr>
							{/each}
						</tbody>
						<tfoot>
							<tr>
								<td colspan="3">Total cobrado (con descuentos, antes de comisiones de MP)</td>
								<td>{formatARS(e.revenue)}</td>
							</tr>
							<tr>
								<td colspan="3">💜 Fondo KinkyVibe usado</td>
								<td>{formatARS(e.fondoUsed)}</td>
							</tr>
						</tfoot>
					</table>
				</a>
			</li>
		{/each}
	</ul>
</div>

<style>
	.admin-entradas {
		max-width: 50rem;
		margin: 0 auto;
		padding: 0 16px 2em;
	}
	h1 {
		font-size: var(--step-3);
	}
	.warn {
		background: var(--4-light);
		padding: 0.5em;
		border-radius: 0.5em;
	}
	.events {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 1em;
	}
	.event {
		display: block;
		padding: 1em;
		border-radius: 1em;
		outline: 2px solid var(--2);
		color: inherit;
		text-decoration: none;
		background: white;
	}
	.event:hover {
		outline-width: 4px;
	}
	.title {
		display: block;
		font-weight: bold;
		font-size: var(--step-1);
	}
	.date {
		color: #555;
		font-size: var(--step--1);
	}
	table {
		width: 100%;
		margin-top: 0.6em;
		border-collapse: collapse;
		font-size: var(--step--1);
	}
	th,
	td {
		text-align: left;
		padding: 0.3em 0.4em;
		border-bottom: 1px solid #eee;
	}
	td:not(:first-child),
	th:not(:first-child) {
		text-align: right;
		white-space: nowrap;
	}
	tfoot td {
		font-weight: bold;
	}
	.over {
		background: hsl(0, 90%, 92%);
	}
</style>
