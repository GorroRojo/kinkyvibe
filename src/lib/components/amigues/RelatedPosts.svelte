<script>
	/**
	 * "Más cosas de …" al pie de un perfil: las publicaciones relacionadas que manda el servidor
	 * (sin eventos pasados) y, si quien mira eligió ver los pasados, las busca todas en el
	 * navegador. Lo usan las fichas .md y los perfiles de la base.
	 * Props: `meta` (lo que usa `relatedPostsFor`: `category`, `postID`, `title`, `authors`),
	 * `relatedPosts`, `relatedPastCount`.
	 */
	import PostList from '$lib/components/PostList.svelte';
	import { userConfig } from '$lib/utils/stores.js';
	import { fetchAllPostsClient, relatedPostsFor } from '$lib/utils/allPosts';

	/** @type {any} */
	export let meta;
	/** @type {ProcessedPost[]} */
	export let relatedPosts = [];
	export let relatedPastCount = 0;

	let posts = relatedPosts;
	let loadedPast = false;
	$: if ($userConfig.show_past_events && relatedPastCount > 0 && !loadedPast) {
		loadedPast = true;
		fetchAllPostsClient()
			.then((all) => (posts = relatedPostsFor(meta, all)))
			.catch(() => (loadedPast = false));
	}
	$: relatedAuthors = [...new Set([meta.postID, ...(meta.authors ?? [])])];
</script>

{#if posts.length > 0 || relatedPastCount > 0}
	<div class="content">
		<h3>
			Más cosas de
			{relatedAuthors.length == 1
				? relatedAuthors[0]
				: [relatedAuthors.slice(0, -1).join(', '), relatedAuthors.slice(-1)[0]].join(' o ')}
		</h3>
	</div>
	<PostList {posts} />
{/if}
