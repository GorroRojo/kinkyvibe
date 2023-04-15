<script>
	//@ts-nocheck
	import CardRow from '$lib/components/CardRow.svelte';
	let name = 'world';
	export let data;
</script>

<main>
	<CardRow
		id="informacion"
		title="Para informarnos"
		items={[
			{
				name: 'The New Topping Book',
				src: 'https://img1.od-cdn.com/ImageType-400/2320-1/32F/D81/AE/%7B32FD81AE-838E-4A39-829A-8315B59B8C3E%7DImg400.jpg',
				tags: ['BDSM', 'Ingles']
			},
			{ name: 'Guia para Bottoms', tags: ['BDSM', 'Guia'], mark: 'nuevo!' },
			{
				name: 'Una pequeña guía rápida de Tipos de Materiales',
				tags: ['BDSM', 'seguridad', 'materiales', 'salud', 'guía']
			}
		]}
		--color-1="var(--2)"
		--color-2="var(--1)"
	/>

	<CardRow
		id="amigues"
		title="Para apoyarnos"
		items={[
			{ name: 'Pastel Dom', mark: 'descuento', tags: ['emprendimiento', 'cuerdas', 'shibari'] },
			{ name: 'Soguita Shibari', tags: ['clases', 'shibari'] },
			{ name: 'KinkyBunny', tags: ['emprendimiento', 'BDSM'] }
		]}
		--color-1="var(--1)"
		--color-2="var(--2)"
	/>

	<CardRow
		id="calendario"
		title="Para encontrarnos"
		items={[
			{ name: 'Taller de Dominación', tags: ['taller', 'Dom', 'BDSM'] },
			{ name: 'Picantearla', tags: ['evento', 'social', 'LGBT+'] },
			{ name: 'Feria Dissidir', mark: 'pronto', tags: ['evento', 'feria', 'LGBT+'] }
		]}
		--color-1="var(--2)"
		--color-2="var(--1)"
		href="/calendario"
	/>
	<ul>
		{#each data.posts as post}
			<li>
				<h2><a href={post.path}>{post.meta.title}</a></h2>
			</li>
		{/each}
	</ul>
</main>

<style>
	main {
		width: 100%;
		max-width: 50rem;
		margin: auto;
	}
</style>
