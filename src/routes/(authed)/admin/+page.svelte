<script>
	import PostList from '$lib/components/PostList.svelte';
	export let data;
	let c = atob(data.res ?? '');
	/**
     * @param {any} e
	 */
    function save(e) {
        alert(document.querySelector('textarea')?.value);
	}
</script>

<form method="POST" action="/logout">
    <input type="submit" value="Log out" class="cta"/>
</form>
<div class="content">
	<h2>Publicaciones no listadas</h2>
</div>
<PostList posts={data.unlisted_posts} />
<!-- <textarea value={c}></textarea> -->
<!-- <button on:click={save}>Save</button> -->
