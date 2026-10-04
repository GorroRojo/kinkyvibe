<script>
	/**
	 * Contenido › No listadas: borradores y páginas ocultas, en filas como las de Eventos (no las
	 * tarjetas del sitio, que traen «Comprar entradas»). Cada fila lleva a su editor del panel y a
	 * la página pública.
	 */
	import { ExternalLink, EyeOff, Pencil } from '@lucide/svelte';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import EmptyState from '$lib/components/admin/panel/EmptyState.svelte';
	import { dateParts, timeRange } from '$lib/admin/eventFormat.js';

	/** @type {{ rows: import('$lib/admin/unlisted.js').UnlistedRow[] }} */
	export let data;

	/**
	 * "Evento · 12 dic 2026 · 20:00", "Material".
	 * @param {import('$lib/admin/unlisted.js').UnlistedRow} r
	 */
	function meta(r) {
		const d = dateParts(r.start);
		const time = timeRange(r.start);
		return [r.categoryLabel, d ? `${d.day} ${d.month} ${d.year}` : '', time]
			.filter(Boolean)
			.join(' · ');
	}
</script>

<PageHeader
	title="Publicaciones no listadas"
	subtitle="Borradores y páginas ocultas: no aparecen en el calendario ni en las listas, pero se pueden abrir con su link."
/>

{#if data.rows.length}
	<Card padded={false}>
		<ul class="list">
			{#each data.rows as r (r.path)}
				{@const d = dateParts(r.start)}
				<li>
					<div class="date" aria-hidden="true">
						{#if d}<small>{d.weekday}</small><b>{d.day}</b><small>{d.month}</small>{/if}
					</div>
					{#if r.thumb}
						<img class="thumb" src={r.thumb} alt="" loading="lazy" decoding="async" />
					{:else}
						<div class="thumb noimg" aria-hidden="true"></div>
					{/if}
					<div class="info">
						{#if r.editHref}
							<a class="title" href={r.editHref}>{r.title}</a>
						{:else}
							<span class="title">{r.title}</span>
						{/if}
						<span class="meta">{meta(r)}</span>
						<span class="badges">
							<Badge tone="neutral">no listada</Badge>
							{#if r.draft}<Badge tone="warn">borrador</Badge>{/if}
						</span>
					</div>
					<div class="actions">
						{#if r.editHref}
							<a class="kv-btn ghost" href={r.editHref} aria-label="Editar {r.title}"
								><Pencil size={16} aria-hidden="true" /> Editar</a
							>
						{/if}
						<a
							class="icon-link"
							href={r.path}
							target="_blank"
							rel="noreferrer"
							title="Ver la página"
							aria-label="Ver la página de {r.title} (se abre en otra pestaña)"
							><ExternalLink size={16} aria-hidden="true" /></a
						>
					</div>
				</li>
			{/each}
		</ul>
	</Card>
{:else}
	<EmptyState icon={EyeOff} title="No hay publicaciones no listadas" />
{/if}

<style>
	/* Las mismas filas que la lista de Eventos (/admin/eventos). */
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.list li {
		display: grid;
		grid-template-columns: 3.2rem 3.2rem minmax(0, 1fr) auto;
		gap: var(--space-xs);
		align-items: center;
		padding: var(--space-2xs) var(--space-xs);
		border-bottom: 1px solid var(--line);
	}
	.list li:last-child {
		border-bottom: 0;
	}
	.list li:hover {
		background: var(--surface-2);
	}
	.date {
		display: flex;
		flex-direction: column;
		align-items: center;
		line-height: 1.05;
		color: var(--accent-dark);
	}
	.date b {
		font-size: var(--text-lg);
	}
	.date small {
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-weight: 700;
	}
	.thumb {
		width: 3.2rem;
		height: 3.2rem;
		border-radius: var(--round);
		object-fit: cover;
		background: var(--surface-2);
	}
	.noimg {
		background: linear-gradient(135deg, var(--1-light), var(--2-light));
	}
	.info {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;
	}
	.title {
		font-weight: 700;
		text-decoration: none;
		overflow-wrap: anywhere;
	}
	a.title:hover {
		text-decoration: underline;
	}
	.meta {
		color: var(--muted);
		font-size: var(--text-xs);
	}
	.badges {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3xs);
	}
	.actions {
		display: flex;
		align-items: center;
		gap: var(--space-3xs);
	}
	.icon-link {
		display: inline-grid;
		place-items: center;
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 50%;
		color: var(--muted);
	}
	.icon-link:hover {
		background: var(--surface-2);
		color: var(--link);
	}
	@media (max-width: 720px) {
		.list li {
			grid-template-columns: 2.8rem minmax(0, 1fr) auto;
			grid-template-areas: 'date info actions';
			gap: var(--space-3xs) var(--space-2xs);
			padding: var(--space-2xs) var(--space-xs);
		}
		.date {
			grid-area: date;
		}
		.thumb {
			display: none;
		}
		.info {
			grid-area: info;
		}
		.actions {
			grid-area: actions;
			flex-direction: column;
			align-self: start;
		}
		.actions .kv-btn {
			padding: 0.4rem var(--space-2xs);
		}
	}
</style>
