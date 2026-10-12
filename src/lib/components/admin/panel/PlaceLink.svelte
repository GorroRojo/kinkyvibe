<script>
	/**
	 * Un lugar de Fijados o Recientes (barra lateral y panel «Más» del celu): el ícono de su página
	 * (`placeIcon`), el nombre en negrita y, si hay, una línea chica de contexto (el evento, la
	 * sección), los dos cortados con «…» si no entran. Props: `place` (`RecentPlace`).
	 */
	import NavIcon from './NavIcon.svelte';
	import { placeIcon } from '$lib/admin/recentPlaces.js';

	/** @type {import('$lib/admin/recentPlaces.js').RecentPlace} */
	export let place;

	$: icon = placeIcon(place.href);
	$: title = place.context ? `${place.label} · ${place.context}` : place.label;
</script>

<a class="place" href={place.href} {title}
	><span class="pi"><NavIcon item={icon} size={16} /></span><span class="pt"
		><span class="pl">{place.label}</span>{#if place.context}<span class="sr-only">, </span><span
				class="pc">{place.context}</span
			>{/if}</span
	></a
>

<style>
	.place {
		display: flex;
		align-items: center;
		gap: var(--space-2xs);
		min-width: 0;
		flex: 1;
		padding: 0.2rem var(--space-xs);
		border-radius: var(--round);
		color: var(--text);
		text-decoration: none;
		line-height: 1.2;
	}
	.place:hover {
		background: var(--surface-2);
		color: var(--link);
	}
	.pi {
		flex: none;
		display: grid;
		place-items: center;
		width: 1.5rem;
		height: 1.5rem;
		border-radius: var(--radius-s);
		background: var(--surface-2);
		color: var(--accent);
	}
	.pt {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.pl,
	.pc {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.pl {
		font-size: var(--text-sm);
		font-weight: 700;
	}
	.pc {
		font-size: var(--text-xs);
		color: var(--muted);
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
