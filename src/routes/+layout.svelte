<script>
	import {
		ArrowLeft,
		ArrowRight,
		BookOpen,
		Heart,
		Sparkles,
		CalendarRange,
		ShoppingCart
	} from 'lucide-svelte';
	import { siInstagram, siTelegram } from 'simple-icons';
	import SimpleIcon from '$lib/components/SimpleIcon.svelte';
	import Navbar from '$lib/components/Navbar.svelte';
	import '$lib/styles/style.scss';
	import { fade } from 'svelte/transition';
	import Footer from '$lib/components/Footer.svelte';
	import logo from './logo.png';
	import { filteredTags, tagsConfig } from '$lib/utils/stores';
	// @ts-ignore
	import { navigating } from "$app/stores";
	export let data;
	// onMount(() => {
	tagsConfig.set(data.tagsConfig);
	filteredTags.set([]);
	// });
</script>

<svelte:head>
	<title>KinkyVibe.ar</title>
</svelte:head>
<header>
	<div id="me">
		<ul id="redes">
			<li>
				<a href="https://t.me/BDSMtextos">
					<SimpleIcon icon={siTelegram} />
				</a>
			</li>
			<li>
				<a href="https://www.instagram.com/kinkyvibeargentina/">
					<SimpleIcon icon={siInstagram} />
				</a>
			</li>
			<!-- recursero -->
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
			{ icon: BookOpen, name: 'Material', sub: 'Textos y Materiales', href: '/material' },
			{ icon: Heart, name: 'Amigues', sub: 'Emprendimientos y Profesionales', href: '/amigues' },
			{ icon: CalendarRange, name: 'Calendario', sub: 'Talleres y Eventos', href: '/calendario' },
			{
				icon: ShoppingCart,
				name: 'Tienda',
				sub: 'Juguetes e Implementos',
				href: 'https://kinkyvibe.mitiendanube.com'
			},
			{ icon: Sparkles, name: 'Servicios', sub: 'Asesorías y Clases', href: '/servicios' }
		]}
	/>
</header>
{#if data.currentRoute != '/'}
	<a class="back" href={$navigating?.from?.url ?? '/'}><ArrowLeft size="20" style="translate: 0 .3em" /> Inicio</a>
{/if}
{#key data.currentRoute}
	<main in:fade={{ duration: 300, delay: 300 }}>
		<slot />
	</main>
{/key}
<Footer />

<style>
	#title {
		color: black;
		display: block;
		font-size: 2em;
		text-align: center;
		width: 100%;
		text-decoration: none;
	}
	a.back {
		display: block;
		width: 100%;
		max-width: 800px;
		margin: 0 auto 0em;
		/* padding-left: 1em; */
		color: var(--2);
		text-decoration: none;
	}
	@media (max-width:680px) {
		a.back {
			display:none;
		}
	}
	:global(*:not(code *)) {
		box-sizing: border-box;
		font-family: 'Lato', sans-serif;
	}
	:global(body) {
		position: relative;
		min-height: 99vh;
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
		gap: 0.6em;
		flex-direction: row-reverse;
		justify-content: space-evenly;
		max-width: 20em;
		justify-self: right;
		--color: var(--1);
	}
	:global(svg) {
		width: 24;
		height: 24px;
	}
	#title img {
		max-width: 10vh;
		min-width: 2em;
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
	}
	#redes a:hover {
		scale: 1.1;
		box-shadow: 0 0 0.4em rgba(1, 1, 1, 0.2);
		background: white;
		outline: 5px solid white;
	}

	#quien a {
		color: white;
		text-decoration: none;
		transition: 300ms;
	}
	#quien a:hover {
		scale: 1.1;
		box-shadow: 5px 5px 1em rgba(1, 1, 1, 0.2);
		/* background: var(--1); */
		/* filter: brightness(1.3); */
	}
	#quien a:active {
		scale: 1.05;
		box-shadow: none;
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
