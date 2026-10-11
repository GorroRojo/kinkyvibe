<script>
	/**
	 * Ficha de un perfil: datos (tipo, visibilidad, presentación, links), quiénes lo gestionan
	 * (con link a cada cuenta) y las acciones de admins: marcar como revisado, ocultar y borrar.
	 * Borrar es el mismo link que la página del perfil (/admin/borrar/amigues/<dirección>: se
	 * recupera desde Actividad); la acción `borrar` de esta página queda para los links viejos.
	 */
	import '$lib/admin/panel-forms.scss';
	import { enhance } from '$app/forms';
	import { fmtDateTime } from '$lib/admin/format.js';
	import { accountHref } from '$lib/admin/links.js';
	import { PROFILES_HREF } from '$lib/admin/perfiles.js';
	import { VISIBILITY_LABELS, actorLabel } from '$lib/admin/cuentas.js';
	import { KIND_LABELS, ROLE_LABELS } from '$lib/utils/perfiles.js';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import ClaimsCard from '$lib/components/admin/amigues/ClaimsCard.svelte';
	import UndoToast from '$lib/components/admin/panel/UndoToast.svelte';
	import DeleteLink from '$lib/components/admin/panel/DeleteLink.svelte';

	export let data;
	export let form;

	$: p = data.profile;
	$: deleted = form && 'deleted' in form ? form.deleted : null;
	let busy = '';

	/** @param {string} name */
	const submit = (name) => () => {
		busy = name;
		return async (/** @type {{ update: () => Promise<void> }} */ { update }) => {
			await update();
			busy = '';
		};
	};

	/** @type {Record<string, string>} */
	const REVIEW_LABELS = {
		'profile.review': 'Revisado',
		'profile.hide': 'Ocultado',
		'profile.delete': 'Borrado',
		'profile.approve': 'Aprobado para Amigues'
	};
</script>

<PageHeader
	title={p.title}
	subtitle="/amigues/{data.urlSlug}"
	back={{ href: PROFILES_HREF, label: 'Perfiles' }}
