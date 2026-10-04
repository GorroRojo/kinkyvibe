<script>
	/**
	 * Personas: búsqueda, filtros (serie, vuelven, primera vez) y CSV (sin DNI).
	 */
	import '$lib/admin/panel-forms.scss';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { StickyNote, Users } from '@lucide/svelte';
	import { fmtDate } from '$lib/admin/format.js';
	import { csvFilename } from '$lib/admin/csv.js';
	import { formatARS } from '$lib/utils/money.js';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Stat from '$lib/components/admin/panel/Stat.svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import CsvButton from '$lib/components/admin/panel/CsvButton.svelte';
	import EmptyState from '$lib/components/admin/panel/EmptyState.svelte';

	export let data;

	let q = $page.url.searchParams.get('q') ?? '';
	let serie = $page.url.searchParams.get('serie') ?? '';
	let kind = $page.url.searchParams.get('tipo') ?? '';

	/** @param {string} s */
	const fold = (s) =>
		s
			.normalize('NFD')
			.replace(/\p{Diacritic}/gu, '')
			.toLowerCase();
	$: needle = fold(q.trim());
	$: filtered = data.people.filter(
		(p) =>
			(!needle ||
				fold([p.name, ...p.otherNames, p.email, ...p.pronouns].join(' ')).includes(needle)) &&
			(!serie || p.series.includes(serie)) &&
			(kind !== 'vuelven' || p.attended >= 2) &&
			(kind !== 'primera' || p.attended <= 1)
	);
	$: seriesTitle = Object.fromEntries(data.series.map((s) => [s.id, s.title]));
	$: recurring = data.people.filter((p) => p.attended >= 2).length;

	// Los filtros quedan en la URL (para volver o compartir con otre admin).
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let t;
	function sync() {
		clearTimeout(t);
		t = setTimeout(() => {
			const u = new URLSearchParams();
			if (q.trim()) u.set('q', q.trim());
			if (serie) u.set('serie', serie);
			if (kind) u.set('tipo', kind);
			const s = u.toString();
			goto(s ? `?${s}` : '?', { replaceState: true, keepFocus: true, noScroll: true });
		}, 300);
	}

	/** @type {import('$lib/admin/csv.js').CsvColumn<(typeof data.people)[number]>[]} */
	const columns = [
		{ label: 'nombre', key: 'name' },
		{ label: 'otros_nombres', value: (p) => p.otherNames.join(' / ') },
		{ label: 'pronombres', value: (p) => p.pronouns.join(' / ') },
		{ label: 'email', key: 'email' },
		{ label: 'eventos_comprados', key: 'bought' },
		{ label: 'eventos_asistidos', key: 'attended' },
		{ label: 'no_vino', key: 'noShows' },
		{ label: 'series', value: (p) => p.series.join(' / ') },
		{ label: 'gastado', key: 'spent' },
		{
			label: 'primera_visita',
			value: (p) => (p.firstVisit ? new Date(p.firstVisit).toISOString().slice(0, 10) : '')
		},
		{
			label: 'ultima_visita',
			value: (p) => (p.lastVisit ? new Date(p.lastVisit).toISOString().slice(0, 10) : '')
		},
		{ label: 'notas', key: 'notes' }
	];
</script>

<PageHeader
	title="Personas"
	subtitle="Quienes compraron entradas, agrupades por email. Solo lo ven les admins."
>
	<svelte:fragment slot="actions">
		<CsvButton rows={filtered} {columns} filename={csvFilename('personas')} />
	</svelte:fragment>
</PageHeader>

{#if !data.dbAvailable}
	<p class="kv-flash bad">No hay base de datos disponible.</p>
{/if}

<div class="kv-stats">
	<Stat label="Personas" value={data.people.length} />
	<Stat label="Vuelven" value={recurring} sub="vinieron a 2 eventos o más" />
	<Stat label="Con notas" value={data.people.filter((p) => p.notes).length} />
</div>

<Card>
	<div class="filters">
		<label class="kv-field grow">
			<span>Buscar persona</span>
			<input
				type="search"
				bind:value={q}
				on:input={sync}
				placeholder="Nombre, email o pronombres"
				autocomplete="off"
			/>
		</label>
		<label class="kv-field">
			<span>Serie</span>
			<select bind:value={serie} on:change={sync}>
				<option value="">Todas</option>
				{#each data.series as s (s.id)}
					<option value={s.id}>{s.title} ({s.people})</option>
				{/each}
			</select>
		</label>
		<label class="kv-field">
			<span>Mostrar</span>
			<select bind:value={kind} on:change={sync}>
				<option value="">Todes</option>
				<option value="vuelven">Vuelven (2+ eventos)</option>
				<option value="primera">Primera vez o sin venir</option>
			</select>
		</label>
	</div>
	<p class="kv-note" aria-live="polite">
		{filtered.length}
		{filtered.length === 1 ? 'persona' : 'personas'}
	</p>

	{#if filtered.length === 0}
		<EmptyState icon={Users} title="No hay nadie con esos filtros" />
	{:else}
		<div class="kv-table-wrap">
			<table class="kv-table">
				<thead>
					<tr>
						<th>Persona</th>
						<th class="r">Vino / compró</th>
						<th class="r">Gastado</th>
						<th class="hide-sm">Series</th>
						<th class="hide-sm">Última vez</th>
					</tr>
				</thead>
				<tbody>
					{#each filtered.slice(0, 500) as p (p.id)}
						<tr>
							<td class="who">
								<a class="name" href="/admin/comunidad/personas/{p.id}">{p.name}</a>
								{#if p.pronouns.length}<span class="muted">({p.pronouns.join(', ')})</span>{/if}
								{#if p.notes}<span class="note" title="{p.notes} notas"
										><StickyNote size={14} aria-label="{p.notes} notas" /></span
									>{/if}
								<small class="muted email">{p.email}</small>
							</td>
							<td class="r num">
								{p.attended} / {p.bought}
								{#if p.attended === 1}<Badge tone="info">primera vez</Badge>{/if}
								{#if p.noShows}<small class="muted">{p.noShows} sin venir</small>{/if}
							</td>
							<td class="r num">{formatARS(p.spent)}</td>
							<td class="hide-sm small">{p.series.map((s) => seriesTitle[s] ?? s).join(', ')}</td>
							<td class="hide-sm small">{fmtDate(p.lastVisit ?? p.lastPurchase)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		{#if filtered.length > 500}
			<p class="kv-note">
				Se muestran las primeras 500; buscá o filtrá para ver otras (el CSV las tiene todas).
			</p>
		{/if}
	{/if}
</Card>

<style>
	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-xs);
		align-items: flex-end;
	}
	.grow {
		flex: 1 1 16rem;
	}
	.name {
		font-weight: 700;
	}
	/* La columna de la persona no se angosta hasta partir el mail letra por letra: con
	   `overflow-wrap: anywhere` su ancho mínimo sería una letra. Un mail más largo que esto se
	   corta donde haga falta (sigue siendo un solo texto, se puede seleccionar y copiar entero). */
	.who {
		min-width: 14rem;
	}
	.email {
		display: block;
		overflow-wrap: anywhere;
	}
	td small {
		display: block;
	}
	.note {
		color: var(--link);
		margin-left: 0.2rem;
	}
	.small {
		font-size: var(--text-sm);
	}
	@media (max-width: 700px) {
		.hide-sm {
			display: none;
		}
	}
</style>
