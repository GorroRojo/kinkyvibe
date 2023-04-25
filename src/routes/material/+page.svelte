<script>
	//@ts-nocheck
	export let data;
    import Card from '$lib/components/Card.svelte';
</script>

<ul>
	{#each data.posts as post}
	<li>
			[{post.meta.date? new Intl.DateTimeFormat('es-AR').format(new Date(post.meta.date)):"?"}]
			<a href={post.path}>{post.meta.title}</a>
			- {post.meta.authors.join(', ')}
			<ul>
				{#each post.meta.tags as tag}
						<li>{tag}</li>
				{/each}
			</ul>
		</li>
	{/each}
</ul>
