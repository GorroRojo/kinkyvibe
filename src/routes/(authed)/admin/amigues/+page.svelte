<script>
	import '$lib/admin/panel-forms.scss';
	import { IdCard } from '@lucide/svelte';
	import ContentList from '$lib/components/admin/content/ContentList.svelte';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import EmptyState from '$lib/components/admin/panel/EmptyState.svelte';
	import ProfilesTable from '$lib/components/admin/amigues/ProfilesTable.svelte';
	import ProfileFilters from '$lib/components/admin/amigues/ProfileFilters.svelte';

	/** @type {any} */
	export let data;
	/** @type {any} */
	export let form;
</script>

{#if data.editor === 'db'}
	<PageHeader
		title="Amigues"
		subtitle="Personas, proyectos y lugares de /amigues. Los cambios se publican al guardar."
	>
		<svelte:fragment slot="actions">
			<a class="kv-btn ghost" href="/admin/amigues/importar">Importar y clasificar</a>
			<a class="kv-btn" href="/admin/amigues/nuevo">Nuevo perfil</a>
		</svelte:fragment>
	</PageHeader>
	{#if data.notImported}
		<p class="kv-flash warn">
			Hay {data.notImported}
			{data.notImported === 1 ? 'ficha .md que no está' : 'fichas .md que no están'} en la base: se siguen
			mostrando desde el archivo. <a href="/admin/amigues/importar">Importar</a>
		</p>
	{/if}
	<Card>
		<ProfileFilters q={data.q} kind={data.kind} kinds={data.kinds} resetHref="/admin/amigues" />
		{#if data.profiles.length}
			<ProfilesTable
				profiles={data.profiles}
				hrefFor={(p) => `/admin/amigues/${p.slug}`}
				showManagers={false}
			/>
		{:else}
			<EmptyState icon={IdCard} title="No hay perfiles con esos filtros" />
		{/if}
	</Card>
{:else}
	<ContentList
		category="amigues"
		rows={data.rows}
		{form}
		title="Amigues"
		subtitle="Perfiles de personas y proyectos amigues (se usan en «Organizan» y «Autores»)."
		newLabel="Nuevo perfil"
		canDuplicate={false}
	>
		<p class="kv-note">
			Pasá las fichas a la base para revisarlas antes de prender «perfiles_publicos».
		</p>
		<svelte:fragment slot="actions">
			<a class="kv-btn ghost" href="/admin/amigues/importar">Importar y clasificar</a>
		</svelte:fragment>
	</ContentList>
{/if}
