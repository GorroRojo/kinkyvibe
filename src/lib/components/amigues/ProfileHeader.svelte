<script>
	/**
	 * Encabezado de un perfil: imagen redonda, nombre y pronombres (con link si son de
	 * pronombr.es). Lo usan las fichas .md y los perfiles de la base.
	 * Props: `title`, `image`, `pronoun` (link o texto; "…/evitar" no muestra nada).
	 */
	import { pronounDisplay } from '$lib/utils/mentions';

	export let title = '';
	/** @type {string | null | undefined} */
	export let image = undefined;
	/** @type {string | null | undefined} */
	export let pronoun = undefined;
</script>

<div class="profile-header h-card p-contact">
	{#if image}
		<img src={image} class="profile-pic u-photo" alt="" />
	{:else}
		<span class="profile-pic initial" aria-hidden="true"
			>{title.trim().charAt(0).toUpperCase()}</span
		>
	{/if}
	<h1 id="title" class="profile-name p-name">
		{title}
		{#if pronoun && (pronoun + '').split('/').pop() != 'evitar'}
			{#if (pronoun + '').startsWith('https')}
				<a target="_blank" class="u-pronouns" href={pronoun + ''}>
					{pronounDisplay(pronoun)}
				</a>
			{:else}
				<span class="u-pronouns">{pronoun}</span>
			{/if}
		{/if}
	</h1>
	<slot />
</div>

<style lang="scss">
	.u-pronouns {
		font-size: 0.5em;
		opacity: 0.7;
		text-decoration: none;
	}
	.profile-header {
		display: grid;
		grid-template-columns: 4em 1fr;
		gap: 1em;
		align-items: center;
		font-size: var(--step-3);
		justify-content: center;
		justify-items: start;
		width: max-content;
		margin-inline: auto;
		max-width: 100%;
		padding-inline: 16px;
	}
	.profile-pic {
		display: block;
		border-radius: 9999em;
		object-fit: cover;
		max-height: 4em;
		width: auto;
		justify-self: right;
		aspect-ratio: 1;
		translate: 0 -0.2em;
	}
	.initial {
		width: 1.6em;
		height: 1.6em;
		display: grid;
		place-items: center;
		font-size: 2em;
		font-weight: bold;
		color: white;
		background: var(--1, hotpink);
	}
	.profile-name {
		justify-self: left;
		text-align: left;
		max-width: 100%;
	}

	@media (max-width: 630px) {
		.profile-header {
			grid-auto-flow: row;
		}
	}
</style>
