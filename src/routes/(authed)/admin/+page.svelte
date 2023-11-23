<script>
	import PostList from '$lib/components/PostList.svelte';
	export let data;
	export let form;
	import CodeMirror from 'svelte-codemirror-editor';
	import { markdown } from '@codemirror/lang-markdown';
	// import { oneDark } from "@codemirror/theme-one-dark";

	/**
	 * @param {any} e
	 */
	function save(e) {
		alert(document.querySelector('textarea')?.value);
	}

	let value = form?.post?.raw ?? data?.contents.raw ?? '';
</script>

<div class="profile-header h-card p-contact">
	<img src={data.user.avatar_url} class="profile-pic u-photo" alt="" />
	<span id="title" class="profile-name p-name">
		{data.user.name ?? data.user.login}
	</span>
	<form method="POST" action="/logout">
		<input type="submit" value="Cerrar sesión" />
	</form>
</div>

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

<style>
	.profile-header {
		display: flex;
		gap: 0.4em;
		align-items: center;
		font-size: var(--step-0);
		justify-content: start;
		justify-items: start;
		width: max-content;
		margin-inline: auto;
		max-width: 100%;
		width: 50rem;
	}
	.profile-pic {
		display: block;
		border-radius: 9999em;
		object-fit: cover;
		max-height: 1.5em;
		width: auto;
		justify-self: right;
		aspect-ratio: 1;
		translate: 0 -0em;
	}
	.profile-name {
		margin-right: 1em;
	}

	@media (max-width: 630px) {
		.profile-header {
			grid-auto-flow: row;
		}
	}
</style>
