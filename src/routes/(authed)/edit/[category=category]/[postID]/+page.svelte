<script>
	export let data;
	export let form;
	import CodeMirror from 'svelte-codemirror-editor';
	import { markdown } from '@codemirror/lang-markdown';
	import { page } from '$app/stores';
	let value = data?.post.raw ?? '';
	const sha = data?.post.sha ?? '';
	const path = data?.post.path ?? '';
</script>

<div class="content">
	<a href={'/' + $page.params.category + '/' + $page.params.postID}>Volver a la publicación</a>
</div>
<CodeMirror
	lineWrapping
	tabSize={4}
	bind:value
	lang={markdown()}
	styles={{
		'&': {
			maxHeight: '70rem',
			maxWidth: '70rem',
			'margin-inline': 'auto',
			background: 'white'
		}
	}}
/>
<div class="content">
	<form method="POST" action="?/save">
		<textarea hidden name="content" {value} />
		<input type="text" hidden name="sha" value={sha} />
		<input type="text" hidden name="path" value={path} />
		<input type="submit" value="Guardar" />
	</form>
	<p>
		Los cambios tardarán al menos 1m30s en verse después de guardar. Si pasan más de 5 minutos,
		contactar a <a href="https://t.me/Gorro_Rojo">@Gorro_Rojo</a>
	</p>
</div>
{#if form?.save}
	<pre>{form.save}</pre>
{/if}
