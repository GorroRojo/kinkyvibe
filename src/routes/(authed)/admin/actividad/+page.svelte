<script>
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import CsvButton from '$lib/components/admin/panel/CsvButton.svelte';
	import EmptyState from '$lib/components/admin/panel/EmptyState.svelte';
	import { ChevronRight, ChevronsLeft, Filter, X } from '@lucide/svelte';

	export let data;

	$: f = data.filters;
	$: filtered = Boolean(f.actor || f.type || f.targetType || f.targetId);
	/** Familias que aparecen en el registro (la parte antes del punto de cada acción). */
	$: families = [...new Set(data.facets.actions.map((a) => a.split('.')[0]))];

	const whenFmt = new Intl.DateTimeFormat('es-AR', {
		timeZone: 'America/Argentina/Buenos_Aires',
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		hour: '2-digit',
		minute: '2-digit'
	});

	/** @param {string} action */
	function tone(action) {
		if (/refund|cancel|deactivate|clear/.test(action)) return 'bad';
		if (/confirm|publish|activate|create|send/.test(action)) return 'ok';
		if (/settings|import/.test(action)) return 'info';
		return 'neutral';
	}

	/**
	 * Link al objeto de una entrada: filtra por ese objeto.
	 * @param {{ targetType: string | null, targetId: string | null }} e
	 */
	function targetFilterHref(e) {
		const p = new URLSearchParams();
		if (e.targetType) p.set('objeto', e.targetType);
		if (e.targetId) p.set('id', e.targetId);
		return `?${p}`;
	}
</script>

<PageHeader
	title="Actividad"
	subtitle="Quién cambió qué en el panel: confirmaciones, reembolsos, códigos, ajustes y publicaciones."
>
	<svelte:fragment slot="actions">
		<CsvButton href={data.csvHref} label="CSV" />
	</svelte:fragment>
</PageHeader>

