<script>
	/**
	 * «Ver el archivo que se va a guardar»: el markdown que genera el formulario, plegado. Movido
	 * desde /admin/eventos/nuevo y PostEditor, que lo tenían igual.
	 *
	 * `savesToDb`: lo que se guarda va a la base (no es un archivo del repo): el título lo dice ($lib/admin/saveCopy.js).
	 */
	import { saveCopy } from '$lib/admin/saveCopy.js';

	export let content = '';
	export let savesToDb = false;
</script>

<details>
	<summary>{saveCopy(savesToDb).filePreview}</summary>
	<pre class="markdown">{content}</pre>
</details>

<style>
	details {
		margin-top: 1em;
	}
	summary {
		cursor: pointer;
		color: var(--2-dark);
	}
	.markdown {
		background: #1e1e1e;
		color: #eee;
		border-radius: var(--radius-m);
		padding: 1em;
		font-size: var(--step--2);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		max-height: 30em;
		overflow: auto;
	}
</style>
