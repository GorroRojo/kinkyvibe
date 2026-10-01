<script>
	/**
	 * Cuentas: lista de las cuentas del público con búsqueda por mail (en el servidor, `?q=`).
	 * Cada fila lleva a la ficha de la cuenta (perfiles y permiso para tener perfiles).
	 */
	import '$lib/admin/panel-forms.scss';
	import { CircleUser } from '@lucide/svelte';
	import { fmtDate } from '$lib/admin/format.js';
	import { accountHref } from '$lib/admin/links.js';
	import { PROFILES_HREF } from '$lib/admin/perfiles.js';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Stat from '$lib/components/admin/panel/Stat.svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import EmptyState from '$lib/components/admin/panel/EmptyState.svelte';
	import CsvButton from '$lib/components/admin/panel/CsvButton.svelte';
	import { csvFilename } from '$lib/admin/csv.js';

	export let data;

	/** @param {number | null | undefined} ms */
	const day = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : '');
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
	subtitle="Las cuentas del público (Ingresar / Mi rincón). Solo lo ven les admins."
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
		<button class="kv-btn" type="submit">Buscar</button>
		{#if data.q}<a class="kv-btn ghost" href="/admin/comunidad/cuentas">Ver todas</a>{/if}
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
		<div class="kv-table-wrap">
			<table class="kv-table">
				<thead>
					<tr>
						<th>Cuenta</th>
						<th>Creada</th>
						<th class="hide-sm">Mail verificado</th>
						<th class="hide-sm">Contraseña</th>
						<th class="r">Perfiles</th>
						<th><abbr title="Puede tener perfiles">Permiso</abbr></th>
					</tr>
				</thead>
				<tbody>
					{#each data.accounts as a (a.id)}
						<tr class:gone={a.deletedAt}>
							<td>
								<a class="name" href={accountHref(a.id)}>{a.email ?? 'Cuenta borrada'}</a>
								{#if a.deletedAt}<Badge tone="bad">borrada {fmtDate(a.deletedAt)}</Badge>{/if}
							</td>
							<td class="small">{fmtDate(a.createdAt)}</td>
							<td class="hide-sm small">{a.verified ? 'Sí' : 'No'}</td>
							<td class="hide-sm small">{a.hasPassword ? 'Sí' : 'No'}</td>
							<td class="r num">{a.profiles}</td>
							<td>
								{#if a.canHaveProfiles}<Badge tone="ok">sí</Badge>{:else}<span class="muted"
										>no</span
									>{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		{#if data.accounts.length >= 500}
			<p class="kv-note">Se muestran las 500 más nuevas; buscá por mail para encontrar otras.</p>
		{/if}
	{/if}
</Card>

<style>
	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: 0.8rem;
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
	.gone .name {
		color: var(--muted);
	}
	.small {
		font-size: 0.88rem;
	}
	@media (max-width: 700px) {
		.hide-sm {
			display: none;
		}
	}
</style>
