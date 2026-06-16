<script>
	import PostList from '$lib/components/PostList.svelte';
	import PushNotificationAdmin from '$lib/components/PushNotificationAdmin.svelte';

	export let data;
</script>
<div class="content">
	<h2>Publicaciones no listadas</h2>
</div>
<PostList posts={data.unlisted_posts} />


<div class="content">
	<PushNotificationAdmin />
</div>
<!-- <textarea value={c}></textarea> -->
<!-- <button on:click={save}>Save</button> -->
