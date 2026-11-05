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
	// - Va de borde a borde de la pantalla (también en la compu); lo de adentro, centrado.
	// - Cinco estilos (A pila de flyers, B franja cruzada, C mesa de stickers, D diagonal, E mesa de
	//   zines): cada diapositiva trae el suyo (`estilo`, de Ajustes o del evento:
	//   $lib/utils/carruselEstilos.js). Los controles de abajo toman el de la que se ve.
	// - Lo que no es un evento (material, perfiles, la Kinkipedia) va en los mismos estilos, con su
	//   tipo en lugar de la fecha y «Ver». Sin imagen, en el lugar del flyer va su ficha: el color y
	//   el símbolo de su tipo, los mismos de su vista previa al compartir (`categoryTileLook`,
	//   $lib/utils/ogObjeto.js), con el título.
	// - Los fondos y los bloques son siempre de la marca; los colores del flyer (`colors`, guardados
	//   al subir la imagen) eligen cuál paleta va detrás (la que más se le distingue) y dan el acento
	//   (la estrella, la cinta). Textos: blanco si se lee, si no la tinta (títulos 3:1, el resto
	//   4.5:1). $lib/utils/carruselPaletas.js.
	import { onDestroy, onMount, tick } from 'svelte';
	import { ChevronLeft, ChevronRight, Pause, Play } from '@lucide/svelte';
	import { argDateList, parseSiteDate } from '$lib/utils/dates.js';
	import { placeShort } from '$lib/utils/eventPlace.js';
	import { posterSrcset } from '$lib/utils/mediaCopies.js';
	import { ticketCta } from '$lib/utils/ticketCta.js';
	import { ROTAR, estiloDeDiapositiva, isCarruselEstilo } from '$lib/utils/carruselEstilos.js';
	import { conFondoPropio, paletasDelCarrusel } from '$lib/utils/carruselPaletas.js';
	import { CARRUSEL_TIPOS } from '$lib/utils/carrusel.js';
	import { categoryTileLook } from '$lib/utils/ogObjeto.js';
	import { cssColorHex } from '$lib/utils/flyerColors.js';

	/** Los eventos, ya elegidos y en orden (`carruselSlides`, src/lib/server/carrusel.js), con el
	 * estilo de cada uno (sin estilo, rotan) y los colores de su flyer (sin colores, la marca).
	 * @type {{ path: string, meta: Record<string, any>, estilo?: string, colors?: string[] | null }[]} */
	export let posts;
	/** La venta de entradas por slug, como en las tarjetas (`ticketStatesFor`).
	 * @type {import('$lib/utils/ticketCta.js').TicketStates | null} */
	export let ticketStates = null;
	/** Cada cuánto pasa sola (ms). */
	export let interval = 7000;

	const LOGO = '/android-chrome-192x192.png';
	/**
	 * Un color escrito a mano en el evento (`carrousel_background`, `carrousel_color`), como
	 * `#rrggbb`, o `null`.
	 * @param {unknown} v
	 */
	const hex6 = (v) => {
		const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
		if (/^#[0-9a-f]{6}$/.test(s)) return s;
		if (/^#[0-9a-f]{3}$/.test(s)) return '#' + [...s.slice(1)].map((c) => c + c).join('');
		return null;
	};

	/** E: dónde caen las copias del flyer en la mesa (x %, y %, giro, ancho rem). */
	const MESA = [
		[-4, -18, -9, 17],
		[14, 38, 7, 15],
		[33, -24, 4, 16],
		[52, 42, -6, 17],
		[71, -12, 10, 15],
		[88, 30, -4, 18]
	];

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

	/** @param {Record<string, any>} meta */
	const hasImageOf = (meta) => Boolean(meta.featured) && meta.featured !== 'undefined';
	// La ficha de lo que no es un evento y no tiene imagen (para un evento sin imagen, el flyer con
	// el título, de siempre).
	$: tiles = posts.map((p) =>
		hasImageOf(p.meta) ? null : categoryTileLook(p.meta.category, p.meta.tags ?? [])
	);
	// Con ficha, la paleta de la marca se elige contra el color de la ficha (como contra un flyer).
	$: paletas = paletasDelCarrusel(
		posts.map((p, i) => {
			const tileHex = tiles[i] && cssColorHex(tiles[i]?.bg);
			return tileHex
				? { hasImage: true, colors: [tileHex] }
				: { hasImage: hasImageOf(p.meta), colors: p.colors };
		})
	);
	$: slides = posts.map((post, i) => {
		const meta = post.meta;
		// Lo nuevo (material, perfiles, la Kinkipedia) no tiene fecha ni entradas: va su tipo.
		const evento = !['material', 'amigues', 'wiki'].includes(meta.category);
		const start = parseSiteDate(evento ? (meta.start ?? '') : '');
		const [day, time] = evento ? argDateList(meta.start ?? '').split(' · ') : [];
		const hasImage = hasImageOf(meta);
		const propio = hex6(meta.carrousel_background);
		const paleta = propio
			? conFondoPropio(paletas[i], propio, hex6(meta.carrousel_color))
			: paletas[i];
		return {
			post,
			evento,
			tile: tiles[i],
			tipo: CARRUSEL_TIPOS[/** @type {keyof typeof CARRUSEL_TIPOS} */ (meta.category)] ?? '',
			estilo: isCarruselEstilo(post.estilo) ? post.estilo : estiloDeDiapositiva(ROTAR, null, i),
			paleta,
			ink: paleta.ink,
			day,
			time,
			hasImage,
			tilt: [-3, 2.5, -1.5, 3, -2][i % 5],
			background: paleta.bg,
			when: evento ? argDateList(meta.start ?? '') : '',
			iso: isNaN(start.getTime()) ? undefined : start.toISOString(),
			place: evento ? placeShort(meta) : '',
			cta: evento ? ticketCta(meta, ticketStates) : null,
			srcset: posterSrcset(meta.featured) || undefined
		};
	});
	// Los controles toman el color de la diapositiva que se ve (van encima de la franja).
	$: current = slides[index] ?? slides[0];

	/**
	 * Programa el próximo paso. `at` está para que vuelva a correr con cada cambio de diapositiva.
	 * @param {boolean} on
	 * @param {number} at
	 */
	function schedule(on, at) {
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
	class="carrusel en-{current.estilo}"
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
	style:--nav-ink={current.estilo === 'd' ? current.paleta.altInk : current.ink}
	style:--nav-claro-ink={current.paleta.claroInk}
	style:--nav-acento={current.paleta.acento}
	style:--nav-oscuro={current.paleta.oscuro}
>
	<h2 id="carrusel-titulo" class="visually-hidden">Lo nuevo de Kinky Vibe</h2>
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
			{@const parts = (slide.day ?? '').split(' ')}
			<div
				id="carrusel-{i}"
				class="slide v-{slide.estilo}"
				class:active
				class:sin-imagen={!slide.hasImage}
				class:con-ficha={Boolean(slide.tile)}
				class:nuevo={!slide.evento}
				role="group"
				aria-roledescription="diapositiva"
				aria-label="{i + 1} de {count}"
				aria-hidden={active ? undefined : 'true'}
				inert={!active}
				tabindex="-1"
				style:--slide-bg={slide.background}
				style:--ink={slide.ink}
				style:--titulo-ink={slide.paleta.tituloInk}
				style:--alt-titulo-ink={slide.paleta.altTituloInk}
				style:--cinta-adhesiva={slide.paleta.cintaAdhesiva}
				style:--flyer={slide.paleta.flyer}
				style:--flyer-ink={slide.paleta.flyerInk}
				style:--alt={slide.paleta.alt}
				style:--alt-ink={slide.paleta.altInk}
				style:--cinta={slide.paleta.cinta}
				style:--cinta-ink={slide.paleta.cintaInk}
				style:--garabato={slide.paleta.garabato}
				style:--claro={slide.paleta.claro}
				style:--claro-ink={slide.paleta.claroInk}
				style:--acento={slide.paleta.acento}
				style:--oscuro={slide.paleta.oscuro}
				style:--medio={slide.paleta.medio}
				style:--papel={slide.paleta.papel}
				style:--sello-borde={slide.paleta.sello}
				style:--tilt="{slide.tilt}deg"
			>
				<!-- El fondo, de borde a borde: dibujitos (A, B, C), dos mitades (D) o la mesa (E). -->
				<div class="fondo" aria-hidden="true">
					{#if slide.estilo === 'd'}
						<span class="mitad mitad-1"></span>
						<span class="mitad mitad-2"></span>
					{:else if slide.estilo === 'e' && slide.hasImage && load}
						{#each MESA as [x, y, r, w]}
							<img
								class="copia"
								src={meta.featured}
								srcset={slide.srcset}
								sizes={slide.srcset ? '18rem' : undefined}
								alt=""
								loading="lazy"
								decoding="async"
								style:left="{x}%"
								style:top="{y}%"
								style:width="{w}rem"
								style:--r="{r}deg"
							/>
						{/each}
						<span class="velo"></span>
					{:else if slide.estilo === 'e' && slide.tile}
						<!-- sin imagen, la mesa con copias de su ficha -->
						{#each MESA as [x, y, r, w]}
							<span
								class="copia ficha-copia"
								style:background={slide.tile.bg}
								style:left="{x}%"
								style:top="{y}%"
								style:width="{w}rem"
								style:--r="{r}deg"><img src={slide.tile.icon} alt="" /></span
							>
						{/each}
						<span class="velo"></span>
					{/if}
				</div>
				<div class="inner">
					<div class="art">
						{#if slide.estilo === 'a'}
							<span class="papel papel-1" aria-hidden="true"></span>
							<span class="papel papel-2" aria-hidden="true"></span>
						{/if}
						<div class="img-box">
							{#if slide.hasImage}
								{#if load}
									<img
										src={meta.featured}
										srcset={slide.srcset}
										sizes={slide.srcset ? '(min-width: 44rem) 24rem, 70vw' : undefined}
										width="720"
										height="720"
										alt=""
										loading={i === 0 ? 'eager' : 'lazy'}
										fetchpriority={i === 0 ? 'high' : undefined}
										decoding={i === 0 ? undefined : 'async'}
									/>
								{/if}
							{:else if slide.tile}
								<!-- Sin imagen: la ficha de su tipo, como en su vista previa al compartir. -->
								<span
									class="ficha"
									style:background={slide.tile.bg}
									style:color={slide.tile.ink}
									aria-hidden="true"
								>
									<img class="ficha-icono" src={slide.tile.icon} alt="" />
									<span class="ficha-titulo">{meta.title}</span>
								</span>
							{:else}
								<!-- Sin imagen: un flyer hecho con el título, en la letra de los flyers. -->
								<span class="flyer" aria-hidden="true">
									<span class="flyer-titulo">{meta.title}</span>
									<img class="flyer-logo" src={LOGO} alt="" />
								</span>
							{/if}
						</div>
						{#if slide.estilo === 'a'}
							<span class="cinta-adhesiva" aria-hidden="true"></span>
						{:else if (slide.estilo === 'b' || slide.estilo === 'd') && parts[1]}
							<!-- estrella con la fecha, como el «NUEVO» de la tienda -->
							<span class="sello" aria-hidden="true"
								><span class="sello-borde"></span><span class="sello-centro"
									><b>{parts[1]}</b>{parts[2] ?? ''}</span
								></span
							>
						{/if}
					</div>
					<div class="details">
						{#if slide.estilo === 'd'}
							<p class="miga">
								{#if slide.evento}talleres y eventos <span aria-hidden="true">›</span>
									{slide.day}{:else}{slide.tipo}{/if}
							</p>
						{:else if slide.estilo !== 'b' && (slide.day || !slide.evento)}
							<!-- la fecha del evento o, en lo nuevo, su tipo («Material», «Kinkipedia»…) -->
							<p class="fecha"><span>{slide.evento ? slide.day : slide.tipo}</span></p>
						{/if}
						{#if slide.estilo === 'b'}
							<p class="antetitulo">{slide.evento ? 'Se viene' : slide.tipo}</p>
						{/if}
						<h3 id="carrusel-{i}-titulo"><span>{meta.title}</span></h3>
						{#if slide.when}
							<p class="when">
								<time datetime={slide.iso}
									>{slide.estilo === 'b' || slide.estilo === 'd'
										? slide.when
										: (slide.time ?? slide.when)}</time
								>{#if slide.place}<span class="place">{' · ' + slide.place}</span>{/if}
							</p>
						{/if}
						{#if meta.summary && (slide.estilo !== 'b' || !slide.evento)}<p class="summary">
								{meta.summary}
							</p>{/if}
						<div class="actions">
							{#if slide.cta?.kind === 'buy'}
								<a class="btn buy" href={slide.cta.href}>{slide.cta.text}</a>
							{:else if slide.cta?.kind === 'note'}
								<span class="note">{slide.cta.text}</span>
							{/if}
							<a class="btn mas" href={slide.post.path} aria-describedby="carrusel-{i}-titulo"
								>{slide.evento ? 'Saber más' : 'Ver'}</a
							>
						</div>
					</div>
				</div>
				{#if slide.estilo === 'b' && slide.evento}
					<!-- la franja que cruza toda la pantalla, como la violeta del cartel de la tienda -->
					<p class="franja" aria-hidden="true">
						<span>{slide.when}{slide.place ? ' · ' + slide.place : ''}</span>
					</p>
				{/if}
			</div>
		{/each}
	</div>
	{#if count > 1}
		<div class="nav">
			<button type="button" class="control" aria-label="Anterior" on:click={() => go(index - 1)}>
				<ChevronLeft size={22} aria-hidden="true" />
			</button>
			<div class="picker">
				{#each slides as slide, i (slide.post.path)}
					<button
						type="button"
						class="dot"
						data-slide={i}
						aria-label="{i + 1}: {slide.post.meta.title}"
						aria-current={i === index ? 'true' : undefined}
						tabindex={i === index ? 0 : -1}
						style:--flyer={slide.paleta.flyer}
						style:--tilt="{slide.tilt}deg"
						on:click={() => go(i)}
					>
						{#if current.estilo === 'c'}
							{#if slide.hasImage && mounted}
								<img src={slide.post.meta.featured} alt="" loading="lazy" />
							{:else if slide.tile}
								<span class="mini-flyer" style:background={slide.tile.bg} aria-hidden="true"
									><img class="mini-ficha" src={slide.tile.icon} alt="" /></span
								>
							{:else}
								<span class="mini-flyer" aria-hidden="true"><img src={LOGO} alt="" /></span>
							{/if}
						{:else}
							<span class="punto" aria-hidden="true"></span>
						{/if}
					</button>
				{/each}
			</div>
			<button type="button" class="control" aria-label="Siguiente" on:click={() => go(index + 1)}>
				<ChevronRight size={22} aria-hidden="true" />
			</button>
		</div>
	{/if}
</section>

<style>
	/* La letra de los títulos de los flyers (la misma de las imágenes para compartir). */
	@font-face {
		font-family: 'Lilita One';
		src: url('/fonts/share/lilita-one-latin.woff2') format('woff2');
		font-weight: 400;
		font-display: swap;
	}
	/* La redonda de los carteles de la tienda («Estás visitando una tienda erótica…»). */
	@font-face {
		font-family: 'Fredoka';
		src: url('/fonts/share/fredoka-latin-variable.woff2') format('woff2');
		font-weight: 300 700;
		font-display: swap;
	}

	/* ---------- Común ----------
	   Como los carteles de la tienda: colores planos, dibujitos de trazo fino, letra gorda y
	   redonda, sin degradés ni vidrio. Bordes solo donde la tienda los usa (el botón de contorno
	   «CLICKEÁ ACÁ» y las flechas de círculo fino); nada de contorno en textos, tarjetas ni fotos. */
	.carrusel {
		--kv-tinta: color-mix(in srgb, var(--2-dark) 30%, black);
		--redonda: 'Fredoka', 'Lato', 'Lato Fallback', sans-serif;
		--gorda: 'Lilita One', 'Lato', 'Lato Fallback', sans-serif;
		--nav-alto: 4.25rem;
		position: relative;
		/* de borde a borde: el <main> de la portada no tiene ancho máximo */
		width: 100%;
		touch-action: pan-y;
	}
	.slides {
		display: grid;
	}
	.slide {
		grid-area: 1 / 1;
		position: relative;
		overflow: hidden;
		background: var(--slide-bg);
		color: var(--ink);
		visibility: hidden;
		opacity: 0;
		transition:
			opacity 300ms ease,
			visibility 0s linear 300ms;
	}
	.slide.active {
		visibility: visible;
		opacity: 1;
		transition: opacity 300ms ease;
	}
	.slide:focus-visible {
		outline: 3px solid var(--ink);
		outline-offset: -6px;
	}
	.fondo {
		position: absolute;
		inset: 0;
		pointer-events: none;
		overflow: hidden;
	}
	/* los dibujitos de la agenda impresa, en trazo fino y de un color de la marca */
	.fondo::before {
		content: '';
		position: absolute;
		inset: 0;
		background: var(--garabato);
		mask: url('/agenda-impresa/fondo.svg') center / 38rem repeat;
		-webkit-mask: url('/agenda-impresa/fondo.svg') center / 38rem repeat;
		opacity: 0.55;
	}
	.inner {
		position: relative;
		z-index: 1;
		max-width: 72rem;
		margin-inline: auto;
		padding: var(--space-xl) var(--space-l) calc(var(--nav-alto) + var(--space-s));
		display: grid;
		grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
		align-items: center;
		gap: var(--space-xl);
	}
	.art {
		position: relative;
		width: 100%;
		max-width: 24rem;
		justify-self: center;
	}
	.img-box {
		position: relative;
		aspect-ratio: 1;
		width: 100%;
	}
	.img-box > img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.details {
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-2xs);
	}
	/* Los títulos son texto grande (≥ 31 px): con 3:1 alcanza (`tituloInk`, carruselPaletas.js). */
	h3 {
		margin: 0;
		color: var(--titulo-ink);
		font-family: var(--gorda);
		font-weight: 400;
		font-size: clamp(2.2rem, 4.2vw, 3.6rem);
		line-height: 1.02;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
		overflow-wrap: anywhere;
		padding-bottom: 0.08em;
	}
	.when {
		margin: 0;
		font-weight: 700;
		font-size: var(--text-base, 1.1rem);
	}
	.summary {
		margin: 0;
		max-width: 38rem;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-xs);
		margin-top: var(--space-2xs);
	}
	/* Los botones de la tienda: «Ver más» (píldora blanca, sin borde) para comprar y el de
	   contorno («CLICKEÁ ACÁ») para «Saber más». */
	.btn {
		display: inline-block;
		padding: 0.55em 1.3em;
		border-radius: var(--radius-pill);
		text-decoration: none;
		font-family: var(--redonda);
		font-weight: 600;
		font-size: 1.1rem;
		line-height: 1.1;
		transition: transform 120ms ease;
	}
	.btn.buy {
		background: white;
		color: var(--oscuro);
	}
	.btn.mas {
		border: 2.5px solid currentColor;
		color: inherit;
		padding-block: calc(0.55em - 2.5px);
	}
	.btn:hover {
		transform: translateY(-2px) rotate(-1.5deg);
	}
	.note {
		font-weight: 700;
	}
	.btn:focus-visible,
	.control:focus-visible,
	.dot:focus-visible {
		outline: 3px solid currentColor;
		outline-offset: 3px;
	}
	.btn.buy:focus-visible {
		outline-color: var(--ink);
	}
	/* Las flechas de la tienda: círculo de trazo fino, del color del texto de la diapositiva. */
	.control {
		display: grid;
		place-items: center;
		width: 2.75rem;
		height: 2.75rem;
		padding: 0;
		border: 1.5px solid currentColor;
		border-radius: var(--radius-pill);
		background: transparent;
		color: var(--nav-ink);
		cursor: pointer;
		transition: background 150ms ease;
	}
	.control:hover {
		background: color-mix(in srgb, var(--nav-ink) 18%, transparent);
	}
	.rotation {
		position: absolute;
		right: var(--space-s);
		top: var(--space-s);
		z-index: 3;
	}
	.nav {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: var(--nav-alto);
		z-index: 2;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-xs);
		color: var(--nav-ink);
	}
	.picker {
		display: flex;
	}
	.dot {
		min-width: 2rem;
		height: 2.75rem;
		padding: 0;
		border: 0;
		background: none;
		cursor: pointer;
		display: grid;
		place-items: center;
		color: var(--nav-ink);
	}
	/* los puntos de la tienda: el de la que se ve, una píldora */
	.punto {
		display: block;
		width: 0.7rem;
		height: 0.7rem;
		border-radius: var(--radius-pill);
		background: currentColor;
		opacity: 0.45;
		transition:
			width 200ms ease,
			opacity 200ms ease;
	}
	.dot[aria-current='true'] .punto {
		width: 1.8rem;
		opacity: 1;
	}

	/* Sin imagen: un flyer hecho con el título, en colores planos de la marca, con los dibujitos y
	   el logo. El título como «NEGOCIACIÓN» de la tienda: amarillo con sombra corrida, sin borde. */
	.flyer {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		justify-content: center;
		padding: 9%;
		background: var(--flyer);
		overflow: hidden;
		container-type: inline-size;
	}
	.flyer::before {
		content: '';
		position: absolute;
		inset: -10%;
		background: white;
		mask: url('/agenda-impresa/fondo.svg') center / 140% no-repeat;
		-webkit-mask: url('/agenda-impresa/fondo.svg') center / 140% no-repeat;
		opacity: 0.3;
	}
	.flyer-titulo {
		position: relative;
		font-family: var(--gorda);
		font-size: 14.5cqi;
		overflow-wrap: anywhere;
		line-height: 1;
		text-transform: uppercase;
		color: var(--flyer-ink);
		text-shadow: 0.05em 0.06em 0 var(--kv-tinta);
		transform: rotate(-4deg);
		display: -webkit-box;
		-webkit-line-clamp: 4;
		line-clamp: 4;
		-webkit-box-orient: vertical;
		overflow: hidden;
		padding: 0.1em;
	}
	.flyer-logo {
		position: absolute;
		right: 6%;
		bottom: 6%;
		width: 26%;
		height: auto;
		border-radius: 50%;
		transform: rotate(-12deg);
	}

	/* Sin imagen, lo que no es un evento: su ficha (el color y el símbolo de su tipo, los de su vista
	   previa al compartir, $lib/utils/ogObjeto.js) con el título abajo. Cuadrada, como un flyer:
	   entra igual en la pila (A), el marco blanco (B), el sticker (C), la mitad (D) y la mesa (E). */
	.ficha {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4%;
		padding: 10%;
		container-type: inline-size;
		overflow: hidden;
		text-align: center;
	}
	.ficha-icono {
		width: 46%;
		height: auto;
	}
	.ficha-titulo {
		font-family: var(--gorda);
		font-size: 10cqi;
		line-height: 1.02;
		overflow-wrap: anywhere;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	/* en la mesa de E, las copias de la ficha */
	.ficha-copia {
		display: grid;
		place-items: center;
	}
	.ficha-copia img {
		width: 45%;
		height: auto;
	}
	.mini-ficha {
		border-radius: 0 !important;
		transform: none !important;
	}

	/* La fecha en una franja inclinada, como las tiras violetas de la tienda. */
	.fecha {
		margin: 0;
		font-family: var(--gorda);
		font-size: var(--text-lg);
		text-transform: uppercase;
		transform: rotate(-2deg);
	}
	.fecha span {
		display: inline-block;
		padding: 0.1em 0.6em;
		background: var(--cinta);
		color: var(--cinta-ink);
		transform: skewX(-12deg);
	}

	/* Estrella (B y D): dos capas, como el «NUEVO» azul con borde fucsia. */
	.sello {
		position: absolute;
		width: 6.5rem;
		height: 6.5rem;
		transform: rotate(-12deg);
		z-index: 2;
		--estrella: polygon(
			50% 0%,
			58% 13%,
			69% 3%,
			73% 18%,
			86% 13%,
			84% 28%,
			98% 30%,
			90% 43%,
			100% 53%,
			88% 61%,
			95% 75%,
			80% 78%,
			79% 93%,
			66% 87%,
			57% 100%,
			48% 88%,
			36% 98%,
			31% 84%,
			17% 89%,
			17% 74%,
			3% 70%,
			11% 58%,
			0% 47%,
			12% 38%,
			6% 24%,
			21% 22%,
			22% 7%,
			36% 13%
		);
	}
	.sello-borde,
	.sello-centro {
		position: absolute;
		clip-path: var(--estrella);
	}
	.sello-borde {
		inset: 0;
		background: var(--sello-borde);
	}
	.sello-centro {
		inset: 7%;
		display: grid;
		place-content: center;
		text-align: center;
		background: var(--oscuro);
		color: white;
		font-family: var(--gorda);
		text-transform: uppercase;
		line-height: 0.9;
		font-size: 1.15rem;
	}
	.sello-centro b {
		font-weight: 400;
		font-size: 2.2rem;
	}

	/* ---------- A · Pila de flyers ---------- */
	.v-a .art {
		transform: rotate(var(--tilt));
	}
	/* el flyer impreso: margen blanco de papel, sin contorno */
	.v-a .img-box {
		background: white;
		border: 0.6rem solid white;
	}
	.v-a .papel {
		position: absolute;
		inset: 0;
	}
	.v-a .papel-1 {
		background: var(--papel);
		transform: rotate(7deg) translate(6%, 2%);
	}
	.v-a .papel-2 {
		background: var(--alt);
		transform: rotate(-6deg) translate(-5%, 4%);
	}
	.v-a .cinta-adhesiva {
		position: absolute;
		top: -0.9rem;
		left: 30%;
		width: 40%;
		height: 1.7rem;
		background: color-mix(in srgb, var(--cinta-adhesiva) 80%, transparent);
		transform: rotate(-5deg);
		z-index: 2;
	}

	/* ---------- B · Franja cruzada (el cartel verde de la tienda) ----------
	   Liso, sin dibujitos; título redondo y gordo; la fecha en una estrella y una franja que
	   cruza toda la pantalla. */
	.v-b .fondo::before {
		display: none;
	}
	.v-b .inner {
		grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
		padding-bottom: calc(var(--nav-alto) + 4.5rem);
	}
	.v-b .art {
		order: 2;
		transform: rotate(var(--tilt));
	}
	.v-b .img-box {
		background: white;
		border: 0.6rem solid white;
	}
	/* sin imagen, el flyer va en el círculo blanco del cartel de la tienda (el del logo); un
	   flyer de verdad no se recorta: tiene texto en las esquinas */
	.slide.v-b.sin-imagen:not(.con-ficha) .img-box {
		border-radius: 50%;
		overflow: hidden;
	}
	.v-b .flyer {
		border-radius: 50%;
	}
	.v-b .flyer {
		padding: 16%;
	}
	.v-b .flyer-logo {
		right: 50%;
		bottom: 5%;
		transform: translateX(50%) rotate(-12deg);
		width: 22%;
	}
	.v-b .sello {
		left: -1rem;
		top: -1rem;
	}
	.v-b .antetitulo {
		margin: 0;
		font-family: var(--redonda);
		font-weight: 600;
		font-size: var(--text-xl);
		line-height: 1;
	}
	.v-b h3 {
		font-family: var(--redonda);
		font-weight: 700;
		font-size: clamp(2.4rem, 5vw, 4.2rem);
		line-height: 0.98;
		-webkit-line-clamp: 4;
		line-clamp: 4;
	}
	.v-b .when {
		display: none;
	}
	.v-b .note {
		color: var(--ink);
	}
	.v-b .franja {
		position: absolute;
		z-index: 1;
		left: -2%;
		right: -2%;
		bottom: calc(var(--nav-alto) + 0.25rem);
		margin: 0;
		padding: 0.25em 0;
		text-align: center;
		background: var(--cinta);
		color: var(--cinta-ink);
		font-family: var(--redonda);
		font-weight: 600;
		font-size: clamp(1.2rem, 2.4vw, 2rem);
		transform: rotate(-1.5deg);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* ---------- C · Mesa de stickers ----------
	   La franja es una mesa clara con dibujitos; el flyer, un sticker troquelado (borde blanco) y
	   las miniaturas de abajo, stickers sueltos. */
	.en-c {
		--nav-ink: var(--nav-claro-ink) !important;
	}
	.slide.v-c {
		background: var(--claro);
		color: var(--claro-ink);
		--garabato: var(--medio) !important;
	}
	.v-c .fondo::before {
		opacity: 0.4;
	}
	.v-c .inner {
		padding-bottom: calc(5.5rem + var(--space-s));
	}
	.v-c .art {
		transform: rotate(var(--tilt));
	}
	.v-c .img-box {
		border: 0.7rem solid white;
		border-radius: var(--radius-l);
		background: white;
		overflow: hidden;
		box-shadow: 0.35rem 0.45rem 0 color-mix(in srgb, var(--oscuro) 22%, transparent);
	}
	.v-c .img-box > img,
	.v-c .flyer {
		border-radius: var(--radius-m);
	}
	.v-c h3 {
		color: var(--acento);
	}
	.v-c .fecha span {
		background: var(--cinta);
		color: var(--cinta-ink);
		border-radius: var(--radius-s);
		transform: none;
	}
	.v-c .btn.buy {
		background: var(--acento);
		color: white;
	}
	.v-c .btn.buy:focus-visible {
		outline-color: var(--acento);
	}
	.en-c .nav {
		height: 5.5rem;
		gap: var(--space-2xs);
	}
	.en-c .picker {
		gap: var(--space-2xs);
	}
	.en-c .dot {
		position: relative;
		width: 3.6rem;
		height: 3.6rem;
		padding: 0.22rem;
		background: white;
		border-radius: var(--radius-s);
		transform: rotate(var(--tilt));
		transition: transform 150ms ease;
	}
	.en-c .dot img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		border-radius: 0.35rem;
	}
	.en-c .mini-flyer {
		display: grid;
		place-items: center;
		width: 100%;
		height: 100%;
		border-radius: 0.35rem;
		background: var(--flyer);
		overflow: hidden;
	}
	.en-c .mini-flyer img {
		width: 60%;
		height: auto;
		border-radius: 50%;
		transform: rotate(-12deg);
	}
	/* la que se ve: levantada y con una rayita violeta abajo (sin contorno) */
	.en-c .dot[aria-current='true'] {
		transform: rotate(0deg) translateY(-0.35rem) scale(1.12);
	}
	.en-c .dot[aria-current='true']::after {
		content: '';
		position: absolute;
		left: 25%;
		right: 25%;
		bottom: -0.65rem;
		height: 0.3rem;
		border-radius: var(--radius-pill);
		background: var(--nav-acento);
	}

	/* ---------- D · Diagonal partida (el cartel de «mini talleres rapiditos») ----------
	   Dos colores planos cortados en diagonal, con dibujitos de otro color en cada mitad; el
	   flyer en una, el texto en la otra, y la estrella con la fecha sobre el corte. */
	.v-d .fondo::before {
		display: none;
	}
	.v-d .mitad {
		position: absolute;
		inset: 0;
	}
	.v-d .mitad-1 {
		background: var(--slide-bg);
	}
	.v-d .mitad-2 {
		background: var(--alt);
		clip-path: polygon(50% 0, 100% 0, 100% 100%, 42% 100%);
	}
	.v-d .mitad::before {
		content: '';
		position: absolute;
		inset: 0;
		mask: url('/agenda-impresa/fondo.svg') center / 38rem repeat;
		-webkit-mask: url('/agenda-impresa/fondo.svg') center / 38rem repeat;
		opacity: 0.5;
	}
	.v-d .mitad-1::before {
		background: var(--garabato);
	}
	.v-d .mitad-2::before {
		background: var(--slide-bg);
		opacity: 0.35;
	}
	.v-d .inner {
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: var(--space-2xl);
	}
	.v-d .art {
		transform: rotate(-3deg);
	}
	.v-d .sello {
		right: -2.8rem;
		top: -1.8rem;
		width: 7.5rem;
		height: 7.5rem;
	}
	/* los controles, en la mitad del texto (en la otra no se leerían) */
	.en-d .nav {
		left: 50%;
		justify-content: flex-end;
		padding-right: max(var(--space-l), calc((100% - 72rem) / 2 + var(--space-l)));
	}
	.v-d .details {
		color: var(--alt-ink);
		align-items: flex-end;
		text-align: right;
	}
	.v-d .miga {
		margin: 0;
		font-family: var(--redonda);
		font-weight: 500;
		font-size: var(--text-lg);
	}
	.v-d h3 {
		color: var(--alt-titulo-ink);
		font-family: var(--redonda);
		font-weight: 600;
		font-size: clamp(2.2rem, 4vw, 3.5rem);
		line-height: 1;
		-webkit-line-clamp: 4;
		line-clamp: 4;
	}
	.v-d .when {
		font-family: var(--redonda);
		font-weight: 500;
		font-size: 1.15rem;
	}
	.v-d .summary {
		display: none;
	}
	.v-d .actions {
		justify-content: flex-end;
	}
	.v-d .btn {
		border-radius: var(--radius-m);
		text-transform: uppercase;
		font-size: 1.25rem;
	}
	.v-d .btn.buy {
		color: var(--oscuro);
	}
	.v-d .btn.mas {
		border-width: 3px;
		padding-block: calc(0.55em - 3px);
	}
	.v-d .btn.buy:focus-visible {
		outline-color: var(--alt-ink);
	}

	/* ---------- E · Mesa de zines (las fotos de la tienda) ----------
	   El fondo es una mesa con copias del flyer tiradas, con un velo violeta plano encima; el
	   título va en tiras violetas (así se lee sobre cualquier foto) y botones de píldora blanca. */
	.slide.v-e:not(.sin-imagen),
	.slide.v-e.con-ficha {
		--ink: white;
		color: white;
		background: var(--medio);
	}
	.slide.v-e:not(.sin-imagen) .fondo::before,
	.slide.v-e.con-ficha .fondo::before {
		display: none;
	}
	.v-e .copia {
		position: absolute;
		aspect-ratio: 1;
		object-fit: cover;
		border: 0.45rem solid white;
		transform: rotate(var(--r));
	}
	.v-e .velo {
		position: absolute;
		inset: 0;
		background: var(--oscuro);
		opacity: 0.55;
	}
	.en-e {
		--nav-ink: white !important;
	}
	/* los controles en una píldora violeta: se leen sobre cualquier foto o color */
	.en-e .nav {
		width: fit-content;
		margin-inline: auto;
		bottom: var(--space-2xs);
		height: auto;
		padding: 0.3rem 0.5rem;
		border-radius: var(--radius-pill);
		background: var(--nav-oscuro);
	}
	.v-e .inner {
		grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
		align-items: end;
	}
	.v-e .art {
		order: 2;
		max-width: 22rem;
		transform: rotate(2deg);
	}
	.v-e .img-box {
		border: 0.5rem solid white;
		background: white;
	}
	.v-e .fecha span {
		background: white;
		color: var(--oscuro);
	}
	.v-e h3 {
		font-family: var(--redonda);
		font-weight: 700;
		font-size: clamp(2.3rem, 4.4vw, 3.8rem);
		line-height: 1.18;
		-webkit-line-clamp: 4;
		line-clamp: 4;
	}
	.v-e h3 span {
		color: white;
		background: var(--oscuro);
		padding: 0 0.2em;
		-webkit-box-decoration-break: clone;
		box-decoration-break: clone;
	}
	.v-e .when,
	.v-e .summary,
	.v-e .note {
		color: white;
		background: var(--kv-tinta);
		padding: 0.1em 0.4em;
	}
	.v-e .summary {
		display: none;
	}
	.v-e .btn.mas {
		color: white;
		background: var(--oscuro);
		border-color: white;
	}
	.v-e .btn.buy:focus-visible {
		outline-color: white;
	}

	/* Lo nuevo (sin fecha): el resumen se ve también en D y E, y B no lleva franja abajo. */
	.slide.nuevo .summary {
		display: -webkit-box;
	}
	.v-b.nuevo .inner {
		padding-bottom: calc(var(--nav-alto) + var(--space-s));
	}

	/* ---------- Celu ---------- */
	@media (max-width: 44rem) {
		.carrusel {
			--nav-alto: 3.75rem;
		}
		/* con muchas diapositivas (hasta 12), los puntos más angostos: las flechas siguen entrando
		   en 390 px (cada punto, 24 px de ancho para tocarlo) */
		.dot {
			min-width: 1.5rem;
		}
		.nav {
			gap: var(--space-3xs, 0.25rem);
		}
		.inner,
		.v-b .inner,
		.v-d .inner,
		.v-e .inner {
			grid-template-columns: minmax(0, 1fr);
			gap: var(--space-m);
			padding: var(--space-l) var(--space-s) calc(var(--nav-alto) + var(--space-2xs));
		}
		.art {
			max-width: 68%;
		}
		.v-b .art,
		.v-e .art {
			order: 0;
		}
		.v-e .art {
			max-width: 62%;
		}
		h3 {
			font-size: var(--text-2xl);
		}
		.summary,
		.slide.nuevo .summary {
			display: none;
		}
		.v-b .inner {
			padding-bottom: calc(var(--nav-alto) + 3.5rem);
		}
		.v-b h3,
		.v-d h3,
		.v-e h3 {
			font-size: var(--text-2xl);
		}
		.v-b .antetitulo {
			font-size: var(--text-lg);
		}
		.v-b .franja {
			font-size: 1.05rem;
		}
		.v-c .inner {
			padding-bottom: calc(4.6rem + var(--space-2xs));
		}
		.en-c .nav {
			height: 4.6rem;
		}
		.en-c .dot {
			width: 2.9rem;
			height: 2.9rem;
		}
		.en-c .nav .control {
			display: none;
		}
		/* con muchas diapositivas, los stickers no entran en el ancho: se deslizan de costado */
		.en-c .picker {
			max-width: 100%;
			overflow-x: auto;
			scrollbar-width: none;
			padding: 0.6rem var(--space-s) 0.9rem;
		}
		.en-c .dot {
			flex-shrink: 0;
		}
		/* D en el celu: el corte cruza de lado a lado, entre el flyer y el texto. Se mide con el
		   flyer (64 % del ancho de adentro), así el texto queda siempre entero en la otra mitad
		   (con su color, que se lee ahí). */
		.v-d .inner {
			row-gap: var(--space-xl);
		}
		.v-d .mitad-2 {
			--corte: calc(var(--space-l) + 0.64 * (100vw - 2 * var(--space-s)) + 1.1rem);
			clip-path: polygon(0 var(--corte), 100% calc(var(--corte) - 3rem), 100% 100%, 0 100%);
		}
		.v-d .art {
			max-width: 64%;
		}
		.v-d .sello {
			right: -2.4rem;
			bottom: -1rem;
			width: 6rem;
			height: 6rem;
		}
		.v-d .sello-centro {
			font-size: 1rem;
		}
		.v-d .sello-centro b {
			font-size: 1.8rem;
		}
		.v-d .details {
			align-items: flex-start;
			text-align: left;
		}
		.en-d .nav {
			left: 0;
			justify-content: center;
			padding-right: 0;
		}
		.v-d .actions {
			justify-content: flex-start;
		}
		.v-d .miga {
			font-size: 1rem;
		}
		.v-e .copia {
			width: 9rem !important;
		}
		.sello {
			width: 5.4rem;
			height: 5.4rem;
		}
		.sello-centro b {
			font-size: 1.7rem;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.slide,
		.slide.active,
		.btn,
		.punto,
		.en-c .dot {
			transition: none;
		}
	}
</style>
