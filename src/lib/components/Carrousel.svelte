<script>
	// El carrusel de la portada (interruptor `carrusel_portada`; docs/estilo.md, «Carrusel de la
	// portada»). Sigue el patrón de carrusel de WAI-ARIA (APG): grupo con nombre, diapositivas
	// «N de M», botón de pausa primero, anterior / siguiente y un botón por diapositiva.
	//
	// - Pasa solo cada `interval` ms, nunca con «reducir movimiento» (y sin JavaScript, nunca).
	//   Se frena mientras el mouse está encima o el foco está adentro; se para del todo cuando la
	//   persona elige una diapositiva (botones, flechas o deslizando) o toca «Pausar».
	// - Los puntos son una sola parada del Tab (el de la que se ve); entre ellos, con las flechas.
	// - Sin saltos de diseño: todas las diapositivas están en la misma celda de la grilla, así que el
	//   alto es el de la más alta desde el HTML del servidor; la imagen tiene su cuadrado reservado.
	// - La imagen de la primera se pide enseguida y con prioridad (puede ser el LCP); las demás
	//   recién después de hidratar, de a una por delante de la que se ve, y `lazy`.
	import { onDestroy, onMount, tick } from 'svelte';
	import { ChevronLeft, ChevronRight, Pause, Play } from '@lucide/svelte';
	import { argDateList, parseSiteDate } from '$lib/utils/dates.js';
	import { placeShort } from '$lib/utils/eventPlace.js';
	import { posterSrcset } from '$lib/utils/mediaCopies.js';
	import { ticketCta } from '$lib/utils/ticketCta.js';

	/** Los eventos, ya elegidos y en orden (`carruselPosts`, $lib/utils/carrusel.js).
	 * @type {{ path: string, meta: Record<string, any> }[]} */
	export let posts;
	/** La venta de entradas por slug, como en las tarjetas (`ticketStatesFor`).
	 * @type {import('$lib/utils/ticketCta.js').TicketStates | null} */
	export let ticketStates = null;
	/** Cada cuánto pasa sola (ms). */
	export let interval = 7000;

	const DEFAULT_BACKGROUNDS = ['var(--2-dark)', 'var(--1-dark)', 'var(--3-dark)'];
	/** @param {unknown} v */
	const isHex = (v) => typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v.trim());

	let index = 0;
	/** La más lejana que ya se vio: hasta una más que esa se piden las imágenes. */
	let reached = 0;
	let mounted = false;
	let reduceMotion = true;
	/** «Pasar solo» (lo cambia el botón de pausa, o elegir una diapositiva). */
	let playing = true;
	let hovered = false;
	let focused = false;
	/** @type {HTMLElement} */
	let root;
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let timer;

	$: count = posts.length;
	$: if (index >= count) index = 0;
	$: if (index > reached) reached = index;
	$: canRotate = mounted && !reduceMotion && count > 1;
	$: rotating = canRotate && playing && !hovered && !focused;
	$: schedule(rotating, index);

	$: slides = posts.map((post, i) => {
		const meta = post.meta;
		const background = isHex(meta.carrousel_background)
			? meta.carrousel_background.trim()
			: DEFAULT_BACKGROUNDS[i % DEFAULT_BACKGROUNDS.length];
		const color = isHex(meta.carrousel_color) ? meta.carrousel_color.trim() : 'white';
		const start = parseSiteDate(meta.start ?? '');
		return {
			post,
			background,
			color,
			when: argDateList(meta.start ?? ''),
			iso: isNaN(start.getTime()) ? undefined : start.toISOString(),
			place: placeShort(meta),
			cta: ticketCta(meta, ticketStates),
			srcset: posterSrcset(meta.featured) || undefined
		};
	});

	/**
	 * Programa el próximo paso. `current` está para que vuelva a correr con cada cambio de diapositiva.
	 * @param {boolean} on
	 * @param {number} current
	 */
	// eslint-disable-next-line no-unused-vars
	function schedule(on, current) {
		clearTimeout(timer);
		if (on) timer = setTimeout(() => (index = (index + 1) % count), interval);
	}

	/**
	 * Va a la diapositiva `i` porque la persona la eligió: deja de pasar sola.
	 * @param {number} i
	 */
	function go(i) {
		playing = false;
		index = (i + count) % count;
	}

	/** @param {KeyboardEvent} event */
	async function onKeydown(event) {
		if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
		if (event.altKey || event.ctrlKey || event.metaKey) return;
		event.preventDefault();
		const target = /** @type {HTMLElement} */ (event.target);
		go(index + (event.key === 'ArrowRight' ? 1 : -1));
		await tick();
		// El foco no se queda en una diapositiva que ya no se ve (queda `inert`): pasa a la nueva, o
		// al botón de la nueva si estaba en los botones de abajo.
		const selector = target.closest('.slide')
			? `#carrusel-${index}`
			: target.closest('.picker')
				? `[data-slide="${index}"]`
				: '';
		if (selector) /** @type {HTMLElement | null} */ (root.querySelector(selector))?.focus();
	}

	let touchX = 0;
	let touchY = 0;
	/** @param {TouchEvent} event */
	function onTouchStart(event) {
		touchX = event.touches[0].clientX;
		touchY = event.touches[0].clientY;
	}
	/** @param {TouchEvent} event */
	function onTouchEnd(event) {
		const dx = event.changedTouches[0].clientX - touchX;
		const dy = event.changedTouches[0].clientY - touchY;
		if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) go(index + (dx < 0 ? 1 : -1));
	}

	/** @param {FocusEvent} event */
	function onFocusIn(event) {
		// En el botón de pausa no frena: si no, «Reanudar» no podría reanudar.
		focused = !(/** @type {HTMLElement} */ (event.target).closest('.rotation'));
	}
	/** @param {FocusEvent} event */
	function onFocusOut(event) {
		const next = /** @type {Node | null} */ (event.relatedTarget);
		if (!next || !root.contains(next)) focused = false;
	}

	/** @type {MediaQueryList | undefined} */
	let motion;
	const onMotion = () => (reduceMotion = Boolean(motion?.matches));
	onMount(() => {
		motion = matchMedia('(prefers-reduced-motion: reduce)');
		onMotion();
		motion.addEventListener('change', onMotion);
		mounted = true;
	});
	onDestroy(() => {
		clearTimeout(timer);
		motion?.removeEventListener('change', onMotion);
	});
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section
	class="carrusel"
	aria-roledescription="carrusel"
	aria-labelledby="carrusel-titulo"
	bind:this={root}
	on:keydown={onKeydown}
	on:mouseenter={() => (hovered = true)}
	on:mouseleave={() => (hovered = false)}
	on:focusin={onFocusIn}
	on:focusout={onFocusOut}
	on:touchstart|passive={onTouchStart}
	on:touchend|passive={onTouchEnd}
