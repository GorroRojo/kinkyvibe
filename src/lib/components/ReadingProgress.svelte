<script>
	/**
	 * Barra de progreso de lectura (idea de #19, decisión 0044): una línea fina arriba de todo que se
	 * llena mientras se lee. Empieza cuando el borde de arriba de la ventana llega al principio de
	 * `from` (el artículo, con el título) y se llena cuando el borde de abajo llega al final de
	 * `text` (el texto, sin lo que viene después: la propina, «Más cosas de…», la lista). La página
	 * la pone solo en los textos largos (`showsReadingProgress`, $lib/utils/readingTime.js).
	 *
	 * Es decorativa (`aria-hidden`): el lector de pantalla ya sabe por dónde va. Fija y con
	 * `transform`, así no corre nada de la página. En violeta (`--2`), para no confundirse con la
	 * barra de carga rosa (LoadingBar.svelte), que queda por encima. Sigue al scroll sin animar; con
	 * «sin preferencia» de movimiento, un suavizado cortito.
	 *
	 * Props: `from` y `text` (los elementos; sin ellos la barra queda vacía).
	 */
	import { onMount } from 'svelte';

	/** @type {HTMLElement | undefined} */
	export let from = undefined;
	/** @type {HTMLElement | undefined} */
	export let text = undefined;

	let progress = 0;
	let frame = 0;

	function measure() {
		frame = 0;
		if (!from || !text) return;
		const scrollY = window.scrollY;
		const start = from.getBoundingClientRect().top + scrollY;
		const end = text.getBoundingClientRect().bottom + scrollY - window.innerHeight;
		const p = end <= start ? 1 : (scrollY - start) / (end - start);
		progress = Math.min(1, Math.max(0, p));
	}
	function schedule() {
		if (!frame) frame = requestAnimationFrame(measure);
	}

	/** @type {ResizeObserver | undefined} */
	let observer;
	/** @type {HTMLElement | undefined} */
	let observed;
	let mounted = false;
	// Los elementos llegan después del montaje (los `bind:this` de la página): se mide y se
	// observa el texto cuando están, que puede crecer después (imágenes que cargan, interactivos).
	$: if (mounted) watch(text, from);

	/**
	 * @param {HTMLElement | undefined} el
	 * @param {HTMLElement | undefined} _from (solo para que se vuelva a medir si cambia)
	 */
	function watch(el, _from) {
		if (el !== observed) {
			if (observed) observer?.unobserve(observed);
			if (el) observer?.observe(el);
			observed = el;
		}
		schedule();
	}

	onMount(() => {
		observer = new ResizeObserver(schedule);
		mounted = true;
		return () => {
			observer?.disconnect();
			if (frame) cancelAnimationFrame(frame);
		};
	});
</script>

<svelte:window on:scroll|passive={schedule} on:resize|passive={schedule} />

<div class="reading-progress" aria-hidden="true">
	<div class="fill" style:transform="scaleX({progress})"></div>
</div>

<style>
	.reading-progress {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		height: 3px;
		z-index: 99;
		pointer-events: none;
	}
	.fill {
		height: 100%;
		background: var(--2);
		transform-origin: left;
		transform: scaleX(0);
	}
	@media (prefers-reduced-motion: no-preference) {
		.fill {
			transition: transform 80ms linear;
		}
	}
</style>
