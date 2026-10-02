<script>
	/**
	 * Índice de secciones de un formulario largo: en la compu, una columna al costado que queda
	 * fija al scrollear; en el celu, una fila de botones fija arriba que se desliza de costado.
	 * Marca la sección que se está viendo y, al tocar una, la lleva a la pantalla.
	 *
	 * Props:
	 * - `sections`: [{ id, icon, label }] (ver `formSections` en `$lib/admin/eventForm.js`); `id`
	 *   es el del elemento de la sección en la página.
	 */
	import { onMount, tick } from 'svelte';
	import { currentSection } from '$lib/admin/eventForm.js';

	/** @type {import('$lib/admin/eventForm.js').FormSection[]} */
	export let sections = [];

	let current = sections[0]?.id ?? '';
	/** @type {HTMLOListElement | undefined} */
	let strip;

	/** Altura de la línea de lectura: un poco debajo de lo que tapa la barra fija de arriba. */
	function readingLine() {
		const top = parseFloat(getComputedStyle(document.documentElement).fontSize) * 9;
		return Math.min(top, window.innerHeight / 3);
	}

	/** Después de tocar una sección, la marcada es esa mientras dura el scroll hasta ella. */
	let pinnedUntil = 0;

	function update() {
		if (Date.now() < pinnedUntil) return;
		const tops = sections
			.map((s) => ({ id: s.id, el: document.getElementById(s.id) }))
			.filter((s) => s.el)
			.map((s) => ({
				id: s.id,
				top: /** @type {HTMLElement} */ (s.el).getBoundingClientRect().top
			}));
		const root = document.documentElement;
		const atEnd = window.innerHeight + window.scrollY >= root.scrollHeight - 4;
		const next = currentSection(tops, readingLine(), atEnd && window.scrollY > 0);
		if (next !== current) {
			current = next;
			// En el celu, que el botón de la sección actual quede a la vista en la fila.
			// Sin scrollIntoView: movería también la página.
			tick().then(revealCurrent);
		}
	}

	function revealCurrent() {
		const a = /** @type {HTMLElement | null | undefined} */ (
			strip?.querySelector('[aria-current="true"]')
		);
		if (!strip || !a || strip.scrollWidth <= strip.clientWidth) return;
		const left = a.offsetLeft - strip.offsetLeft;
		if (left < strip.scrollLeft || left + a.offsetWidth > strip.scrollLeft + strip.clientWidth)
			strip.scrollTo({ left: Math.max(0, left - 16) });
	}

	onMount(() => {
		let frame = 0;
		const onScroll = () => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(update);
		};
		update();
		window.addEventListener('scroll', onScroll, { passive: true });
		window.addEventListener('resize', onScroll, { passive: true });
		return () => {
			cancelAnimationFrame(frame);
			window.removeEventListener('scroll', onScroll);
			window.removeEventListener('resize', onScroll);
		};
	});

	/** @param {MouseEvent} e @param {string} id */
	function jump(e, id) {
		const el = document.getElementById(id);
		if (!el) return;
		// Sin cambiar la URL: no es una navegación (y no tiene que preguntar por cambios sin guardar).
		e.preventDefault();
		const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
		el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
		current = id;
		pinnedUntil = Date.now() + 1200;
	}
</script>

<nav class="section-index" aria-label="Secciones del formulario">
	<p class="title">En esta página</p>
	<ol bind:this={strip}>
		{#each sections as s (s.id)}
			<li>
				<a
					href="#{s.id}"
					aria-current={s.id === current ? 'true' : undefined}
					on:click={(e) => jump(e, s.id)}
					><span class="icon" aria-hidden="true">{s.icon}</span><span>{s.label}</span></a
				>
			</li>
		{/each}
	</ol>
</nav>

<style>
	.section-index {
		position: sticky;
		top: var(--form-sticky-top, 0px);
		z-index: 3;
	}
	.title {
		display: none;
		margin: 0 0 0.4rem;
		font-size: 0.8rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--muted, #666);
	}
	ol {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.section-index a {
		display: flex;
		align-items: center;
		gap: 0.45em;
		text-decoration: none;
		color: var(--text, #333);
		border-radius: 2em;
		white-space: nowrap;
		min-height: 2.75rem;
		box-sizing: border-box;
		padding: 0 0.9em;
	}
	.section-index a[aria-current='true'] {
		background: var(--accent, hsl(319, 90%, 60%));
		color: var(--accent-ink, white);
		font-weight: 700;
	}
	.section-index a:focus-visible {
		outline: 2px solid var(--link, #6a2fc4);
		outline-offset: 2px;
	}

	/* Celu (o columna angosta): una fila que se desliza, fija arriba. */
	@container event-form (max-width: 47.99rem) {
		.section-index {
			margin: 0 -16px 0.8rem;
			padding: 0.4rem 16px;
			background: var(--bg, #fff7fb);
		}
		ol {
			display: flex;
			gap: 0.4rem;
			overflow-x: auto;
			scrollbar-width: none;
			overscroll-behavior-x: contain;
		}
		ol::-webkit-scrollbar {
			display: none;
		}
		.section-index a {
			background: var(--surface, white);
			box-shadow: inset 0 0 0 1px var(--line, #ddd);
			font-size: 0.9rem;
		}
	}

	/* Compu: columna al costado. */
	@container event-form (min-width: 48rem) {
		.section-index {
			align-self: start;
			padding-top: 0.2rem;
		}
		.title {
			display: block;
			padding-left: 0.9rem;
		}
		ol {
			display: flex;
			flex-direction: column;
			gap: 0.15rem;
		}
		.section-index a:not([aria-current='true']):hover {
			background: var(--surface-2, #f3eef6);
		}
	}
</style>
