<script>
	//@ts-nocheck
	import CardRow from '../components/CardRow.svelte';
	import Navbar from '../components/Navbar.svelte';
	let name = 'world';
</script>

<main>
	<h1>KinkyVibe</h1>

	<Navbar
		links={[
			{ name: 'Informacion', sub: 'Textos y Materiales', href: '#informacion' },
			{
				name: 'Amigues',
				sub: 'Emprendimientos y Profesionales',
				href: '#amigues'
			},
			{ name: 'Calendario', sub: 'Talleres y Eventos', href: '#calendario' },
			{ name: 'Tienda', sub: 'Juguetes e Implementos', href: '#tienda' },
			{ name: 'Servicios', sub: 'Asesorías y Clases', href: '#servicios' }
		]}
	/>
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
	/>
</main>

<style>
	:root {
		--1: #ff48c4;
		--2: #6511f8;
		/* 		--3: #1d805f; */
		--3: #2aedab;

		scroll-behavior: smooth;
	}
	:global(*) {
		box-sizing: border-box;
	}
	:global(body) {
		position: relative;
	}
	main {
		width: 100%;
		max-width: 50rem;
		margin: auto;
	}
	h1 {
		text-align: center;
		width: 100%;
	}
</style>
