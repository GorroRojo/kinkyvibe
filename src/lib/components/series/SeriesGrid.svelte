<script>
	/**
	 * Las series en tarjetas (la Kinkipedia): imagen (o el emoji grande si no tiene), nombre,
	 * descripción corta, cuántas ediciones y la próxima (o la última, si no hay próxima). Las series
	 * hijas (como «Picantearla: Deluxe», o una serie por año) van dentro de la tarjeta de su madre
	 * (groupSeries). Cada tarjeta lleva a la página de la serie (/wiki/<serie>).
	 * Props: `series` (lo de seriesSummaries, src/lib/server/series/index.js).
	 */
	import { CalendarDays, History, Repeat } from '@lucide/svelte';
	import { editionDateLabel, groupSeries } from '$lib/utils/series.js';

	/**
	 * @typedef {{ id: string, name: string, icon: string, href: string, image?: string,
	 *   description: string, total: number, parent?: string | null,
	 *   next: { title: string, start: string, path: string } | null,
	 *   last?: { start: string } | null }} SeriesSummary
	 */

	/** @type {readonly SeriesSummary[]} */
	export let series = [];

	$: groups = groupSeries(series);

	/** @param {number} n */
	const editions = (n) => `${n} ${n === 1 ? 'edición' : 'ediciones'}`;
</script>

<ul class="series-grid">
	{#each groups as s (s.id)}
		<li class="surface-card" class:has-children={s.children.length > 0}>
			<a class="cover-link" href={s.href}>
				{#if s.image}
					<img src={s.image} alt="" loading="lazy" />
				{:else}
					<span class="cover-emoji" aria-hidden="true">{s.icon || '🔁'}</span>
				{/if}
				<strong class="name"
					>{#if s.icon}<span aria-hidden="true">{s.icon}</span>
					{/if}{s.name}</strong
				>
			</a>
			{#if s.description}<p class="description">{s.description}</p>{/if}
			<p class="meta">
				<span class="fact"><Repeat size="1em" aria-hidden="true" /> {editions(s.total)}</span>
				{#if s.next}
					<span class="fact next">
						<CalendarDays size="1em" aria-hidden="true" /> Próxima:
						<a href={s.next.path}>{editionDateLabel(s.next.start)}</a>
					</span>
				{:else if s.last}
					<span class="fact">
						<History size="1em" aria-hidden="true" /> Última: {editionDateLabel(s.last.start)}
					</span>
				{/if}
			</p>
			{#if s.children.length}
				<ul class="children" aria-label="Series dentro de {s.name}">
					{#each s.children as c (c.id)}
						<li>
							<a href={c.href} class="child-name"
								>{#if c.icon}<span aria-hidden="true">{c.icon}</span>
								{/if}{c.name}</a
							>
							<span class="child-meta">
								{editions(c.total)}{#if c.next}
									· próxima: <a href={c.next.path}>{editionDateLabel(c.next.start)}</a>{/if}
							</span>
						</li>
					{/each}
				</ul>
			{/if}
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
	.series-grid > li {
		display: grid;
		align-content: start;
		gap: 0.45em;
		margin: 0;
	}
	@media (min-width: 40rem) {
		.series-grid > li.has-children {
			grid-column: span 2;
		}
	}
	.cover-link {
		display: grid;
		gap: 0.4em;
		text-decoration: none;
		color: inherit;
	}
	img,
	.cover-emoji {
		width: 100%;
		aspect-ratio: 16 / 9;
		border-radius: var(--round);
	}
	img {
		object-fit: cover;
	}
	.has-children img,
	.has-children .cover-emoji {
		aspect-ratio: 32 / 9;
	}
	.cover-emoji {
		display: grid;
		place-items: center;
		font-size: 2.6em;
		background: color-mix(in srgb, var(--1) 12%, var(--surface, white));
	}
	.name {
		font-size: var(--step-0);
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
		display: flex;
		flex-wrap: wrap;
		gap: 0.2em 0.9em;
		font-size: var(--step--1);
		color: var(--muted);
	}
	.fact {
		display: inline-flex;
		align-items: center;
		gap: 0.3em;
	}
	.children {
		list-style: none;
		margin: 0.2em 0 0;
		padding: 0.5em 0 0;
		border-top: 1px solid color-mix(in srgb, var(--1) 18%, transparent);
		display: grid;
		gap: 0.35em;
		font-size: var(--step--1);
	}
	.children li {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 0.1em 0.8em;
		margin: 0;
	}
	.child-name {
		font-weight: 700;
	}
	.child-meta {
		color: var(--muted);
	}
</style>
