<script>
	//@ts-nocheck
	import { currentPostData, searchOpen } from './../utils/stores.js';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { Search } from '@lucide/svelte';
	export let links;
	let shortcut = ['Ctrl', 'K'];
	onMount(() => {
		if (/Mac|iPhone|iPad/.test(navigator.platform)) shortcut = ['⌘', 'K'];
	});
</script>

<nav>
	<ul>
		{#each links as { icon, name, sub, href, target = undefined }}
			<li
				class:current={$page.url.pathname.includes(href) ||
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
	<!-- Buscador global: botón redondo aparte, no un ítem más del menú -->
	<button
		type="button"
		class="search-btn"
		data-search-trigger
		aria-label="Buscar (Ctrl+K)"
		aria-haspopup="dialog"
		aria-keyshortcuts="Control+K Meta+K"
		on:click={() => searchOpen.set(true)}
	>
		<Search size="1.35em" strokeWidth={2.5} aria-hidden="true" />
		<span class="tip" aria-hidden="true">
			Buscar en todo el sitio
			<span class="keys">
				{#each shortcut as key}<kbd>{key}</kbd>{/each}
			</span>
		</span>
	</button>
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
		border-radius: 1em;

		& > span > span {
			position: relative;
			top: 0.2em;
			margin-right: 0.3em;
		}
	}

	.current span {
		color: var(--2);
		--color: var(--2);
	}
	.current a {
		background: white;
		box-shadow: 0 0 0.5em rgba(1, 1, 1, 0.1);
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
	/* Botón del buscador global: círculo aparte, distinto de los ítems del menú */
	.search-btn {
		position: relative;
		flex: none;
		display: grid;
		place-items: center;
		width: 3.25rem;
		height: 3.25rem;
		padding: 0;
		font: inherit;
		border-radius: 50%;
		border: 2px solid var(--1);
		background: white;
		color: var(--1);
		box-shadow: 0 0.15em 0.6em rgba(0, 0, 0, 0.1);
		transition:
			background-color 150ms,
			color 150ms,
			scale 150ms;
		&:hover {
			background: var(--1);
			color: white;
			scale: 1.06;
		}
		&:active {
			scale: 0.96;
		}
		&:focus-visible {
			outline: 3px solid var(--2);
			outline-offset: 3px;
		}
	}
	.tip {
		position: absolute;
		top: calc(100% + 0.6rem);
		/* alineado a la derecha del botón para no desbordar la pantalla */
		right: -2px;
		translate: 0 -0.25rem;
		z-index: 5;
		display: flex;
		align-items: center;
		gap: 0.5em;
		padding: 0.35em 0.6em;
		border-radius: 0.5em;
		background: var(--2-dark);
		color: white;
		font-size: 0.8rem;
		font-weight: bold;
		white-space: nowrap;
		opacity: 0;
		pointer-events: none;
		transition:
			opacity 120ms,
			translate 120ms;
		&::before {
			content: '';
			position: absolute;
			bottom: 100%;
			right: calc(1.625rem - 0.35rem);
			border: 0.35rem solid transparent;
			border-bottom-color: var(--2-dark);
		}
	}
	.keys {
		display: flex;
		gap: 0.2em;
	}
	kbd {
		font-family: inherit;
		font-size: 0.9em;
		line-height: 1.4;
		padding: 0 0.4em;
		border-radius: 0.3em;
		background: rgba(255, 255, 255, 0.2);
		border: 1px solid rgba(255, 255, 255, 0.35);
	}
	.search-btn:hover .tip,
	.search-btn:focus-visible .tip {
		opacity: 1;
		translate: 0 0;
	}
	@media (prefers-reduced-motion: reduce) {
		.search-btn,
		.tip {
			transition: none;
		}
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
			/* los 5 ítems reparten el ancho; el botón de búsqueda va aparte al final */
			gap: 0.25em;
			max-width: none;
			padding-inline: 0.5em max(0.5em, env(safe-area-inset-right));
			z-index: 2;
			background: white;
			font-size: 1em;
			.search-btn {
				width: 2.75rem;
				height: 2.75rem;
				border: 0;
				background: var(--1);
				color: white;
				box-shadow: 0 0.1em 0.5em rgba(0, 0, 0, 0.2);
				&:hover {
					scale: 1;
				}
				.tip {
					display: none;
				}
			}
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
