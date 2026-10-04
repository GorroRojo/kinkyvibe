<script>
	/**
	 * Link «Borrar…» a la página de confirmación (/admin/borrar/<kind>/<slug>).
	 * Props: `kind` ('calendario' | 'material' | 'amigues'), `slug`, `label` (default "Borrar…").
	 */
	import { Trash2 } from '@lucide/svelte';

	/** @type {'calendario' | 'material' | 'amigues'} */
	export let kind;
	/** @type {string} */
	export let slug;
	export let label = 'Borrar…';
</script>

{#if slug}
	<p class="delete">
		<a href="/admin/borrar/{kind}/{encodeURIComponent(slug)}"
			><Trash2 size={16} aria-hidden="true" /> {label}</a
		>
	</p>
{/if}

<style>
	.delete {
		margin: 1.5rem 0 0;
		display: flex;
		justify-content: flex-end;
	}
	/* `.delete a` y no solo `a`: con la misma especificidad que `.kv-panel a` (panel.scss, color
	   heredado) ganaba el que llegara último, y el orden del CSS cambia según cómo se arme el
	   bundle. */
	.delete a {
		display: inline-flex;
		align-items: center;
		gap: 0.35em;
		color: var(--bad);
		font-weight: 700;
		min-height: 2.75rem;
	}
	/* Al pasar el mouse, como todos los links del panel. */
	.delete a:hover {
		color: var(--accent);
	}
</style>
