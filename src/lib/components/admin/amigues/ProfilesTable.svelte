<script>
	/**
	 * Tabla de perfiles del panel (Comunidad › Perfiles): nombre (link al editor, o a la ficha si
	 * está borrado), dirección, estado (borrado, para revisar, rechazado, no aparece en Amigues),
	 * link a la ficha (quiénes lo gestionan, aprobar, ocultar, borrar), tipo, origen, visibilidad,
	 * cuándo se creó y quiénes lo gestionan.
	 * Props: `profiles` (AdminProfile de src/lib/server/admin/cuentas.js), `hrefFor` (link de cada
	 * fila), `slugFor` (la dirección que se muestra), `showManagers`.
	 */
	import { fmtDate } from '$lib/admin/format.js';
	import { accountHref, profileHref } from '$lib/admin/links.js';
	import { VISIBILITY_LABELS } from '$lib/admin/cuentas.js';
	import { PROFILE_ORIGINS, profileRowHref } from '$lib/admin/perfiles.js';
	import { KIND_LABELS, ROLE_LABELS } from '$lib/utils/perfiles.js';
	import Badge from '$lib/components/admin/panel/Badge.svelte';

	/** @type {any[]} */
	export let profiles;
	/** @type {(p: any) => string} */
	export let hrefFor = profileRowHref;
	/** @type {(p: any) => string} */
	export let slugFor = (p) => p.legacySlug || p.slug;
	/** @type {Record<string, string>} */
	const ORIGIN_LABELS = PROFILE_ORIGINS;
	export let showManagers = true;
</script>

<div class="kv-table-wrap">
	<table class="kv-table">
		<thead>
			<tr>
				<th>Perfil</th>
				<th>Tipo</th>
				<th class="hide-sm">Origen</th>
				<th>Visibilidad</th>
				<th class="hide-sm">Creado</th>
				{#if showManagers}<th class="hide-sm">Lo gestionan</th>{/if}
			</tr>
		</thead>
		<tbody>
			{#each profiles as p (p.id)}
				<tr class:gone={p.deletedAt}>
					<td>
						<a class="name" href={hrefFor(p)}>{p.title}</a>
						<small class="muted slug">/{slugFor(p)}</small>
						{#if p.deletedAt}<Badge tone="bad">borrado {fmtDate(p.deletedAt)}</Badge>{/if}
						{#if p.byAccount && !p.deletedAt && !p.reviewed}<Badge tone="warn">para revisar</Badge
							>{/if}
						{#if p.rejected && !p.approved && !p.deletedAt}<Badge tone="bad">rechazado</Badge
							>{:else if p.approved === false && !p.deletedAt}<Badge tone="info"
								>no aparece en Amigues</Badge
							>{/if}
						{#if !p.deletedAt}<a class="ficha small" href={profileHref(p.id)}>ficha</a>{/if}
					</td>
					<td class="small">{KIND_LABELS[p.kind] ?? p.kind}</td>
					<td class="hide-sm small">{ORIGIN_LABELS[p.origin] ?? ''}</td>
					<td class="small">
						{#if p.visibility === 'hidden'}<Badge tone="info">oculto</Badge
							>{:else}{VISIBILITY_LABELS[p.visibility] ?? p.visibility}{/if}
					</td>
					<td class="hide-sm small">{fmtDate(p.createdAt)}</td>
					{#if showManagers}
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
					{/if}
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
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
	.ficha {
		margin-left: 0.3rem;
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
