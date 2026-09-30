<script>
	import '$lib/admin/panel-forms.scss';
	import { ChevronRight, Mail } from '@lucide/svelte';
	import { AJUSTES_TABS } from '$lib/admin/ajustes.js';
	import { fmtDateTime } from '$lib/admin/format.js';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Tabs from '$lib/components/admin/panel/Tabs.svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';

	export let data;
</script>

<PageHeader
	title="Plantillas de los mails"
	subtitle="El asunto, el título y el texto de arriba de cada mail que manda el sistema."
	back={{ href: '/admin/ajustes/mails', label: 'Mails' }}
/>
<Tabs tabs={[...AJUSTES_TABS]} current="/admin/ajustes/mails" />

<div class="kv-stack settings">
	{#if !data.dbAvailable}
		<p class="kv-flash bad">No hay base de datos disponible: se usan los textos de siempre.</p>
	{/if}
	<Card padded={false}>
		<ul class="list">
			{#each data.templates as t (t.id)}
				<li>
					<a href="/admin/ajustes/mails/plantillas/{t.id}">
						<span class="icon"><Mail size={20} aria-hidden="true" /></span>
						<span class="main">
							<span class="kv-row">
								<b>{t.label}</b>
								{#if t.custom}
									<Badge tone="info">texto propio</Badge>
								{:else}
									<Badge>original</Badge>
								{/if}
							</span>
							<small class="muted">{t.when}</small>
							<small class="subject">Asunto: {t.subject}</small>
							{#if t.updatedAt}
								<small class="muted">Cambiado el {fmtDateTime(t.updatedAt)} por {t.updatedBy}</small
								>
							{/if}
						</span>
						<ChevronRight size={20} aria-hidden="true" />
					</a>
				</li>
			{/each}
		</ul>
	</Card>
	<p class="kv-note">
		Los datos de la compra, las entradas con su QR y los links los pone siempre el sistema: una
		plantilla no los puede romper.
	</p>
</div>

<style>
	.settings {
		max-width: 48rem;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li + li {
		border-top: 1px solid var(--line);
	}
	a {
		display: flex;
		gap: 0.8rem;
		align-items: center;
		padding: 0.9rem 1.2rem;
		text-decoration: none;
		color: var(--text);
	}
	a:hover {
		background: var(--surface-2);
	}
	.icon {
		color: var(--accent);
		flex: none;
	}
	.main {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		flex: 1;
		min-width: 0;
	}
	.subject {
		overflow-wrap: anywhere;
	}
</style>
