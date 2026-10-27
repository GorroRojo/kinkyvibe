<script>
	import LDTag from '$lib/components/LDTag.svelte';
	import {
		ArrowLeft,
		ArrowRight,
		BookOpen,
		Heart,
		CalendarRange,
		ShoppingCart,
		ChevronRight,
		Globe
	} from '@lucide/svelte';
	import Navbar from '$lib/components/Navbar.svelte';
	import { fade } from 'svelte/transition';
	import Footer from '$lib/components/Footer.svelte';
	import logo from '../logo.png';
	import { filteredTags, togglePositiveTagFilterFn } from '$lib/utils/stores';
	import { page } from '$app/stores';
	import AgeModal from '$lib/components/AgeModal.svelte';
	import LoadingBar from '$lib/components/LoadingBar.svelte';
	import SearchLauncher from '$lib/components/SearchLauncher.svelte';
	import SearchButton from '$lib/components/SearchButton.svelte';
	import { accountLink } from '$lib/utils/cuentas.js';
	import {
		breadcrumbLd,
		ownBackLink,
		sectionCrumb,
		sectionFromRouteId
	} from '$lib/utils/navigation.js';
	import { browser } from '$app/environment';
	import { applyAccountSpeedChange, initReadingSpeed } from '$lib/utils/readingSpeed.js';
	export let data;
	// La velocidad de lectura de la persona (la de la cuenta gana sobre la del navegador), después de
	// hidratar: el servidor ya dibujó los minutos de siempre. $lib/utils/readingSpeed.js. Solo
	// cuando cambia lo de la cuenta (al entrar, salir o guardar en Mi rincón): `data` cambia en cada
	// navegación y no tiene que pisar lo que se acaba de elegir en la explicación.
	/** @type {unknown} */
	let appliedAccountSpeed;
	let appliedMember = false;
	let speedStarted = false;
	$: if (browser) applyAccountSpeed(data.readingSpeed, Boolean(data.member));
	/** @param {unknown} value @param {boolean} member */
	function applyAccountSpeed(value, member) {
		if (speedStarted && value === appliedAccountSpeed && member === appliedMember) return;
		if (!speedStarted) initReadingSpeed(value);
		else
			applyAccountSpeedChange({
				previous: appliedAccountSpeed,
				next: value,
				sameMember: member && appliedMember
			});
		speedStarted = true;
		appliedAccountSpeed = value;
		appliedMember = member;
	}
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
	// Migas de pan: las visibles y las de datos estructurados salen de lo mismo (sectionCrumb), y
	// la sección sale de la ruta, así ya están en el HTML del servidor (antes las ponía un store que
	// la página llenaba tarde, y en el servidor era estado compartido entre pedidos).
	$: section = sectionFromRouteId($page.route?.id);
	$: onPost = Boolean(section);
	$: crumb = sectionCrumb(section);
	// «Salir» (Mi rincón o el encabezado) vuelve al inicio con ?salida=1: un aviso corto.
	let closedNotice = false;
	$: loggedOut = !closedNotice && !data.member && $page.url.searchParams.get('salida') === '1';
	$: ldBreadcrumb = breadcrumbLd(section, $page.url.origin);
	// La página nueva aparece con un fundido corto y sin espera: antes eran 300 ms de espera más
	// 300 ms de fundido, más de medio segundo en blanco en cada navegación. Con «reducir
	// movimiento» activado en el sistema, sin fundido.
	const pageFade = {
		duration: browser && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 150
	};
</script>

<svelte:head>
	<link rel="icon" href="/favicon-32x32.png" />
	<meta name="theme-color" content="hsl(262, 90%, 60%)" />
</svelte:head>

<!-- Mientras carga la página siguiente (si tarda más de 150 ms), una barrita arriba. -->
<LoadingBar />
<AgeModal />
<SearchLauncher />

