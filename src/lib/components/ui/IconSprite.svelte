<script>
	// Una vez por página (el layout raíz): los íconos de las tarjetas (iconSprite.js).
	import { iconSpriteMarkup } from './iconSprite.js';
</script>

{@html iconSpriteMarkup}

<style>
	/* Lo que Lucide pone como atributos en cada <svg> (el grosor va en cada uno: SpriteIcon). El
	   símbolo hereda trazo, relleno y grosor del <svg> que lo usa. */
	:global(svg.sprite-icon) {
		fill: none;
		stroke: currentColor;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
</style>
