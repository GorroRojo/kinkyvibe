<script>
	/**
	 * Un ícono de Lucide del sprite de la página (iconSprite.js, en el layout raíz): se ve igual
	 * que el componente de Lucide (mismas clases, tamaño y grosor), pero el dibujo va una sola vez
	 * por página. Para los íconos que se repiten en las tarjetas de las listas.
	 */
	import { spriteIconId } from './iconSprite.js';
	/** @type {import('./iconSprite.js').SpriteIconName} */
	export let name;
	/** @type {string | number} */
	export let size = 24;
	/** @type {string | number} */
	export let strokeWidth = 2;
	/** @type {string | undefined} */
	export let style = undefined;
</script>

<svg
	class="lucide lucide-{name} lucide-icon sprite-icon"
	width={size}
	height={size}
	viewBox="0 0 24 24"
	stroke-width={strokeWidth}
	aria-hidden="true"
	{style}><use href="#{spriteIconId(name)}" /></svg
>
