<script>
	//@ts-nocheck
	export let src;
	export let alt;
</script>

<img class="cimg" {src} alt={alt ?? ''} />

<style>
	img {
		margin-inline: auto;
		position: relative;
		width: 100%;
		object-fit: contain;
		border-radius: 1em;
	}
</style>
