<script>
	/**
	 * Cuentas: lista de las cuentas del público con búsqueda por mail (en el servidor, `?q=`).
	 * Cada fila lleva a la ficha de la cuenta (perfiles y permiso para tener perfiles).
	 */
	import '$lib/admin/panel-forms.scss';
	import { CircleUser } from '@lucide/svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { DEFAULT_ACCOUNT_SORT, accountSortParam } from '$lib/admin/cuentas.js';
	import { fmtDate } from '$lib/admin/format.js';
	import { argDate } from '$lib/utils/dates.js';
	import { accountHref } from '$lib/admin/links.js';
	import { PROFILES_HREF } from '$lib/admin/perfiles.js';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Stat from '$lib/components/admin/panel/Stat.svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import EmptyState from '$lib/components/admin/panel/EmptyState.svelte';
	import CsvButton from '$lib/components/admin/panel/CsvButton.svelte';
	import { csvFilename } from '$lib/admin/csv.js';
	import { Table } from '$lib/components/ui';

	export let data;

	/** @param {number | null | undefined} ms */
	// El día en hora de Argentina (no UTC: lo de desde las 21:00 caía al día siguiente).
	const day = (ms) => (ms ? argDate(ms) : '');
	// El orden lo hace el servidor (`?orden=`): con 500 cuentas o más no llegan todas, y ordenar
	// solo las que llegaron sería un orden falso. Tocar un encabezado pide la lista en ese orden.
	$: sort = data.sort ?? DEFAULT_ACCOUNT_SORT;
	$: sortParam = accountSortParam(sort);
	/** @type {import('$lib/components/ui/tableSort.js').TableColumn[]} */
	const tableColumns = [
		{ key: 'email', label: 'Cuenta', sort: 'text' },
		{ key: 'createdAt', label: 'Creada', class: 'small', nowrap: true, sort: 'date' },
		{ key: 'verified', label: 'Mail verificado', class: 'hide-sm small' },
		{ key: 'hasPassword', label: 'Contraseña', class: 'hide-sm small' },
		{ key: 'profiles', label: 'Perfiles', align: 'right', sort: 'number' },
		{ key: 'canHaveProfiles', label: 'Permiso', title: 'Puede tener perfiles' }
	];
	/** @param {CustomEvent<{ key: string, dir: 'asc' | 'desc' }>} event */
	function changeSort(event) {
		const url = new URL($page.url);
		const param = accountSortParam(event.detail);
		if (param) url.searchParams.set('orden', param);
		else url.searchParams.delete('orden');
		// El foco se queda en el encabezado que se tocó (se puede seguir con el teclado).
		goto(url, { keepFocus: true, noScroll: true });
	}

	/** @type {import('$lib/admin/csv.js').CsvColumn<(typeof data.accounts)[number]>[]} */
	const columns = [
		{ label: 'email', value: (a) => a.email ?? '' },
		{ label: 'creada', value: (a) => day(a.createdAt) },
		{ label: 'mail_verificado', value: (a) => (a.verified ? 'si' : 'no') },
		{ label: 'contrasena', value: (a) => (a.hasPassword ? 'si' : 'no') },
		{ label: 'perfiles', key: 'profiles' },
		{ label: 'puede_tener_perfiles', value: (a) => (a.canHaveProfiles ? 'si' : 'no') },
		{ label: 'borrada', value: (a) => day(a.deletedAt) }
	];
</script>

<PageHeader
	title="Cuentas"
	subtitle="Las cuentas del público (Entrar / Mi rincón). Solo lo ven les admins."
>
	<svelte:fragment slot="actions">
		<a class="kv-btn ghost" href={PROFILES_HREF}>Perfiles</a>
		<CsvButton rows={data.accounts} {columns} filename={csvFilename('cuentas')} />
	</svelte:fragment>
</PageHeader>

{#if !data.dbAvailable}
	<p class="kv-flash bad">No hay base de datos disponible.</p>
{/if}

<div class="kv-stats">
	<Stat label="Cuentas" value={data.totals.active} sub="sin contar las borradas" />
	<Stat label="Pueden tener perfiles" value={data.totals.withProfiles} />
	<Stat label="Borradas" value={data.totals.deleted} />
</div>

<Card>
	<form class="filters" method="GET" role="search">
		<label class="kv-field grow">
			<span>Buscar por mail</span>
			<input
				type="search"
				name="q"
				value={data.q}
				placeholder="Parte del mail"
				autocomplete="off"
			/>
		</label>
		{#if sortParam}<input type="hidden" name="orden" value={sortParam} />{/if}
		<button class="kv-btn" type="submit">Buscar</button>
		{#if data.q}<a
				class="kv-btn ghost"
				href="/admin/comunidad/cuentas{sortParam ? `?orden=${sortParam}` : ''}">Ver todas</a
			>{/if}
	</form>
	<p class="kv-note" aria-live="polite">
		{data.accounts.length}
		{data.accounts.length === 1 ? 'cuenta' : 'cuentas'}{#if data.q}&nbsp;con «{data.q}»{/if}
	</p>

	{#if data.accounts.length === 0}
		<EmptyState
			icon={CircleUser}
			title={data.q ? 'No hay cuentas con ese mail' : 'Todavía no hay cuentas'}
		/>
	{:else}
		<div class="accounts">
			<Table
				columns={tableColumns}
				rows={data.accounts}
				{sort}
				presorted
				on:sort={changeSort}
				rowKey="id"
				rowClass={(a) => (a.deletedAt ? 'gone' : '')}
			>
				<svelte:fragment slot="cell" let:row={a} let:column>
					{#if column.key === 'email'}
						<a class="name" href={accountHref(a.id)}>{a.email ?? 'Cuenta borrada'}</a>
						{#if a.deletedAt}<Badge tone="bad">borrada {fmtDate(a.deletedAt)}</Badge>{/if}
					{:else if column.key === 'createdAt'}
						{fmtDate(a.createdAt)}
					{:else if column.key === 'verified'}
						{a.verified ? 'Sí' : 'No'}
					{:else if column.key === 'hasPassword'}
						{a.hasPassword ? 'Sí' : 'No'}
					{:else if column.key === 'profiles'}
						{a.profiles}
					{:else if column.key === 'canHaveProfiles'}
						{#if a.canHaveProfiles}<Badge tone="ok">sí</Badge>{:else}<span class="muted">no</span
							>{/if}
					{/if}
				</svelte:fragment>
			</Table>
		</div>
		{#if data.accounts.length >= 500}
			<p class="kv-note">
				Se muestran las primeras 500 {sortParam ? 'en este orden' : '(las más nuevas)'}; buscá por
				mail o cambiá el orden para encontrar otras.
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
		overflow-wrap: anywhere;
		margin-right: 0.3rem;
	}
	.accounts :global(.gone .name) {
		color: var(--muted);
	}
	.accounts :global(td.small) {
		font-size: var(--text-sm);
	}
	@media (max-width: 700px) {
		.accounts :global(.hide-sm) {
			display: none;
		}
	}
</style>
