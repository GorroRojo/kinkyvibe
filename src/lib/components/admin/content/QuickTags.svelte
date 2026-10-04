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
						class="chip kv-tag"
						aria-pressed={picked.has(t)}
						style:--tag-color={tag?.getColor?.() ?? undefined}
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
		gap: var(--space-2xs);
	}
	.group {
		display: flex;
		flex-direction: column;
		gap: var(--space-3xs);
	}
	.label {
		font-size: var(--text-xs);
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--muted, #6b6470);
		font-weight: 700;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3xs);
	}
	/* chip de etiqueta con su color (.kv-tag, style.scss); lleno cuando está elegido */
	.chip {
		min-height: 2.2rem;
		padding: var(--space-3xs) var(--space-xs);
		font-size: var(--text-sm);
		font-weight: 400;
		cursor: pointer;
	}
	.chip[aria-pressed='true'] {
		font-weight: 700;
	}
</style>
