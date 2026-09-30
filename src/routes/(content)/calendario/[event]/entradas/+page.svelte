<script>
	import TicketPurchase from '$lib/components/TicketPurchase.svelte';
	import { currentPostData } from '$lib/utils/stores.js';
	import { page } from '$app/stores';

	/**
	 * @type {{
	 *   data: { meta: Record<string, any>, path: string, tickets: import('$lib/server/tickets/checkout.js').TicketsView },
	 *   form: { buy?: any } | null
	 * }}
	 */
	let { data, form } = $props();

	$effect(() => {
		currentPostData.set({ category: 'calendario', path: $page.url.pathname });
	});

	let when = $derived(
		data.meta.start
			? new Date(data.meta.start).toLocaleString('es-AR', {
					dateStyle: 'full',
					timeStyle: 'short',
					hourCycle: 'h23',
					timeZone: 'America/Argentina/Buenos_Aires'
				}) + ' hs'
			: ''
	);
	let where = $derived(
		data.tickets.online
			? 'Online'
			: [data.meta.location_name, data.meta.location].filter(Boolean).join(' · ')
	);
</script>

<svelte:head>
	<title>Entradas · {data.meta.title} - KinkyVibe.ar</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="purchase-page">
	<p class="back"><a href={data.path}>← Volver al evento</a></p>
	<header class="event-mini">
		{#if data.meta.featured}
			<img src={data.meta.featured + ''} alt="" width="96" height="96" />
		{/if}
		<div>
			<h1><a href={data.path}>{data.meta.title}</a></h1>
			{#if when}<p class="when">{when}</p>{/if}
			{#if where}<p class="where">{where}</p>{/if}
		</div>
	</header>

	<TicketPurchase tickets={data.tickets} result={form?.buy} />
</div>

<style>
	.purchase-page {
		max-width: 40rem;
		margin: 0 auto;
		padding: 0 16px 3em;
	}
	.back {
		margin: 1em 0 0.5em;
		font-size: var(--step--1);
	}
	.event-mini {
		display: flex;
		gap: 0.9em;
		align-items: center;
		padding: 0.7em;
		border-radius: 1em;
		background: var(--2-dark);
		color: white;
	}
	.event-mini img {
		width: 5.5em;
		height: 5.5em;
		object-fit: cover;
		border-radius: 0.6em;
		flex-shrink: 0;
	}
	.event-mini > div {
		min-width: 0;
	}
	h1 {
		margin: 0 0 0.2em;
		font-size: var(--step-2);
		line-height: 1.15;
		overflow-wrap: anywhere;
	}
	h1 a {
		color: inherit;
		text-decoration: none;
	}
	h1 a:hover {
		text-decoration: underline;
	}
	.when,
	.where {
		margin: 0;
		font-size: var(--step--1);
		opacity: 0.9;
	}
	.when::first-letter {
		text-transform: uppercase;
	}
	.purchase-page :global(.tickets) {
		margin-top: 1em;
	}
	@media (max-width: 500px) {
		.event-mini img {
			width: 4em;
			height: 4em;
		}
	}
</style>
