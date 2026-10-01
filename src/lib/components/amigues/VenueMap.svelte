<script>
	/**
	 * Mapa chico de un lugar con baldosas de OpenStreetMap (imágenes comunes, sin librerías ni
	 * scripts de afuera) y el link para abrirlo en openstreetmap.org. Solo se muestra cuando la
	 * dirección del lugar es pública.
	 * Props: `lat`, `lng`, `label` (nombre del lugar, para el texto alternativo).
	 */
	import { osmLink, osmTiles } from '$lib/utils/venues.js';

	/** @type {number} */
	export let lat;
	/** @type {number} */
	export let lng;
	export let label = '';

	const width = 320;
	const height = 200;
	$: map = osmTiles(lat, lng, { width, height });
</script>

<figure class="venue-map">
	<a href={osmLink(lat, lng)} target="_blank" rel="noopener noreferrer" class="frame">
		<span class="tiles" style:width="{width}px" style:height="{height}px" role="img" aria-label="Mapa: {label}">
			{#each map.tiles as t (`${t.x}-${t.y}-${t.left}`)}
				<img
					src={t.url}
					alt=""
					width="256"
					height="256"
					loading="lazy"
					referrerpolicy="strict-origin-when-cross-origin"
					style:left="{t.left}px"
					style:top="{t.top}px"
				/>
			{/each}
			<span class="pin" aria-hidden="true"></span>
		</span>
	</a>
	<figcaption>
		<a href={osmLink(lat, lng)} target="_blank" rel="noopener noreferrer">Ver en OpenStreetMap</a>
		· © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer"
			>colaboradores de OpenStreetMap</a
		>
	</figcaption>
</figure>

<style>
	.venue-map {
		margin: 1em auto;
		width: fit-content;
		max-width: 100%;
	}
	.frame {
		display: block;
		max-width: 100%;
		overflow: hidden;
		border-radius: 0.8em;
		border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
	}
	.tiles {
		position: relative;
		display: block;
		max-width: 100%;
		overflow: hidden;
		background: #e5e3df;
	}
	.tiles img {
		position: absolute;
		max-width: none;
	}
	.pin {
		position: absolute;
		left: 50%;
		top: 50%;
		width: 18px;
		height: 18px;
		margin: -18px 0 0 -9px;
		border-radius: 50% 50% 50% 0;
		transform: rotate(-45deg);
		background: hsl(319, 90%, 55%);
		border: 2px solid white;
		box-shadow: 0 1px 4px rgb(0 0 0 / 0.4);
	}
	figcaption {
		font-size: var(--step--1);
		margin-top: 0.4em;
		text-align: center;
		opacity: 0.85;
	}
</style>
