<script>
	import Navbar from '../components/Navbar.svelte';
</script>

<a href="/">KinkyVibe</a>

<Navbar
	links={[
		{ name: 'Informacion', sub: 'Textos y Materiales', href: '#informacion' },
		{
			name: 'Amigues',
			sub: 'Emprendimientos y Profesionales',
			href: '#amigues'
		},
		{ name: 'Calendario', sub: 'Talleres y Eventos', href: '/calendario' },
		{ name: 'Tienda', sub: 'Juguetes e Implementos', href: '#tienda' },
		{ name: 'Servicios', sub: 'Asesorías y Clases', href: '#servicios' }
	]}
/>
<slot />

<style>
	a {
        color: black;
        display:block;
		font-size: 2em;
		text-align: center;
		width: 100%;
        text-decoration: none;
	}
    :root {
		--1: #ff48c4;
		--2: #6511f8;
		/* 		--3: #1d805f; */
		--3: #2aedab;

		scroll-behavior: smooth;
	}
	:global(*) {
		box-sizing: border-box;
        font-family: 'Lato', sans-serif;
	}
	:global(body) {
		position: relative;
	}
</style>
