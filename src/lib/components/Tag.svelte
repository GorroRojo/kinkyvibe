<script>
	//@ts-nocheck
	
	/** @type {{isCheckbox?: boolean, isLink?: boolean, tag?: string, icon?: string, name?: any, checked?: boolean, noBorder?: boolean, onInput?: any}} */
	let {
		isCheckbox = false,
		isLink = false,
		tag = '',
		icon = '',
		name = tag,
		checked = $bindable(false),
		noBorder = false,
		onInput = () => {
		return;
	}
	} = $props();
</script>

{#if isCheckbox}
	<label class="tag" class:checked class:noBorder>
		<input type="checkbox" oninput={onInput} {name} bind:checked tabindex="0" />
		{icon} {tag}
	</label>
{:else if isLink}
	<a class="tag" rel="tag" href="/todo?tags={tag}" class:noBorder>{icon} {tag}</a>
{:else}
	<span class="tag" class:noBorder>
		{icon} {tag}
	</span>
{/if}

<style>
	/*
	
	variables:

		--tag-color
		--border-radius
		--outline-color
		--text-color
		--off-background
		--off-outline
		--off-outline-offset
		--filled-text-color
		--filled-outline
		--filled-outline-offset
		--fill-color
		--text-decoration
		--off-text-decoration

	*/
	.tag {
		padding: var(--padding, 0.3em 0.6em);
		border-radius: var(--border-radius, 2em);
		user-select: none;
		display: inline-block;
		font-size: var(--font-size);
		flex: 1 1;
		text-decoration: var(--text-decoration);
	}
	.tag.noBorder {
		border: 0;
	}

	a.tag,
	label.tag.checked,
	span.tag {
		background: var(--fill-color, var(--tag-color, var(--1)));
		color: var(--filled-text-color, white);
		outline: var(--filled-outline, none);
		outline-offset: var(--filled-outline-offset, 0);
		text-decoration-color: var(--text-decoration, 'none');
	}
	label.tag,
	a.tag {
		cursor: pointer;
	}
	span.tag,
	label.tag {
		border: 1px solid var(--outline-color, var(--tag-color));
		color: var(--text-color, var(--tag-color));
		background: var(--off-background, transparent);
		transition: 0ms;
		outline: var(--off-outline, none);
		outline-offset: var(--off-outline-offset, 0);
	}
	span.tag {
		cursor: unset;
	}
	label.tag:has(:focus) {
		outline: 1px dotted var(--outline-color, var(--tag-color, var(--1))) !important;
		/* scale: 1.05; */
	}
	input {
		border: 0;
		margin: 0;
		padding: 0;
		width: 0;
		height: 0;
		opacity: 0;
		position: absolute;
	}
	a.tag:hover {
		text-decoration: var(--hover-text-decoration, var(--text-decoration), none);
	}
</style>
