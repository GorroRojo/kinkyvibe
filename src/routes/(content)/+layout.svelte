<script>
	import LDTag from '$lib/components/LDTag.svelte';
	import {
		ArrowLeft,
		ArrowRight,
		BookOpen,
		Heart,
		CalendarRange,
		ShoppingCart,
		ChevronLeft,
		Globe
	} from 'lucide-svelte';
	import { siInstagram, siTelegram, siKofi } from 'simple-icons';
	import SimpleIcon from '$lib/components/SimpleIcon.svelte';
	import Navbar from '$lib/components/Navbar.svelte';
	import { fade, fly } from 'svelte/transition';
	import Footer from '$lib/components/Footer.svelte';
	import logo from '../logo.png';
	import { filteredTags, currentPostData, togglePositiveTagFilterFn } from '$lib/utils/stores';
	import { page } from '$app/stores';
	import AgeModal from '$lib/components/AgeModal.svelte';
	import UserMenu from '$lib/components/UserMenu.svelte';
	export let data;
	togglePositiveTagFilterFn.update(
		() =>
			function (checked, tag) {
				if (checked) {
					filteredTags.update((fTags) => [...fTags, tag]);
				} else {
					filteredTags.update((fTags) => [
						...fTags.slice(0, fTags.indexOf(tag)),
						...fTags.slice(fTags.indexOf(tag) + 1)
					]);
				}
				$page.url.searchParams.set('tags', $filteredTags.join(','));
				if ($filteredTags.length > 0) {
					window.history.pushState('', '', `?${$page.url.searchParams.toString()}`);
				} else {
					$page.url.searchParams.delete('tags');
					window.history.replaceState('', '', $page.url);
				}
			}
	);
	/**@type (cat: string)=>(LD.BreadcrumbList & {"@context": string})*/
	let ldBreadcrumb = (cat) => ({
		'@context': 'https://schema.org',
		'@type': 'BreadcrumbList',
		itemListElement: [
			{
				'@type': 'ListItem',
				position: 1,
				name:
					cat == 'wiki' ? 'Kinkipedia' : cat ?? '',
				item: 'https://example.com/books'
			}
		]
	});
</script>

<svelte:head>
	<link rel="icon" href="/favicon-32x32.png" />
	<meta name="theme-color" content="hsl(319, 90%, 60%)" />
	<meta property="og:url" content={$page.url.href} />
</svelte:head>

<AgeModal />

