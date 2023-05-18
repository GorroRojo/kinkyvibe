<script>
	//@ts-nocheck
	import { ArrowRight } from 'lucide-svelte';
	import { siTiktok, siInstagram, siTwitter } from 'simple-icons';
	import Navbar from '$lib/components/Navbar.svelte';
	import '$lib/styles/style.scss';
	import { fade, fly } from 'svelte/transition';
	import Footer from '$lib/components/Footer.svelte';
	import logo from './logo.png';
	import SimpleIcon from '$lib/components/SimpleIcon.svelte';
	export let data;
</script>

<header>
	<div id="me">
		<ul id="redes">
			<li><a href="/"><SimpleIcon icon={siTiktok} /></a></li>
			<li><a href="/"><SimpleIcon icon={siInstagram} /></a></li>
			<li><a href="/"><SimpleIcon icon={siTwitter} /></a></li>
			<!-- cafecitoapp -->
			<!-- youtube -->
			<!-- recursero -->
			<!-- telegram -->
			<!-- fanzines -->
		</ul>
		<a id="title" href="/">
			<img src={logo} alt="KinkyVibe" />
		</a>
		<div id="quien">
			<a href="/nosotres">Nosotres <ArrowRight size="18" /></a>
		</div>
	</div>
	<Navbar
		links={[
			{ name: 'Informacion', sub: 'Textos y Materiales', href: '/material' },
			{
				name: 'Amigues',
				sub: 'Emprendimientos y Profesionales',
				href: '/amigues'
			},
			{ name: 'Calendario', sub: 'Talleres y Eventos', href: '/calendario' },
			{ name: 'Tienda', sub: 'Juguetes e Implementos', href: 'https://kinkyvibe.mitiendanube.com' },
			{ name: 'Servicios', sub: 'Asesorías y Clases', href: '/servicios' }
		]}
	/>
</header>
{#key data.currentRoute}
	<main in:fly={{ y: 100, duration: 300, delay: 300 }} out:fly={{ y: -30, duration: 300 }}>
		<slot />
	</main>
{/key}
<Footer />

<style lang="scss">
	#title {
		color: black;
		display: block;
		font-size: 2em;
		text-align: center;
		width: 100%;
		text-decoration: none;
	}

	:global(*:not(code *)) {
		box-sizing: border-box;
		font-family: 'Lato', sans-serif;
	}
	:global(body) {
		position: relative;
		min-height: 99vh;
		padding-bottom: 20em;
		box-sizing: border-box;
		/* overflow-y: scroll; */
	}
	:global(html) {
		overflow-x: hidden;
	}
	#me {
		display: grid;
		grid-template-columns: 1fr 0.3fr 1fr;
		/* height: 10em; */
		justify-content: center;
		align-items: center;
		gap: 1em;
		max-width: 800px;
		margin-inline: auto;
		margin-top: 0.5em;
	}
	#redes {
		list-style: none;
		padding: 0;
		/* padding-right: 1em; */
		display: flex;
		gap: 0.3em;
		flex-direction: row-reverse;
		justify-content: space-evenly;
		max-width: 10em;
		justify-self: right;
	}
	:global(svg) {
		width: 24;
		height: 24px;
	}
	#title {
		font-size: 2.5em;
		height: 100%;
		img {
			height: 100%;
			max-width: 100%;
			object-fit: contain;
			object-position: center;
		}
	}
	#quien {
		justify-self: left;
		font-size: 0.9em;
	}
	#quien a,
	#redes a {
		--size: 1.5em;
		height: var(--size);
		font-size: 1.2em;
		/* translate: 0 0.1em; */
	}
	#redes a {
		display: grid;
		place-content: center;
		background: transparent;
		outline: 0;
		transition: 100ms;
		&:hover {
			scale: 1.1;
			box-shadow: 0 0 0.4em rgba(1, 1, 1, 0.2);
			background: white;
			outline: 5px solid white;
		}
	}
	#quien a {
		color: white;
		text-decoration: none;
		transition: 300ms;
		&:hover {
			scale: 1.1;
			box-shadow: 5px 5px 1em rgba(1, 1, 1, 0.2);
			/* background: var(--1); */
			/* filter: brightness(1.3); */
		}
		&:active {
			scale: 1.05;
			box-shadow: none;
		}
	}
	#quien a {
		padding-inline: 0.6em;
		display: flex;
		align-items: center;
		gap: 0.5em;
		border-radius: 3em;
		/* background: linear-gradient(125.13deg, #ff009f 6%, #4529ab 100%); */
		background: var(--2);
		max-width: 10em;
	}

	#me li a {
		width: var(--size);
		color: hotpink;
		background: transparent;
		border-radius: 3em;
	}
</style>
