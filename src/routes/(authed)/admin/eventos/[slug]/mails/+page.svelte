<script>
	/**
	 * Pestaña "Plantillas de mails" de la ficha del evento: cada mail y si este evento le cambia
	 * algo. Se edita en /admin/eventos/<slug>/mails/<mail>.
	 */
	import '$lib/admin/panel-forms.scss';
	import { ChevronRight, Mail } from '@lucide/svelte';
	import { page } from '$app/stores';
	import { fmtDateTime } from '$lib/admin/format.js';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';

	export let data;

	$: slug = $page.params.slug ?? '';
</script>

<div class="kv-stack settings">
	<p class="kv-note">
		Podés cambiar el texto de los mails que les llegan a quienes compran para este evento. Lo que no
		cambies acá sale como en la <a href="/admin/mensajes/plantillas">plantilla general</a>.
	</p>
	{#if !data.dbAvailable}
		<p class="kv-flash bad">No hay base de datos disponible: se usan los textos de siempre.</p>
	{/if}
	<Card padded={false}>
		<ul class="list">
			{#each data.templates as t (t.id)}
				<li>
					<a href="/admin/eventos/{encodeURIComponent(slug)}/mails/{t.id}">
						<span class="icon"><Mail size={20} aria-hidden="true" /></span>
						<span class="main">
							<span class="kv-row">
								<b>{t.label}</b>
								{#if t.changed.length}
									<Badge tone="info">propio de este evento</Badge>
								{:else if t.general}
									<Badge>plantilla general</Badge>
								{:else}
									<Badge>original</Badge>
								{/if}
							</span>
							<small class="muted">{t.when}</small>
							{#if t.changed.length}
								<small>Cambia: {t.changed.join(', ').toLowerCase()}.</small>
							{/if}
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
	.list a {
		display: flex;
		gap: var(--space-xs);
		align-items: center;
		padding: var(--space-xs) var(--space-s);
		text-decoration: none;
		color: var(--text);
	}
	.list a:hover {
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
</style>
