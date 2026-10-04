<script>
	/**
	 * "Próximamente": una sola página para todas las secciones que vienen (ver
	 * `+page.server.js`). El ícono sale de `nav.js`.
	 */
	import { Hourglass } from '@lucide/svelte';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import EmptyState from '$lib/components/admin/panel/EmptyState.svelte';
	import NavIcon from '$lib/components/admin/panel/NavIcon.svelte';
	import { navItem } from '$lib/admin/nav.js';

	/** @type {{ soon: { id: string, label: string, phase: number | null, text: string, area: string } }} */
	export let data;

	$: item = navItem(data.soon.id);
</script>

<PageHeader
	title={data.soon.label}
	subtitle={data.soon.area ? `${data.soon.area} › ${data.soon.label}` : ''}
>
	<span slot="meta" class="tag"
		>Próximamente{data.soon.phase ? ` · fase ${data.soon.phase}` : ''}</span
	>
</PageHeader>

<div class="soon">
	<EmptyState icon={Hourglass} title="Próximamente" text={data.soon.text}>
		<p class="kv-note">
			{#if item}<NavIcon {item} size={16} />{/if}
			Esta sección está en el plan aprobado{data.soon.phase
				? ` y llega en la fase ${data.soon.phase}`
				: ''}. Mientras tanto, esta dirección queda reservada. Si no querés ver lo que viene en el
			menú, elegí «Ocultar lo que viene» en tu menú de usuario.
		</p>
		<a class="kv-btn ghost" href="/admin">Volver al Inicio</a>
	</EmptyState>
</div>

<style>
	.tag {
		font-size: var(--text-xs);
		border: 1.5px dashed var(--line);
		color: var(--muted);
		border-radius: 2em;
		padding: 0.05em 0.7em;
		white-space: nowrap;
	}
	.soon {
		border: 2px dashed var(--line);
		border-radius: var(--card-round);
		padding: var(--space-xs);
		max-width: 44rem;
	}
	.kv-note {
		display: flex;
		gap: 0.4rem;
		align-items: baseline;
		text-align: left;
		max-width: 36rem;
	}
</style>