>
	<svelte:fragment slot="meta">
		<Badge>{KIND_LABELS[p.kind] ?? p.kind}</Badge>
		{#if p.deletedAt}<Badge tone="bad">borrado</Badge>{/if}
		{#if p.visibility === 'hidden'}<Badge tone="info">oculto</Badge>{/if}
		{#if p.byAccount && !p.deletedAt && !data.review}<Badge tone="warn">para revisar</Badge>{/if}
		{#if !data.approval && !p.deletedAt}<Badge tone="info">no aparece en Amigues</Badge>{/if}
	</svelte:fragment>
	<svelte:fragment slot="actions">
		{#if !p.deletedAt}
			<a class="kv-btn" href="/admin/comunidad/perfiles/{data.urlSlug}">Editar el perfil</a>
		{/if}
	</svelte:fragment>
</PageHeader>

{#if deleted && p.deletedAt}
	<form method="POST" action="?/deshacer" use:enhance={submit('deshacer')}>
		<input type="hidden" name="id" value={deleted.id} />
		<!-- El botón Deshacer de UndoToast no tiene `type`: dentro del form, lo envía. -->
		<UndoToast busy={busy === 'deshacer'} message="Borraste «{deleted.title}»." />
	</form>
	<p class="kv-note">
		Si te arrepentís más tarde, lo podés recuperar desde <a href="/admin/ajustes/actividad"
			>Actividad</a
		>.
	</p>
{:else if form?.perfil}
	<p class="kv-flash" class:bad={!form.perfil.ok} role="status">{form.perfil.message}</p>
{/if}

<div class="kv-grid-2 layout">
	<Card title="Datos">
		<dl class="facts">
			<dt>Visibilidad</dt>
			<dd>{VISIBILITY_LABELS[p.visibility] ?? p.visibility}</dd>
			<dt>Creado</dt>
			<dd>{fmtDateTime(p.createdAt)} por {actorLabel(p.createdBy)}</dd>
			<dt>Última edición</dt>
			<dd>{fmtDateTime(p.updatedAt)} por {actorLabel(p.updatedBy)}</dd>
			{#if p.deletedAt}
				<dt>Borrado</dt>
				<dd>{fmtDateTime(p.deletedAt)}</dd>
			{/if}
			{#if p.pronouns}
				<dt>Pronombres</dt>
				<dd>{p.pronouns}</dd>
			{/if}
			{#if p.kind === 'proyecto'}
				<dt>Integrantes</dt>
				<dd>{p.showMembers ? 'Se muestran' : 'No se muestran'}</dd>
			{/if}
			<dt>Amigues</dt>
			<dd>
				{#if data.approval}
					Aparece (aprobado por {data.approval.by === 'importacion'
						? 'la importación'
						: `@${data.approval.by}`}, {fmtDateTime(data.approval.at)})
				{:else}
					No aparece: falta que une admin lo apruebe
				{/if}
			</dd>
			<dt>Revisión</dt>
			<dd>
				{#if data.review}
					{REVIEW_LABELS[data.review.action] ?? 'Revisado'} por @{data.review.by}, {fmtDateTime(
						data.review.at
					)}
				{:else if p.byAccount}
					Sin revisar
				{:else}
					—
				{/if}
			</dd>
		</dl>
		{#if p.bio}
			<h3 class="sub">Presentación</h3>
			<p class="bio">{p.bio}</p>
		{/if}
		{#if p.links.length}
			<h3 class="sub">Links</h3>
			<ul class="links">
				{#each p.links as l (l)}<li><code>{l}</code></li>{/each}
			</ul>
		{/if}
	</Card>

	<Card title="Lo gestionan">
		<p class="kv-note">Nunca se muestra fuera del panel ni a otras cuentas.</p>
		{#if data.managers.length}
			<ul class="managers">
				{#each data.managers as m (m.accountId)}
					<li>
						<a href={accountHref(m.accountId)}>{m.email ?? 'Cuenta borrada'}</a>
						<Badge>{ROLE_LABELS[m.role] ?? m.role}</Badge>
						{#if m.deleted}<Badge tone="bad">cuenta borrada</Badge>{/if}
					</li>
				{/each}
			</ul>
		{:else}
			<p class="muted">Nadie.</p>
		{/if}
	</Card>
</div>

{#if data.claims.length || form?.claim}
	<div class="layout">
		<ClaimsCard
			claims={data.claims}
			result={form?.claim}
			title="Pedidos «Es mi perfil» de este perfil"
		/>
	</div>
{/if}

{#if !p.deletedAt}
	<Card title="Acciones">
		<div class="actions">
			{#if !data.approval}
				<form method="POST" action="?/aprobar" use:enhance={submit('aprobar')}>
					<button class="kv-btn" type="submit" disabled={busy !== ''}>Aprobar para Amigues</button>
				</form>
			{:else}
				<form method="POST" action="?/desaprobar" use:enhance={submit('desaprobar')}>
					<button class="kv-btn ghost" type="submit" disabled={busy !== ''}>Sacar de Amigues</button
					>
				</form>
			{/if}
			{#if !data.review}
				<form method="POST" action="?/revisado" use:enhance={submit('revisado')}>
					<input type="hidden" name="version" value={p.version} />
					<button class="kv-btn" type="submit" disabled={busy !== ''}>Marcar como revisado</button>
				</form>
			{/if}
			{#if p.visibility !== 'hidden'}
				<form method="POST" action="?/ocultar" use:enhance={submit('ocultar')}>
					<input type="hidden" name="version" value={p.version} />
					<button class="kv-btn ghost" type="submit" disabled={busy !== ''}>Ocultar</button>
				</form>
			{/if}
		</div>
		<p class="kv-note">
			Aprobar lo muestra en /amigues (si su visibilidad lo deja) y lo saca de "Para revisar".
			Ocultar o borrar también lo saca de "Para revisar". Oculto, lo ven solo les admins y quienes
			lo gestionan (en Mi rincón, donde pueden volver a cambiar la visibilidad).
		</p>
		<!-- Borrar: uno solo, el de la página del perfil (se recupera desde Actividad). -->
		<DeleteLink kind="amigues" slug={data.urlSlug} label="Borrar el perfil…" />
	</Card>
{/if}

<style>
	.layout {
		margin-bottom: 1rem;
	}
	.facts {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.4rem var(--space-xs);
		margin: 0;
	}
	.facts dt {
		color: var(--muted);
	}
	.facts dd {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.sub {
		font-size: var(--text-sm);
		margin: 1rem 0 0.3rem;
	}
	.bio {
		white-space: pre-line;
		margin: 0;
		overflow-wrap: anywhere;
	}
	.links,
	.managers {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.links li,
	.managers li {
		padding: var(--space-3xs) 0;
		overflow-wrap: anywhere;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2xs);
	}
</style>
