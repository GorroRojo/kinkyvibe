<script>
	//@ts-nocheck
	import { page } from '$app/stores';
	import { Heart } from 'lucide-svelte';
	export let links;
</script>

<nav>
	<ul>
		{#each links as { icon, name, sub, href }}
			<li class:current={$page.url.pathname.includes(href)}>
				<a {href}>
					<span>
						<span><svelte:component this={icon} size="1em" /></span>
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
		color: var(--1);
		translate: 0 0.3em;
		transition: 100ms;
		text-decoration: none;
	}

	nav li:hover span {
		translate: 0 0;
	}

	nav li small {
		display: block;
		font-size: 0.6em;
		color: gray;
		scale: 0;
		transition: 100ms;
		white-space: nowrap;
	}
	nav li:hover small {
		scale: 1;
	}
	@media screen and (max-width: 680px) {
		nav {
			position: fixed;
			bottom: 0;
			left: 0;
			right: 0;
			z-index: 1;
			background: white;
			font-size: 1.2em;
			ul {
				flex-wrap: nowrap;
				gap: 1em;
				/* width: 100%; */
				li {
					width: 15vw;
					height: 4em;
					&:hover span {
						translate: 0 0em;
					}
					/* &.current, */
					&.current {
						a {
							box-shadow:none;
						}
						span span {
							scale: 2;
							translate: 0 0.1em;
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
							font-size: .8em;

							span {
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
</style>
