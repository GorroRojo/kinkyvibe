<!--
	The neighbourhood of a tag as a small graph (SVG, no libraries): parents above, children
	below, related tags at the sides, other names under the center. Click a node to go to it.
-->
<script>
	/** @type {import('$lib/utils/tagConfig.js').TagNode} */
	export let node;
	/** @type {Map<string, import('$lib/utils/tagConfig.js').TagNode>} */
	export let byId;
	/** @type {(id: string) => void} */
	export let onSelect;

	const W = 640;
	const MAX_KIDS = 12;

	/**
	 * @param {string[]} ids
	 * @param {number} y
	 * @param {number} [x0]
	 * @param {number} [x1]
	 */
	function row(ids, y, x0 = 40, x1 = W - 40) {
		if (!ids.length) return [];
		const step = (x1 - x0) / ids.length;
		return ids.map((id, i) => ({ id, x: x0 + step * (i + 0.5), y }));
	}
	$: parents = row(node.parents.filter((p) => p !== 'root').slice(0, 6), 36);
	$: kidIds = node.children.slice(0, MAX_KIDS);
	$: kids = [...row(kidIds.slice(0, 6), 250), ...row(kidIds.slice(6, 12), 306)];
	$: rel = node.related.slice(0, 6);
	$: related = [
		...rel.filter((_, i) => i % 2 === 0).map((id, i) => ({ id, x: 78, y: 110 + i * 34 })),
		...rel.filter((_, i) => i % 2 === 1).map((id, i) => ({ id, x: W - 78, y: 110 + i * 34 }))
	];
	$: height = kidIds.length > 6 ? 340 : kidIds.length ? 284 : 190;
	$: others = [...node.aka, ...node.variants];
	/** @param {string} id */
	const label = (id) => {
		const n = byId.get(id);
		const name = n?.name ?? id;
		const text = `${n?.icon ? n.icon + ' ' : ''}${name}`;
		return text.length > 18 ? text.slice(0, 17) + '…' : text;
	};
	/** @param {string} id */
	const color = (id) => byId.get(id)?.color ?? 'var(--muted)';
</script>

<svg viewBox="0 0 {W} {height}" role="img" aria-label="Relaciones de {node.name}">
	{#each parents as p}
		<line x1={p.x} y1={p.y + 12} x2={W / 2} y2={128} class="edge" />
	{/each}
	{#each kids as k}
		<line x1={W / 2} y1={152} x2={k.x} y2={k.y - 12} class="edge" />
	{/each}
	{#each related as r}
		<line x1={r.x} y1={r.y} x2={W / 2} y2={140} class="edge rel" />
	{/each}

	{#each [...parents, ...kids, ...related] as n (n.id + n.x + n.y)}
		<g
			class="node"
			transform="translate({n.x} {n.y})"
			role="button"
			tabindex="0"
			aria-label="Ir a {byId.get(n.id)?.name ?? n.id}"
			on:click={() => onSelect(n.id)}
			on:keydown={(e) =>
				(e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect(n.id))}
		>
			<rect x="-58" y="-13" width="116" height="26" rx="13" style:stroke={color(n.id)} />
			<text text-anchor="middle" dy="4">{label(n.id)}</text>
		</g>
	{/each}

	<g class="center" transform="translate({W / 2} 140)">
		<rect
			x="-86"
			y="-18"
			width="172"
			height="36"
			rx="18"
			style:fill={node.color ?? 'var(--accent)'}
		/>
		<text text-anchor="middle" dy="5">{label(node.id)}</text>
		{#if others.length}
			<text class="aka" text-anchor="middle" y="36"
				>también: {others.slice(0, 4).join(', ')}{others.length > 4 ? '…' : ''}</text
			>
		{/if}
	</g>
	{#if node.children.length > MAX_KIDS}
		<text class="more" x={W / 2} y={height - 6} text-anchor="middle"
			>y {node.children.length - MAX_KIDS} más</text
		>
	{/if}
</svg>

<style>
	svg {
		width: 100%;
		height: auto;
		display: block;
		font-size: 12px;
	}
	.edge {
		stroke: var(--line);
		stroke-width: 1.5;
	}
	.edge.rel {
		stroke-dasharray: 4 4;
	}
	.node {
		cursor: pointer;
	}
	.node rect {
		fill: var(--surface);
		stroke-width: 1.5;
	}
	.node text {
		fill: var(--text);
	}
	.node:hover rect,
	.node:focus-visible rect {
		fill: var(--surface-2);
	}
	.node:focus-visible {
		outline: none;
	}
	.node:focus-visible rect {
		stroke: var(--link);
		stroke-width: 3;
	}
	.center text {
		fill: #fff;
		font-weight: 700;
		font-size: 14px;
	}
	.center .aka,
	.more {
		fill: var(--muted);
		font-weight: 400;
		font-size: 12px;
	}
</style>