<header>
	<div id="me">
		<ul id="redes">
			<li>
				<a href="https://cafecito.app/kinkyvibe" target="_blank">
					<SimpleIcon icon={siKofi} />
				</a>
			</li>
			<li>
				<a href="https://t.me/BDSMtextos" target="_blank">
					<SimpleIcon icon={siTelegram} />
				</a>
			</li>
			<li>
				<a href="https://www.instagram.com/kinkyvibeargentina/" target="_blank">
					<SimpleIcon icon={siInstagram} />
				</a>
			</li>
			<!-- recursero -->
			<!-- fanzines -->
		</ul>
		<a id="logo" rel="home" href="/">
			<img src={logo} alt="KinkyVibe" />
		</a>
		<div id="user">
			{#if data.user && data.user !== undefined && data.user.login !== undefined && data.user.login !== ''}
				<UserMenu user={data.user} />
			{:else}
				<a href="/amigues/KinkyVibe">
					Nuestros servicios
					<ArrowRight size="18" />
				</a>
				<!-- <a href="/login?redirectTo={$page.url}">Iniciar sesión</a> -->
			{/if}
		</div>
	</div>
	<div>
		<Navbar
			links={[
				{ icon: BookOpen, name: 'Material', sub: 'Textos y Materiales', href: '/material' },
				{ icon: Heart, name: 'Amigues', sub: 'Emprendimientos y Profesionales', href: '/amigues' },
				{ icon: CalendarRange, name: 'Calendario', sub: 'Talleres y Eventos', href: '/calendario' },
				{
					icon: ShoppingCart,
					name: 'Tienda',
					sub: 'Juguetes e Implementos',
					href: 'https://tienda.kinkyvibe.ar',
					target: '_blank'
				},
				{ icon: Globe, name: 'Kinkipedia', sub: 'Enciclopedia Fetichista', href: '/wiki' }
			]}
		/>
	</div>
</header>
{#if data.currentRoute != '/'}
	<div class="breadcrumbs">
		<a href={'/'}>
			{#if !($currentPostData && $currentPostData.path == $page.url.pathname)}
				<ArrowLeft size="20" style="translate: 0 .4em" />
			{/if}
			Inicio
		</a>

		{#if $currentPostData && $currentPostData.path == $page.url.pathname}
			<LDTag schema={ldBreadcrumb($currentPostData?.category)} />
			<ChevronLeft size="20" style="translate: 0 .4em" />
			<a href={'/' + $currentPostData.category}
				>{$currentPostData.category == 'wiki' ? 'Kinkipedia' : $currentPostData.category}</a
			>
		{/if}
	</div>
{/if}
{#key data.currentRoute}
	<main in:fade={{ duration: 300, delay: 300 }}>
		<slot />
	</main>
{/key}

<Footer />

<style>
	#user {
		/* position: absolute */
	}
	/* header {
		display: grid;
        grid-template-columns: 12em 1fr 10em 5em;
		max-width: 50rem;
		margin-inline: auto;
		height: 3em;
		align-items: center;
        justify-content: space-between;
        align-content: center;
	} */

	#logo {
		color: black;
		display: block;
		text-align: center;
		width: 100%;
		max-height: 10rem;
		text-decoration: none;
	}
	.breadcrumbs {
		display: flex;
		width: 100%;
		max-width: 50rem;
		margin: 0 auto 1.4em;
		/* padding-left: 1em; */
		color: var(--2);
		text-decoration: none;
		align-items: baseline;
		gap: 1em;
		justify-content: center;
		margin-top: 1em;
	}
	.breadcrumbs a {
		text-decoration: none;
		text-transform: capitalize;
	}
	#me {
		display: grid;
		grid-template-areas: 'redes logo user';
		grid-template-columns: 1fr 0.3fr 1fr;
		/* height: 10em; */
		justify-content: center;
		align-items: center;
		gap: 1em;
		max-width: 50rem;
		margin-inline: auto;
		margin-top: 0.5em;
	}
	#me > * {
		/* min-width: 0; */
		max-width: 100%;
	}
	#redes {
		grid-area: redes;
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
	#logo img {
		max-width: 10vh;
		min-width: 2em;
	}
	#user {
		grid-area: user;
		justify-self: left;
		font-size: 0.9em;
		display: flex;
		gap: 0.5em;
		align-items: center;
		text-align: center;
		/* color royalblue */
	}
	#user a,
	#redes a {
		--size: 1.5em;
		/* height: var(--size); */
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

	#user a {
		color: white;
		text-decoration: none;
		transition: 300ms;
	}
	#user a:hover {
		scale: 1.1;
		box-shadow: 5px 5px 1em rgba(1, 1, 1, 0.2);
		/* background: var(--1); */
		/* filter: brightness(1.3); */
	}
	#user a:active {
		scale: 1.05;
		box-shadow: none;
	}
	#user a {
		padding-inline: 0.6em;
		display: flex;
		align-items: center;
		gap: 0.5em;
		border-radius: 3em;
		/* background: linear-gradient(125.13deg, #ff009f 6%, #4529ab 100%); */
		background: var(--2);
		max-width: 11em;
	}

	#me li a {
		width: var(--size);
		color: hotpink;
		background: transparent;
		border-radius: 3em;
	}
	#logo {
		grid-area: logo;
	}
	@media (min-width: 1380px) {
		header {
			display: flex;
			justify-content: stretch;
			padding-inline: 2em;
		}
		header > * {
			flex: 1 1;
			width: 100%;
		}
		#me {
			margin-inline: 0;
			grid-template-areas: 'redes logo user';
			grid-template-columns: 10em auto auto;
		}
		.breadcrumbs {
			margin-block: 0 1.5em;
		}
	}
	/* @media (max-width: 580px) {
		#me {
			grid-template-areas: 'logo user redes';
			grid-template-columns: 0.3fr auto 1fr;
			justify-content: center;
			justify-items: center;
			padding-inline: 1em;
		}
		#redes {
			justify-self: unset;
			justify-content: center;
		}
		#user {
			justify-self: unset;
		}
	} */
	@media (max-width: 500px) {
		#me {
			grid-template-areas: 'logo user';
			grid-template-columns: 0.3fr auto;
			flex-wrap: wrap;
			max-width: 100%;
		}
		#redes {
			display: none;
		}
	}
	@media (max-width: 330px) {
		#me {
			grid-template-areas: 'logo';
			grid-template-columns: 1fr;
		}
		#user {
			display: none;
		}
	}
</style>
