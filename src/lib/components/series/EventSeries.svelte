<script>
	/**
	 * Las series de un evento en su página: arriba "Edición N de <serie>"
	 * con anterior y siguiente (`part="nav"`); después del contenido (`part="after"`), si el evento
	 * ya pasó, la próxima edición (si hay), y la tarjeta «No te pierdas la próxima de <serie>»
	 * (SeriesFollowCard: seguir la serie o «Avisame si se repite», y el calendario de la serie).
	 * Props:
	 * - `series`: { list, account } de loadSeries en calendario/[event]/+page.server.js.
	 * - `part`: 'nav' (debajo del título) o 'after' (después del contenido).
	 * - `origin`: origen del sitio, para el link del calendario.
	 */
	import SeriesEditionNav from './SeriesEditionNav.svelte';
	import SeriesFollowCard from './SeriesFollowCard.svelte';
	import { editionDateLabel } from '$lib/utils/series.js';

	/** @type {{ list: Array<{ id: string, name: string, href: string, icon: string, number: number, total: number, prev: any, next: any, past: boolean, nextUpcoming: import('$lib/utils/series.js').Edition | null }>, account: { member: boolean, subscribed: string[], sigo?: boolean, invite?: boolean } }} */
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
	{#each series.list as s, i (s.id)}
		<div class="event-series">
			{#if s.past && s.nextUpcoming}
				<p class="next surface-card">
					Ya se anunció la próxima edición de {s.name}:
					<a href={s.nextUpcoming.path}>{s.nextUpcoming.title}</a>
					· {editionDateLabel(s.nextUpcoming.start)}
				</p>
			{/if}
			<SeriesFollowCard serie={s} account={series.account} {origin} anchor={i === 0} />
		</div>
	{/each}
{/if}

<style>
	.event-series {
		display: grid;
		gap: 0;
		margin-top: 1em;
	}
	.next {
		width: min(40rem, 100%);
		margin: 1.5em auto 0;
		margin-bottom: 0;
	}
	.next a {
		font-weight: 700;
		color: var(--2-dark);
	}
</style>
