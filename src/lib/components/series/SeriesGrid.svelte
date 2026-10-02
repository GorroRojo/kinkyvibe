<script>
	/**
	 * Las series en tarjetas (la Kinkipedia): imagen, nombre, descripción, cuántas ediciones y la
	 * próxima. Cada tarjeta lleva a la página de la serie (/wiki/<serie>).
	 * Props: `series` (lo de seriesSummaries, src/lib/server/series/index.js).
	 */
	import { editionDateLabel } from '$lib/utils/series.js';

	/** @type {readonly { id: string, name: string, icon: string, href: string, image?: string, description: string, total: number, next: { title: string, start: string, path: string } | null }[]} */
	export let series = [];
</script>

<ul class="series-grid">
	{#each series as s (s.id)}
		<li class="surface-card">
			<a class="cover-link" href={s.href}>
				{#if s.image}<img src={s.image} alt="" loading="lazy" />{/if}
				<strong>{s.icon} {s.name}</strong>
			</a>
			{#if s.description}<p class="description">{s.description}</p>{/if}
			<p class="meta">
				{s.total}
				{s.total === 1 ? 'edición' : 'ediciones'}
				{#if s.next}
					· próxima: <a href={s.next.path}>{editionDateLabel(s.next.start)}</a>
				{/if}
			</p>
		</li>
	{/each}
</ul>

<style>
	.series-grid {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 1em;
		grid-template-columns: repeat(auto-fill, minmax(min(15rem, 100%), 1fr));
	}
	li {
		display: grid;
		align-content: start;
		gap: 0.4em;
		margin: 0;
	}
	.cover-link {
		display: grid;
		gap: 0.4em;
		text-decoration: none;
		color: inherit;
	}
	img {
		width: 100%;
		aspect-ratio: 16 / 9;
		object-fit: cover;
		border-radius: var(--round);
	}
	.description {
		margin: 0;
		font-size: var(--step--1);
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.meta {
		margin: 0;
		font-size: var(--step--1);
		color: var(--muted);
	}
</style>
