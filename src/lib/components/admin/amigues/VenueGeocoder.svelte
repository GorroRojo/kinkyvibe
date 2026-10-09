<script>
	/**
	 * «Buscar en el mapa» del editor de lugares del panel. Solo cuando une admin aprieta el botón,
	 * manda la dirección, el barrio y la ciudad a `POST /admin/geocodificar` (que le pregunta a
	 * Nominatim, de OpenStreetMap, desde el servidor) y muestra los resultados con una vista previa.
	 * El punto se ajusta con un clic en el mapa o con las flechas, y «Usar esta ubicación» completa
	 * la latitud y la longitud del formulario. No guarda nada: eso pasa al guardar el formulario.
	 *
	 * La vista previa son las mismas baldosas de OpenStreetMap que `VenueMap` (imágenes comunes, sin
	 * librerías ni scripts de afuera; `osmTiles` en src/lib/utils/venues.js).
	 *
	 * Props: `address`, `area`, `city` (lo escrito en el formulario), `lat`, `lng` (texto, con
	 * bind:).
	 */
	import { osmTiles, osmMovePoint } from '$lib/utils/venues.js';

	export let address = '';
	export let area = '';
	export let city = '';
	export let lat = '';
	export let lng = '';

	const width = 440;
	const height = 220;
	const zoom = 17;
	/** Cuánto se mueve el punto con cada flecha, en píxeles del mapa (unos 12 m a este zoom). */
	const STEP = 12;

	/** @type {{ lat: number, lng: number, label: string }[]} */
	let results = [];
	let selected = -1;
	/** @type {{ lat: number, lng: number } | null} */
	let point = null;
	let busy = false;
	let error = '';
	let status = '';

	$: canSearch = Boolean(address?.trim()) && !busy;
	$: map = point ? osmTiles(point.lat, point.lng, { zoom, width, height }) : null;

	async function search() {
		if (!canSearch) return;
		busy = true;
		error = '';
		status = '';
		results = [];
		selected = -1;
		point = null;
		try {
			const res = await fetch('/admin/geocodificar', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ address, area, city })
			});
			const data = await res.json().catch(() => ({}));
			if (Array.isArray(data.results) && data.results.length) {
				results = data.results;
				choose(0);
			} else {
				error =
					data.error ?? 'No encontramos esa dirección. Probá agregando la ciudad o el barrio.';
			}
		} catch {
			error = 'No pudimos buscar en el mapa ahora. Probá en un rato o cargá los números a mano.';
		} finally {
			busy = false;
		}
	}

	/** @param {number} i */
	function choose(i) {
		selected = i;
		point = { lat: results[i].lat, lng: results[i].lng };
		status = '';
	}

	/**
	 * @param {number} dx
	 * @param {number} dy
	 */
	function move(dx, dy) {
		if (!point) return;
		point = osmMovePoint(point.lat, point.lng, dx, dy, zoom);
		status = '';
	}

	/** Un clic en el mapa lleva el punto ahí (con teclado, `detail` es 0: se usan las flechas). */
	function clickMap(/** @type {MouseEvent & { currentTarget: HTMLElement }} */ event) {
		if (!point || event.detail === 0) return;
		const rect = event.currentTarget.getBoundingClientRect();
		move(
			event.clientX - (rect.left + rect.width / 2),
			event.clientY - (rect.top + rect.height / 2)
		);
	}

	function use() {
		if (!point) return;
		lat = String(point.lat);
		lng = String(point.lng);
		status = 'Listo: completamos la latitud y la longitud. Guardá el formulario para que quede.';
	}
</script>

