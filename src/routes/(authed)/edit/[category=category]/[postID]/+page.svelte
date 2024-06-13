<script>
	import TagsInput from './../../../../../lib/components/TagsInput.svelte';
	export let data;
	export let form;
	import CodeMirror from 'svelte-codemirror-editor';
	import { markdown } from '@codemirror/lang-markdown';
	import { page } from '$app/stores';
	import { parseDocument, visit } from 'yaml';
	import { format } from 'date-fns';
	let postContent = data?.post.raw.split('---').slice(2).join('---');
	const sha = data?.post.sha ?? '';
	const path = data?.post.path ?? '';
	let doc = parseDocument(data?.post.raw.split('---')[1], { strict: false });
	/** @param {string} uncommentKey */
	function uncomment(uncommentKey) {
		let value = undefined;
		let re = new RegExp('\\s*?' + uncommentKey + ': ?(.*)?\\n', 'g');
		let removeComment = (/** @type {string} */ comments) => {
			let r = re.exec(comments || '');
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
	/** @param {string} commentKey */
	function comment(commentKey) {
		let value = doc.get(commentKey);
		if (value) {
			doc.delete(commentKey);
			doc.comment = (doc.comment ? doc.comment + '\n' : '') + commentKey + ': ' + value + '\n';
		}
	}
	/** @type {(key: string, value: any) => void}*/
	function setProperty(key, value) {
		if (doc.has(key)) {
			if (value == '' && !postPropByKey(key)?.required) {
				comment(key);
			} else {
				doc.set(key, value);
			}
		} else if (value != '') {
			let commentedValue = uncomment(key);
			doc.set(key, value);
		}
		doc = doc;
	}
	/** @param {string} key */
	function postPropByKey(key) {
		return [...postProperties, ...Object.values(typedProperties).flat()].find((p) => p.key == key);
	}
	/**@typedef PostPropInput
	 * @prop {string} label
	 * @prop {string} key
	 * @prop {'checkbox'|'date'|'text'|'textarea'|'email'|'url'|'tel'|'datetime-local'|'select'|'array'} type
	 * @prop {'tag'} [subtype]
	 * @prop {string} [placeholder]
	 * @prop {number} [width=2]
	 * @prop {boolean} [required=false]
	 * @prop {Array<{label:string, value:string, default?:boolean}>} [options]
	 */
	/**@type {Array<PostPropInput>}*/
	const postProperties = [
		{ label: 'Publicado', key: 'published_date', type: 'date', width: 1, required: true },
		{ label: 'Actualizado', key: 'updated_date', type: 'date', width: 1, required: true },
		{
			label: 'Título',
			key: 'title',
			type: 'text',
			width: 2,
			required: true,
			placeholder: 'Mi gran título'
		},
		/** TODO tags */
		{ label: 'Etiquetas', key: 'tags', type: 'array', subtype: 'tag', width: 2 },
		/** TODO autores */
		/** TODO featured */
		{
			label: 'Descripción',
			key: 'summary',
			type: 'textarea',
			width: 2,
			required: true,
			placeholder: 'Sobre tal cosa tal otro y tal acotra.'
		},
		{ label: 'Link', key: 'link', type: 'url', width: 1, placeholder: 'https://gorro.ar' },
		{
			label: 'Texto del link',
			key: 'link_text',
			type: 'text',
			width: 1,
			placeholder: 'Ir al sitio'
		},
		{ label: 'Publicación oculta', key: 'force_unlisted', type: 'checkbox', width: 2 }
	];
	/**@type {Record<'amigues'|'calendario'|'material'|'wiki'|string,Array<PostPropInput>>}*/
	const typedProperties = {
		amigues: [
			{
				label: 'Pronombres',
				key: 'pronoun',
				type: 'text',
				width: 1,
				placeholder: 'https://pronombr.es/elle&el',
				required: true
			},

			{
				label: 'Género',
				key: 'gender_identity',
				type: 'text',
				width: 1,
				placeholder: 'Perrito Travo Interdimensional'
			},
			{ label: 'Mail', key: 'email', type: 'email', width: 1, placeholder: 'gorro.rojo@gmail.com' },
			{ label: 'Teléfono', key: 'tel', type: 'tel', width: 1, placeholder: '+54 11 1234 5678' },
			{
				label: 'Dirección',
				key: 'location',
				type: 'text',
				width: 1,
				placeholder: 'Calle 123, Ciudad'
			},
			{ label: 'Cumpleaños', key: 'bday', type: 'date', width: 1 }
		],
		calendario: [
			{
				label: 'Estado',
				key: 'status',
				type: 'select',
				width: 2,
				options: [
					{ label: 'Anunciado (link oculto)', value: 'anunciado', default: true },
					{ label: 'Abierto a inscripciones', value: 'abierto' },
					{ label: 'Inscripciones agotadas', value: 'lleno' },
					{ label: 'Cancelado', value: 'cancelado' }
				]
			},
			{ label: 'Comienza', key: 'start', type: 'datetime-local', width: 1, required: true },
			{ label: 'Termina', key: 'end', type: 'datetime-local', width: 1, required: true },
			{
				label: 'Dirección',
				key: 'location',
				type: 'text',
				width: 1,
				placeholder: 'Calle 123, Ciudad'
			},
			{
				label: 'Nombre de locación',
				key: 'location_name',
				type: 'text',
				width: 1,
				placeholder: 'Centro Cultural Carincio Cortillas'
			}
		],
		material: [
			{ label: 'Redireccionar', key: 'redirect', type: 'checkbox', width: 2 },
			{ label: 'Última fecha de acceso', key: 'access_date', type: 'date', width: 1 },
			{
				label: 'Fecha de publicación original',
				key: 'original_published_date',
				type: 'date',
				width: 1
			}
		],
		wiki: []
	};
	setProperty('updated_date', format(new Date(), 'yyyy-MM-dd') + 'Z-03:00');
</script>

<div class="content">
	<a href={'/' + $page.params.category + '/' + $page.params.postID}>Volver a la publicación</a>
</div>
<!-- <pre>{#key doc}{'---\n' + doc.toString() + '---\n' + postContent}{/key}</pre> -->
<pre>{doc.get('tags').items}</pre>
<ul class="proplist">
	{#each [...postProperties, ...typedProperties[$page.params.category]] as postProp}
		<li class={postProp.type} style:--width={postProp.width}>
			<label for={postProp.key + '-input'}>
				{#if postProp.type != 'checkbox'}
					<span>
						{postProp.label}
						{#if postProp.required}
							<span class="required">*</span>
						{/if}
					</span>
				{/if}
				{#if postProp.type == 'textarea'}
					<textarea
						id="{postProp.key}-input"
						required={postProp.required ?? false}
						name={postProp.key}
						on:input={(e) => setProperty(postProp.key, e?.target?.value.replaceAll(/\n/g, ' '))}
						value={doc.get(postProp.key) ?? ''}
						maxlength="250"
						on:keypress={function (e) {
							if (e.key == 'Enter') e.preventDefault();
						}}
					/>
				{:else if postProp.type == 'array'}
					<TagsInput
						inputid="{postProp.key}-input"
						initialTags={doc.get(postProp.key).items.map((t) => t.value)}
						onUpdate={(tags)=>setProperty(postProp.key, {items:tags})}
					/>
				{:else if postProp.type == 'select'}
					<select
						id="{postProp.key}-input"
						name={postProp.key}
						on:change={(e) => setProperty(postProp.key, e?.target?.value)}
						value={doc.get(postProp.key) ?? ''}
					>
						{#each postProp.options as option}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
				{:else}
					<input
						id="{postProp.key}-input"
						type={postProp.type}
						placeholder={postProp.placeholder}
						on:input={(e) =>
							setProperty(
								postProp.key,
								postProp.type == 'checkbox'
									? e?.target?.checked
									: postProp.type.startsWith('date')
									? e?.target.value
										? e?.target?.value + `${postProp.type == 'datetime-local' ? '' : 'Z'}-03:00`
										: ''
									: e?.target?.value
							)}
						min={postProp.type == 'datetime-local'
							? postProp.key == 'end'
								? doc.get('start')?.slice(0, -6)
								: undefined
							: postProp.type == 'date'
							? postProp.key == 'updated_date'
								? doc.get('published_date')?.split('Z')[0]
								: undefined
							: undefined}
						value={postProp.type == 'date'
							? doc.get(postProp.key)?.split('Z')?.[0]
							: postProp.type == 'datetime-local'
							? doc.get(postProp.key)?.slice(0, -6)
							: doc.get(postProp.key) ?? ''}
					/>
				{/if}
				{#if postProp.type == 'checkbox'}
					<span>{postProp.label}</span>
				{/if}
			</label>
		</li>
	{/each}
</ul>

<div class="content">
	<div class="col-2s">
		<form method="POST" action="?/save">
			<textarea hidden name="content" value={'---\n' + doc.toString() + '\n---' + postContent} />
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
	bind:value={postContent}
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
	.proplist {
		display: flex;
		flex-wrap: wrap;
		row-gap: 0.5em;
		margin-inline: auto;
		max-width: 40rem;
		padding-inline: 5px;
	}
	.proplist li {
		list-style: none;
		display: block;
		flex-basis: calc((var(--width, 2) / 2) * 100%);
	}
	.proplist label {
		display: flex;
		flex-direction: column;
	}
	.proplist .checkbox label {
		display: inline;
	}
	.proplist label span {
		color: var(--1);
		margin-bottom: 0.2em;
	}
	.proplist textarea {
		resize: none;
		height: 6em;
	}
	.proplist input,
	.proplist select,
	.proplist textarea,
	.proplist .checkbox {
		font-size: var(--step-0);
		position: relative;
		padding: 0.4em 0.8em;
		margin-bottom: 0.5em;
		accent-color: var(--1);
		transition: 100ms;
	}
	.proplist .checkbox {
		/* width: 100%; */
		opacity: 0.5;
		&:has(:checked) {
			opacity: 1;
		}
	}
	.proplist .textarea textarea,
	.proplist .select select,
	.proplist .text input,
	.proplist .email input,
	.proplist .url input,
	.proplist .tel input,
	.proplist .datetime-local input,
	.proplist .date input {
		border-radius: 1em;
		border: 0;
		outline: 1px solid var(--1-light);

		&:focus {
			outline-width: 3px;
		}
		&:invalid {
			outline-color: red;
			outline-width: 2px;
		}
		&:placeholder-shown {
			opacity: 0.5;
		}
	}
</style>
