<script>
	import { argDateList } from '$lib/utils/dates.js';
	/** Check-in: elegir el evento y abrir el modo puerta. */
	import { DoorOpen } from '@lucide/svelte';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import CapacityBar from '$lib/components/admin/panel/CapacityBar.svelte';
	import { eventHref } from '$lib/admin/nav.js';

	export let data;

	/** @param {number} ms */
	const when = (ms) => argDateList(ms);

	const SECTIONS = /** @type {const} */ ([
		['hoy', 'Hoy'],
		['proximos', 'Próximos'],
		['recientes', 'Recientes']
	]);
	$: empty = SECTIONS.every(([id]) => data.groups[id].length === 0);
	/** El primer evento (hoy o el próximo) lleva el botón rosa. */
	$: firstSlug = SECTIONS.map(([id]) => data.groups[id][0]?.slug).find(Boolean) ?? null;
</script>

<PageHeader
	title="Puerta"
	subtitle="Elegí el evento para abrir su Puerta: pantalla oscura, sin menús, que no se apaga y sigue andando sin conexión."
/>

{#if !data.hasDb}
	<p class="note">No hay base de datos disponible: los conteos no se pueden mostrar.</p>
{/if}

{#if empty}
	<Card>
		<p class="empty">
			No hay eventos presenciales con entradas hoy, próximos ni de los últimos 60 días.
		</p>
	</Card>
{/if}

{#each SECTIONS as [id, label] (id)}
	{#if data.groups[id].length}
		<section class="group" aria-labelledby="g-{id}">
			<h2 id="g-{id}">{label}</h2>
			<div class="list">
				{#each data.groups[id] as e (e.slug)}
					<Card tag="article">
						<div class="event" class:today={id === 'hoy'}>
							<div class="info">
								<h3>{e.title}</h3>
								<p class="muted">
									{when(e.start)}{#if e.location}&nbsp;· {e.location}{/if}
								</p>
								<p class="count">
									<b class="num">{e.inside}</b> de <span class="num">{e.total}</span> adentro
								</p>
								{#if e.total}<CapacityBar
										sold={e.inside}
										capacity={e.total}
										label="{e.inside} de {e.total} adentro"
									/>{/if}
							</div>
							<a
								class="kv-btn"
								class:ghost={e.slug !== firstSlug || id === 'recientes'}
								href={eventHref(e.slug, 'ingreso')}
							>
								<DoorOpen size={18} /> Abrir Puerta
							</a>
						</div>
					</Card>
				{/each}
			</div>
		</section>
	{/if}
{/each}

<style>
	.group {
		margin-bottom: 1.4rem;
	}
	h2 {
		font-size: var(--text-xs);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--muted);
		margin: 0 0 0.6rem;
	}
	.list {
		display: grid;
		gap: var(--space-xs);
	}
	@media (min-width: 900px) {
		.list {
			grid-template-columns: repeat(auto-fill, minmax(22rem, 1fr));
		}
	}
	.event {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}
	.info {
		display: flex;
		flex-direction: column;
		gap: var(--space-3xs);
	}
	h3 {
		margin: 0;
		font-size: var(--text-base);
	}
	p {
		margin: 0;
	}
	.count {
		font-size: var(--text-sm);
	}
	.count b {
		font-size: var(--text-lg);
	}
	.event .kv-btn {
		align-self: flex-start;
		min-height: 2.75rem;
	}
	.note {
		background: var(--warn-bg);
		color: var(--warn);
		padding: var(--space-2xs) var(--space-xs);
		border-radius: var(--radius-m);
	}
	.empty {
		margin: 0;
		color: var(--muted);
	}
</style>
