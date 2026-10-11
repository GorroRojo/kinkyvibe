<script>
	/**
	 * Aviso en la página, con su ícono de Lucide (sin «⚠️» ni «✅» en el texto): verde para lo que
	 * salió bien («Guardado ✓»), amarillo para avisos y **rojo** (`--error`) para errores y malas
	 * noticias. «Guardado» y «Deshacer» nunca van en rojo. Un aviso con «Deshacer» es `UndoToast`.
	 * Mismos colores que `.kv-flash` (panel-forms.scss); usa los tokens del panel si está adentro y
	 * los del sitio si no, así sirve en los dos.
	 *
	 * Props:
	 * - `tone`: 'ok' (default) | 'warn' | 'error'.
	 * - `compact`: más chico y con letra normal, para avisos largos o al lado de un campo (dentro
	 *   de un formulario).
	 * - `inline`: compacto y armado con `<span>`, para ir dentro de un `<label>` o un párrafo.
	 * - `role`: los errores se anuncian con `role="alert"` y los demás con `role="status"`. Pasá
	 *   `role={null}` para una nota fija que está desde que carga la página (no se anuncia), o
	 *   `role="alert"` para un aviso que aparece después de una acción y no puede pasar de largo.
	 * - `id`: opcional (para `aria-describedby` o las pruebas).
	 * Slot default: el texto (puede tener links, listas, botones).
	 */
	import { CircleAlert, CircleCheck, TriangleAlert } from '@lucide/svelte';
	// Las páginas que usaban Notice recibían con él los estilos de formularios del panel: se queda.
	import '$lib/admin/panel-forms.scss';

	/** @type {'ok' | 'warn' | 'error'} */
	export let tone = 'ok';
	export let compact = false;
	export let inline = false;
	/** @type {'alert' | 'status' | null | undefined} */
	export let role = undefined;
	/** @type {string | undefined} */
	export let id = undefined;

	const ICONS = { ok: CircleCheck, warn: TriangleAlert, error: CircleAlert };

	$: ariaRole = role === undefined ? (tone === 'error' ? 'alert' : 'status') : role;
	$: tag = inline ? 'span' : 'div';
</script>

<svelte:element
	this={tag}
	class="kv-notice {tone}"
	class:compact={compact || inline}
	class:inline
	role={ariaRole ?? undefined}
	{id}
>
	<svelte:component this={ICONS[tone]} class="kv-notice-icon" size="1.1em" aria-hidden="true" />
	<svelte:element this={tag} class="kv-notice-text"><slot /></svelte:element>
</svelte:element>

<style>
	.kv-notice {
		--notice-bg: var(--ok-bg, var(--3-tint));
		--notice-ink: var(--ok, var(--3-ink));
		display: flex;
		align-items: flex-start;
		gap: var(--space-3xs) var(--space-2xs);
		margin: 0;
		padding: var(--space-2xs) var(--space-xs);
		border-radius: var(--radius-m);
		background: var(--notice-bg);
		color: var(--notice-ink);
		font-weight: 700;
	}
	.kv-notice.warn {
		--notice-bg: var(--warn-bg, var(--4-tint));
		--notice-ink: var(--warn, var(--4-ink));
	}
	.kv-notice.error {
		--notice-bg: var(--error-bg);
		--notice-ink: var(--error);
	}
	/* el ícono, a la altura del primer renglón */
	.kv-notice > :global(.kv-notice-icon) {
		flex: none;
		margin-block-start: 0.15em;
	}
	.kv-notice-text {
		flex: 1;
		min-width: 0;
	}
	.kv-notice-text > :global(:first-child) {
		margin-block-start: 0;
	}
	.kv-notice-text > :global(:last-child) {
		margin-block-end: 0;
	}
	/* compacto: letra normal en el color del texto (se lee mejor en avisos largos); el ícono
	   conserva el color del tono */
	.kv-notice.compact {
		padding: var(--space-3xs) var(--space-2xs);
		border-radius: var(--radius-s);
		color: var(--text, var(--ink));
		font-weight: 400;
		font-size: var(--text-sm);
	}
	.kv-notice.compact > :global(.kv-notice-icon) {
		color: var(--notice-ink);
	}
	.kv-notice.inline {
		display: inline-flex;
		max-width: 100%;
	}
</style>
