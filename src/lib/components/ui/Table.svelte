<script>
	/**
	 * Tabla para leer (`.kv-table` del panel): encabezados violetas, filas con línea abajo y fondo
	 * suave al pasar el mouse. En el celu se desliza de costado. El estilo de planilla editable va
	 * solo donde se edita.
	 *
	 * Props: `columns`: { key, label, align?: 'left' | 'right' }[]; `rows`: objetos con esas
	 * claves; `caption` (opcional, para lectores de pantalla y arriba de la tabla); `empty`: texto
	 * si no hay filas (default «No hay nada para mostrar.»); `rowKey`: clave única de cada fila.
	 * Slot `cell` (opcional, `let:row let:column let:value`): para dibujar una celda a mano.
	 */
	/** @type {{ key: string, label: string, align?: 'left' | 'right' }[]} */
	export let columns = [];
	/** @type {Record<string, any>[]} */
	export let rows = [];
	/** @type {string} */
	export let caption = '';
	export let empty = 'No hay nada para mostrar.';
	/** @type {string | undefined} */
	export let rowKey = undefined;
</script>

<div class="kv-table-wrap">
	<table class="kv-table">
		{#if caption}<caption>{caption}</caption>{/if}
		<thead>
			<tr>
				{#each columns as c (c.key)}
					<th scope="col" class:r={c.align === 'right'}>{c.label}</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each rows as row, i (rowKey ? row[rowKey] : i)}
				<tr>
					{#each columns as c (c.key)}
						<td class:r={c.align === 'right'} class:num={c.align === 'right'}
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
</style>
