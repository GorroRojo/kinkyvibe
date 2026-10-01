<script>
	/**
	 * «Ver el archivo que se va a guardar»: el markdown que genera el formulario, plegado. Movido
	 * desde /admin/eventos/nuevo y PostEditor, que lo tenían igual.
	 */
	export let content = '';
</script>

<details>
	<summary>Ver el archivo que se va a guardar</summary>
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
		border-radius: 1em;
		padding: 1em;
		font-size: var(--step--2);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		max-height: 30em;
		overflow: auto;
	}
</style>
