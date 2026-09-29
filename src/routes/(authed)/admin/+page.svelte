<script>
	import PostList from '$lib/components/PostList.svelte';
	export let data;
</script>

<div class="content">
	<p>
		<a href="/admin/eventos">📅 Cargar un evento</a>
		<small>(duplicar uno anterior o crear uno nuevo)</small>
	</p>
	<h2>Entradas</h2>
	<p>
		<a href="/admin/entradas">Venta de entradas</a>: ventas por evento, órdenes, transferencias
		pendientes, exportar CSV y control de ingreso con QR.
	</p>
	<p>
		<a href="/admin/entradas/codigos">Códigos de descuento</a>: crear, activar/desactivar y ver
		cuántas veces se usó cada uno.
	</p>
	<p>
		<a href="/admin/entradas/ajustes">Ajustes de venta</a>: datos para transferir (alias, CBU/CVU,
		titular, banco) y comisión de Mercado Pago.
	</p>
	<h2>Publicaciones no listadas</h2>
</div>
<PostList posts={data.unlisted_posts} />

<!-- <textarea value={c}></textarea> -->
<!-- <button on:click={save}>Save</button> -->
