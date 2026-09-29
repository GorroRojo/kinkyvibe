<script>
	import PostList from '$lib/components/PostList.svelte';
	export let data;
</script>
<div class="content">
	<h2>Eventos</h2>
	<ul class="actions">
		<li>
			<a href="/admin/eventos">📅 Cargar un evento</a>
			<small>duplicar uno anterior o crear uno nuevo</small>
		</li>
		<li>
			<a href="/admin/eventos/importar">📋 Importar desde la planilla</a>
			<small>pegar filas de la planilla y crear varios borradores juntos</small>
		</li>
	</ul>
	<h2>Publicaciones no listadas</h2>
</div>
<PostList posts={data.unlisted_posts} />

<!-- <textarea value={c}></textarea> -->
<!-- <button on:click={save}>Save</button> -->

<style>
	.actions {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75em;
	}
	.actions a {
		font-weight: bold;
	}
	.actions small {
		display: block;
		opacity: 0.8;
	}
</style>
