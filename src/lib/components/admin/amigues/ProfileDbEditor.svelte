<script>
	/**
	 * Página del panel para editar un perfil de la base (Comunidad › Perfiles; también las fichas
	 * importadas): encabezado con su estado (tipo a confirmar, oculto, sin aprobar),
	 * el formulario y la clasificación de la importación.
	 * Props: `data` (de `editorPageData` en src/lib/server/admin/amiguesRoutes.js) y `form`.
	 */
	import '$lib/admin/panel-forms.scss';
	import { enhance } from '$app/forms';
	import { page } from '$app/stores';
	import { fmtDateTime } from '$lib/admin/format.js';
	import { profileHref } from '$lib/admin/links.js';
	import { actorLabel } from '$lib/admin/cuentas.js';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import ProfileEditorForm from './ProfileEditorForm.svelte';

	/** @type {any} */
	export let data;
	/** @type {any} */
	export let form;

	$: p = data.profile;
	// Después de guardar (o de un error), el formulario muestra lo que volvió del servidor.
	$: values = structuredClone(form?.perfil?.values ?? data.values);
	$: created = $page.url.searchParams.get('guardado') === 'creado';
	/**
	 * Lo que pasó al crear, según cómo quedó: un perfil oculto o sin aprobar no está «publicado».
	 * @param {{ visibility: string }} profile
	 * @param {unknown} approval
	 */
	function createdMessage(profile, approval) {
		if (profile.visibility === 'hidden')
			return 'Listo: el perfil quedó creado y oculto (no se ve en el sitio).';
		if (!approval)
			return 'Listo: el perfil quedó creado. Todavía no aparece en Amigues: falta aprobarlo.';
		return 'Listo: el perfil quedó creado y publicado.';
	}
</script>

<PageHeader
	title={p.title}
	subtitle="/amigues/{p.urlSlug}"
	back={{ href: '/admin/comunidad/perfiles', label: 'Perfiles' }}
>
	<svelte:fragment slot="meta">
		<Badge>{data.kinds[p.kind] ?? p.kind}</Badge>
		{#if data.source && !data.source.confirmedAt}<Badge tone="warn">tipo a confirmar</Badge>{/if}
		{#if p.visibility === 'hidden'}<Badge tone="info">oculto</Badge>{/if}
		{#if !data.approval}<Badge tone="warn">no aparece en Amigues</Badge>{/if}
	</svelte:fragment>
	<svelte:fragment slot="actions">
		<a class="kv-btn ghost" href="/amigues/{p.urlSlug}" target="_blank" rel="noopener">Ver página</a
		>
		<a class="kv-btn ghost" href={profileHref(p.id)}>Estado, revisión y pedidos</a>
	</svelte:fragment>
</PageHeader>

<div class="kv-stack">
	{#if created}
		<p class="kv-flash" role="status">{createdMessage(p, data.approval)}</p>
	{/if}
	{#if form?.perfil && !form.perfil.conflict}
		<p class="kv-flash" class:bad={!form.perfil.ok} role="status">{form.perfil.message}</p>
	{/if}

	{#if data.source}
		<Card title="Ficha importada">
			<p class="kv-note">
				Vino de <code>src/lib/posts/amigues/{data.source.legacySlug}.md</code> el {fmtDateTime(
					data.source.importedAt
				)}. La clasificación automática propuso
				<strong>{data.kinds[data.source.suggestedKind]}</strong>: {data.source.reason ||
					'sin señales claras'}.
			</p>
			{#if data.source.confirmedAt}
				<p class="kv-note">
					Tipo confirmado por @{data.source.confirmedBy}, {fmtDateTime(data.source.confirmedAt)}.
				</p>
			{:else}
				<form method="POST" action="?/confirmarTipo" use:enhance class="kv-row">
					<span class="kv-note"
						>¿Es {data.kinds[p.kind]}? Si no, cambiá el tipo abajo y guardá.</span
					>
					<button class="kv-btn small" type="submit">Sí, confirmar</button>
				</form>
			{/if}
		</Card>
	{/if}

	<Card title="Perfil">
		<p class="kv-note">
			Los cambios se publican al guardar. Última edición: {fmtDateTime(p.updatedAt)} por {actorLabel(
				p.updatedBy
			)}.
		</p>
		<ProfileEditorForm
			{values}
			errors={form?.perfil?.errors ?? {}}
			conflict={form?.perfil?.conflict ?? null}
			action="?/guardarPerfil"
			submitLabel="Guardar y publicar"
			kinds={data.kinds}
			image={data.image ?? null}
		/>
	</Card>
</div>
