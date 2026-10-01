<script>
	/**
	 * Cuentas → Perfiles: todos los perfiles (persona o grupo), con su visibilidad, cuándo se
	 * crearon, quiénes los gestionan y si están borrados. Búsqueda y filtro en la URL (`?q=`,
	 * `?filtro=`), resueltos en el servidor.
	 */
	import '$lib/admin/panel-forms.scss';
	import { IdCard } from '@lucide/svelte';
	import { fmtDate } from '$lib/admin/format.js';
	import { accountHref, profileHref } from '$lib/admin/links.js';
	import { CUENTAS_TABS, VISIBILITY_LABELS } from '$lib/admin/cuentas.js';
	import { KIND_LABELS, ROLE_LABELS } from '$lib/utils/perfiles.js';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Stat from '$lib/components/admin/panel/Stat.svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import Tabs from '$lib/components/admin/panel/Tabs.svelte';
	import EmptyState from '$lib/components/admin/panel/EmptyState.svelte';

	export let data;
</script>

<PageHeader
	title="Perfiles"
	subtitle="Perfiles de persona y de grupo que crearon las cuentas. Les admins ven también los ocultos y los borrados."
/>

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

<Card>
	<form class="filters" method="GET" role="search">
		<label class="kv-field grow">
			<span>Buscar perfil</span>
			<input
				type="search"
				name="q"
				value={data.q}
				placeholder="Nombre o dirección"
				autocomplete="off"
			/>
		</label>
		<label class="kv-field">
			<span>Mostrar</span>
			<select name="filtro" value={data.filter}>
				<option value="">Todos</option>
				{#each Object.entries(data.filters) as [value, label] (value)}
					<option {value}>{label}</option>
				{/each}
			</select>
		</label>
		<button class="kv-btn" type="submit">Buscar</button>
		{#if data.q || data.filter}<a class="kv-btn ghost" href="/admin/cuentas/perfiles">Ver todos</a
			>{/if}
	</form>
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
		<div class="kv-table-wrap">
			<table class="kv-table">
				<thead>
					<tr>
						<th>Perfil</th>
						<th>Tipo</th>
						<th>Visibilidad</th>
						<th class="hide-sm">Creado</th>
						<th class="hide-sm">Lo gestionan</th>
					</tr>
				</thead>
				<tbody>
					{#each data.profiles as p (p.id)}
						<tr class:gone={p.deletedAt}>
							<td>
								<a class="name" href={profileHref(p.id)}>{p.title}</a>
								<small class="muted slug">/{p.slug}</small>
								{#if p.deletedAt}<Badge tone="bad">borrado {fmtDate(p.deletedAt)}</Badge>{/if}
								{#if p.byAccount && !p.deletedAt && !p.reviewed}<Badge tone="warn"
										>para revisar</Badge
									>{/if}
							</td>
							<td class="small">{KIND_LABELS[p.kind] ?? p.kind}</td>
							<td class="small">
								{#if p.visibility === 'hidden'}<Badge tone="info">oculto</Badge
									>{:else}{VISIBILITY_LABELS[p.visibility] ?? p.visibility}{/if}
							</td>
							<td class="hide-sm small">{fmtDate(p.createdAt)}</td>
							<td class="hide-sm small">
								{#each p.managers as m (m.accountId)}
									<span class="manager"
										><a href={accountHref(m.accountId)}>{m.email ?? 'cuenta borrada'}</a>
										<span class="muted">({ROLE_LABELS[m.role] ?? m.role})</span></span
									>
								{:else}
									<span class="muted">nadie</span>
								{/each}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		{#if data.profiles.length >= 500}
			<p class="kv-note">Se muestran los 500 más nuevos; buscá para encontrar otros.</p>
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
	}
	.gone .name {
		color: var(--muted);
	}
	.slug {
		display: block;
		overflow-wrap: anywhere;
	}
	.manager {
		display: block;
		overflow-wrap: anywhere;
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
