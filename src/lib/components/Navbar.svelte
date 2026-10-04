<script>
	//@ts-nocheck
	import { currentPostData } from './../utils/stores.js';
	import { page } from '$app/stores';
	import SearchButton from './SearchButton.svelte';
	import { isSectionActive } from '$lib/utils/navigation.js';
	export let links;
</script>

<nav>
	<ul>
		{#each links as { icon, name, sub, href, target = undefined }}
			<li
				class:current={isSectionActive($page.url.pathname, href) ||
					($currentPostData &&
						$currentPostData?.path == $page?.url?.pathname &&
						$currentPostData?.category == href.slice(1))}
			>
				<a {href} {target} tabindex="0">
					<span>
						<span><svelte:component this={icon} size="1em" /></span>
						{name}
					</span>
					<small>{sub}</small>
				</a>
			</li>
		{/each}
	</ul>
	<SearchButton variant="fab" />
</nav>

<style lang="scss">
	nav {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1em;
		margin-inline: auto;
		padding-inline: 1em;
		max-width: calc(1000px + 7em);
	}
	nav ul {
		padding: 0;
		display: flex;
		row-gap: 0.4em;
		justify-content: center;
		margin-inline: 0;
		flex: 1 1 auto;
		min-width: 0;
		max-width: 1000px;
	}

	nav li {
		list-style: none;
		max-width: 11em;
		/* padding-block: 0.4em; */
		width: 100%;
		height: 4em;
	}
	nav a {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		font-weight: bold;
		color: var(--1);
		font-size: 1.2em;
		flex: 1;
		/* border: 2px solid var(--1); */
		/* border-radius: 1em; */
		background: transparent;
		height: 100%;
		text-decoration: none;
		/* box-shadow: 0 0 .2em rgba(1,1,1,.3); */
		transition: 200ms;
		max-width: 20vw;
		overflow-x: visible;
		border-radius: var(--radius-m);

		& > span > span {
			position: relative;
			top: 0.2em;
			margin-right: 0.3em;
		}
	}

	/* «Estás acá»: violeta sobre lila (la misma regla que el panel). */
	.current span {
		color: var(--2-dark);
		--color: var(--2-dark);
	}
	.current a {
		background: var(--2-tint);
	}
	nav a span {
		--color: var(--1);
		color: var(--color);
		translate: 0 0.3em;
		transition: 100ms;
		text-decoration: none;
	}

	nav li:hover span,
	nav a:focus span {
		translate: 0 0;
	}
	nav a:focus {
		outline: 2px solid var(--color);
		border: 0;
	}

	nav li small {
		display: block;
		font-size: 0.6em;
		color: gray;
		scale: 0;
		transition: 100ms;
		white-space: nowrap;
	}
	nav li:hover small,
	nav a:focus small {
		scale: 1;
	}
	/* 681–1024px: menú más compacto para que ninguna etiqueta se parta en dos líneas */
	@media screen and (min-width: 681px) and (max-width: 1024px) {
		nav {
			gap: 0.5em;
			padding-inline: 0.5em;
		}
		nav a {
			font-size: clamp(0.95em, 0.55em + 0.9vw, 1.2em);
			max-width: none;
			white-space: nowrap;
		}
	}
	@media screen and (max-width: 680px) {
		nav {
			position: fixed;
			bottom: 0;
			left: 0;
			right: 0;
			/* los 5 ítems reparten el ancho (el buscador es un FAB aparte, ver SearchButton) */
			gap: 0.25em;
			max-width: none;
			padding-inline: 0.5em max(0.5em, env(safe-area-inset-right));
			z-index: 2;
			background: var(--surface);
			/* lugar para la barra de gestos del celu */
			padding-bottom: env(safe-area-inset-bottom, 0px);
			font-size: 1em;
			ul {
				flex-wrap: nowrap;
				gap: 0.25em;
				li {
					flex: 1 1 0;
					min-width: 0;
					width: auto;
					height: 4em;
					&:hover span,
					a:hover span,
					a:focus {
						outline: none;
						span {
							translate: 0 0.3em;
						}
					}
					/* &.current, */
					&.current {
						a {
							box-shadow: none;
						}
						span span {
							scale: 2;
							translate: 0 0.2em;
						}
					}
					a {
						border: 0;
						span {
							display: flex;
							flex-direction: column;
							/* width: 100%; */
							justify-items: center;
							align-items: center;
							font-size: 0.8em;

							span {
								color: var(--color);
								font-size: 1.2em;
								scale: 1.5;
								top: -1rem;
								margin-right: 0;
							}
						}
						small {
							display: none;
						}
					}
				}
			}
		}
	}
	/* 341–400px: etiquetas un poco más chicas para que entren junto al botón de búsqueda */
	@media screen and (max-width: 400px) {
		nav ul li a > span {
			font-size: 0.7em;
			letter-spacing: -0.01em;
			& > span {
				font-size: 1.37em;
			}
		}
	}
	@media screen and (max-width: 340px) {
		nav ul li a span {
			color: transparent;
		}
		nav ul li a span span {
			top: -0.3em;
			scale: 2;
		}
		.current span span {
			top: -0.7em;
		}
		.current span,
		nav a:focus span,
		nav li:hover span {
			translate: 0 0.4em;
		}
	}
</style>
