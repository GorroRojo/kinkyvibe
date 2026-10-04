<!--
	One row of the tag tree (recursive). Rows can be dragged onto another row to move the tag
	there ("from" is the parent it was dragged out of); the keyboard alternative is "Mover a…" in
	the detail panel.
-->
<script>
	import { ChevronRight, GripVertical } from '@lucide/svelte';

	/** @type {string} */
	export let id;
	/** @type {string | null} */
	export let parent = null;
	/** @type {Map<string, import('$lib/utils/tagConfig.js').TagNode>} */
	export let byId;
	/** @type {Record<string, boolean>} */
	export let open = {};
	/** @type {string} */
	export let selected = '';
	export let depth = 0;
	/** @type {string[]} ancestors on this branch (a tag can't contain itself) */
	export let path = [];
	/** @type {(id: string) => void} */
	export let onSelect;
	/** @type {(id: string, from: string | null, to: string) => void} */
	export let onMove;
	/** @type {(id: string) => void} */
	export let onToggle;

	$: node = byId.get(id);
	$: kids = (node?.children ?? []).filter((c) => !path.includes(c));
	$: isOpen = open[id] ?? depth < 1;
	let over = false;

	/** @param {DragEvent} e */
	function dragStart(e) {
		e.dataTransfer?.setData('application/x-kv-tag', JSON.stringify({ id, from: parent }));
		e.dataTransfer?.setData('text/plain', id);
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
	}
	/** @param {DragEvent} e */
	function drop(e) {
		over = false;
		const raw = e.dataTransfer?.getData('application/x-kv-tag');
		if (!raw) return;
		const d = JSON.parse(raw);
		if (d.id !== id) onMove(d.id, d.from, id);
	}
</script>

{#if node}
	<li
		role="treeitem"
		aria-expanded={kids.length ? isOpen : undefined}
		aria-selected={selected === id}
	>
		<div
			class="row"
			class:sel={selected === id}
			class:over
			style:--depth={depth}
			style:--tag-color={node.color ?? 'var(--line)'}
			draggable={id !== 'root'}
			on:dragstart={dragStart}
			on:dragover|preventDefault={() => (over = true)}
			on:dragleave={() => (over = false)}
			on:drop|preventDefault={drop}
			role="presentation"
		>
			{#if kids.length}
				<button
					type="button"
					class="tog"
					class:isOpen
					aria-label={isOpen ? `Cerrar ${node.name}` : `Abrir ${node.name}`}
					on:click={() => onToggle(id)}><ChevronRight size={16} /></button
				>
			{:else}<span class="tog" aria-hidden="true"></span>{/if}
			<button type="button" class="name" on:click={() => onSelect(id)}>
				{#if id !== 'root'}<GripVertical size={14} class="grip" aria-hidden="true" />{/if}
				<span class="dot" aria-hidden="true"></span>
				{#if node.icon}<span aria-hidden="true">{node.icon}</span>{/if}
				<span class="label">{id === 'root' ? 'Todas las etiquetas' : node.name}</span>
				{#if node.name !== id && id !== 'root'}<span class="id">{id}</span>{/if}
			</button>
			<span class="count" title="Publicaciones con esta etiqueta (con sus hijas: {node.subtotal})"
				>{node.total}{#if kids.length && node.subtotal !== node.total}<small>
						/ {node.subtotal}</small
					>{/if}</span
			>
		</div>
		{#if kids.length && isOpen}
			<ul role="group">
				{#each kids as c (c)}
					<svelte:self
						id={c}
						parent={id}
						{byId}
						{open}
						{selected}
						depth={depth + 1}
						path={[...path, id]}
						{onSelect}
						{onMove}
						{onToggle}
					/>
				{/each}
			</ul>
		{/if}
	</li>
{/if}

<style>
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 0.2rem;
		padding: 0.1rem 0.4rem 0.1rem calc(0.3rem + var(--depth) * 1.1rem);
		border-radius: var(--radius-s);
		min-height: 2.3rem;
	}
	.row:hover {
		background: var(--surface-2);
	}
	.row.sel {
		background: var(--link-bg);
		color: var(--link);
	}
	.row.over {
		outline: 2px dashed var(--accent);
		outline-offset: -2px;
	}
	.tog {
		width: 1.8rem;
		height: 1.8rem;
		flex: none;
		display: grid;
		place-items: center;
		border: 0;
		background: none;
		cursor: pointer;
		color: var(--muted);
		border-radius: 50%;
	}
	.tog :global(svg) {
		transition: transform 0.15s;
	}
	.tog.isOpen :global(svg) {
		transform: rotate(90deg);
	}
	.name {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: var(--space-3xs);
		border: 0;
		background: none;
		cursor: pointer;
		text-align: left;
		padding: var(--space-3xs) 0;
		color: inherit;
	}
	.name :global(.grip) {
		color: var(--muted);
		opacity: 0.5;
		flex: none;
		cursor: grab;
	}
	.dot {
		width: 0.55rem;
		height: 0.55rem;
		border-radius: 50%;
		background: var(--tag-color);
		flex: none;
	}
	.label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.id {
		font-size: var(--text-xs);
		color: var(--muted);
		white-space: nowrap;
	}
	.count {
		font-size: var(--text-xs);
		color: var(--muted);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
</style>
