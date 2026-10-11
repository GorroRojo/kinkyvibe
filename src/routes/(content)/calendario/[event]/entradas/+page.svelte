<script>
	import { argDateTimeLong } from '$lib/utils/dates.js';
	import TicketPurchase from '$lib/components/TicketPurchase.svelte';
	import { currentPostData } from '$lib/utils/stores.js';
	import { doorText } from '$lib/utils/tickets.js';
	import { page } from '$app/stores';
	import { venueLine } from '$lib/utils/venues.js';
	import { salePlaceText } from '$lib/utils/eventPlace.js';

	/**
	 * @type {{
	 *   data: { meta: Record<string, any>, path: string, tickets: import('$lib/server/tickets/checkout.js').TicketsView, venue: import('$lib/utils/venues.js').VenueView | null, account: ReturnType<typeof import('$lib/utils/savedBuyer.js').purchasePrefill> | null },
	 *   form: { buy?: any } | null
	 * }}
	 */
	let { data, form } = $props();

	$effect(() => {
		currentPostData.set({ category: 'calendario', path: $page.url.pathname });
	});

	let when = $derived(data.meta.start ? argDateTimeLong(data.meta.start) : '');
	// Con lugar vinculado, el lugar según su privacidad (nunca el «Dónde» del .md).
	let where = $derived(
		!data.tickets.online && data.venue
			? venueLine(data.venue)
			: salePlaceText(data.tickets.online, data.meta)
	);
</script>

<svelte:head>
	<title>Entradas · {data.meta.title} · Kinky Vibe</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="purchase-page">
	<p class="back"><a class="tap-target" href={data.path}>← Volver al evento</a></p>
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
	{#if data.tickets.reason !== 'cancelled' && doorText(data.tickets.door)}
		<p class="door">{doorText(data.tickets.door)}</p>
	{/if}

	<TicketPurchase
		tickets={data.tickets}
		result={form?.buy}
		account={data.account}
		slug={$page.params.event}
	/>
</div>

<style>
	/* Ancho para el formulario y, en pantallas anchas, el resumen de la compra al costado. */
	.purchase-page {
		max-width: 62rem;
		margin: 0 auto;
		padding: 0 var(--space-xs) 3em;
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
		border-radius: var(--radius-m);
		background: var(--2-dark);
		color: white;
	}
	.event-mini img {
		width: 5.5em;
		height: 5.5em;
		object-fit: cover;
		border-radius: var(--radius-s);
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
	.door {
		margin: 0.8em 0 0;
		font-size: var(--step--1);
		font-weight: bold;
		color: var(--2-dark);
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
