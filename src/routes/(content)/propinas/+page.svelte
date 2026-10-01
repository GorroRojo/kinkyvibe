<script>
	/**
	 * /propinas: el mismo bloque de propina de las publicaciones, para cuando el formulario se
	 * mandó sin JavaScript y volvió con algo para corregir (o se entró con `?de=material/<slug>`).
	 */
	import TipBlock from '$lib/components/propinas/TipBlock.svelte';
	import { tipPost, tipPostPath } from '$lib/utils/propinas.js';

	export let data;
	export let form;

	/** @type {Partial<import('$lib/utils/propinas.js').TipFormValues>} */
	let values = {};
	$: values = form?.values ?? {};
	$: post = tipPost(values.category, values.slug) ?? data.post;
</script>

<svelte:head>
	<title>Dejá una propina - KinkyVibe.ar</title>
	<meta name="robots" content="noindex" />
</svelte:head>

{#if post}
	<TipBlock
		heading="h1"
		category={post.category}
		slug={post.slug}
		{values}
		errors={form?.errors ?? {}}
		error={form?.error ?? ''}
	/>
	<p class="back"><a href={tipPostPath(post.category, post.slug)}>Volver a la publicación</a></p>
{:else}
	<section class="surface-card empty">
		<h1>Propinas</h1>
		<p>
			Las propinas se dejan desde el pie de cada publicación de KinkyVibe. Pasá por el
			<a href="/material">material</a> o el <a href="/calendario">calendario</a>.
		</p>
	</section>
{/if}

<style>
	.back {
		text-align: center;
	}
	.back a,
	.empty a {
		color: var(--2-dark);
	}
	.empty {
		max-width: 32rem;
		margin: 2em auto;
		width: calc(100% - 32px);
		box-sizing: border-box;
	}
	.empty h1 {
		margin-top: 0;
		font-size: var(--step-2);
	}
</style>
