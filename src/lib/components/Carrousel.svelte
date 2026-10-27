<script>
	// @ts-nocheck
	import { argWeekdayDay } from '$lib/utils/dates.js';
	import { placeShort } from '$lib/utils/eventPlace.js';
	import { cubicInOut } from 'svelte/easing';
	import { fade } from 'svelte/transition';
	import { onMount } from 'svelte';
	import { ChevronLeft, ChevronRight, Pause, Play } from '@lucide/svelte';
	/**@type {{path: string, meta: AnyPostData}[]}*/
	export let posts;
	let index = 0;
	$: post = posts[index];
	// «Online», el nombre del lugar o la dirección (eventPlace.js); sin nada, solo la fecha.
	$: place = post ? placeShort(post.meta) : '';
	const defaultCombos = [
		['var(--1)', 'white'],
		['var(--2)', 'white'],
		['var(--3)', 'white']
	];
	let currDefaultCombo = 0;
	$: slideColors = posts.map((p) => {
		if (p.meta.carrousel_background) {
			return [
				p.meta.carrousel_background,
				p.meta.carrousel_color ?? 'white',
				p.meta.carrousel_accent_text ?? p.meta.carrousel_color ?? 'white',
				p.meta.carrousel_accent_bg ?? p.meta.carrousel_background
			];
		} else {
			currDefaultCombo = currDefaultCombo == defaultCombos.length - 1 ? 0 : currDefaultCombo + 1;
			// alert(defaultCombos[currDefaultCombo])
			return defaultCombos[currDefaultCombo];
		}
	});
	$: currBackground = slideColors[index]?.[0];
	$: currColor = slideColors[index]?.[1];
	$: currAccent = slideColors[index]?.[2] ?? currColor ?? 'white';
	$: currAccentBg = slideColors[index]?.[3] ?? currBackground;
	/**
	 * @param {HTMLElement} node
	 * @param {{ delay?: number, duration?: number, easing?: (t: number) => number }} params
	 * @param {{direction: 'in'|'out'|'both'}} options
	 * @return {{ delay?: number, duration?: number, easing?: (t: number) => number, css?: (t: number, u: number) => string, tick?: (t: number, u: number) => void }}
	 */
	function spin(node, params, { direction }) {
		const existingTransform = getComputedStyle(node).transform.replace('none', '');
		const d = direction === 'in' ? 1 : -1;
		return {
			delay: params.delay || 0,
			// con «reducir movimiento», sin giro
			duration: reducedMotion ? 0 : params.duration || 400,
			easing: params.easing || cubicInOut,
			css: (t, u) => `
				transform: ${existingTransform} rotate(${-d * u * 360}deg);
				opacity: ${t};
			`
		};
	}
	// Pasa solo cada 10 s (WCAG 2.2.2: se puede pausar): arranca en el navegador (no en el
	// servidor), no arranca con «reducir movimiento», se frena mientras el mouse o el foco están
	// adentro (así el foco nunca se cae con la diapositiva que se va) y se pausa del todo con el
	// botón o al pasar de diapositiva a mano.
	let playing = false;
	let reducedMotion = false;
	let hovered = false;
	let focused = false;
	onMount(() => {
		reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
		playing = !reducedMotion;
		const autoslide = setInterval(() => {
			if (playing && !hovered && !focused && posts.length > 1) next();
		}, 10000);
		return () => clearInterval(autoslide);
	});
	const next = () => (index = index != posts.length - 1 ? index + 1 : 0);
	const prev = () => (index = index != 0 ? index - 1 : posts.length - 1);
	/** @param {KeyboardEvent} e flechas para pasar de diapositiva con el teclado */
	function onKeydown(e) {
		if (e.key == 'ArrowRight' || e.key == 'ArrowLeft') {
			e.preventDefault();
			playing = false;
			e.key == 'ArrowRight' ? next() : prev();
		}
	}
</script>

