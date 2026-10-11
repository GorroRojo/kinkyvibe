<script>
	/**
	 * El resumen de lo que falta para guardar, el mismo en los tres formularios largos del panel:
	 * crear un evento («Falta completar:»), editarlo (PostEditor) y material / amigues
	 * (ContentEditor), los dos con «Antes de guardar:». Cada problema es un link a su campo: al
	 * tocarlo, la pantalla va al campo y le pone el foco (`focusField`). Mientras el resumen está a
	 * la vista, los campos con problema llevan `aria-invalid="true"` (`markInvalid`); al irse, se
	 * les saca.
	 *
	 * Props:
	 * - `problems`: `Problem[]` de `$lib/admin/formProblems.js`. Uno sin `field` va sin link.
	 * - `title`: el título en negrita.
	 * - `id`: opcional (para llevar la pantalla al resumen o las pruebas).
	 *
	 * La página decide cuándo mostrarlo (`{#if}`): este componente siempre dibuja la caja. El
	 * aspecto es el `.problems` de siempre (admin.scss / panel-editor.scss).
	 */
	import { onDestroy, tick } from 'svelte';
	import { focusField, markInvalid, problemFields } from '$lib/admin/formProblems.js';

	/** @type {import('$lib/admin/formProblems.js').Problem[]} */
	export let problems = [];
	export let title = 'Falta completar:';
	/** @type {string | undefined} */
	export let id = undefined;

	let gone = false;
	$: fields = problemFields(problems);
	// Después de dibujar (los campos ya están en la página); en el servidor no hace nada.
	$: if (typeof document !== 'undefined')
		tick().then(() => {
			if (!gone) markInvalid(fields);
		});
	onDestroy(() => {
		gone = true;
		markInvalid([]);
	});
</script>

<div class="problems" role="alert" {id}>
	<strong>{title}</strong>
	<ul>
		{#each problems as p}<li>
				{#if p.field}<a href="#{p.field}" on:click|preventDefault={() => focusField(p.field)}
						>{p.text}</a
					>{:else}{p.text}{/if}
			</li>{/each}
	</ul>
</div>
