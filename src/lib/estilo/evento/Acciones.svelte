<script>
	/**
	 * «Agregar a mi calendario», «Seguir la serie» y «Compartir» de las maquetas: los componentes
	 * reales de la página del evento, con los datos inventados.
	 * Props: `past` (el evento ya pasó), `align` ('center' | 'start'), `stack` (uno abajo del otro).
	 */
	import AddToCalendarButton from '$lib/components/AddToCalendarButton.svelte';
	import FollowButton from '$lib/components/FollowButton.svelte';
	import ShareEventButton from '$lib/components/ShareEventButton.svelte';
	import { calendarButtonEvent } from '$lib/utils/eventPage.js';
	import { meta, series } from './datos.js';

	export let past = false;
	/** @type {'center' | 'start'} */
	export let align = 'center';
	export let stack = false;

	const s = series.list[0];
	/** @type {any} */
	const calendarEvent = calendarButtonEvent(/** @type {any} */ (meta));
</script>

<div class="acciones" class:start={align === 'start'} class:stack>
	<AddToCalendarButton event={calendarEvent} quiet={past} />
	<FollowButton
		kind="etiqueta"
		key={s.id}
		name={s.name}
		label={past ? 'Seguir la serie' : `Seguir ${s.name}`}
		inline
	/>
	<ShareEventButton
		url={'https://example.invalid/calendario/' + meta.postID}
		title={meta.title}
		text={meta.summary}
		imagesHref="#compartir"
	/>
</div>

<style>
	.acciones {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--space-2xs);
	}
	.start {
		justify-content: flex-start;
	}
	.stack {
		flex-direction: column;
		align-items: stretch;
	}
</style>
