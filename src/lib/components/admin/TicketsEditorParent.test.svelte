<!--
	Solo para las pruebas (TicketsEditor.tramos.dom.test.js): el padre de TicketsEditor como lo usa
	PostEditor (`bind:state`), que dice si ve un cambio respecto del formulario inicial (lo que
	prende «Guardar»).
-->
<script>
	import TicketsEditor from './TicketsEditor.svelte';
	import { readTicketsForm, ticketsFormChanged } from '$lib/utils/ticketsEditor.js';

	/** @type {Record<string, any>} el frontmatter del evento */
	export let meta;

	const initial = readTicketsForm(meta);
	let state = readTicketsForm(meta);
	$: changed = ticketsFormChanged(initial, state);
</script>

<TicketsEditor bind:state idPrefix="edit" />
<output data-testid="changed">{changed ? 'con cambios' : 'sin cambios'}</output>
