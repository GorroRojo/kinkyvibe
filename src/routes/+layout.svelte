<script>
	import Navbar from '$lib/components/Navbar.svelte';
	import '$lib/styles/style.scss';
	import { fade } from 'svelte/transition';
	export let data;
</script>
<header>
	<a href="/">KinkyVibe</a>
	<Navbar
		links={[
			{ name: 'Informacion', sub: 'Textos y Materiales', href: '/material' },
			{
				name: 'Amigues',
				sub: 'Emprendimientos y Profesionales',
				href: '#amigues'
			},
			{ name: 'Calendario', sub: 'Talleres y Eventos', href: '/calendario' },
			{ name: 'Tienda', sub: 'Juguetes e Implementos', href: 'https://kinkyvibe.mitiendanube.com' },
			{ name: 'Servicios', sub: 'Asesorías y Clases', href: '#' }
		]}
	/>
</header>
{#key data.currentRoute}
	<main in:fade={{ delay: 100, duration: 100 }} out:fade={{ duration: 100 }}>
		<slot />
	</main>
{/key}

<style>
	a {
		color: black;
		display: block;
		font-size: 2em;
		text-align: center;
		width: 100%;
		text-decoration: none;
	}

	:global(*) {
		box-sizing: border-box;
		font-family: 'Lato', sans-serif;
	}
	:global(body) {
		position: relative;
	}
</style>
