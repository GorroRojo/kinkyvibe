<script>
	/**
	 * Lo de series en la página de una etiqueta (/wiki/<etiqueta>, que puede estar prerenderizada):
	 * lo pide a /api/series/<etiqueta> (forma slug: seriesApiPath) al cargar, así el interruptor `series` se respeta en el
	 * momento. Apagado (404) no muestra nada. Si la etiqueta es una serie: su imagen, las próximas
	 * ediciones primero y después las pasadas, y "Avisame si se repite". Si tiene eventos: el
	 * calendario .ics para suscribirse.
	 * Props: `tag` (id de la etiqueta).
	 */
	import { onMount } from 'svelte';
	import EditionList from './EditionList.svelte';
	import SeriesNotifyForm from './SeriesNotifyForm.svelte';
	import CalendarSubscribe from './CalendarSubscribe.svelte';
	import { seriesApiPath } from '$lib/utils/series.js';

	/** @type {string} */
	export let tag;

	/** @type {null | { series: null | { id: string, name: string, image?: string, total: number, upcoming: import('$lib/utils/series.js').Edition[], past: import('$lib/utils/series.js').Edition[] }, feed: string | null, account: { member: boolean, subscribed: boolean } }} */
	let info = null;
	let origin = '';

	onMount(async () => {
		origin = location.origin;
		if (!tag) return;
		try {
			const r = await fetch(seriesApiPath(tag));
			if (r.ok) info = await r.json();
		} catch {
			info = null;
		}
	});
</script>

{#if info}
	{@const s = info.series}
	<section class="series-block" aria-label={s ? `Ediciones de ${s.name}` : 'Calendario'}>
		{#if s}
			{#if s.image}
				<img class="cover" src={s.image} alt="" loading="lazy" />
			{/if}
			<div class="surface-card">
				<h2>Próximas ediciones</h2>
				{#if s.upcoming.length}
					<EditionList editions={s.upcoming} />
				{:else}
					<p class="hint">Por ahora no hay una próxima edición anunciada.</p>
				{/if}
			</div>
			{#if s.past.length}
				<details class="surface-card" open={!s.upcoming.length}>
					<summary><h2>Ediciones pasadas <span class="n">{s.past.length}</span></h2></summary>
					<EditionList editions={s.past} />
				</details>
			{/if}
			{#if s.total}
				<SeriesNotifyForm
					seriesId={s.id}
					seriesName={s.name}
					member={info.account.member}
					subscribed={info.account.subscribed}
					heading={s.upcoming.length ? 'Avisame de las próximas ediciones' : 'Avisame si se repite'}
				/>
			{/if}
		{/if}
		{#if info.feed}
			<div class="surface-card">
				<CalendarSubscribe url={origin + info.feed} label="las fechas de {s ? s.name : tag}" />
			</div>
		{/if}
	</section>
{/if}

<style>
	.series-block {
		width: min(45rem, 100%);
		margin: 1.5em auto 0;
		display: grid;
		gap: 1em;
	}
	.cover {
		width: 100%;
		max-height: 22rem;
		object-fit: cover;
		border-radius: var(--round);
		box-shadow: var(--shadow);
	}
	h2 {
		margin: 0 0 0.4em;
		font-size: var(--step-1);
	}
	summary {
		cursor: pointer;
		list-style-position: inside;
	}
	summary h2 {
		display: inline;
	}
	.n {
		color: var(--muted);
		font-size: var(--step--1);
		font-weight: 400;
	}
	.hint {
		margin: 0;
		color: var(--muted);
	}
	.series-block :global(.series-notify) {
		margin: 0;
		width: 100%;
	}
</style>