<div class="geocoder">
	<div class="kv-row">
		<button class="kv-btn ghost" type="button" on:click={search} disabled={!canSearch}>
			{busy ? 'Buscando…' : 'Buscar en el mapa'}
		</button>
		<small class="kv-note"
			>Busca la dirección, el barrio y la ciudad en OpenStreetMap. Solo se manda cuando apretás el
			botón.</small
		>
	</div>

	{#if error}<p class="kv-flash warn" role="alert">{error}</p>{/if}

	{#if results.length}
		<ul class="results" aria-label="Resultados">
			{#each results as r, i (`${r.lat},${r.lng},${i}`)}
				<li>
					<button
						type="button"
						class="result"
						class:on={i === selected}
						aria-pressed={i === selected}
						on:click={() => choose(i)}>{r.label || `${r.lat}, ${r.lng}`}</button
					>
				</li>
			{/each}
		</ul>
	{/if}

	{#if point && map}
		<div class="preview" style:--map-w="{width}px" style:--map-h="{height}px">
			<button
				type="button"
				class="tiles"
				aria-label="Mapa con el punto elegido. Hacé clic para moverlo."
				on:click={clickMap}
			>
				{#each map.tiles as t (`${t.x}-${t.y}-${t.left}`)}
					<img
						src={t.url}
						alt=""
						width="256"
						height="256"
						decoding="async"
						referrerpolicy="strict-origin-when-cross-origin"
						style:left="calc(50% + {t.left - width / 2}px)"
						style:top="{t.top}px"
					/>
				{/each}
				<span class="pin" aria-hidden="true"></span>
			</button>
			<div class="caption">
				<span class="nudge" role="group" aria-label="Mover el punto">
					<button type="button" on:click={() => move(0, -STEP)} aria-label="Mover al norte"
						>↑</button
					>
					<button type="button" on:click={() => move(0, STEP)} aria-label="Mover al sur">↓</button>
					<button type="button" on:click={() => move(-STEP, 0)} aria-label="Mover al oeste"
						>←</button
					>
					<button type="button" on:click={() => move(STEP, 0)} aria-label="Mover al este">→</button>
				</span>
				<span class="coords">{point.lat}, {point.lng}</span>
				<small class="credit"
					>© <a
						href="https://www.openstreetmap.org/copyright"
						target="_blank"
						rel="noopener noreferrer">colaboradores de OpenStreetMap</a
					></small
				>
			</div>
			<p class="kv-note">Hacé clic en el mapa o usá las flechas para ajustar el punto.</p>
			<div class="kv-row">
				<button class="kv-btn" type="button" on:click={use}>Usar esta ubicación</button>
			</div>
		</div>
	{/if}
	<p class="kv-note" role="status">{status}</p>
</div>

<style>
	.geocoder {
		display: grid;
		gap: var(--space-2xs);
	}
	.geocoder .kv-note:empty {
		display: none;
	}
	.results {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.3rem;
	}
	.result {
		width: 100%;
		text-align: left;
		font: inherit;
		font-size: var(--text-sm);
		padding: 0.4rem 0.6rem;
		border: 1px solid var(--field);
		border-radius: var(--radius-s, 6px);
		background: transparent;
		color: inherit;
		cursor: pointer;
	}
	.result.on {
		border-color: var(--1, hsl(319, 90%, 55%));
		box-shadow: inset 3px 0 0 var(--1, hsl(319, 90%, 55%));
		font-weight: 700;
	}
	.preview {
		margin: 0;
		width: min(100%, var(--map-w));
		display: grid;
		gap: var(--space-2xs);
	}
	.tiles {
		position: relative;
		display: block;
		width: 100%;
		height: var(--map-h);
		padding: 0;
		overflow: hidden;
		border-radius: var(--radius-m);
		border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
		/* El gris de las baldosas de OSM mientras cargan. */
		background: #e5e3df;
		cursor: crosshair;
	}
	.tiles img {
		position: absolute;
		max-width: none;
		pointer-events: none;
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
	.caption {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4em 0.8em;
		font-size: var(--text-sm);
	}
	.nudge {
		display: inline-flex;
		gap: 0.2rem;
	}
	.nudge button {
		font: inherit;
		min-width: 2rem;
		min-height: 2rem;
		border: 1px solid var(--field);
		border-radius: var(--radius-s, 6px);
		background: transparent;
		color: inherit;
		cursor: pointer;
	}
	.coords {
		font-family: ui-monospace, monospace;
	}
	.credit {
		font-size: 0.85em;
		opacity: 0.8;
		margin-left: auto;
	}
	.credit a {
		color: inherit;
	}
</style>
