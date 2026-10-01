<script>
	/**
	 * Cuentas → Perfiles: todos los perfiles (persona, proyecto o lugar), con su visibilidad, cuándo se
	 * crearon, quiénes los gestionan y si están borrados. Búsqueda y filtro en la URL (`?q=`,
	 * `?filtro=`, `?tipo=`), resueltos en el servidor, y los pedidos "Es mi perfil" pendientes.
	 */
	import '$lib/admin/panel-forms.scss';
	import { IdCard } from '@lucide/svelte';
	import { CUENTAS_TABS, VISIBILITY_LABELS } from '$lib/admin/cuentas.js';
	import { KIND_LABELS, ROLE_LABELS } from '$lib/utils/perfiles.js';
	import ProfilesTable from '$lib/components/admin/amigues/ProfilesTable.svelte';
	import ProfileFilters from '$lib/components/admin/amigues/ProfileFilters.svelte';
	import ClaimsCard from '$lib/components/admin/amigues/ClaimsCard.svelte';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Stat from '$lib/components/admin/panel/Stat.svelte';
	import Tabs from '$lib/components/admin/panel/Tabs.svelte';
	import EmptyState from '$lib/components/admin/panel/EmptyState.svelte';
	import CsvButton from '$lib/components/admin/panel/CsvButton.svelte';
	import { csvFilename } from '$lib/admin/csv.js';

	export let data;
	export let form;

	/** @param {number | null | undefined} ms */
	const day = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : '');
	/** @type {import('$lib/admin/csv.js').CsvColumn<(typeof data.profiles)[number]>[]} */
	const columns = [
		{ label: 'nombre', key: 'title' },
		{ label: 'direccion', key: 'slug' },
		{ label: 'tipo', value: (p) => KIND_LABELS[p.kind] ?? p.kind },
		{ label: 'visibilidad', value: (p) => VISIBILITY_LABELS[p.visibility] ?? p.visibility },
		{ label: 'creado', value: (p) => day(p.createdAt) },
		{
			label: 'lo_gestionan',
			value: (p) =>
				p.managers
					.map((m) => `${m.email ?? 'cuenta borrada'} (${ROLE_LABELS[m.role] ?? m.role})`)
					.join(' / ')
		},
		{ label: 'borrado', value: (p) => day(p.deletedAt) }
	];
</script>

<PageHeader
	title="Perfiles"
	subtitle="Personas, proyectos y lugares: los que crearon las cuentas y las fichas de amigues. Les admins ven también los ocultos y los borrados."
>
	<svelte:fragment slot="actions">
		<CsvButton rows={data.profiles} {columns} filename={csvFilename('perfiles')} />
	</svelte:fragment>
</PageHeader>

<Tabs tabs={[...CUENTAS_TABS]} />

{#if !data.dbAvailable}
	<p class="kv-flash bad">No hay base de datos disponible.</p>
{/if}

<div class="kv-stats">
	<Stat label="Perfiles" value={data.counts.total} sub="con ocultos y borrados" />
	<Stat
		label="Para revisar"
		value={data.counts.toReview}
		tone={data.counts.toReview ? 'warn' : ''}
		sub="creados por cuentas, sin revisar"
	/>
	<Stat label="Ocultos" value={data.counts.hidden} />
	<Stat label="Borrados" value={data.counts.deleted} />
</div>

{#if data.claims.length || form?.claim}
	<ClaimsCard claims={data.claims} result={form?.claim} />
{/if}

<Card>
	<ProfileFilters
		q={data.q}
		filter={data.filter}
		filters={data.filters}
		kind={data.kind}
		kinds={data.kinds}
		resetHref="/admin/cuentas/perfiles"
	/>
	<p class="kv-note" aria-live="polite">
		{data.profiles.length}
		{data.profiles.length === 1 ? 'perfil' : 'perfiles'}
	</p>

	{#if data.profiles.length === 0}
		<EmptyState
			icon={IdCard}
			title={data.q || data.filter ? 'No hay perfiles con esos filtros' : 'Todavía no hay perfiles'}
		/>
	{:else}
		<ProfilesTable profiles={data.profiles} />
		{#if data.profiles.length >= 500}
			<p class="kv-note">Se muestran los 500 más nuevos; buscá para encontrar otros.</p>
		{/if}
	{/if}
</Card>