<Card>
	<form class="filters" method="GET" data-sveltekit-keepfocus>
		<label>
			<span>Admin</span>
			<select name="admin" value={f.actor ?? ''}>
				<option value="">Todes</option>
				{#each data.facets.actors as a (a)}<option value={a}>{a}</option>{/each}
			</select>
		</label>
		<label>
			<span>Tipo</span>
			<select name="tipo" value={f.type ?? ''}>
				<option value="">Todos</option>
				{#each families as fam (fam)}
					<optgroup label={data.families[fam] ?? fam}>
						<option value={fam}>{data.families[fam] ?? fam}: todo</option>
						{#each data.facets.actions.filter((a) => a.split('.')[0] === fam) as a (a)}
							<option value={a}>{a}</option>
						{/each}
					</optgroup>
				{/each}
			</select>
		</label>
		<label>
			<span>Objeto</span>
			<select name="objeto" value={f.targetType ?? ''}>
				<option value="">Cualquiera</option>
				{#each data.facets.targetTypes as t (t)}
					<option value={t}>{data.targetTypes[t] ?? t}</option>
				{/each}
			</select>
		</label>
		<label class="grow">
			<span>Id del objeto</span>
			<input
				name="id"
				value={f.targetId ?? ''}
				placeholder="slug del evento, código, id de orden…"
				autocomplete="off"
			/>
		</label>
		<div class="buttons">
			<button class="kv-btn" type="submit"><Filter size={16} aria-hidden="true" /> Filtrar</button>
			{#if filtered}
				<a class="kv-btn ghost" href="/admin/actividad"
					><X size={16} aria-hidden="true" /> Limpiar</a
				>
			{/if}
		</div>
	</form>
</Card>

<div class="list-wrap">
	<Card padded={false}>
		{#if !data.dbAvailable}
			<EmptyState
				emoji="🔌"
				title="Sin base de datos"
				text="El registro de actividad vive en la base de datos, que no está disponible en este entorno."
			/>
		{:else if !data.entries.length}
			<EmptyState
				emoji="📜"
				title={filtered ? 'Nada con esos filtros' : 'Todavía no hay actividad'}
				text={filtered
					? 'Probá con otros filtros o limpialos.'
					: 'Cuando alguien confirme una transferencia, cree un código o publique un evento, va a aparecer acá.'}
			/>
		{:else}
			<ol class="log">
				{#each data.entries as e (e.id)}
					<li>
						<time datetime={new Date(e.at).toISOString()}>{whenFmt.format(e.at)}</time>
						<div class="what">
							<b>{e.summary}</b>
							<span class="meta">
								<a href="?admin={encodeURIComponent(e.actorLogin)}" class="who">@{e.actorLogin}</a>
								<a href="?tipo={encodeURIComponent(e.action)}" class="act"
									><Badge tone={tone(e.action)}>{e.action}</Badge></a
								>
								{#if e.targetType || e.targetId}
									<a href={targetFilterHref(e)} class="target"
										>{data.targetTypes[e.targetType ?? ''] ?? e.targetType ?? ''}
										<code>{e.targetId ?? ''}</code></a
									>
								{/if}
							</span>
						</div>
					</li>
				{/each}
			</ol>
		{/if}
	</Card>
</div>

{#if data.nextHref || data.firstHref}
	<nav class="pager" aria-label="Páginas del registro">
		{#if data.firstHref}
			<a class="kv-btn ghost" href={data.firstHref}
				><ChevronsLeft size={16} aria-hidden="true" /> Lo más nuevo</a
			>
		{/if}
		{#if data.nextHref}
			<a class="kv-btn ghost" href={data.nextHref}
				>Más viejas <ChevronRight size={16} aria-hidden="true" /></a
			>
		{/if}
	</nav>
{/if}

<style lang="scss">
	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: 0.7rem;
		align-items: flex-end;
		label {
			display: flex;
			flex-direction: column;
			gap: 0.2rem;
			min-width: 9rem;
			flex: 1 1 9rem;
			span {
				font-size: 0.72rem;
				letter-spacing: 0.07em;
				text-transform: uppercase;
				color: var(--muted);
				font-weight: 700;
			}
		}
		.grow {
			flex: 2 1 14rem;
		}
		select,
		input {
			background: var(--surface);
			border: 1px solid var(--line);
			border-radius: 0.7em;
			padding: 0.5rem 0.6rem;
			min-height: 2.6rem;
			width: 100%;
		}
		.buttons {
			display: flex;
			gap: 0.5rem;
			flex-wrap: wrap;
		}
	}
	.list-wrap {
		margin-top: 1rem;
	}
	.log {
		list-style: none;
		margin: 0;
		padding: 0;
		li {
			display: grid;
			grid-template-columns: 10rem minmax(0, 1fr);
			gap: 0.8rem;
			padding: 0.75rem 1.2rem;
			border-bottom: 1px solid var(--line);
			&:last-child {
				border-bottom: 0;
			}
		}
		time {
			color: var(--muted);
			font-size: 0.85rem;
			font-variant-numeric: tabular-nums;
			padding-top: 0.1rem;
		}
		.what {
			display: flex;
			flex-direction: column;
			gap: 0.3rem;
			min-width: 0;
			b {
				overflow-wrap: anywhere;
			}
		}
		.meta {
			display: flex;
			flex-wrap: wrap;
			gap: 0.3rem 0.6rem;
			align-items: center;
			font-size: 0.85rem;
			a {
				text-decoration: none;
			}
		}
		.who {
			color: var(--link);
			font-weight: 700;
		}
		.target {
			color: var(--muted);
			overflow-wrap: anywhere;
			code {
				font-size: 0.8rem;
			}
		}
	}
	.pager {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
		margin-top: 1rem;
	}
	@media (max-width: 599.98px) {
		.log li {
			grid-template-columns: minmax(0, 1fr);
			gap: 0.2rem;
			padding: 0.7rem 1rem;
		}
	}
</style>
