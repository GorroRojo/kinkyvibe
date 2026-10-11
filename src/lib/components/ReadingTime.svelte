<script>
	/**
	 * «X min de lectura», con un reloj, de un material o una entrada de la wiki (idea de JorgeT10,
	 * PR #46), con la explicación de cómo se calcula ({@link readingTimeHint}).
	 *
	 * La explicación aparece al pasar el mouse, con el foco del teclado y al tocar (en el celu no hay
	 * mouse): el tiempo es un botón que la abre y la cierra (`aria-expanded`), y la explicación está
	 * siempre unida al botón con `aria-describedby`, así los lectores de pantalla la leen aunque no
	 * esté a la vista. Escape o tocar afuera la cierran. La caja se corre para no salirse de la
	 * pantalla (16px de margen), así funciona igual centrada (material) o contra el borde (wiki).
	 *
	 * Velocidad de cada persona (pedido de gorrite): desde la explicación, «¿Leés más rápido o más
	 * lento? Ajustalo» abre las opciones (Más despacio, Predeterminado, Más rápido u Otro). La elección vale
	 * para todo el sitio ($lib/utils/readingSpeed.js): el servidor dibuja los minutos de siempre y,
	 * si la persona eligió otra velocidad, después de hidratar se recalculan con `words`.
	 *
	 * Todo es contenido «en línea» (span, button, input, label): va adentro de un <p> o un <address>.
	 *
	 * Props: `minutes` (los de `pageReadingMinutes`; con 0 o sin dato no muestra nada), `words` (los
	 * de `pageReadingWords`, para recalcular), `id` (el de la explicación; uno fijo, así el servidor
	 * y el navegador arman lo mismo: va una vez por página), `open` y `adjusting` (para las pruebas).
	 */
	import { tick } from 'svelte';
	import { Clock } from '@lucide/svelte';
	import { page } from '$app/stores';
	import {
		READING_SPEEDS,
		READING_SPEED_MAX,
		READING_SPEED_MIN,
		WORDS_PER_MINUTE,
		minutesAtSpeed,
		readingTimeHint,
		readingTimeLabel
	} from '$lib/utils/readingTime.js';
	import { chooseReadingSpeed, readingSpeed } from '$lib/utils/readingSpeed.js';

	/** @type {unknown} */
	export let minutes = 0;
	/** @type {unknown} */
	export let words = 0;
	export let id = 'kv-tiempo-de-lectura';

	// Con una velocidad elegida y las palabras, los minutos a esa velocidad; si no, los del servidor.
	$: shownMinutes =
		$readingSpeed !== null && Number(words) > 0 ? minutesAtSpeed(words, $readingSpeed) : minutes;
	$: label = readingTimeLabel(shownMinutes);
	$: hintText = readingTimeHint($readingSpeed);
	$: current = $readingSpeed ?? WORDS_PER_MINUTE;

	/** La explicación abierta (al tocar) y las opciones de velocidad a la vista. Props solo para las
	 * pruebas (arrancan cerradas). */
	export let open = false;
	export let adjusting = false;
	/** @type {number | null} */
	let other = null;
	/** @type {HTMLElement | undefined} */
	let wrap;
	/** @type {HTMLElement | undefined} */
	let hint;
	/** Cuánto se corre la explicación (px) para quedar dentro de la pantalla. */
	let shift = 0;
	const GUTTER = 16;

	/**
	 * Corre la explicación (ya visible) para que no se salga de la pantalla. Parte del corrimiento
	 * que ya tiene puesto (no de `shift`, que puede ir un paso adelante del DOM).
	 */
	async function place() {
		await tick();
		if (!hint) return;
		const box = hint.getBoundingClientRect();
		if (!box.width) return;
		const applied = parseFloat(hint.style.getPropertyValue('--shift')) || 0;
		const centered = box.left - applied;
		const viewport = document.documentElement.clientWidth || window.innerWidth;
		const maxLeft = Math.max(GUTTER, viewport - GUTTER - box.width);
		shift = Math.min(Math.max(centered, GUTTER), maxLeft) - centered;
	}
	async function toggle() {
		open = !open;
		if (!open) adjusting = false;
		if (open) {
			await tick();
			place();
		}
	}
	async function toggleAdjust() {
		open = true;
		adjusting = !adjusting;
		if (adjusting) other = $readingSpeed;
		await tick();
		place();
	}
	/** @param {unknown} wpm */
	function pick(wpm) {
		open = true;
		chooseReadingSpeed(wpm, { member: Boolean($page?.data?.member) });
		other = null;
	}

	/** @param {MouseEvent} e */
	function closeOutside(e) {
		if (open && wrap && !wrap.contains(/** @type {Node} */ (e.target))) {
			open = false;
			adjusting = false;
		}
	}
	/** @param {KeyboardEvent} e */
	function closeOnEscape(e) {
		if (open && e.key === 'Escape') {
			open = false;
			adjusting = false;
		}
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
		<span class="hint" class:adjusting bind:this={hint} style:--shift="{shift}px">
			<span class="hint-text" {id} role="note" aria-live="polite">{hintText}</span>
			<button
				type="button"
				class="adjust"
				aria-expanded={adjusting}
				aria-controls="{id}-velocidad"
				on:click={toggleAdjust}>¿Leés más rápido o más lento? Ajustalo</button
			>
			{#if adjusting}
				<span class="speeds" id="{id}-velocidad">
					<span class="kv-segmented" role="group" aria-label="Tu velocidad de lectura">
						{#each READING_SPEEDS as s (s.id)}
							<button
								type="button"
								aria-pressed={current === s.wpm}
								title="{s.wpm} palabras por minuto"
								on:click={() => pick(s.wpm)}>{s.label}</button
							>
						{/each}
					</span>
					<span class="other">
						<label for="{id}-otro">Otro:</label>
						<input
							id="{id}-otro"
							type="number"
							inputmode="numeric"
							min={READING_SPEED_MIN}
							max={READING_SPEED_MAX}
							step="10"
							placeholder={String(current)}
							bind:value={other}
							on:keydown={(e) => e.key === 'Enter' && other !== null && pick(other)}
						/>
						<span class="unit">palabras por minuto</span>
						<button
							type="button"
							class="use"
							disabled={other === null}
							on:click={() => other !== null && pick(other)}>Usar</button
						>
					</span>
				</span>
			{/if}
		</span>
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
	/* 24rem: con «Predeterminado» las tres no entraban en 22rem (gorrite, 11/10). */
	.hint.adjusting {
		width: min(24rem, calc(100vw - 32px));
		max-width: none;
	}
	/* Puente invisible entre el tiempo y la caja: el mouse puede bajar sin que se cierre. */
	.hint::before {
		content: '';
		position: absolute;
		inset-inline: 0;
		bottom: 100%;
		height: 0.6em;
	}
	.hint-text {
		display: block;
	}
	.adjust {
		display: inline;
		margin-top: var(--space-3xs, 0.3em);
		padding: 0.2em 0;
		border: 0;
		background: none;
		font: inherit;
		color: var(--link, var(--2-dark));
		text-decoration: underline;
		text-underline-offset: 0.2em;
		cursor: pointer;
	}
	.speeds {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-2xs, 0.5em);
		margin-top: var(--space-2xs, 0.5em);
	}
	.speeds .kv-segmented {
		justify-content: center;
		flex-wrap: nowrap;
	}
	/* Las tres en una fila, también en el celu. */
	.speeds .kv-segmented > button {
		padding-inline: 0.5em;
		white-space: nowrap;
	}
	/* Celus angostos: letra un poco más chica para que sigan en una fila (probado a 360 y 320). */
	@media (max-width: 375px) {
		.speeds .kv-segmented > button {
			font-size: 0.88em;
		}
	}
	@media (max-width: 340px) {
		.speeds .kv-segmented > button {
			padding-inline: 0.4em;
			font-size: 0.8em;
		}
	}
	.other {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 0.3em;
	}
	.other input {
		width: 4.5em;
		padding: 0.2em 0.3em;
		font: inherit;
		border: 1px solid var(--line, #ccc);
		border-radius: var(--radius-s, 0.5em);
		background: var(--surface);
		color: inherit;
	}
	.unit {
		color: var(--muted);
	}
	.use {
		padding: 0.2em 0.8em;
		border: 1px solid var(--accent, var(--1));
		border-radius: var(--radius-pill, 999px);
		background: var(--surface);
		font: inherit;
		color: var(--accent-text, var(--1-ink));
		cursor: pointer;
	}
	.use:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.open .hint,
	.reading-time:hover .hint,
	.reading-time:has(:focus-visible) .hint,
	.time:focus-visible + .hint {
		display: block;
	}
</style>
