<script>
	//@ts-nocheck
	import { currentPostData } from './../utils/stores.js';
	import { page } from '$app/state';
	/** @type {{links: any}} */
	let { links } = $props();
</script>

<nav>
	<ul>
		{#each links as { icon, name, sub, href, target = undefined }}
			{@const SvelteComponent = icon}
			<li
				class:current={page.url.pathname.includes(href) ||
					($currentPostData &&
						$currentPostData?.path == page?.url?.pathname &&
						$currentPostData?.category == href.slice(1))}
			>
				<a {href} {target} tabindex="0">
					<span>
						<span><SvelteComponent size="1em" /></span>
						{name}
					</span>
					<small>{sub}</small>
				</a>
			</li>
		{/each}
	</ul>
</nav>

<style lang="scss">
	nav ul {
		padding: 0;
		display: flex;
		row-gap: 0.4em;
		justify-content: center;
		margin-inline: auto;
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
	nav span {
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
	@media screen and (max-width: 680px) {
		nav {
			position: fixed;
			bottom: 0;
			left: 0;
			right: 0;
			padding-inline: 1em;
			z-index: 2;
			background: white;
			font-size: 1em;
			ul {
				flex-wrap: nowrap;
				gap: 1em;
				/* width: 100%; */
				li {
					width: 15vw;
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
