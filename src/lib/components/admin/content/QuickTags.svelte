<!--
	"Lo básico": rows of toggle chips for the tag groups every post of a kind should have (idioma,
	precio, tipo, formato… from the tag tree). Writes into the same `tags` list the TagPicker
	below edits.
-->
<script>
	import { canonicalTag, siteTags } from '$lib/utils/adminTags.js';
	import { quickTagGroups, toggleQuickTag } from '$lib/utils/contentPosts.js';

	/** @type {string} */
	export let category;
	/** @type {string[]} */
	export let tags = [];
	export let idPrefix = 'quick';

	const tm = siteTags();
	/** @param {string} t */
	const canon = (t) => canonicalTag(t, tm);
	const groups = quickTagGroups(category, tm);
	$: picked = new Set(tags.map(canon));
</script>

<div class="quick">
	{#each groups as g, i}
		<div class="group" role="group" aria-labelledby="{idPrefix}-g{i}">
			<span class="label" id="{idPrefix}-g{i}">{g.label}{g.single ? '' : ' (varias)'}</span>
			<div class="chips">
				{#each g.tags as t}
					{@const tag = tm.get(t)}
					<button
						type="button"
						class="chip"
						aria-pressed={picked.has(t)}
						style:--tag-color={tag?.getColor?.() ?? 'var(--1)'}
						on:click={() => (tags = toggleQuickTag(tags, t, g, canon))}
					>
						{#if tag?.icon}<span aria-hidden="true">{tag.icon.trim()}</span>{/if}
						{tag?.visible_name ?? t}
					</button>
				{/each}
			</div>
		</div>
	{/each}
</div>

<style>
	.quick {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.group {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.label {
		font-size: 0.72rem;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--muted, #6b6470);
		font-weight: 700;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.3em;
		border: 1px solid var(--line, #e4e0e8);
		background: var(--surface, #fff);
		color: var(--text, inherit);
		border-radius: 2em;
		padding: 0.3rem 0.8rem;
		min-height: 2.2rem;
		font-size: 0.9rem;
		cursor: pointer;
	}
	.chip[aria-pressed='true'] {
		background: var(--accent, var(--1));
		border-color: var(--accent, var(--1));
		color: var(--accent-ink, #fff);
		font-weight: 700;
	}
</style>
