<script>
	/**
	 * Estadísticas → Bot de Telegram (decisión 0045): quién usó el bot en el período y, aparte,
	 * para qué se usa, sumado por semana. Los datos salen de loadBotUsage
	 * ($lib/server/telegram/usoPanel.js): lo buscado y las cosas llegan ya con el umbral de 5 veces
	 * aplicado en la consulta, y el detalle de una semana solo si la usaron 5 personas o más.
	 */
	import '$lib/admin/panel-forms.scss';
	import { Bot } from '@lucide/svelte';
	import {
		PERIOD_PARAM,
		VISITS_DEFAULT_PERIOD,
		VISITS_PERIODS,
		filterHref,
		parsePeriod,
		periodText
	} from '$lib/admin/statsPeriod.js';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import PeriodFilter from '$lib/components/admin/stats/PeriodFilter.svelte';
	import { Card, EmptyState, Notice, Table } from '$lib/components/ui';

	export let data;

	const PATH = '/admin/estadisticas/bot';
	/** El umbral, para los textos (el de verdad se aplica en el servidor). */
	const MIN = 5;

	$: period = parsePeriod(data.period, VISITS_PERIODS, VISITS_DEFAULT_PERIOD);
	$: u = data.usage;

	/** 'AAAA-MM-DD' → '6/10'. @param {string} day */
	const shortDay = (day) => {
		const [, m, d] = day.split('-').map(Number);
		return d && m ? `${d}/${m}` : day;
	};
	/** @param {{ from: string, to: string }} w */
	const weekText = (w) => `${shortDay(w.from)} al ${shortDay(w.to)}`;

	/** @param {Record<string, any>} p una fila de personas */
	const telegramName = (p) =>
		[p.name, p.username ? `@${p.username}` : ''].filter(Boolean).join(' ') || 'Sin nombre';

	$: peopleRows = u.available
		? u.people.map((p, i) => ({
				...p,
				key: i,
				who: p.account?.label ?? p.admin ?? telegramName(p)
			}))
		: [];
	/** @typedef {import('$lib/components/ui/tableSort.js').TableColumn} TableColumn */
	/** @type {TableColumn[]} */
	const peopleColumns = [
		{ key: 'who', label: 'Quién', sort: 'text' },
		{ key: 'total', label: 'Interacciones', align: 'right', sort: 'number' },
		{ key: 'lastDay', label: 'Último día', align: 'right', sort: 'date', nowrap: true }
	];
	/** @type {{ key: string, dir: 'asc' | 'desc' } | null} */
	let peopleSort = { key: 'total', dir: 'desc' };

	$: tipos = u.available ? u.tipos : [];
	/** @type {TableColumn[]} */
	let weekColumns = [];
	$: weekColumns = [
		{ key: 'label', label: 'Semana', nowrap: true },
		{ key: 'people', label: 'Personas', align: 'right' },
		...tipos.map((t) => ({ key: t.id, label: t.label, align: /** @type {'right'} */ ('right') }))
	];
	$: weekRows = u.available
		? u.weeks.map((w) => ({
				key: w.week,
				week: w.week,
				label: weekText(w),
				people: w.people,
				...Object.fromEntries(tipos.map((t) => [t.id, w.totals[t.id] ?? 0]))
			}))
		: [];
	$: chosenWeek = u.available ? u.week : '';
	$: chosen = u.available ? u.weeks.find((w) => w.week === chosenWeek) : undefined;

	/** @param {string} week */
	const weekHref = (week) => filterHref(PATH, { [PERIOD_PARAM]: data.period, semana: week });

	/** Las listas sin umbral (pantallas, comandos, Mini App…), en este orden. */
	const PLAIN = [
		{ id: 'pantalla', title: 'Pantallas' },
		{ id: 'comando', title: 'Comandos' },
		{ id: 'miniapp', title: 'Mini App' },
		{ id: 'seguir', title: 'Seguir' },
		{ id: 'vincular', title: 'Vincular' },
		{ id: 'desvincular', title: 'Desvincular' }
	];
	/** Las listas con umbral. */
	const LISTS = [
		{ id: 'busqueda', title: 'Lo más buscado en el bot', search: true },
		{ id: 'inline', title: 'Lo más buscado en el modo inline', search: true },
		{ id: 'objeto', title: 'Lo más abierto en el bot', search: false },
		{ id: 'inline_elegido', title: 'Lo más mandado desde el modo inline', search: false }
	];
</script>

<PageHeader
	title="Bot de Telegram"
	subtitle="Quién usa el bot y cuánto, y aparte, sumado por semana, para qué se usa."
/>

<p class="kv-note privacy">
	Lo que buscó o miró cada persona nunca se guarda: de cada quien solo sabemos cuántas veces usó el
	bot por día.
</p>

