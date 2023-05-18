<script>
	//@ts-nocheck
	import {page} from '$app/stores'
	export let links;
</script>

<nav>
	<ul>
		{#each links as { name, sub, href, current }}
			<li class:current={$page.url.pathname.includes(href)}>
				<a {href}>
					<span>{name}</span>
					<small>{sub}</small>
				</a>
			</li>
		{/each}
	</ul>
</nav>

<style>
	nav ul {
		padding: 0;
		display: flex;
		gap: 1em;
		row-gap: .4em;
		flex-wrap: wrap;
		justify-content: space-around;
		margin-inline: auto;
		max-width: 1000px;
	}

	nav li {
		list-style: none;
		max-width: 11em;
		/* padding-block: 0.4em; */
		width: 100%;
		height: 4em;
	}
	nav a {
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		font-weight: bold;
		color: var(--1);
		font-size: 1.2em;
		flex: 1;
		border: 2px solid var(--1);
		border-radius: 1em;
		background: transparent;
		height: 100%;
		text-decoration: none;
		/* box-shadow: 0 0 .2em rgba(1,1,1,.3); */
		transition: 200ms;
	}
	.current a, .current span {
		border-color: var(--2);
		color: var(--2);
		background: white;
	}
	nav span {
		color: var(--1);
		translate: 0 0.3em;
		transition: 100ms;
		text-decoration: none;
	}

	nav li:hover span {
		translate: 0 0;
	}

	nav li small {
		display: block;
		font-size: 0.6em;
		color: gray;
		font-style: small-caps;
		scale: 0;
		transition: 100ms;
	}
	nav li:hover small {
		scale: 1;
	}
</style>
