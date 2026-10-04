<script>
	import '$lib/admin/panel-forms.scss';
	import { enhance } from '$app/forms';
	import { AJUSTES_TABS } from '$lib/admin/ajustes.js';
	import { fmtDateTime } from '$lib/admin/format.js';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Tabs from '$lib/components/admin/panel/Tabs.svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';

	export let data;
	export let form;
</script>

<PageHeader
	title="Interruptores"
	subtitle="Funciones nuevas: salen apagadas y se prenden desde acá."
/>
<Tabs tabs={[...AJUSTES_TABS]} />

<div class="kv-stack settings">
	{#if !data.dbAvailable}
		<p class="kv-flash bad">No hay base de datos disponible: todo queda apagado.</p>
	{/if}
	{#if form?.message}
		<p class="kv-flash" role="status">{form.message}</p>
	{:else if form?.error}
		<p class="kv-flash bad" role="alert">{form.error}</p>
	{/if}

	{#each data.flags as f (f.key)}
		<Card title={f.label}>
			<p class="state">
				{#if f.forced === true}
					<Badge tone="info">prendido por {f.envVar}=1</Badge>
				{:else if f.forced === false}
					<Badge tone="bad">apagado por {f.envVar}=0</Badge>
				{:else if f.enabled}
					<Badge tone="ok">prendido</Badge>
				{:else}
					<Badge tone="neutral">apagado</Badge>
				{/if}
				{#if f.updatedAt}
					<span class="kv-note">
						Último cambio: {fmtDateTime(f.updatedAt)} ({f.updatedBy})
					</span>
				{/if}
			</p>
			<p class="kv-note">{f.description}</p>
			{#if f.key === 'personas_eventos' && (f.forced ?? f.enabled)}
				<p><a href="/admin/eventos/roles">Configurar roles y preguntas →</a></p>
			{/if}
			{#if f.forced !== null}
				<p class="kv-note">
					La variable {f.envVar} (panel de Cloudflare) manda sobre este botón mientras exista.
				</p>
			{/if}
			<form method="POST" action="?/toggle" use:enhance>
				<input type="hidden" name="key" value={f.key} />
				<input type="hidden" name="enabled" value={f.enabled ? '0' : '1'} />
				<button class="kv-btn" class:ghost={f.enabled} type="submit"
					>{f.enabled ? 'Apagar' : 'Prender'}</button
				>
			</form>
		</Card>
	{/each}
</div>

<style>
	.settings {
		max-width: 48rem;
	}
	.state {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2xs);
		margin: 0 0 0.5rem;
	}
</style>
