<script>
	export let data;
	export let form;
	import CodeMirror from 'svelte-codemirror-editor';
	import { markdown } from '@codemirror/lang-markdown';
	import { page } from '$app/stores';
	import { parseDocument, visit } from 'yaml';
	let value = data?.post.raw ?? '';
	const sha = data?.post.sha ?? '';
	const path = data?.post.path ?? '';
	let doc = parseDocument(value.split('---')[1], { strict: false });
	/**
	 * @param {string} uncommentKey
	 */
	function uncomment(uncommentKey) {
		let value = undefined;
		let re = new RegExp('\\s*?' + uncommentKey + ': ?(.*)?\\n', 'g');
		console.log('uncommentKey:', uncommentKey);
		let removeComment = (/** @type {string} */ comments) => {
			let r = re.exec(comments || '');
			if (comments) {
				console.log('comments:', comments);
				console.log('r:', r);
			}
			if (r) {
				value = r[1];
				comments = comments.replaceAll(re, '');
				doc.add(doc.createPair(uncommentKey, value));
			}
			return comments;
		};
		// @ts-ignore
		visit(doc, (_, /**@type{{commentBefore:string}}*/ node, path) => {
			node.commentBefore = removeComment(node?.commentBefore);
		});
		if (value === undefined) {
			doc.comment = removeComment(doc?.comment ?? '');
		}
		return value;
	}
	/**
	 * @param {string} commentKey
	 */
	function comment(commentKey) {
		let value = doc.get(commentKey);
		if (value) {
			doc.delete(commentKey);
			doc.comment = (doc.comment ? doc.comment + '\n' : '') + commentKey + ': ' + value + '\n';
		}
	}
	/** @type {(key: string, comment: boolean) => void}*/
	function setComment(key, active) {
		active ? comment(key) : uncomment(key);
	}
	/** @type {(key: string, value: any) => void}*/
	function setProperty(key, value) {
		if (doc.has(key)) {
			doc.set(key, value);
		} else {
			let commentedValue = uncomment(key);
			doc.set(key, value);
		}
		doc = doc;
		value = value.replace(/---\n([\s\S]*\n)*?---/m, '---\n' + doc.toString() + '---\n');
	}
	value = value.replace(/---\n([\s\S]*\n)*?---/m, '---\n' + doc.toString() + '---\n');
</script>

<pre>{#key doc}{doc.toString()}{/key}</pre>
<ul>
	<li>
		<label
			>Título
			<input
				type="text"
				name="title"
				on:change={/** @param {Event & {target:HTMLInputElement}} e */ (e) =>
					setProperty('title', e?.target?.value)}
				value={doc.get('title')}
			/>
		</label>
	</li>
	<li>
		<label
			>Descripción<input
				type="text"
				name="summary"
				on:change={(e) => setProperty('summary', e?.target?.value)}
				value={doc.get('summary')}
			/></label
		>
	</li>
	<li>
		<label
			><input
				type="checkbox"
				on:input={(e) => setProperty('force_unlisted', e?.target?.checked)}
				value={doc.get('force_unlisted')}
			/>
			Unlisted</label
		>
	</li>
</ul>
<div class="content">
	<a href={'/' + $page.params.category + '/' + $page.params.postID}>Volver a la publicación</a>
</div>
<div class="content">
	<div class="col-2s">
		<form method="POST" action="?/save">
			<textarea hidden name="content" {value} />
			<input type="text" hidden name="sha" value={sha} />
			<input type="text" hidden name="path" value={path} />
			<input type="submit" value="Guardar" />
		</form>
		{#if form?.save}
			<small style="font-size: var(--step--1)">
				{form?.save + ' ' + new Date().toLocaleString('es-AR')}
			</small>
		{/if}
	</div>
	<small style="font-size: var(--step--1)">
		Los cambios tardarán al menos 1m30s en verse después de guardar. Si pasan más de 5 minutos,
		contactar a
		<a href="https://t.me/Gorro_Rojo">@Gorro_Rojo</a>
	</small>
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

<style>
	form {
		display: inline;
	}
</style>