{#if post}
	<section
		id="carrousel"
		aria-roledescription="carrusel"
		aria-label="Próximos eventos"
		style:--currBackground={currBackground}
		style:--currColor={currColor}
		style:--currAccent={currAccent}
		style:--currAccentBg={currAccentBg}
		on:mouseenter={() => (hovered = true)}
		on:mouseleave={() => (hovered = false)}
		on:focusin={() => (focused = true)}
		on:focusout={(e) => (focused = e.currentTarget.contains(e.relatedTarget))}
		on:keydown={onKeydown}
		out:fade={{ duration: reducedMotion ? 0 : 400 }}
	>
		<button type="button" class="pause" on:click={() => (playing = !playing)}
			>{#if playing}<Pause size={16} aria-hidden="true" /> Pausar{:else}<Play
					size={16}
					aria-hidden="true"
				/> Reproducir{/if}</button
		>
		<button
			type="button"
			class="arrow prev"
			aria-label="Evento anterior"
			on:click={() => {
				prev();
				playing = false;
			}}><ChevronLeft aria-hidden="true" /></button
		>
		<!-- Con el carrusel en pausa, el lector de pantalla lee la diapositiva nueva; andando, no. -->
		<div class="slides" aria-live={playing ? 'off' : 'polite'}>
			{#key index}
				<div
					class="slide"
					role="group"
					aria-roledescription="diapositiva"
					aria-label="{index + 1} de {posts.length}"
				>
					<div class="img-wrapper">
						<img
							in:spin={{ duration: 1500 }}
							out:spin={{ duration: 1500 }}
							src={(post.meta.logo ?? post.meta.featured) + ''}
							alt=""
						/>
					</div>
					<div
						class="details"
						in:fade={{ delay: reducedMotion ? 0 : 1100, duration: reducedMotion ? 0 : 400 }}
						out:fade={{ duration: reducedMotion ? 0 : 400 }}
					>
						<h2>
							{argWeekdayDay(post.meta.start)}{place ? ` - ${place.replaceAll(' ', '\u00a0')}` : ''}
						</h2>
						<p>{post.meta.summary}</p>
						<a href={post.path}
							>Saber más<span class="visually-hidden"> sobre {post.meta.title}</span></a
						>
					</div>
				</div>
			{/key}
		</div>
		<button
			type="button"
			class="arrow next"
			aria-label="Evento siguiente"
			on:click={() => {
				next();
				playing = false;
			}}><ChevronRight aria-hidden="true" /></button
		>
	</section>
{/if}

<style>
	#carrousel {
		color: var(--currColor);
		height: 20rem;
		min-height: fit-content;
		display: flex;
		overflow: visible;
		max-width: 100vw;
		padding: 0;
		margin: 0;
		position: relative;
		margin-bottom: 3em;
		transition: 1500ms;
		/* z-index: -2; */
	}
	#carrousel::before,
	#carrousel::after {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 0;
		right: 0;
		display: block;
		content: ' ';
		pointer-events: none;
	}
	#carrousel::before {
		z-index: -2;
		background-color: var(--currBackground);
		transition: 1000ms;
	}
	#carrousel::after {
		z-index: -1;
		background: linear-gradient(
			to right,
			transparent,
			color-mix(in srgb, transparent 70%, black) 100%
		);
	}
	.slide {
		/* display: flex; */
		gap: 4em;
		display: grid;
		align-items: center;
		grid-template-columns: min(20em, 40%) auto;

		height: 100%;
		min-height: 0;
		max-height: 100%;

		width: 90rem;
		max-width: 100vw;
		min-width: 0;
		padding: 0;
		margin: 0 auto;

		position: absolute;
		left: 3em;
		right: 3em;

		font-size: var(--step-1);
	}
	.details {
		/* color: var(--currColor); */
		/* text-shadow: 0 0 1em black; */
		/* max-height: 100%; */
		max-width: 100%;
		min-width: 0;
		margin-right: 7em;
		width: auto;
		z-index: 1;
		max-height: 100%;
	}
	h2 {
		text-transform: uppercase;
		margin-block: 0;
		font-size: var(--step-0);
	}
	p {
		margin-block: 0;
		text-overflow: ellipsis;
		/* white-space: pre-wrap; */
		max-height: 20%;
		min-height: 0;
		height: 100%;
		overflow: hidden;
	}
	.details a {
		background: var(--currAccentBg);
		color: var(--currAccent);
		padding: 0.3em 0.6em;
		display: block;
		text-align: center;
		max-width: max-content;
		margin-left: auto;
		margin-top: 0.2em;
		scale: 1;
		transition:
			background 1000ms 1000ms,
			color 1000ms 100ms,
			scale 200ms;
		min-height: var(--tap);
		display: flex;
		align-items: center;
		text-decoration: none;
		border-radius: 0.3em;
	}
	.details a:hover {
		color: var(--currAccent);
		scale: 1.1;
	}
	.slides {
		display: contents;
	}
	.arrow {
		position: absolute;
		top: 0;
		bottom: 0;
		z-index: 1;
		display: grid;
		place-items: center;
		background: color-mix(in srgb, var(--currBackground) 70%, white);
		border: 0;
		color: var(--currColor);
		width: 3rem;
		cursor: pointer;
		transition: 1000ms;
	}
	.prev {
		left: 0;
	}
	.next {
		right: 0;
	}
	/* el foco se ve sobre cualquier color de diapositiva: anillo blanco con borde oscuro */
	button:focus-visible,
	.details a:focus-visible {
		outline: 3px solid white;
		outline-offset: -3px;
		box-shadow: inset 0 0 0 6px #111;
	}
	.pause {
		position: absolute;
		left: 3.5rem;
		bottom: 0.75rem;
		z-index: 3;
		display: inline-flex;
		align-items: center;
		gap: 0.3em;
		min-height: 2rem;
		padding: 0.2em 0.8em;
		border: 0;
		border-radius: var(--radius-pill);
		background: rgba(0, 0, 0, 0.6);
		color: white;
		font: inherit;
		font-size: var(--text-sm);
		font-weight: 700;
		cursor: pointer;
	}
	.img-wrapper {
		max-height: 100%;
		min-width: 0;
		min-height: 0;
		height: 100%;
		/* width: 40em; */
		display: flex;
		justify-content: center;
	}
	img {
		padding: 0;
		margin: 0;
		scale: 1.1;
		/* box-shadow: 0 0 0.1em var(--currBackground); */
		border-radius: 0.3em;
		z-index: 2;
		transition: 1000ms;
		max-width: 100%;
		min-height: 0;
		max-height: 100%;
		object-fit: contain;
	}
	@media (max-width: 900px) {
		#carrousel {
			height: 40rem;
		}
		.slide {
			grid-template-columns: 1fr;
			width: 100%;
			max-width: 100%;
			left: 0;
			padding-inline: 2.5em;
		}
		.img-wrapper {
			width: 100%;
			max-width: 100%;
			min-width: 0;
			height: 20rem;
		}
		.details {
			margin-right: 0;
		}
		img {
			pointer-events: none;
		}
	}
</style>
