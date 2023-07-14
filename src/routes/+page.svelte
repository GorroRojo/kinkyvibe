<script>
	//@ts-nocheck
	import CardRow from '$lib/components/CardRow.svelte';
	import PostList from '$lib/components/PostList.svelte';
	export let data;
	let { posts, err } = data;
</script>

<main>
	{#if !err}
	<div class="cardrow">
		<CardRow
			index="0"
			id="calendario"
			title="Talleres y eventos"
			items={posts
				.filter((p) => (p.meta.category == 'calendario'))
				.slice(0, 3)}
			--color-1="var(--2-dark)"
			--color-2="var(--1)"
			href="/calendario"
		/>
	</div>
	<div class="cardrow">
		<CardRow
			index="0"
			id="informacion"
			title="Artículos, links y descargables"
			items={posts
				.filter((p) => (p.meta.category == 'material'))
				.slice(0, 3)}
			--color-1="var(--1)"
			--color-2="var(--2-dark)"
			href="/material"
		/>
	</div>
	<div class="cardrow">
		<CardRow
			index="1"
			id="amigues"
			title="Para apoyarnos"
			items={posts
				.filter((p) => (p.meta.category == 'amigues'))
				.slice(0, 3)}
			--color-1="var(--2-dark)"
			--color-2="var(--1)"
			href="/amigues"
		/>
	</div>
		<div id="lista" />
		<PostList posts={posts} />
		<!-- .filter((p) => !(p.meta.start && new Date(p.meta.start).getTime() < Date.now()))} -->
	{:else}
		posts: {JSON.stringify(posts)}
		err: {JSON.stringify(err)}
	{/if}
</main>

<style>
	#lista {
		display:none;
	}
	main {
		/* width: 100%; */
		/* max-width: 50rem; */
		margin: auto;
		display: grid;
		gap: 3rem;
		padding-top: 3rem;
	}
	.cardrow {
		width: 100%;
		max-width: 50rem;
		margin-inline: auto;
	}
	main > * {
		min-width: 0;
		min-height: 0;
	}
</style>
