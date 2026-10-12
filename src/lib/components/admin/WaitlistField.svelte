<!--
	«Lista de espera» del editor de eventos, dentro de «Entradas» (TicketsEditor): sin lista, por
	evento o por tipo de entrada y «Avisar a todes a la vez desde el principio». Los tiempos de
	reserva son fijos (`WAITLIST_SETTINGS`; gorrite, 12/10: no se configuran ni por evento ni en Ajustes).
	Escribe la clave `lista_espera` ($lib/utils/ticketsEditor.js). Con gente anotada, el editor no deja
	apagarla ni cambiar el alcance (lo dicen los errores de la venta).

	Props (con bind): `scope`, `allAtOnce`. Además `idPrefix`, `enabled` (el
	interruptor `lista_espera`: `false` avisa que está apagado; `null` no se sabe) y `live` (gente
	anotada por alcance, para avisar).
-->
<script>
	import Notice from '$lib/components/ui/Notice.svelte';

	/** @type {'' | 'evento' | 'tipo'} */
	export let scope = '';
	export let allAtOnce = false;
	export let idPrefix = 'ev';
	/** @type {boolean | null} */
	export let enabled = null;
	/** @type {Record<string, number> | null} */
	export let live = null;

	$: people = live ? Object.values(live).reduce((a, b) => a + b, 0) : 0;
</script>

<fieldset class="waitlist" id="{idPrefix}-waitlist">
	<legend>Lista de espera</legend>
	<label class="part">
		<span>Cuando se agota</span>
		<select
			id="{idPrefix}-waitlist-scope"
			bind:value={scope}
			aria-describedby="{idPrefix}-waitlist-help"
		>
			<option value="">Sin lista de espera</option>
			<option value="evento">Lista por evento (una sola fila)</option>
			<option value="tipo">Lista por tipo de entrada (una fila por tipo con cupo)</option>
		</select>
	</label>
	<small id="{idPrefix}-waitlist-help"
		>Cuando se agota, la gente deja su mail. Si se libera un lugar, le avisamos a la primera persona
		de la fila y se lo guardamos un rato; si no compra, pasa a la siguiente.</small
	>
	{#if enabled === false}
		<Notice tone="warn" compact role={null}
			>La lista de espera está apagada en Ajustes → Interruptores (prueba): lo que elijas se guarda,
			pero no se usa hasta prenderla.</Notice
		>
	{/if}
	{#if people > 0}
		<small class="live"
			>{people === 1 ? 'Hay 1 persona anotada' : `Hay ${people} personas anotadas`}: para apagarla o
			cambiar el alcance, cerrá la lista primero (Ventas › Lista de espera, en la ficha).</small
		>
	{/if}
	{#if scope}
		<label class="check">
			<input type="checkbox" id="{idPrefix}-waitlist-all" bind:checked={allAtOnce} />
			Avisar a todes a la vez desde el principio (se lo queda quien compre primero)
		</label>
		<small
			>El lugar se guarda 24 h, 12 h o 2 h según cuánto falte para el comienzo (con menos de 6 h, se
			les avisa a todes a la vez).</small
		>
	{/if}
</fieldset>

<style>
	.waitlist {
		border: 0;
		padding: 0;
		margin: 0;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.35em;
	}
	legend {
		float: none;
		padding: 0;
		margin-bottom: 0.3em;
		color: var(--1-dark);
	}
	.part {
		display: flex;
		flex-direction: column;
		gap: 0.25em;
		max-width: 26em;
		min-width: 0;
	}
	.part > span {
		color: var(--1-dark);
	}
	.check {
		display: flex;
		align-items: flex-start;
		gap: 0.4em;
	}
	.live {
		font-weight: 700;
	}
</style>
