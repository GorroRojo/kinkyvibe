<script>
	import { createTagsInput, melt } from '@melt-ui/svelte';
	import { tagManager } from '$lib/utils/stores';
	import { tagSorter } from '$lib/utils';
	export let placeholder = '';
	export let initialTags = [];
	export let inputid = undefined;
    export let onUpdate = (arr) => {};
	const {
		elements: { root, input, tag, deleteTrigger, edit },
		states: { tags },
		helpers: { addTag }
	} = createTagsInput({
		placeholder: placeholder,
		unique: true,
		addOnPaste: true,
		add: (t) => {
			let tagData = $tagManager.get(t);
			return { id: tagData.id, value: tagData.visible_name ?? tagData.id };
		}
	});
    tags.subscribe((ts)=>onUpdate(ts.map((t)=>t.value)))
    // console.log(initialTags)
	initialTags.forEach((t) => addTag(t));
    let sortTags = tagSorter($tagManager);
</script>

<div use:melt={$root}>
	{#each $tags.sort((a,b)=>sortTags($tagManager.get(a.id),$tagManager.get(b.id))) as t}
        {@const tagData = $tagManager.get(t.value)}
		<div
			use:melt={$tag(t)}
			class="tag"
			style:--tag-color={tagData?.getColor() ?? 'var(--color-2,var(--1))'}
		>
			<span class="pill">{tagData?.icon ?? ''} {t.value}</span>
			<button class="pill" use:melt={$deleteTrigger(t)}>x</button>
		</div>
		<div use:melt={$edit(t)}>{t.value}</div>
	{/each}
	<input {inputid} use:melt={$input} placeholder="enter para añadir una etiqueta" type="text" />
</div>

<style>
	.tag {
		display: inline-block;
	}
	.pill {
        line-height:1;
		padding: var(--padding, 0.3em 0.6em);
		border-radius: var(--border-radius, 2em);
		user-select: none;
		display: inline-block;
		font-size: var(--step--1);
		flex: 1 1;

		background: var(--tag-color, var(--1));
		color: white;

		border: 1px solid var(--tag-color);
	}
	span.pill {
		border-bottom-right-radius: 0;
		border-top-right-radius: 0;
        margin-right: 0;
        border-right-width: 0;
	}
	button.pill {
		border-bottom-left-radius: 0;
		border-top-left-radius: 0;
        margin-left: 0;
        border-left-width:0;
	}
    input {
        font-size: var(--step--1);
		position: relative;
		padding: 0.4em 0.8em;
		margin-bottom: 0.5em;
		accent-color: var(--1);
		transition: 100ms;
        
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
    input,.pill {
        margin-top: .4rem;
    }
</style>
