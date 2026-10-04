<script>
	/**
	 * Comunidad › Perfiles: la única lista de perfiles del panel (personas, proyectos y lugares),
	 * con filtros en la URL, CSV de lo que se ve, las pestañas «Para aprobar» y «Pedidos "Es mi
	 * perfil"». Solo la base («solo base»). Cada fila abre el editor del perfil. Ver +page.server.js.
	 */
	import '$lib/admin/panel-forms.scss';
	import { IdCard } from '@lucide/svelte';
	import {
		PROFILES_HREF,
		PROFILE_CSV_COLUMNS,
		PROFILE_KIND_FILTERS,
		PROFILE_ORIGINS,
		PROFILE_STATES,
		hasProfileFilters,
		profilesHref
	} from '$lib/admin/perfiles.js';
	import { csvFilename } from '$lib/admin/csv.js';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Stat from '$lib/components/admin/panel/Stat.svelte';
	import Tabs from '$lib/components/admin/panel/Tabs.svelte';
	import EmptyState from '$lib/components/admin/panel/EmptyState.svelte';
	import CsvButton from '$lib/components/admin/panel/CsvButton.svelte';
	import ProfilesTable from '$lib/components/admin/amigues/ProfilesTable.svelte';
	import ProfileFilters from '$lib/components/admin/amigues/ProfileFilters.svelte';
	import ClaimsCard from '$lib/components/admin/amigues/ClaimsCard.svelte';

	/** @type {any} */
	export let data;
	/** @type {any} */
	export let form;

	const IMPORT_HREF = `${PROFILES_HREF}/importar`;
	const NEW_HREF = `${PROFILES_HREF}/nuevo`;

	$: f = data.filters ?? { q: '', kind: '', origin: '', state: '', view: '' };
	$: tabs = [
		{ href: PROFILES_HREF, label: 'Todos' },
		{
			href: profilesHref({ state: 'para-aprobar' }),
			label: 'Para aprobar',
			count: data.counts?.toApprove
		},
		{
			href: profilesHref({ view: 'pedidos' }),
			label: 'Pedidos «Es mi perfil»',
			count: data.claims?.length
		}
	];
	$: current =
		f.view === 'pedidos'
			? profilesHref({ view: 'pedidos' })
			: f.state === 'para-aprobar' && !f.q && !f.kind && !f.origin
				? profilesHref({ state: 'para-aprobar' })
				: PROFILES_HREF;
</script>

<PageHeader
	title="Perfiles"
	subtitle="Personas, proyectos y lugares: las fichas de /amigues, los que crean las cuentas y los que se cargan acá. Les admins ven también los ocultos y los borrados."
>
	<svelte:fragment slot="actions">
		{#if f.view !== 'pedidos'}
			<CsvButton
				rows={data.profiles}
				columns={PROFILE_CSV_COLUMNS}
				filename={csvFilename('perfiles')}
			/>
		{/if}
		<a class="kv-btn ghost" href={IMPORT_HREF}>Importar y clasificar</a>
		<a class="kv-btn" href={NEW_HREF}>Nuevo perfil</a>
	</svelte:fragment>
</PageHeader>

<Tabs {tabs} {current} />

{#if !data.dbAvailable}
	<p class="kv-flash bad">No hay base de datos disponible.</p>
{/if}
{#if data.notImported}
	<p class="kv-flash warn">
		Hay {data.notImported}
		{data.notImported === 1 ? 'ficha .md del repo que no está' : 'fichas .md del repo que no están'}
		en la base: no se muestran en el sitio hasta importarlas. <a href={IMPORT_HREF}>Importar</a>
	</p>
{/if}
{#if f.view === 'pedidos' || form?.claim}
	<ClaimsCard claims={data.claims} result={form?.claim} />
{/if}

{#if f.view !== 'pedidos'}
	<div class="kv-stats">
		<Stat label="Perfiles" value={data.counts.total} sub="con ocultos y borrados" />
		<Stat
			label="Para aprobar"
			value={data.counts.toApprove}
			tone={data.counts.toApprove ? 'warn' : ''}
			sub="no aparecen en /amigues"
		/>
		<Stat
			label="Sin revisar"
			value={data.counts.toReview}
			tone={data.counts.toReview ? 'warn' : ''}
			sub="creados por cuentas"
		/>
		<Stat label="Ocultos" value={data.counts.hidden} />
		<Stat label="Borrados" value={data.counts.deleted} />
	</div>

	{#if f.state === 'para-aprobar'}
		<p class="kv-note">
			Se aprueban desde la ficha de cada perfil. Los lugares que cargan las cuentas se aprueban o
			rechazan (con motivo) en <a href="/admin/eventos/lugares">Eventos › Lugares</a>.
		</p>
	{/if}

	<Card>
		<ProfileFilters
			q={f.q}
			kind={f.kind}
			kinds={PROFILE_KIND_FILTERS}
			origin={f.origin}
			origins={PROFILE_ORIGINS}
			state={f.state}
			states={PROFILE_STATES}
			resetHref={PROFILES_HREF}
		/>
		<p class="kv-note" aria-live="polite">
			{data.profiles.length}
			{data.profiles.length === 1 ? 'perfil' : 'perfiles'}
		</p>
		{#if data.profiles.length === 0}
			<EmptyState
				icon={IdCard}
				title={hasProfileFilters(f)
					? 'No hay perfiles con esos filtros'
					: 'Todavía no hay perfiles'}
			/>
		{:else}
			<ProfilesTable profiles={data.profiles} />
			{#if data.profiles.length >= 500}
				<p class="kv-note">Se muestran los 500 más nuevos; buscá para encontrar otros.</p>
			{/if}
		{/if}
	</Card>
{/if}
