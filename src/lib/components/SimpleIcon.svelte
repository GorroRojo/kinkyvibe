<script>
	// @ts-nocheck
	/** Icon data from SimpleIcon's module import
	 * @type {SimpleIcon}
	 */
	export let icon;
</script>

<svg role="img" viewbox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
	<path d={icon.path} />
	<!-- {@html icon.svg.slice(71,-6)} -->
</svg>

<style>
	svg {
		scale: var(--scale, 1);
		translate: var(--translate, 0 0);
		color: var(--color, var(--1));
		fill: var(--color, var(--1));
		/* stroke: var(--color, var(--1)); */
	}
</style>
