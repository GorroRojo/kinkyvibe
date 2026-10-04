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
	} from '@lucide/svelte';
	import Navbar from '$lib/components/Navbar.svelte';
	import { fade } from 'svelte/transition';
	import Footer from '$lib/components/Footer.svelte';
	import logo from '../logo.png';
	import { filteredTags, currentPostData, togglePositiveTagFilterFn } from '$lib/utils/stores';
	import { page } from '$app/stores';
	import AgeModal from '$lib/components/AgeModal.svelte';
	import SearchLauncher from '$lib/components/SearchLauncher.svelte';
	import SearchButton from '$lib/components/SearchButton.svelte';
	import { accountLink } from '$lib/utils/cuentas.js';
	import { breadcrumbLd, sectionCrumb } from '$lib/utils/navigation.js';
	export let data;
	$: cuentaLink = accountLink(data);
	togglePositiveTagFilterFn.update(
		() =>
			function (checked, tag) {
				// PostList mirrors filteredTags into ?tags=
				filteredTags.update((fTags) =>
					checked ? [...fTags.filter((t) => t != tag), tag] : fTags.filter((t) => t != tag)
				);
			}
	);
	// Migas de pan: las visibles y las de datos estructurados salen de lo mismo (sectionCrumb).
	$: onPost = Boolean($currentPostData && $currentPostData.path == $page.url.pathname);
	$: crumb = onPost ? sectionCrumb($currentPostData?.category) : null;
	$: ldBreadcrumb = onPost ? breadcrumbLd($currentPostData?.category, $page.url.origin) : null;
</script>

<svelte:head>
	<link rel="icon" href="/favicon-32x32.png" />
	<meta name="theme-color" content="hsl(319, 90%, 60%)" />
	<meta property="og:url" content={$page.url.href} />
</svelte:head>

<AgeModal />
<SearchLauncher />

<header>
	<div id="me">
		<ul id="redes">
			<!-- el buscador global reemplaza acá al link de Cafecito y a los íconos de
			     Telegram/Instagram (todos siguen en el footer) -->
			<li class="search">
				<SearchButton variant="icon" />
			</li>
			<!-- recursero -->
			<!-- fanzines -->
		</ul>
		<a id="logo" rel="home" href="/">
			<img src={logo} alt="Kinky Vibe" />
		</a>
		<div id="user">
			{#if data.user && data.user !== undefined && data.user.login !== undefined && data.user.login !== ''}
				<!-- loaded on demand: only logged-in admins see it, and it pulls in melt-ui -->
				{#await import('$lib/components/UserMenu.svelte') then { default: UserMenu }}
					<svelte:component this={UserMenu} user={data.user} />
				{/await}
			{:else if data.demoMode}
				<!-- Preview deploys only (docs/demo.md) -->
				<a href="/login?redirectTo=/admin">🧪 Entrar como admin de prueba</a>
				{#if data.cuentas && !data.member}
					<!-- Cuentas del público inventadas (src/lib/server/demo/personas.js) -->
					<a href="/ingresar/demo">🧪 Entrar como persona de prueba</a>
				{/if}
			{:else}
				<a href="https://fondo.kinkyvibe.ar" target="_blank">
					¿Todo gratis?
					<ArrowRight size="18" />
				</a>
				<!-- <a href="/login?redirectTo={$page.url}">Iniciar sesión</a> -->
			{/if}
			{#if cuentaLink}
				<!-- Cuentas del público (docs/cuentas.md): solo con el interruptor prendido -->
				<a class="cuenta" href={cuentaLink.href}>{cuentaLink.label}</a>
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
{#if $page.url.pathname != '/'}
	<div class="breadcrumbs">
		<a href={'/'}>
			{#if !onPost}
				<ArrowLeft size="20" aria-hidden="true" />
			{/if}
			Inicio
		</a>

		{#if crumb}
			{#if ldBreadcrumb}
				<LDTag schema={ldBreadcrumb} />
			{/if}
			<ChevronLeft size="20" aria-hidden="true" />
			<a href={crumb.path}>{crumb.name}</a>
		{/if}
	</div>
{/if}
{#key $page.url.pathname}
	<main in:fade={{ duration: 300, delay: 300 }}>
		<slot />
	</main>
{/key}

<Footer {data} />

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
		padding-inline: var(--space-xs);
		color: var(--2-dark);
		text-decoration: none;
		align-items: center;
		gap: 0.6em;
		justify-content: center;
		margin-top: 1em;
	}
	.breadcrumbs a {
		display: inline-flex;
		align-items: center;
		gap: 0.3em;
		min-height: 2em;
		padding-inline: 0.4em;
		border-radius: var(--round-pill);
		text-decoration: none;
		text-transform: capitalize;
	}
	.breadcrumbs a:hover {
		background: var(--surface);
		color: var(--2-dark);
	}
	.breadcrumbs :global(svg) {
		height: 20px;
		flex: none;
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
	/* `width: 24` (no unit) was always invalid and ignored by browsers; Vite 8's CSS minifier
	   would turn it into 24px and resize every icon, so it's dropped to keep the old rendering. */
	:global(svg) {
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
		box-shadow: var(--shadow-2);
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
		box-shadow: var(--shadow-2);
		/* background: var(--1); */
		/* filter: brightness(1.3); */
	}
	#user a:active {
		scale: 1.05;
		box-shadow: none;
	}
	#user a {
		padding: 0.3em 0.8em;
		min-height: 2.25rem;
		display: flex;
		align-items: center;
		gap: 0.5em;
		border-radius: var(--round-pill);
		font-weight: 700;
		/* background: linear-gradient(125.13deg, #ff009f 6%, #4529ab 100%); */
		background: var(--2);
		max-width: 11em;
	}

	/* discreto: sin el fondo de los otros botones */
	#user a.cuenta {
		background: transparent;
		color: var(--2);
		font-weight: 700;
		padding-inline: 0.4em;
	}
	#user a.cuenta:hover {
		box-shadow: none;
		text-decoration: underline;
	}

	#me li a {
		width: var(--size);
		color: var(--1);
		background: transparent;
		border-radius: 3em;
	}
	#logo {
		grid-area: logo;
	}
	#redes li.search {
		display: grid;
		place-items: center;
	}
	/* en celulares el buscador es el botón flotante (SearchButton variant="fab") */
	@media (max-width: 680px) {
		#redes li.search {
			display: none;
		}
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
	@media (max-width: 680px) {
		/* al menos 44 px de alto para el dedo */
		.breadcrumbs a,
		#user a {
			min-height: var(--tap);
		}
	}
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
	/* muy angosto: solo el logo y el link de la cuenta (Ingresar / Mi rincón), para que siempre se
	   pueda entrar; los otros botones siguen en el menú y el footer */
	@media (max-width: 330px) {
		#me {
			grid-template-columns: auto auto;
			justify-content: center;
		}
		#user > a:not(.cuenta) {
			display: none;
		}
	}
</style>
