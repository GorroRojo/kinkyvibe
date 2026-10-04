<!--
	El texto de una publicación de la base con interactivos registrados (decisión 0004): las
	«partes» que arma el servidor (src/lib/server/contenido/interactive.js). El HTML va tal cual
	(ya está armado y limpio en el servidor), cada interactivo es su componente del registro
	($lib/components/interactivos) y un elemento que contiene un interactivo se arma acá, con sus
	partes adentro. Una etiqueta que no está en el registro no se muestra.
-->
<script>
	import { interactiveComponent } from '$lib/components/interactivos/index.js';
	import ContentParts from './ContentParts.svelte';

	/** @type {import('$lib/server/contenido/interactive.js').Part[]} */
	export let parts = [];
</script>

{#each parts as part}
	{#if 'html' in part}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html part.html}
	{:else if 'component' in part}
		{#if interactiveComponent(part.component)}
			<svelte:component this={interactiveComponent(part.component)} />
		{/if}
	{:else}
		<svelte:element this={part.element} {...part.attrs}>
			<ContentParts parts={part.children} />
		</svelte:element>
	{/if}
{/each}
