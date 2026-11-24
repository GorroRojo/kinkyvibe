<script>
	/**
	 * "Suscribirte en tu calendario": links a un calendario .ics (el de una serie o etiqueta, o el
	 * personal) para Google Calendar, la app de calendario del celu/compu (webcal://) y copiar el
	 * link. Props: `url` (https absoluto del .ics), `label` (qué calendario es), `note` (opcional) y
	 * `compact`: una sola línea chica, «{label}: Google · Apple/Outlook · Copiar link», con `label`
	 * tal cual (la tarjeta de la serie en la página de un evento, SeriesFollowCard.svelte).
	 */
	import { CalendarPlus, Copy } from '@lucide/svelte';
	import { subscribeLinks } from '$lib/utils/series.js';

	/** @type {string} */
	export let url;
	export let label = 'este calendario';
	export let note = '';
	export let compact = false;

	$: links = subscribeLinks(url);
	let copied = false;
	/** Lo que oye un lector de pantalla al copiar (el botón cambia solo a la vista). */
	let copyStatus = '';
	async function copy() {
		copyStatus = '';
		try {
			await navigator.clipboard.writeText(links.https);
			copied = true;
			copyStatus = 'Link copiado';
			setTimeout(() => (copied = false), 2500);
		} catch {
			copied = false;
			copyStatus = `No se pudo copiar. El link es: ${links.https}`;
		}
	}
</script>

{#if compact}
	<p class="cal-line">
		<CalendarPlus size={16} aria-hidden="true" />
		<span>{label}:</span>
		<a href={links.google} target="_blank" rel="noopener">Google</a>
		<span aria-hidden="true">·</span>
		<a href={links.webcal}>Apple/Outlook</a>
		<span aria-hidden="true">·</span>
		<button type="button" on:click={copy}>{copied ? 'Copiado' : 'Copiar link'}</button>
	</p>
	<p class="visually-hidden" role="status">{copyStatus}</p>
{:else}
	<div class="cal-sub">
		<p class="title"><CalendarPlus size={18} aria-hidden="true" /> Suscribite a {label}</p>
		<p class="hint">
			Los eventos nuevos aparecen solos en tu calendario.{note ? ` ${note}` : ''}
		</p>
		<div class="links">
			<a class="pill-btn ghost" href={links.google} target="_blank" rel="noopener"
				>Google Calendar</a
			>
			<a class="pill-btn ghost" href={links.webcal}>Apple / Outlook</a>
			<button class="pill-btn ghost" type="button" on:click={copy}
				><Copy size={16} aria-hidden="true" />{copied ? 'Copiado' : 'Copiar link'}</button
			>
		</div>
		<p class="visually-hidden" role="status">{copyStatus}</p>
	</div>
{/if}

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
	.cal-line {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0 0.4em;
		margin: 0;
		color: var(--muted);
		font-size: var(--step--1);
	}
	/* Chicos a la vista, pero con 44px de alto para tocarlos en el celu */
	.cal-line a,
	.cal-line button {
		display: inline-flex;
		align-items: center;
		min-height: var(--tap);
		padding: 0;
		border: 0;
		background: none;
		font: inherit;
		font-weight: 700;
		color: var(--2-dark);
		text-decoration: underline;
		cursor: pointer;
	}
</style>
