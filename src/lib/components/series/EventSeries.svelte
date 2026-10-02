<script>
	/**
	 * Las series de un evento en su página (interruptor `series`): arriba "Edición N de <serie>"
	 * con anterior y siguiente (`part="nav"`); después del contenido (`part="after"`), si el evento
	 * ya pasó, la próxima edición (si hay) y "Avisame si se repite", y el calendario de la serie.
	 * Props:
	 * - `series`: { list, account } de loadSeries en calendario/[event]/+page.server.js.
	 * - `part`: 'nav' (debajo del título) o 'after' (después del contenido).
	 * - `origin`: origen del sitio, para el link del calendario.
	 */
	import SeriesEditionNav from './SeriesEditionNav.svelte';
	import SeriesNotifyForm from './SeriesNotifyForm.svelte';
	import CalendarSubscribe from './CalendarSubscribe.svelte';
	import { editionDateLabel, tagFeedPath } from '$lib/utils/series.js';

	/** @type {{ list: Array<{ id: string, name: string, href: string, icon: string, number: number, total: number, prev: any, next: any, past: boolean, nextUpcoming: import('$lib/utils/series.js').Edition | null }>, account: { member: boolean, subscribed: string[], sigo?: boolean } }} */
	export let series;
	/** @type {'nav' | 'after'} */
	export let part = 'nav';
	export let origin = '';
</script>

{#if part === 'nav'}
	{#each series.list as s (s.id)}
		<SeriesEditionNav series={s} />
	{/each}
{:else}
	{#each series.list as s (s.id)}
		<div class="event-series">
			{#if s.past && s.nextUpcoming}
				<p class="next surface-card">
					Ya se anunció la próxima edición de {s.name}:
					<a href={s.nextUpcoming.path}>{s.nextUpcoming.title}</a>
					· {editionDateLabel(s.nextUpcoming.start)}
				</p>
			{/if}
			{#if s.past}
				<SeriesNotifyForm
					seriesId={s.id}
					seriesName={s.name}
					member={series.account.member}
					subscribed={series.account.subscribed.includes(s.id)}
					sigo={Boolean(series.account.sigo)}
					heading={s.nextUpcoming ? `Avisame de las próximas ediciones` : 'Avisame si se repite'}
				/>
			{/if}
			<div class="cal surface-card">
				<CalendarSubscribe url={origin + tagFeedPath(s.id)} label="las fechas de {s.name}" />
			</div>
		</div>
	{/each}
{/if}

<style>
	.event-series {
		display: grid;
		gap: 0;
		margin-top: 1em;
	}
	.next,
	.cal {
		width: min(40rem, 100%);
		margin: 1.5em auto 0;
	}
	.next {
		margin-bottom: 0;
	}
	.next a {
		font-weight: 700;
		color: var(--2-dark);
	}
</style>
