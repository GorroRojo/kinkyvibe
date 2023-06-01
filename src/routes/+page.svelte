<script>
	//@ts-nocheck
	import CardRow from '$lib/components/CardRow.svelte';
	import PostList from '$lib/components/PostList.svelte';
	export let data;
	let { posts, err } = data;
</script>

<main>
	{#if !err}
		<CardRow
			index="0"
			id="calendario"
			title="Talleres y eventos"
			items={[
				{ name: 'Taller de Dominación', tags: ['taller', 'Dom', 'BDSM'] },
				{ name: 'Picantearla', tags: ['evento', 'social', 'LGBT+'] },
				{ name: 'Feria Dissidir', mark: 'pronto', tags: ['evento', 'feria', 'LGBT+'] }
			]}
			--color-1="var(--2)"
			--color-2="var(--1)"
			href="/calendario"
		/>
		<CardRow
			index="0"
			id="informacion"
			title="Artículos, links y descargables"
			items={posts
				.filter((p) => (p.category = 'material'))
				.slice(0, 3)
				.map((post) => ({
					name: post.meta.title,
					tags: post.meta.tags,
					href: post.path,
					src: post.meta.featured
				}))}
			--color-1="var(--1)"
			--color-2="var(--2)"
			href="/material"
		/>

		<CardRow
			index="1"
			id="amigues"
			title="Para apoyarnos"
			items={[
				{ name: 'Pastel Dom', mark: 'descuento', tags: ['emprendimiento', 'cuerdas', 'shibari'] },
				{ name: 'Soguita Shibari', tags: ['clases', 'shibari'] },
				{ name: 'KinkyBunny', tags: ['emprendimiento', 'BDSM'] }
			]}
			--color-1="var(--2)"
			--color-2="var(--1)"
		/>

		<PostList {posts} />
	{:else}
		{JSON.stringify(posts)}
		{JSON.stringify(err)}
	{/if}
</main>

<style>
	main {
		width: 100%;
		max-width: 50rem;
		margin: auto;
	}
</style>
