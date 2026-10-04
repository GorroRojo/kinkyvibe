<script>
	/**
	 * Mapa chico de un lugar con baldosas de OpenStreetMap: imágenes comunes que el navegador carga
	 * recién cuando el mapa está por entrar en pantalla (`loading="lazy"`), sin librerías, sin
	 * scripts ni iframes de afuera. Abajo, «Abrir en OpenStreetMap», «Cómo llegar» y el crédito que
	 * pide OpenStreetMap. Solo se muestra cuando la dirección del lugar se ve ("Nombre + dirección"
	 * o "Sólo dirección"): quien lo usa decide con `showsAddress`, y el servidor no manda las
	 * coordenadas en los otros niveles (`venueView` en src/lib/utils/venues.js).
	 *
	 * El alto es fijo (no corre nada cuando llegan las baldosas) y el ancho se adapta hasta
	 * `width`: las baldosas se arman para el ancho máximo y se ubican desde el centro, así en un
	 * celular se recortan los costados y el punto queda siempre en el medio.
	 *
	 * Props: `lat`, `lng`, `label` (nombre del lugar, o su dirección si el nombre no se muestra,
	 * para el texto alternativo).
	 */
	import { osmDirectionsLink, osmLink, osmTiles } from '$lib/utils/venues.js';

	/** @type {number} */
	export let lat;
	/** @type {number} */
	export let lng;
	export let label = '';

	const width = 440;
	const height = 200;
	$: map = osmTiles(lat, lng, { width, height });
	$: href = osmLink(lat, lng);
</script>

<figure class="venue-map" style:--map-w="{width}px" style:--map-h="{height}px">
	<a {href} target="_blank" rel="noopener noreferrer" class="frame" tabindex="-1">
		<span class="tiles" role="img" aria-label="Mapa: {label}">
			{#each map.tiles as t (`${t.x}-${t.y}-${t.left}`)}
				<img
					src={t.url}
					alt=""
					width="256"
					height="256"
					loading="lazy"
					decoding="async"
					referrerpolicy="strict-origin-when-cross-origin"
					style:left="calc(50% + {t.left - width / 2}px)"
					style:top="{t.top}px"
				/>
			{/each}
			<span class="pin" aria-hidden="true"></span>
		</span>
	</a>
	<figcaption>
		<span class="links">
			<a {href} target="_blank" rel="noopener noreferrer">Abrir en OpenStreetMap</a>
			<a
				href={osmDirectionsLink(lat, lng)}
				target="_blank"
				rel="noopener noreferrer"
				aria-label="Cómo llegar (indicaciones en OpenStreetMap)">Cómo llegar</a
			>
		</span>
		<small class="credit"
			>© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer"
				>colaboradores de OpenStreetMap</a
			></small
		>
	</figcaption>
</figure>

<style>
	.venue-map {
		margin: 1em auto;
		width: min(100%, var(--map-w));
	}
	.frame {
		display: block;
		overflow: hidden;
		border-radius: 0.8em;
		border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
	}
	.tiles {
		position: relative;
		display: block;
		width: 100%;
		/* Reservado desde el principio: no corre nada cuando llegan las baldosas. */
		height: var(--map-h);
		overflow: hidden;
		/* El gris de las baldosas de OSM mientras cargan (también si se ve en modo oscuro). */
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
		background: var(--1, hsl(319, 90%, 55%));
		border: 2px solid white;
		box-shadow: 0 1px 4px rgb(0 0 0 / 0.4);
	}
	figcaption {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.4em 0.8em;
		margin-top: 0.5em;
		font-size: var(--step--1);
	}
	.links {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4em;
	}
	.links a {
		display: inline-block;
		padding: 0.3em 0.8em;
		border: 1px solid currentColor;
		border-radius: 999px;
		color: inherit;
		text-decoration: none;
	}
	.credit {
		font-size: 0.85em;
		opacity: 0.8;
	}
	.credit a {
		color: inherit;
	}
</style>
