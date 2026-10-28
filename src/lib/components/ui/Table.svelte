<script>
	/**
	 * Tabla para leer (`.kv-table` del panel): encabezados violetas, filas con línea abajo y fondo
	 * suave al pasar el mouse. Si no entra (en el celu), se desliza de costado: los códigos y la
	 * plata no se cortan en dos líneas. El estilo de planilla editable va solo donde se edita.
	 *
	 * Props:
	 * - `columns`: { key, label, align?, sort?, sortValue?, width?, nowrap?, class?, title?,
	 *   hideLabel? }[]. `align`: 'left' | 'right' (las de la derecha son números: no se cortan,
	 *   salvo `nowrap: false`).
	 *   `sort`: 'text' | 'number' | 'date' (o `true` = texto) hace que la columna se pueda
	 *   ordenar tocando su encabezado (o con Enter); `sortValue(row)` es el valor que se ordena
	 *   (por defecto `row[key]`; para la plata, el número, no el texto). Ver ./tableSort.js.
	 *   `width`: ancho CSS de la columna (va en un `<col>`; así la tabla vacía conserva los
	 *   anchos de la llena). `nowrap`: la celda no se corta (códigos, fechas cortas). `class`:
	 *   clases para el encabezado y las celdas de la columna. `title`: texto al pasar el mouse por
	 *   el encabezado. `hideLabel`: el nombre queda solo para lectores de pantalla (una columna de
	 *   botones).
	 * - `rows`: objetos con esas claves. Se ordenan acá, solo las que ya están en la página: si
	 *   la lista se pagina en el servidor, no pongas `sort` (el orden sería falso).
	 * - `sort` (bind:sort, opcional): { key, dir: 'asc' | 'desc' }, el orden actual. Sin él, las
	 *   filas quedan como vienen hasta que se toca un encabezado.
	 * - `limit` (opcional): muestra solo las primeras N filas, después de ordenar todas.
	 * - `caption` (opcional, para lectores de pantalla y arriba de la tabla); `empty`: texto si no
	 *   hay filas (default «No hay nada para mostrar.»); `rowKey`: clave única de cada fila;
	 *   `rowClass(row)` (opcional): clases de la fila.
	 * - `surface`: 'panel' (default, `.kv-table` de panel.scss) | 'sitio' (fuera del panel: la misma
	 *   tabla con los tokens del sitio, encabezados en `--2-dark`, líneas `--line`, hover `--hover`).
	 * Slot `cell` (opcional, `let:row let:column let:value`): para dibujar una celda a mano.
	 */
	import { ChevronDown, ChevronUp, ChevronsUpDown } from '@lucide/svelte';
	import { ariaSort, nextSort, sortRows, sortType } from './tableSort.js';

	/** @typedef {import('./tableSort.js').TableColumn} Column */
	/** @type {Column[]} */
	export let columns = [];
	/** @type {Record<string, any>[]} */
	export let rows = [];
	/** @type {string} */
	export let caption = '';
	export let empty = 'No hay nada para mostrar.';
	/** @type {string | undefined} */
	export let rowKey = undefined;
	/** @type {{ key: string, dir: 'asc' | 'desc' } | null} */
	export let sort = null;
	/** @type {number | undefined} */
	export let limit = undefined;
	/** @type {((row: any) => string) | undefined} */
	export let rowClass = undefined;
	/** @type {'panel' | 'sitio'} */
	export let surface = 'panel';

	$: sortColumn = sort ? columns.find((c) => c.key === sort?.key && sortType(c)) : undefined;
	$: sorted = sort && sortColumn ? sortRows(rows, sortColumn, sort.dir) : rows;
	$: shown = limit ? sorted.slice(0, limit) : sorted;
	$: hasWidths = columns.some((c) => c.width);

	/** @param {(string | false | undefined)[]} parts */
	const classes = (parts) => parts.filter(Boolean).join(' ') || undefined;
</script>

