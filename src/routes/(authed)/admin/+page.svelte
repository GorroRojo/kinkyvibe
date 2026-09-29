<script>
	import PostList from '$lib/components/PostList.svelte';
	export let data;
</script>
<div class="content">
	<h2>Entradas</h2>
	<p>
		<a href="/admin/entradas">Venta de entradas</a>: ventas por evento, órdenes, exportar CSV y control
		de ingreso con QR.
	</p>
	<h2>Publicaciones no listadas</h2>
</div>
<PostList posts={data.unlisted_posts} />

<!-- <textarea value={c}></textarea> -->
<!-- <button on:click={save}>Save</button> -->
