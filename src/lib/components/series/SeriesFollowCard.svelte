<script>
	/**
	 * «Próximas fechas de <serie>» (sin artículo: cada serie tiene el suyo): una sola tarjeta en la página de un evento de una serie
	 * (gorrite eligió «A: una tarjeta» en la Mesa). Junta lo que antes eran tres bloques: «Seguir la
	 * serie», «Avisame si se repite» y el calendario de la serie. Adentro:
	 * - con cuenta y «Lo que sigo» (`account.sigo`): «Seguir la serie» (FollowButton);
	 * - con cuenta sin «Lo que sigo»: «Avisame» con la cuenta (SeriesNotifyForm);
	 * - sin cuenta: el mail de «Avisame si se repite» (SeriesNotifyForm, doble confirmación).
	 * Abajo, en chico, las fechas en tu calendario (el .ics de la serie). Con cuenta y «Lo que
	 * sigo» no va: seguir ya pone las fechas en tu calendario (pedido de gorrite).
	 * Props: `serie` (un ítem de `list` de loadSeries), `account` (el de loadSeries), `origin`
	 * (origen del sitio, para el link del calendario) y `anchor` (lleva el ancla `#seguir`, a donde
	 * llevan «Agotadas · Avisame la próxima» de las tarjetas, ticketCta.js).
	 */
	import { BellRing } from '@lucide/svelte';
	import FollowButton from '$lib/components/FollowButton.svelte';
	import SeriesNotifyForm from './SeriesNotifyForm.svelte';
	import CalendarSubscribe from './CalendarSubscribe.svelte';
	import { tagFeedPath } from '$lib/utils/series.js';

	/** @type {{ id: string, name: string }} */
	export let serie;
	/** @type {{ member: boolean, subscribed: string[], sigo?: boolean }} */
	export let account;
	export let origin = '';
	export let anchor = false;

	$: follows = account.member && Boolean(account.sigo);
	$: headingId = `serie-${serie.id.replace(/[^\w-]+/g, '-')}`;
</script>

<section
	class="serie-card surface-card"
	id={anchor ? 'seguir' : undefined}
	aria-labelledby={headingId}
>
	<h2 id={headingId}>
		<BellRing size={20} aria-hidden="true" /> Próximas fechas de {serie.name}
	</h2>
	{#if follows}
		<FollowButton kind="etiqueta" key={serie.id} name={serie.name} label="Seguir la serie" inline />
	{:else}
		<SeriesNotifyForm
			bare
			seriesId={serie.id}
			seriesName={serie.name}
			member={account.member}
			subscribed={account.subscribed.includes(serie.id)}
			sigo={Boolean(account.sigo)}
		/>
		<CalendarSubscribe
			compact
			url={origin + tagFeedPath(serie.id)}
			label="Sumalas a tu calendario"
		/>
	{/if}
</section>

<style>
	.serie-card {
		display: grid;
		gap: 0.7em;
		width: min(40rem, 100%);
		margin: 1.5em auto 0;
		border-top: 0.3rem solid var(--2);
		scroll-margin-top: 1em;
	}
	h2 {
		display: flex;
		align-items: center;
		gap: 0.4em;
		margin: 0;
		font-size: var(--step-1);
	}
	.serie-card :global(.follow) {
		justify-content: flex-start;
	}
</style>
