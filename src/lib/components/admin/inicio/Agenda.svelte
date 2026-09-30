<script>
	/**
	 * Agenda de los próximos días en el Inicio: agrupada por día ("Hoy", "Mañana", "vie 2/10"),
	 * cada ítem con su hora, un ícono por tipo y link a donde se resuelve. Lo de hoy que ya pasó se
	 * ve apagado. Prop: `days` (AgendaDay[] de inicio.js).
	 */
	import {
		ArrowLeftRight,
		BellRing,
		CalendarDays,
		TicketCheck,
		TicketMinus,
		TicketX
	} from '@lucide/svelte';

	/** @type {import('$lib/server/admin/inicio.js').AgendaDay[]} */
	export let days = [];

	const ICONS = /** @type {Record<string, any>} */ ({
		event: CalendarDays,
		'sales-open': TicketCheck,
		'sales-close': TicketX,
		'type-close': TicketMinus,
		transfers: ArrowLeftRight,
		reminder: BellRing
	});
	const KIND_LABEL = /** @type {Record<string, string>} */ ({
		event: 'Evento',
		'sales-open': 'Venta',
		'sales-close': 'Venta',
		'type-close': 'Venta',
		transfers: 'Transferencias',
		reminder: 'Recordatorio'
	});
</script>

<ol class="agenda">
	{#each days as d (d.day)}
		<li class="day">
			<h3 class:today={d.label === 'Hoy'}>{d.label}</h3>
			<ul>
				{#each d.items as it (it.id)}
					<li class="item {it.kind}" class:past={it.past}>
						<time datetime={new Date(it.at).toISOString()}>{it.time}</time>
						<span class="ico" title={KIND_LABEL[it.kind]} aria-hidden="true"
							><svelte:component this={ICONS[it.kind] ?? CalendarDays} size={15} /></span
						>
						<div class="what">
							{#if it.href}<a href={it.href}>{it.title}</a>{:else}<b>{it.title}</b>{/if}
							{#if it.text || it.past}<small
									>{[it.past ? 'ya pasó' : '', it.text].filter(Boolean).join(' · ')}</small
								>{/if}
						</div>
					</li>
				{/each}
			</ul>
		</li>
	{/each}
</ol>

<style>
	.agenda,
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.day + .day {
		margin-top: 0.7rem;
	}
	h3 {
		font-size: 0.78rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--muted);
		margin: 0 0 0.25rem;
	}
	h3.today {
		color: var(--accent);
	}
	.item {
		display: grid;
		grid-template-columns: 2.7rem 1.5rem minmax(0, 1fr);
		gap: 0.4rem;
		align-items: start;
		padding: 0.35rem 0;
		border-top: 1px solid var(--line);
	}
	.item:first-child {
		border-top: 0;
	}
	time {
		font-size: 0.85rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		padding-top: 0.1rem;
	}
	.ico {
		width: 1.5rem;
		height: 1.5rem;
		border-radius: 50%;
		display: grid;
		place-items: center;
		background: var(--info-bg);
		color: var(--info);
	}
	.sales-close .ico,
	.type-close .ico,
	.transfers .ico {
		background: var(--warn-bg);
		color: var(--warn);
	}
	.sales-open .ico {
		background: var(--ok-bg);
		color: var(--ok);
	}
	.reminder .ico {
		background: var(--surface-2);
		color: var(--muted);
	}
	.what {
		min-width: 0;
		display: flex;
		flex-direction: column;
		line-height: 1.3;
		padding-top: 0.1rem;
	}
	.what a,
	.what b {
		font-weight: 700;
		text-decoration: none;
		overflow-wrap: anywhere;
		font-size: 0.93rem;
	}
	.what small {
		color: var(--muted);
		overflow-wrap: anywhere;
	}
	/* Lo que ya pasó: en gris (sin opacidad, para que el texto siga teniendo contraste). */
	.past time,
	.past .what a,
	.past .what b {
		color: var(--muted);
		font-weight: 400;
	}
	.past .ico {
		background: var(--surface-2);
		color: var(--muted);
	}
</style>
