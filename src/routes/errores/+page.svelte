<script>
	const PAGES = [
		{ status: 401, label: 'Hay que iniciar sesión' },
		{ status: 403, label: 'Sin permiso' },
		{ status: 404, label: 'La página no existe' },
		{ status: 400, label: 'Otro error del pedido (4xx)' },
		{ status: 500, label: 'Error del sitio (5xx)' }
	];
</script>

<svelte:head>
	<title>Páginas de error · KinkyVibe</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="content">
	<h1>Páginas de error</h1>
	<p>Vista previa de lo que ve alguien cuando algo sale mal.</p>
	<ul>
		{#each PAGES as { status, label }}
			<li><a href="/errores/{status}">{status}</a> · {label}</li>
		{/each}
	</ul>
</div>
