<script>
	/**
	 * «X min de lectura», con un reloj, de un material o una entrada de la wiki (idea de JorgeT10,
	 * PR #46), con la explicación de cómo se calcula ({@link READING_TIME_HINT}).
	 *
	 * La explicación aparece al pasar el mouse, con el foco del teclado y al tocar (en el celu no hay
	 * mouse): el tiempo es un botón que la abre y la cierra (`aria-expanded`), y la explicación está
	 * siempre unida al botón con `aria-describedby`, así los lectores de pantalla la leen aunque no
	 * esté a la vista. Escape o tocar afuera la cierran. La caja se corre para no salirse de la
	 * pantalla (16px de margen), así funciona igual centrada (material) o contra el borde (wiki).
	 *
	 * Props: `minutes` (los de `pageReadingMinutes`; con 0 o sin dato no muestra nada), `id` (el de
	 * la explicación; uno fijo, así el servidor y el navegador arman lo mismo: va una vez por página).
	 */
	import { tick } from 'svelte';
	import { Clock } from '@lucide/svelte';
	import { READING_TIME_HINT, readingTimeLabel } from '$lib/utils/readingTime.js';

	/** @type {unknown} */
	export let minutes = 0;
	export let id = 'kv-tiempo-de-lectura';

	$: label = readingTimeLabel(minutes);
	let open = false;
	/** @type {HTMLElement | undefined} */
	let wrap;
	/** @type {HTMLElement | undefined} */
	let hint;
	/** Cuánto se corre la explicación (px) para quedar dentro de la pantalla. */
	let shift = 0;
	const GUTTER = 16;

	/** Corre la explicación (ya visible) para que no se salga de la pantalla. */
	async function place() {
		shift = 0;
		await tick();
		if (!hint) return;
		const box = hint.getBoundingClientRect();
		if (!box.width) return;
		const max = window.innerWidth - GUTTER;
		if (box.left < GUTTER) shift = GUTTER - box.left;
		else if (box.right > max) shift = max - box.right;
	}
	async function toggle() {
		open = !open;
		if (open) {
			await tick();
			place();
		}
	}

	/** @param {MouseEvent} e */
	function closeOutside(e) {
		if (open && wrap && !wrap.contains(/** @type {Node} */ (e.target))) open = false;
	}
	/** @param {KeyboardEvent} e */
	function closeOnEscape(e) {
		if (open && e.key === 'Escape') open = false;
	}
</script>

<svelte:window on:click={closeOutside} on:keydown={closeOnEscape} />

{#if label}
	<span class="reading-time" class:open bind:this={wrap}>
		<button
			type="button"
			class="time"
			aria-expanded={open}
			aria-describedby={id}
			on:click={toggle}
			on:focus={place}
			on:pointerenter={place}
		>
			<Clock size="1em" aria-hidden="true" />
			<span class="label">{label}</span>
		</button>
		<span class="hint" {id} role="note" bind:this={hint} style:--shift="{shift}px"
			>{READING_TIME_HINT}</span
		>
	</span>
{/if}

<style>
	/* Todo en línea, como el texto de al lado: misma letra, interlineado y línea de base (gorrite:
	   «no está alineado con el resto del texto»). Nada de inline-block ni inline-flex, que corren
	   la línea de base al borde de abajo del ícono. */
	.reading-time {
		position: relative;
		white-space: nowrap;
	}
	.time {
		position: relative;
		display: inline;
		margin: 0;
		padding: 0;
		border: 0;
		border-radius: 0;
		background: none;
		font: inherit;
		line-height: inherit;
		letter-spacing: inherit;
		color: var(--muted);
		vertical-align: baseline;
		cursor: help;
		-webkit-appearance: none;
		appearance: none;
	}
	.label {
		text-decoration: underline dotted;
		text-underline-offset: 0.2em;
	}
	/* El reloj a 1em (el sitio pone todo `svg` a 24px de alto: ver (content)/+layout.svelte),
	   centrado con el texto como un ícono dentro de la línea. */
	.time :global(svg) {
		display: inline;
		width: 1em;
		height: 1em;
		vertical-align: -0.125em;
		margin-inline-end: 0.3em;
	}
	/* Zona para tocar más grande (al menos 44px de alto), invisible y sin mover nada. */
	.time::after {
		content: '';
		position: absolute;
		inset-inline: -0.3em;
		top: 50%;
		height: max(44px, 100%);
		transform: translateY(-50%);
	}
	.hint {
		display: none;
		position: absolute;
		top: calc(100% + 0.4em);
		left: 50%;
		transform: translateX(calc(-50% + var(--shift, 0px)));
		z-index: 10;
		width: max-content;
		max-width: min(16rem, calc(100vw - 32px));
		padding: var(--space-3xs, 0.3em) var(--space-2xs, 0.5em);
		border-radius: var(--radius-s, 0.5em);
		background: var(--surface);
		color: var(--ink, inherit);
		box-shadow: var(--shadow-2);
		font-size: var(--text-sm, 0.875em);
		font-style: normal;
		line-height: 1.35;
		text-align: center;
		white-space: normal;
	}
	.open .hint,
	.reading-time:hover .hint,
	.time:focus-visible + .hint {
		display: block;
	}
</style>
