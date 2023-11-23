<script>
	import PostList from '$lib/components/PostList.svelte';
	export let data;
	import CodeMirror from 'svelte-codemirror-editor';
	import { markdown } from '@codemirror/lang-markdown';
	// import { oneDark } from "@codemirror/theme-one-dark";

	/**
	 * @param {any} e
	 */
	function save(e) {
		alert(document.querySelector('textarea')?.value);
	}

	let value = data.contents;
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
	<form method="POST">
		<input type="text" hidden {value} />
		<input type="submit" value="Guardar" />
	</form>

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
