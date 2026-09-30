<script>
	/**
	 * "⬇ CSV": toda tabla del panel lo ofrece. Dos formas:
	 * - `href`: link a un endpoint `+server.js` que devuelve el CSV (`toCsv` + `csvResponse` de
	 *   `$lib/admin/csv.js`), para listas largas o con datos que no están en la página;
	 * - `rows` + `columns` (+ `filename`): arma el CSV en el navegador con lo que ya se muestra.
	 * Props: `href`, `rows`, `columns` (ver `CsvColumn` en csv.js), `filename`, `label` ("CSV").
	 */
	import { downloadCsv, toCsv } from '$lib/admin/csv.js';
	/** @type {string} */
	export let href = '';
	/** @type {readonly any[]} */
	export let rows = [];
	/** @type {readonly import('$lib/admin/csv.js').CsvColumn<any>[]} */
	export let columns = [];
	export let filename = 'export.csv';
	export let label = 'CSV';

	function download() {
		downloadCsv(toCsv(rows, columns), filename);
	}
</script>

{#if href}
	<a class="kv-btn ghost" {href} download data-sveltekit-reload>⬇ {label}</a>
{:else}
	<button type="button" class="kv-btn ghost" on:click={download} disabled={!columns.length}
		>⬇ {label}</button
	>
{/if}