{#if !data.enabled}
	<Notice tone="warn" role={null}>
		El interruptor «Telegram: estadísticas de uso» está apagado: el bot no está contando nada. Se
		prende en Ajustes → Interruptores.
	</Notice>
{/if}

{#if !u.available}
	<Card>
		<EmptyState
			icon={Bot}
			title="Todavía no hay estadísticas del bot"
			text="Falta aplicar la migración 0057 en esta base: la aplica gorrite antes de prender el interruptor (docs/telegram.md, «Estadísticas de uso»)."
		/>
	</Card>
{:else}
	<div class="kv-stack">
		<Card title="Quiénes usaron el bot">
			<PeriodFilter path={PATH} periods={VISITS_PERIODS} current={period.id} />
			<Table
				columns={peopleColumns}
				rows={peopleRows}
				rowKey="key"
				bind:sort={peopleSort}
				caption="Quiénes usaron el bot, {periodText(period)}"
				empty="Nadie usó el bot en este período (o todavía no se cuenta)."
			>
				<svelte:fragment slot="cell" let:row let:column let:value>
					{#if column.key === 'who'}
						{#if row.account}
							<a href={row.account.href}>{row.account.label}</a>
							<small class="muted">Telegram: {telegramName(row)}</small>
						{:else if row.admin}
							<b>{row.admin}</b> <small class="muted">admin · {telegramName(row)}</small>
						{:else}
							{telegramName(row)}
						{/if}
					{:else if column.key === 'lastDay'}
						{shortDay(String(value))}
					{:else}
						{value}
					{/if}
				</svelte:fragment>
			</Table>
			<p class="kv-note">
				Una interacción es cada cosa que el bot recibió de esa persona: un mensaje, un comando, un
				botón, una búsqueda inline, un resultado inline mandado o abrir la Mini App. Se guarda 180
				días.
			</p>
		</Card>

		<Card title="Por semana">
			<Table
				columns={weekColumns}
				rows={weekRows}
				rowKey="key"
				caption="Totales por tipo, últimas 12 semanas"
				rowClass={(r) => (r.week === chosenWeek ? 'chosen' : '')}
			>
				<svelte:fragment slot="cell" let:row let:column let:value>
					{#if column.key === 'label'}
						<a href={weekHref(row.week)} aria-current={row.week === chosenWeek ? 'true' : undefined}
							>{value}</a
						>
					{:else}
						{value}
					{/if}
				</svelte:fragment>
			</Table>
			<p class="kv-note">
				Semanas de lunes a domingo, en hora de Argentina. Tocá una para ver su detalle abajo.
			</p>
		</Card>

		<Card title={chosen ? `Semana del ${weekText(chosen)}` : 'La semana'}>
			{#if u.detail.hidden}
				<p>
					Esa semana usaron el bot {u.detail.people === 1
						? '1 persona'
						: `${u.detail.people} personas`}: con menos de {MIN}, el detalle no se muestra (sería de
					alguien de la lista de arriba). Los totales por tipo están en «Por semana».
				</p>
			{:else}
				<div class="kv-grid-2">
					{#each PLAIN as p (p.id)}
						{@const rows = u.detail.plain[p.id] ?? []}
						{#if rows.length}
							<section>
								<h3>{p.title}</h3>
								<ul class="keys">
									{#each rows as r (r.clave)}
										<li><span>{r.title ?? r.clave}</span> <b>{r.n}</b></li>
									{/each}
								</ul>
							</section>
						{/if}
					{/each}
				</div>
				<div class="kv-grid-2">
					{#each LISTS as l (l.id)}
						{@const list = u.detail.lists[l.id]}
						<section>
							<h3>{l.title}</h3>
							{#if list && (list.items.length || list.otherN)}
								<ul class="keys">
									{#each list.items as r (r.clave)}
										<li>
											{#if r.href}<a href={r.href}>{r.title}</a>{:else if l.search}<q>{r.clave}</q
												>{:else}<span>{r.clave}</span>{/if}
											<b>{r.n}</b>
										</li>
									{/each}
									{#if list.otherN}
										<li class="muted">
											<span
												>Otras (menos de {MIN} veces cada una{list.otherKeys
													? `, ${list.otherKeys} distintas`
													: ''})</span
											>
											<b>{list.otherN}</b>
										</li>
									{/if}
								</ul>
							{:else}
								<p class="muted">Nada esta semana.</p>
							{/if}
						</section>
					{/each}
				</div>
			{/if}
		</Card>
	</div>
{/if}

<style>
	.privacy {
		margin-block: 0 var(--space-s);
	}
	h3 {
		font-size: var(--text-base);
		margin: 0 0 var(--space-2xs);
	}
	.keys {
		list-style: none;
		margin: 0 0 var(--space-s);
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.keys li {
		display: flex;
		justify-content: space-between;
		gap: var(--space-2xs);
		align-items: baseline;
	}
	.keys li > :first-child {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.keys b {
		font-variant-numeric: tabular-nums;
	}
	:global(.kv-table tr.chosen) {
		font-weight: 600;
	}
</style>
