<script>
	/**
	 * "Suscribirte en tu calendario": links a un calendario .ics (el de una serie o etiqueta, o el
	 * personal) para Google Calendar, la app de calendario del celu/compu (webcal://) y copiar el
	 * link. Props: `url` (https absoluto del .ics), `label` (qué calendario es), `note` (opcional).
	 */
	import { CalendarPlus, Copy } from '@lucide/svelte';
	import { subscribeLinks } from '$lib/utils/series.js';

	/** @type {string} */
	export let url;
	export let label = 'este calendario';
	export let note = '';

	$: links = subscribeLinks(url);
	let copied = false;
	async function copy() {
		try {
			await navigator.clipboard.writeText(links.https);
			copied = true;
			setTimeout(() => (copied = false), 2500);
		} catch {
			copied = false;
		}
	}
</script>

<div class="cal-sub">
	<p class="title"><CalendarPlus size={18} aria-hidden="true" /> Suscribite a {label}</p>
	<p class="hint">
		Los eventos nuevos aparecen solos en tu calendario.{note ? ` ${note}` : ''}
	</p>
	<div class="links">
		<a class="pill-btn ghost" href={links.google} target="_blank" rel="noopener">Google Calendar</a>
		<a class="pill-btn ghost" href={links.webcal}>Apple / Outlook</a>
		<button class="pill-btn ghost" type="button" on:click={copy}
			><Copy size={16} aria-hidden="true" />{copied ? 'Copiado' : 'Copiar link'}</button
		>
	</div>
</div>

<style>
	.cal-sub {
		display: grid;
		gap: 0.5em;
	}
	.title {
		display: flex;
		align-items: center;
		gap: 0.4em;
		margin: 0;
		font-weight: 700;
	}
	.hint {
		margin: 0;
		color: var(--muted);
		font-size: var(--step--1);
	}
	.links {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5em;
	}
	.links .pill-btn {
		font-size: var(--step--1);
	}
</style>