<div class="kv-table-wrap" class:sitio={surface === 'sitio'}>
	<table class:kv-table={surface !== 'sitio'} class:kv-table-sitio={surface === 'sitio'}>
		{#if caption}<caption>{caption}</caption>{/if}
		{#if hasWidths}
			<colgroup>
				{#each columns as c (c.key)}<col style:width={c.width} />{/each}
			</colgroup>
		{/if}
		<thead>
			<tr>
				{#each columns as c (c.key)}
					{@const state = ariaSort(sort, c)}
					<th
						scope="col"
						class={classes([c.class, c.align === 'right' && 'r'])}
						title={c.title}
						aria-sort={state}
					>
						{#if sortType(c)}
							<button type="button" class="sort" on:click={() => (sort = nextSort(sort, c))}
								><span class:sr-only={c.hideLabel}>{c.label}</span><svelte:component
									this={state === 'ascending'
										? ChevronUp
										: state === 'descending'
											? ChevronDown
											: ChevronsUpDown}
									class="sort-icon"
									size={14}
									aria-hidden="true"
								/></button
							>
						{:else if c.hideLabel}
							<span class="sr-only">{c.label}</span>
						{:else}
							{c.label}
						{/if}
					</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each shown as row, i (rowKey ? row[rowKey] : i)}
				<tr class={rowClass?.(row) || undefined}>
					{#each columns as c (c.key)}
						<td
							class={classes([
								c.class,
								c.align === 'right' && 'r num',
								(c.nowrap ?? c.align === 'right') && 'nowrap'
							])}
							>{#if $$slots.cell}<slot name="cell" {row} column={c} value={row[c.key]}
									>{row[c.key] ?? ''}</slot
								>{:else}{row[c.key] ?? ''}{/if}</td
						>
					{/each}
				</tr>
			{:else}
				<tr><td class="empty" colspan={columns.length || 1}>{empty}</td></tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	caption {
		text-align: left;
		font-weight: 700;
		padding-bottom: var(--space-3xs);
	}
	.empty {
		color: var(--muted);
		text-align: center;
	}
	/* Números (plata, cantidades) y códigos en una sola línea: si no entran, la tabla se desliza
	   de costado (`.kv-table-wrap`); no se cortan «KV-0001» ni «$ 24.000». */
	.nowrap {
		white-space: nowrap;
	}
	/* Encabezado que ordena: un botón con el aspecto del texto del encabezado, con su flechita. */
	.sort {
		display: inline-flex;
		align-items: center;
		gap: var(--space-3xs);
		margin: 0;
		padding: 0;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		font-weight: inherit;
		text-align: inherit;
		cursor: pointer;
	}
	.sort:hover {
		text-decoration: underline;
	}
	/* En las columnas de números (a la derecha), la flecha va a la izquierda del nombre, así el
	   nombre queda alineado con los números. */
	th.r .sort {
		flex-direction: row-reverse;
	}
	/* Sin ordenar: la flecha doble, apagada; la columna ordenada lleva la flecha del sentido. */
	th:not([aria-sort]) .sort :global(.sort-icon) {
		opacity: 0.55;
	}
	/* Sitio: lo de `.kv-table` (panel.scss, solo dentro de `.kv-panel`) con los tokens del sitio
	   (encabezados violetas a 7.4:1 sobre blanco). */
	.kv-table-wrap.sitio {
		overflow-x: auto;
	}
	.kv-table-sitio {
		border-collapse: collapse;
		width: 100%;
		color: var(--ink);
	}
	.kv-table-sitio th,
	.kv-table-sitio td {
		text-align: left;
		padding: var(--space-3xs) var(--space-2xs);
		border-bottom: 1px solid var(--line);
	}
	.kv-table-sitio th {
		font-size: var(--text-sm);
		color: var(--2-dark);
		font-weight: 700;
	}
	.kv-table-sitio tbody tr:hover {
		background: var(--hover);
	}
	.kv-table-sitio .r {
		text-align: right;
	}
	.kv-table-sitio .num {
		font-variant-numeric: tabular-nums;
	}
	.kv-table-sitio .empty {
		text-align: center;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