{#if data.demoMode && !(data.user && data.user.login)}
	<!-- Preview deploys only (docs/demo.md): afuera del encabezado, en una esquina, así no le
	     saca lugar (pedido de gorrite, 5/10) -->
	<nav class="demo-bar" aria-label="Modo demo">
		<span aria-hidden="true">🧪</span>
		<span>Entrar como</span>
		<a href="/login?redirectTo=/admin">admin de prueba</a>
		{#if !data.member}
			<!-- Cuentas del público inventadas (src/lib/server/demo/personas.js) -->
			<a href="/ingresar/demo">persona de prueba</a>
		{/if}
	</nav>
{/if}

<header data-sitio>
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
			<!-- width y height: las medidas del PNG, así el lugar queda reservado antes de que llegue
			(el CSS lo achica con height: auto, sin cambiar cómo se ve). -->
			<img src={logo} alt="Kinky Vibe" width="199" height="192" />
		</a>
		<div id="user">
			{#if data.user && data.user !== undefined && data.user.login !== undefined && data.user.login !== ''}
				<!-- loaded on demand: only logged-in admins see it, and it pulls in melt-ui -->
				{#await import('$lib/components/UserMenu.svelte') then { default: UserMenu }}
					<svelte:component this={UserMenu} user={data.user} />
				{/await}
			{/if}
			<!-- El Fondo: a la vista para todes, también en los previews; con la sesión de admin
			     abierta no hace falta (pedido de gorrite, 5/10) -->
			{#if !data.user?.admin}
				<a href="https://fondo.kinkyvibe.ar" target="_blank">
					¿Todo gratis?
					<ArrowRight size="18" />
				</a>
			{/if}
			{#if cuentaLink}
				<!-- Cuentas del público (docs/cuentas.md) -->
				<a class="cuenta" href={cuentaLink.href}>{cuentaLink.label}</a>
			{/if}
			{#if data.member}
				<!-- «Salir» también acá, no solo al final de Mi rincón -->
				<form method="POST" action="/mi-rincon?/salir">
					<button class="cuenta" type="submit">Salir</button>
				</form>
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
{#if $page.url.pathname != '/' && !ownBackLink($page.url.pathname)}
	<!-- «Inicio › Calendario» (la flecha apunta hacia adentro, como se lee). -->
	<nav class="breadcrumbs" aria-label="Migas de pan">
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
			<ChevronRight size="20" aria-hidden="true" />
			<a href={crumb.path}>{crumb.name}</a>
		{/if}
	</nav>
{/if}
{#if loggedOut}
	<p class="salida" role="status">
		Saliste de tu cuenta.
		<button type="button" class="kv-link" on:click={() => (closedNotice = true)}>Cerrar</button>
	</p>
{/if}
{#key $page.url.pathname}
	<main in:fade={pageFade}>
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
	/* Desde 2023 todo `svg` del sitio mide 24px de alto. Nació para los íconos de redes
	   (SimpleIcon.svelte, que no traían tamaño; ahora lo tienen ellos), pero el resto de los íconos
	   del sitio ya se acomodó a esa caja, así que se mantiene igual en las páginas públicas. Antes
	   era un `svg` suelto: como el CSS de una página queda cargado al navegar sin recargar, se
	   colaba en el panel si se entraba desde el sitio. Ahora vale solo mientras este layout está
	   en pantalla (su encabezado tiene `data-sitio`); el `:where` deja la especificidad de un `svg`
	   suelto, así que las reglas propias de cada componente siguen ganando.
	   (`width: 24`, sin unidad, nunca valió y el minificador de Vite 8 lo volvería 24px: no va.) */
	:global(:where(body:has(header[data-sitio])) svg) {
		height: 24px;
	}
	#logo img {
		max-width: 10vh;
		min-width: 2em;
		height: auto;
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

	.demo-bar {
		position: fixed;
		left: var(--space-xs);
		bottom: var(--space-xs);
		z-index: 6;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0 var(--space-2xs);
		max-width: calc(100% - 2 * var(--space-xs));
		padding: var(--space-3xs) var(--space-xs);
		border-radius: var(--radius-pill);
		background: var(--2-tint);
		color: var(--2-dark);
		font-size: var(--text-xs);
		box-shadow: var(--shadow-1);
	}
	/* en el celu, arriba de la barra de navegación de abajo */
	@media (max-width: 680px) {
		.demo-bar {
			bottom: calc(6rem + env(safe-area-inset-bottom, 0px));
		}
	}
	.demo-bar a {
		color: var(--2-dark);
		font-weight: 700;
	}
	.salida {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2xs);
		width: min(40rem, calc(100% - 32px));
		margin: var(--space-2xs) auto 0;
		padding: var(--space-2xs) var(--space-xs);
		border-radius: var(--radius-s);
		background: var(--3-tint);
		color: var(--3-ink);
		font-weight: 700;
	}
	.salida .kv-link {
		min-height: var(--tap);
	}
	#user form {
		display: contents;
	}
	/* discreto: sin el fondo de los otros botones */
	#user button.cuenta {
		border: 0;
		background: transparent;
		color: var(--2);
		font: inherit;
		font-size: 1.2em;
		font-weight: 700;
		min-height: var(--tap);
		padding-inline: 0.4em;
		cursor: pointer;
	}
	#user button.cuenta:hover {
		text-decoration: underline;
	}
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