>
	<h2 id="carrusel-titulo" class="visually-hidden">Próximos eventos de Kinky Vibe</h2>
	{#if canRotate}
		<!-- Lo primero del carrusel en el orden del foco (APG): pausar antes de las diapositivas. -->
		<button
			type="button"
			class="control rotation"
			aria-label={playing ? 'Pausar el carrusel' : 'Reanudar el carrusel'}
			title={playing ? 'Pausar' : 'Reanudar'}
			on:click={() => (playing = !playing)}
		>
			{#if playing}<Pause size={18} aria-hidden="true" />{:else}<Play
					size={18}
					aria-hidden="true"
				/>{/if}
		</button>
	{/if}
	<div class="slides" aria-live={canRotate && playing ? 'off' : 'polite'}>
		{#each slides as slide, i (slide.post.path)}
			{@const meta = slide.post.meta}
			{@const active = i === index}
			{@const load = i === 0 || (mounted && i <= reached + 1)}
			<div
				id="carrusel-{i}"
				class="slide"
				class:active
				role="group"
				aria-roledescription="diapositiva"
				aria-label="{i + 1} de {count}"
				aria-hidden={active ? undefined : 'true'}
				inert={!active}
				tabindex="-1"
				style:--slide-bg={slide.background}
				style:--slide-color={slide.color}
			>
				<div class="img-box">
					{#if load}
						<img
							src={meta.featured}
							srcset={slide.srcset}
							sizes={slide.srcset ? '(min-width: 44rem) 16rem, 38vw' : undefined}
							width="720"
							height="720"
							alt=""
							loading={i === 0 ? 'eager' : 'lazy'}
							fetchpriority={i === 0 ? 'high' : undefined}
							decoding={i === 0 ? undefined : 'async'}
						/>
					{/if}
				</div>
				<div class="details">
					<h3 id="carrusel-{i}-titulo">{meta.title}</h3>
					{#if slide.when}
						<p class="when">
							<time datetime={slide.iso}>{slide.when}</time>{#if slide.place}<span class="place"
									>{' · ' + slide.place}</span
								>{/if}
						</p>
					{/if}
					{#if meta.summary}<p class="summary">{meta.summary}</p>{/if}
					<div class="actions">
						{#if slide.cta?.kind === 'buy'}
							<a class="btn buy" href={slide.cta.href}>{slide.cta.text}</a>
						{:else if slide.cta?.kind === 'note'}
							<span class="note">{slide.cta.text}</span>
						{/if}
						<a class="btn" href={slide.post.path} aria-describedby="carrusel-{i}-titulo"
							>Saber más</a
						>
					</div>
				</div>
			</div>
		{/each}
	</div>
	{#if count > 1}
		<div class="nav">
			<button
				type="button"
				class="control"
				aria-label="Evento anterior"
				on:click={() => go(index - 1)}
			>
				<ChevronLeft size={20} aria-hidden="true" />
			</button>
			<div class="picker">
				{#each slides as slide, i (slide.post.path)}
					<button
						type="button"
						class="dot"
						data-slide={i}
						aria-label="Evento {i + 1}: {slide.post.meta.title}"
						aria-current={i === index ? 'true' : undefined}
						tabindex={i === index ? 0 : -1}
						on:click={() => go(i)}
					></button>
				{/each}
			</div>
			<button
				type="button"
				class="control"
				aria-label="Evento siguiente"
				on:click={() => go(index + 1)}
			>
				<ChevronRight size={20} aria-hidden="true" />
			</button>
		</div>
	{/if}
</section>

<style>
	.carrusel {
		position: relative;
		width: 100%;
		max-width: 50rem;
		margin-inline: auto;
		border-radius: var(--round);
		overflow: hidden;
		box-shadow: var(--shadow);
		/* deslizar de costado es del carrusel; para arriba y abajo, la página */
		touch-action: pan-y;
	}
	.slides {
		display: grid;
	}
	.slide {
		/* todas en la misma celda: el alto es el de la más alta, desde el primer pintado */
		grid-area: 1 / 1;
		display: grid;
		grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
		align-items: center;
		gap: var(--space-s);
		padding: var(--space-s) var(--space-s) 3.25rem;
		background: var(--slide-bg);
		color: var(--slide-color);
		visibility: hidden;
		opacity: 0;
		transition:
			opacity 400ms ease,
			visibility 0s linear 400ms;
	}
	.slide.active {
		visibility: visible;
		opacity: 1;
		transition: opacity 400ms ease;
	}
	.slide:focus-visible {
		outline: 3px solid white;
		outline-offset: -6px;
	}
	.img-box {
		aspect-ratio: 1;
		width: 100%;
		max-width: 16rem;
		justify-self: center;
		border-radius: calc(var(--round) * 0.75);
		overflow: hidden;
		background: color-mix(in srgb, var(--slide-bg) 70%, black);
	}
	.img-box img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.details {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2xs);
	}
	h3 {
		margin: 0;
		font-size: var(--text-xl);
		line-height: 1.15;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
		overflow-wrap: anywhere;
	}
	.when {
		margin: 0;
		font-weight: 700;
		font-size: var(--text-sm);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.summary {
		margin: 0;
		font-size: var(--text-sm);
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2xs);
		margin-top: var(--space-3xs);
	}
	.btn {
		display: inline-block;
		padding: 0.4em 0.9em;
		border-radius: var(--radius-pill);
		border: 2px solid currentColor;
		color: inherit;
		text-decoration: none;
		font-weight: 700;
		font-size: var(--text-sm);
	}
	.btn.buy {
		background: white;
		border-color: white;
		color: var(--slide-bg);
	}
	.btn:hover {
		text-decoration: underline;
	}
	.note {
		font-weight: 700;
		font-size: var(--text-sm);
	}
	.btn:focus-visible,
	.control:focus-visible,
	.dot:focus-visible {
		outline: 3px solid white;
		outline-offset: 2px;
		box-shadow: 0 0 0 5px black;
	}
	.control {
		display: grid;
		place-items: center;
		width: 2.75rem;
		height: 2.75rem;
		padding: 0;
		border: 0;
		border-radius: var(--radius-pill);
		background: rgb(0 0 0 / 0.35);
		color: white;
		cursor: pointer;
	}
	.control:hover {
		background: rgb(0 0 0 / 0.55);
	}
	/* primero en el orden del foco (APG), abajo a la izquierda en pantalla */
	.rotation {
		position: absolute;
		left: 0.5rem;
		bottom: 0.25rem;
		z-index: 1;
	}
	.nav {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0.25rem;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2xs);
		color: white;
	}
	.picker {
		display: flex;
	}
	/* 44 × 44 px para el dedo, con el punto chico adentro */
	.dot {
		width: 1.75rem;
		height: 2.75rem;
		padding: 0;
		border: 0;
		background: none;
		cursor: pointer;
		display: grid;
		place-items: center;
	}
	.dot::before {
		content: '';
		width: 0.7rem;
		height: 0.7rem;
		border-radius: 50%;
		border: 2px solid white;
		background: transparent;
		transition: background 200ms;
	}
	.dot[aria-current='true']::before {
		background: white;
	}
	@media (max-width: 44rem) {
		.carrusel {
			border-radius: 0;
		}
		.slide {
			grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
			align-items: start;
			padding: var(--space-s) var(--space-s) 3.25rem;
		}
		h3 {
			font-size: var(--text-lg);
		}
		.summary {
			display: none;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.slide,
		.slide.active,
		.dot::before {
			transition: none;
		}
	}
</style>
