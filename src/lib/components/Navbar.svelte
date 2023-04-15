<script>
	//@ts-nocheck
	export let links;
</script>

<nav>
	<ul>
		{#each links as { name, sub, href }}
			<li>
				<a {href}>{name}</a>
				<small>{sub}</small>
			</li>
		{/each}
	</ul>
</nav>

<style>
	a {
		color: var(--1);
	}
	nav ul {
		padding: 0;
		display: flex;
		gap: 1em;
		flex-wrap: wrap;
		justify-content: space-around;
	}

	nav li {
		list-style: none;
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		font-weight: bold;
		max-width: 10em;
		color: var(--1);
		font-size: 1.2em;
		flex: 1;
	}

	nav li small {
		display: block;
		font-size: 0.6em;
		color: gray;
		font-style: small-caps;
	}
</style>
