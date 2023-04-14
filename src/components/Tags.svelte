<script>
	// @ts-nocheck
	export let tags = [];
	export let ref;
</script>

<ul {ref}>
	{#each tags as tag}
		<li>{tag}</li>
	{/each}
</ul>

<style>
	ul {
		display: flex;
		gap: 0.2em;
		font-size: 0.8em;
		padding: 0 0.4em;
		overflow-x: scroll;
		overflow-y: hidden;
		/* 		width: 100%; */
	}
	ul::-webkit-scrollbar {
		display: none;
	}
	li {
		display: block;
		padding: 0.5em;
		border-radius: 3em;
		background: var(--color, var(--1));
		color: white;
	}
</style>
