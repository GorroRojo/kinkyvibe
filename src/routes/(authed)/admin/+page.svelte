<script>
	import PostList from '$lib/components/PostList.svelte';
	export let data;
</script>
<div class="content">
	<h2>Publicaciones no listadas</h2>
</div>
<PostList posts={data.unlisted_posts} />

<!-- <textarea value={c}></textarea> -->
<!-- <button on:click={save}>Save</button> -->
