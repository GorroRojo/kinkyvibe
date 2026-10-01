<script>
	import '$lib/admin/panel-forms.scss';
	import { enhance } from '$app/forms';
	import { AJUSTES_TABS } from '$lib/admin/ajustes.js';
	import { fmtDateTime } from '$lib/admin/format.js';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Tabs from '$lib/components/admin/panel/Tabs.svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import CsvButton from '$lib/components/admin/panel/CsvButton.svelte';
	import SignupFieldForm from '$lib/components/admin/SignupFieldForm.svelte';
	import SignupFieldList from '$lib/components/admin/SignupFieldList.svelte';
	import { ROLE_MAX } from '$lib/utils/personas.js';

	/** @type {import('./$types').PageData} */
	export let data;
	/** @type {import('./$types').ActionData} */
	export let form;

	/** @type {import('$lib/admin/csv.js').CsvColumn<(typeof data.roles)[number]>[]} */
	const roleColumns = [
		{ key: 'name', label: 'rol' },
		{ label: 'tipo', value: (r) => (r.fixed ? 'fijo' : 'agregado') },
		{ label: 'agregado', value: (r) => (r.createdAt ? new Date(r.createdAt) : '') },
		{ key: 'createdBy', label: 'por' }
	];
</script>

<PageHeader
	title="Personas y preguntas"
	subtitle="Roles de las personas en eventos y preguntas extra al comprar o inscribirse."
/>
<Tabs tabs={[...AJUSTES_TABS]} />

<div class="kv-stack settings">
	<Card title="Roles">
		<svelte:fragment slot="actions">
			<CsvButton rows={data.roles} columns={roleColumns} filename="roles.csv" />
		</svelte:fragment>
		<p class="kv-note">
			Los eventos y el material listan personas con un rol («Organiza: …»). Los fijos vienen con el
			sitio; acá podés sumar otros. Sacar un rol no lo borra de las publicaciones que ya lo usan.
		</p>
		{#if form?.role}
			<p class="kv-flash" class:bad={!form.role.ok} role="status">{form.role.message}</p>
		{/if}
		<ul class="roles">
			{#each data.roles as r (r.name)}
				<li>
					<span class="name">{r.name}</span>
					{#if r.fixed}
						<Badge tone="neutral">fijo</Badge>
					{:else}
						<small class="kv-note">{r.createdBy} · {fmtDateTime(r.createdAt ?? 0)}</small>
						<form method="POST" action="?/removeRole" use:enhance>
							<input type="hidden" name="name" value={r.name} />
							<button class="kv-btn ghost small" type="submit"
								>Sacar <span class="sr-only">el rol {r.name}</span></button
							>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
		<form class="kv-row add-role" method="POST" action="?/addRole" use:enhance>
			<label class="kv-field">
				<span>Rol nuevo</span>
				<input
					name="name"
					maxlength={ROLE_MAX}
					required
					placeholder="Ej: Cuida la puerta"
					value={form?.role && !form.role.ok && 'name' in form.role ? form.role.name : ''}
				/>
			</label>
			<button class="kv-btn" type="submit">Agregar rol</button>
		</form>
	</Card>

	<Card title="Preguntas generales">
		<p class="kv-note">
			Se definen una vez y cada evento elige cuáles usa (pestaña Preguntas de su ficha). Las
			respuestas son datos de quien compra: se ven solo en Órdenes y en su CSV.
		</p>
		{#if form?.field?.message}
			<p class="kv-flash" class:bad={!form.field.ok} role="status">{form.field.message}</p>
		{/if}
		<SignupFieldList
			fields={data.fields}
			csvName="preguntas-generales.csv"
			empty="Todavía no hay preguntas generales."
		/>
		<h3>Agregar una pregunta general</h3>
		<SignupFieldForm {form} idPrefix="general" />
	</Card>
</div>

<style>
	.settings {
		max-width: 48rem;
	}
	.roles {
		list-style: none;
		margin: 0.6rem 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}
	.roles li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		padding: 0.45rem 0;
		border-top: 1px solid var(--line);
	}
	.name {
		font-weight: 700;
		margin-right: auto;
	}
	.add-role {
		align-items: flex-end;
	}
	.add-role .kv-field {
		flex: 1 1 14rem;
	}
	h3 {
		margin: 1.2rem 0 0.5rem;
		font-size: 1rem;
	}
</style>
