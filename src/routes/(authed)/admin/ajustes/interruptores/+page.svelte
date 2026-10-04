<script>
	import '$lib/admin/panel-forms.scss';
	import { enhance } from '$app/forms';
	import { AJUSTES_TABS } from '$lib/admin/ajustes.js';
	import { fmtDateTime } from '$lib/admin/format.js';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Tabs from '$lib/components/admin/panel/Tabs.svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import { Lock } from '@lucide/svelte';

	export let data;
	export let form;

	/** Interruptor que se está guardando y el último que se guardó (para «Guardando…» / «Guardado ✓»). */
	let saving = '';
	let savedKey = '';

	/** @param {string} key @returns {import('@sveltejs/kit').SubmitFunction} */
	const toggle =
		(key) =>
		({ formElement }) => {
			saving = key;
			savedKey = '';
			return async ({ result, update }) => {
				await update({ reset: false });
				saving = '';
				if (result.type === 'success') savedKey = key;
				else {
					// No se guardó: el interruptor vuelve a mostrar lo que hay guardado.
					const input = formElement.querySelector('input[role="switch"]');
					if (input instanceof HTMLInputElement) input.checked = !input.checked;
				}
			};
		};
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
			<!-- Interruptor: se guarda apenas se toca (sin botón Guardar; decisión de gorrite). -->
			<form slot="actions" method="POST" action="?/toggle" use:enhance={toggle(f.key)}>
				<input type="hidden" name="key" value={f.key} />
				<label class="kv-check toggle">
					<input
						type="checkbox"
						role="switch"
						name="enabled"
						value="1"
						checked={f.enabled}
						disabled={!data.dbAvailable || saving === f.key}
						aria-label={f.label}
						on:change={(e) => e.currentTarget.form?.requestSubmit()}
					/>
					<span>{f.enabled ? 'Prendido' : 'Apagado'}</span>
					{#if saving === f.key}
						<span class="kv-note" role="status">Guardando…</span>
					{:else if savedKey === f.key}
						<span class="saved" role="status">Guardado ✓</span>
					{/if}
				</label>
				<noscript><button class="kv-btn small" type="submit">Guardar</button></noscript>
			</form>
			{#if f.forced !== null || f.updatedAt}
				<p class="state">
					{#if f.forced === true}
						<Badge tone="info" icon={Lock}>prendido por {f.envVar}=1</Badge>
					{:else if f.forced === false}
						<Badge tone="bad" icon={Lock}>apagado por {f.envVar}=0</Badge>
					{/if}
					{#if f.updatedAt}
						<span class="kv-note">
							Último cambio: {fmtDateTime(f.updatedAt)} ({f.updatedBy})
						</span>
					{/if}
				</p>
			{/if}
			<p class="kv-note">{f.description}</p>
			{#if f.key === 'personas_eventos' && (f.forced ?? f.enabled)}
				<p><a href="/admin/eventos/roles">Configurar roles y preguntas →</a></p>
			{/if}
			{#if f.forced !== null}
				<p class="kv-note">
					La variable {f.envVar} (panel de Cloudflare) manda sobre este interruptor mientras exista.
				</p>
			{/if}
		</Card>
	{/each}
</div>

<style>
	.settings {
		max-width: 48rem;
	}
	.toggle {
		font-weight: 700;
	}
	.saved {
		color: var(--ok);
		font-size: var(--text-sm);
	}
	.state {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2xs);
		margin: 0 0 0.5rem;
	}
</style>
