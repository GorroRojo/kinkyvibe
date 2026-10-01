<script>
	/**
	 * Ficha de una cuenta: datos (mail, fechas, contraseña), el permiso "puede tener perfiles" (un
	 * botón para prenderlo o apagarlo) y sus perfiles, cada uno con link a su ficha.
	 */
	import '$lib/admin/panel-forms.scss';
	import { enhance } from '$app/forms';
	import { IdCard } from '@lucide/svelte';
	import { fmtDate, fmtDateTime } from '$lib/admin/format.js';
	import { profileHref } from '$lib/admin/links.js';
	import { VISIBILITY_LABELS } from '$lib/admin/cuentas.js';
	import { KIND_LABELS, ROLE_LABELS } from '$lib/utils/perfiles.js';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import EmptyState from '$lib/components/admin/panel/EmptyState.svelte';

	export let data;
	export let form;

	$: a = data.account;
	let saving = false;
</script>

<PageHeader
	title={a.email ?? 'Cuenta borrada'}
	subtitle="Cuenta del público"
	back={{ href: '/admin/comunidad/cuentas', label: 'Cuentas' }}
>
	<svelte:fragment slot="meta">
		{#if a.deletedAt}<Badge tone="bad">borrada</Badge>{/if}
		{#if a.canHaveProfiles}<Badge tone="ok">puede tener perfiles</Badge>{/if}
	</svelte:fragment>
</PageHeader>

<div class="kv-grid-2 layout">
	<Card title="Datos">
		<dl class="facts">
			<dt>Creada</dt>
			<dd>{fmtDateTime(a.createdAt)}</dd>
			<dt>Mail verificado</dt>
			<dd>{a.verified ? 'Sí' : 'No'}</dd>
			<dt>Contraseña</dt>
			<dd>{a.hasPassword ? 'Tiene' : 'No tiene (entra con código por mail)'}</dd>
			<dt>Perfiles vivos</dt>
			<dd>{a.profiles}</dd>
			{#if a.deletedAt}
				<dt>Borrada</dt>
				<dd>{fmtDateTime(a.deletedAt)}</dd>
			{/if}
		</dl>
	</Card>

	<Card title="Permiso para tener perfiles">
		<p class="kv-note">
			Apagado por defecto. Sin el permiso, la cuenta no ve nada de perfiles: ni la tarjeta en Mi
			rincón, ni sus perfiles, ni invitaciones de proyectos. Sus perfiles quedan guardados y vuelven
			a aparecer si lo prendés de nuevo. Queda en Actividad.
		</p>
		{#if form?.permiso}
			<p class="kv-flash" class:bad={!form.permiso.ok} role="status">{form.permiso.message}</p>
		{/if}
		{#if a.deletedAt}
			<p class="muted">La cuenta está borrada: no se puede cambiar.</p>
		{:else}
			<form
				method="POST"
				action="?/permiso"
				use:enhance={() => {
					saving = true;
					return async ({ update }) => {
						await update();
						saving = false;
					};
				}}
			>
				<p class="state">
					Ahora: <b>{a.canHaveProfiles ? 'puede tener perfiles' : 'no puede tener perfiles'}</b>
				</p>
				<input type="hidden" name="valor" value={a.canHaveProfiles ? '0' : '1'} />
				<button class="kv-btn" class:ghost={a.canHaveProfiles} type="submit" disabled={saving}
					>{a.canHaveProfiles ? 'Sacarle el permiso' : 'Darle el permiso'}</button
				>
			</form>
		{/if}
	</Card>
</div>

<Card title="Perfiles que gestiona">
	{#if data.profiles.length === 0}
		<EmptyState icon={IdCard} title="No gestiona ningún perfil" />
	{:else}
		<div class="kv-table-wrap">
			<table class="kv-table">
				<thead>
					<tr>
						<th>Perfil</th>
						<th>Tipo</th>
						<th>Rol</th>
						<th>Visibilidad</th>
						<th class="hide-sm">Creado</th>
					</tr>
				</thead>
				<tbody>
					{#each data.profiles as p (p.id)}
						<tr>
							<td>
								<a class="name" href={profileHref(p.id)}>{p.title}</a>
								<small class="muted slug">/{p.slug}</small>
								{#if p.deletedAt}<Badge tone="bad">borrado</Badge>{/if}
							</td>
							<td class="small">{KIND_LABELS[p.kind] ?? p.kind}</td>
							<td class="small">{ROLE_LABELS[p.role] ?? p.role}</td>
							<td class="small">{VISIBILITY_LABELS[p.visibility] ?? p.visibility}</td>
							<td class="hide-sm small">{fmtDate(p.createdAt)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</Card>

<style>
	.layout {
		margin-bottom: 1rem;
	}
	.facts {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.4rem 1rem;
		margin: 0;
	}
	.facts dt {
		color: var(--muted);
	}
	.facts dd {
		margin: 0;
	}
	.state {
		margin: 0 0 0.6rem;
	}
	.name {
		font-weight: 700;
		overflow-wrap: anywhere;
	}
	.slug {
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
