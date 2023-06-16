<script>
    //@ts-nocheck
	export let isCheckbox = false;
	export let tag = '';
	export let name = tag;
	export let checked = false;
	export let noBorder = false;
	/**
	 * @type function
	 */
	export let onInput= ()=>{return};
</script>

{#if isCheckbox}
	<label class="tag" class:noBorder>
		<input type="checkbox" on:input={onInput} {name} bind:checked />
		{tag}
	</label>
{:else}
	<!-- <a {href}> -->
	<span class="tag" class:noBorder>
		{tag}
	</span>
	<!-- </a> -->
{/if}

<style>
	.tag {
		padding: 0.3em 0.6em;
		border-radius: var(--border-radius, 2em);
		user-select: none;
		display: inline-block;
		flex: 1 1;
	}
	.tag.noBorder {
		border: 0;
	}
	label.tag {
		border: 1px solid var(--outline-color, var(--tag-color));
		color: var(--text-color, var(--tag-color));
		background: transparent;
		cursor: pointer;
		/* transition: 200ms; */
		outline: var(--off-outline, none);
		outline-offset: var(--off-outline-offset, 0);
	}
	label.tag:has(:checked),
	span.tag {
		background: var(--fill-color, var(--tag-color, var(--1)));
		color: var(--filled-text-color, white);
		outline: var(--filled-outline, none);
		outline-offset: var(--filled-outline-offset, 0);
	}
	input {
		display: none;
	}
</style>
