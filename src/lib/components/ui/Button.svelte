<script>
	/**
	 * Botón (docs/estilo.md, «Piezas»). Envuelve las clases de siempre: `.kv-btn` en el panel y
	 * `.pill-btn` en el sitio, o `.kv-link` para una acción de texto. Con `href` es un <a>.
	 *
	 * Props:
	 * - `variant`: 'primary' (píldora rosa llena, default) | 'secondary' (blanca con borde rosa) |
	 *   'danger' (rosa oscuro, para lo que se puede deshacer: va con ícono) | 'permanent' (rojo,
	 *   solo lo que no tiene vuelta atrás) | 'link' (texto violeta subrayado, `.kv-link`).
	 * - `size`: 'normal' (44px) | 'small'.
	 * - `icon`: componente de Lucide, adelante del texto.
	 * - `iconOnly`: solo el ícono, redondo. Necesita `label` (va como `aria-label` y `title`).
	 * - `label`: nombre accesible (obligatorio con `iconOnly`).
	 * - `surface`: 'panel' (default, `.kv-btn`) | 'sitio' (`.pill-btn`, fuera del panel).
	 * - `href`, `type` (default 'button'), `disabled`, `busy` (`aria-busy`), `target`, `rel`,
	 *   `title`, `form`, `name`, `value`; `class` suma clases.
	 * Slot default: el texto. Evento: `click` (reenviado).
	 */
	/** @type {'primary' | 'secondary' | 'danger' | 'permanent' | 'link'} */
	export let variant = 'primary';
	/** @type {'normal' | 'small'} */
	export let size = 'normal';
	/** @type {any} */
	export let icon = null;
	export let iconOnly = false;
	/** @type {string | undefined} */
	export let label = undefined;
	/** @type {'panel' | 'sitio'} */
	export let surface = 'panel';
	/** @type {string | undefined} */
	export let href = undefined;
	/** @type {'button' | 'submit' | 'reset'} */
	export let type = 'button';
	export let disabled = false;
	export let busy = false;
	/** @type {string | undefined} */
	export let target = undefined;
	/** @type {string | undefined} */
	export let rel = undefined;
	/** @type {string | undefined} */
	export let title = undefined;
	/** @type {string | undefined} */
	export let form = undefined;
	/** @type {string | undefined} */
	export let name = undefined;
	/** @type {string | undefined} */
	export let value = undefined;
	let className = '';
	export { className as class };

	const VARIANT_CLASS = {
		primary: '',
		secondary: 'ghost',
		danger: 'danger',
		permanent: 'permanent',
		link: ''
	};

	$: base = variant === 'link' ? 'kv-link' : surface === 'sitio' ? 'pill-btn' : 'kv-btn';
	$: classes = [
		base,
		variant === 'link' ? '' : VARIANT_CLASS[variant],
		variant !== 'link' && size === 'small' ? 'small' : '',
		variant !== 'link' && iconOnly ? 'icon' : '',
		className
	]
		.filter(Boolean)
		.join(' ');
	$: iconSize = size === 'small' ? 14 : 16;
	$: a11yLabel = iconOnly ? label : undefined;
	$: hoverTitle = title ?? (iconOnly ? label : undefined);
</script>

{#if href}
	<a
		class={classes}
		href={disabled ? undefined : href}
		aria-disabled={disabled ? 'true' : undefined}
		aria-label={a11yLabel}
		title={hoverTitle}
		{target}
		{rel}
		on:click
		>{#if icon}<svelte:component
				this={icon}
				size={iconSize}
				aria-hidden="true"
			/>{/if}{#if !iconOnly}<slot />{/if}</a
	>
{:else}
	<button
		class={classes}
		{type}
		{disabled}
		{form}
		{name}
		{value}
		aria-busy={busy ? 'true' : undefined}
		aria-label={a11yLabel}
		title={hoverTitle}
		on:click
		>{#if icon}<svelte:component
				this={icon}
				size={iconSize}
				aria-hidden="true"
			/>{/if}{#if !iconOnly}<slot />{/if}</button
	>
{/if}
