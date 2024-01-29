<script>
	import PostList from '$lib/components/PostList.svelte';
	export let data;
	export let form;
	import CodeMirror from 'svelte-codemirror-editor';
	import { markdown } from '@codemirror/lang-markdown';

	let value = form?.post?.raw ?? data?.contents.raw ?? '';
</script>



<article class="content">
	<form method="POST" action="?/load">
		<select name="category">
			{#each ['material', 'amigues', 'calendario', 'wiki'] as category}
				<option value={category}>{category}</option>
			{/each}
		</select>
		<input type="text" name="path" placeholder="6-tips-para-tops" />
		<input type="submit" value="Cargar" />
	</form>
	{#if form?.post}
		<CodeMirror
			lineWrapping
			tabSize={4}
			bind:value
			lang={markdown()}
			styles={{
				'&': {
					maxHeight: '30rem',
					maxWidth: '50rem',
					'margin-inline': 'auto',
					background: 'white'
				}
			}}
		/>
		<form method="POST" action="?/save">
			<textarea hidden name="content" {value} />
			<input type="text" hidden name="sha" value={form?.post.sha} />
			<input type="text" hidden name="path" value={form?.post.path} />
			<input type="submit" value="Guardar" />
		</form>
	{/if}
	{#if form?.save}
		<pre>{form.save}</pre>
	{/if}

	<h2>Publicaciones no listadas</h2>
</article>
<PostList posts={data.unlisted_posts} />

<!-- <textarea value={c}></textarea> -->
<!-- <button on:click={save}>Save</button> -->

