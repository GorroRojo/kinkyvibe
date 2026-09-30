<script>
	/**
	 * Lista de movimientos del Inicio (actividad reciente y "desde tu última visita"): un punto de
	 * color por tipo, qué pasó (con link a donde se ve), quién/dónde y hace cuánto.
	 * Props: `items` (ActivityItem[] de inicio.js), `now` (ms del servidor, para "hace 5 min"),
	 * `limit` (opcional).
	 */
	import { checkinHref, eventLink, orderHref } from '$lib/admin/links.js';

	/** @type {import('$lib/server/admin/inicio.js').ActivityItem[]} */
	export let items = [];
	/** @type {number} */
	export let now;
	/** @type {number} */
	export let limit = Infinity;

	const whenFmt = new Intl.DateTimeFormat('es-AR', {
		timeZone: 'America/Argentina/Buenos_Aires',
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		hour: '2-digit',
		minute: '2-digit'
	});

	/** @param {number} ms */
	function ago(ms) {
		const diff = now - ms;
		if (diff < 60_000) return 'recién';
		if (diff < 3_600_000) return `hace ${Math.round(diff / 60_000)} min`;
		if (diff < 86_400_000) return `hace ${Math.round(diff / 3_600_000)} h`;
		return whenFmt.format(ms);
	}

	/** @param {import('$lib/server/admin/inicio.js').ActivityItem} a */
	function href(a) {
		if (a.orderId && a.slug) return orderHref(a.slug, a.orderId);
		if (a.kind === 'checkin' && a.slug) return checkinHref(a.slug);
		if (a.slug) return eventLink(a.slug);
		return null;
	}
</script>

<ul class="feed">
	{#each items.slice(0, limit) as a}
		{@const link = href(a)}
		<li>
			<span class="dot {a.kind}" aria-hidden="true"></span>
			<div class="grow">
				{#if link}<a href={link}><b>{a.title}</b></a>{:else}<b>{a.title}</b>{/if}
				<small class="muted">{[a.who, a.detail].filter(Boolean).join(' · ')}</small>
			</div>
			<time class="muted" datetime={new Date(a.at).toISOString()}>{ago(a.at)}</time>
		</li>
	{/each}
</ul>

<style>
	.feed {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li {
		display: flex;
		gap: 0.7rem;
		align-items: center;
		padding: 0.55rem 0;
		border-top: 1px solid var(--line);
	}
	li:first-child {
		border-top: 0;
	}
	.grow {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}
	.grow b {
		overflow-wrap: anywhere;
	}
	.grow a {
		text-decoration: none;
	}
	.grow small {
		overflow-wrap: anywhere;
	}
	.dot {
		flex: none;
		width: 0.6rem;
		height: 0.6rem;
		border-radius: 50%;
		background: var(--muted);
	}
	.dot.order {
		background: var(--ok);
	}
	.dot.transfer {
		background: var(--warn);
	}
	.dot.refund {
		background: var(--bad);
	}
	.dot.audit {
		background: var(--info);
	}
	.dot.checkin {
		background: var(--accent);
	}
	time {
		font-size: 0.8rem;
		white-space: nowrap;
		align-self: flex-start;
		padding-top: 0.15rem;
	}
</style>
