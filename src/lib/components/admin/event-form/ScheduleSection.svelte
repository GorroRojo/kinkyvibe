<script>
	/**
	 * Sección «📅 ¿Cuándo es?» del formulario, la misma al crear o duplicar un evento
	 * (/admin/eventos/nuevo) y al editarlo (PostEditor): el día (DayPicker), las horas, el fin
	 * opcional y el horario en palabras. Pasar de esto a lo que se guarda: `$lib/admin/schedule.js`.
	 *
	 * Cuando cambia el día de inicio (o se prende «Tiene hora de finalización»), el día de fin lo
	 * sigue con la misma duración en días (`span`); cambiar el día de fin cambia la duración.
	 *
	 * Props:
	 * - `values` (bind): el formulario (`startDate`, `startTime`, `hasEnd`, `endDate`, `endTime`).
	 * - `span` (bind): la duración en días (`scheduleSpan`).
	 * - `month` (bind): el mes que muestra el calendario.
	 * - `today`: hoy en Argentina (YYYY-MM-DD).
	 * - `mode`: `nuevo` (el día arranca vacío a propósito) o `editar`.
	 * - `idPrefix`: `ev` al crear (los ids de siempre: `ev-start-date`, `ev-start-time`…), `edit`
	 *   al editar.
	 * - `hintWeekday`: día de la semana del evento original, para resaltarlo (duplicar).
	 * - `originalSchedule`: cuándo fue el original, en palabras (duplicar).
	 * - `scheduleText`, `scheduleError`: el horario en palabras o lo que tiene mal.
	 * - `fromAgenda`: el día vino de la agenda (se tocó un día), así que no arranca vacío.
	 * - `resync()`: llamarla después de cambiar `values` desde afuera (al recuperar un borrador),
	 *   para que el día de fin recuperado no se recalcule desde el de inicio.
	 */
	import DayPicker from '$lib/components/admin/DayPicker.svelte';
	import { addDays, isValidDate } from '$lib/utils/eventDraft.js';
	import { endDateFollowingStart, scheduleSpan } from '$lib/admin/schedule.js';

	/** @type {import('$lib/admin/schedule.js').Schedule} */
	export let values;
	export let span = 0;
	export let month = '';
	export let today = '';
	/** @type {'nuevo' | 'editar'} */
	export let mode = 'nuevo';
	export let idPrefix = 'ev';
	/** @type {number | undefined} */
	export let hintWeekday = undefined;
	export let originalSchedule = '';
	export let scheduleText = '';
	/** @type {string | null} */
	export let scheduleError = null;
	export let fromAgenda = false;

	// Corre después de que los bind actualizaron `values` (el orden de los eventos no está
	// garantizado). Arranca con lo que hay: abrir el formulario no cambia el día de fin.
	/** @param {import('$lib/admin/schedule.js').Schedule} v */
	const startKey = (v) => `${v.startDate}|${v.hasEnd}`;
	let lastStartKey = startKey(values);
	let lastEnd = values.endDate;
	$: if (startKey(values) !== lastStartKey) {
		lastStartKey = startKey(values);
		values.endDate = endDateFollowingStart(values, span);
		lastEnd = values.endDate;
	}
	$: if (values.endDate !== lastEnd) {
		lastEnd = values.endDate;
		if (isValidDate(values.startDate) && isValidDate(values.endDate)) span = scheduleSpan(values);
	}

	export function resync() {
		lastStartKey = startKey(values);
		lastEnd = values.endDate;
		if (isValidDate(values.startDate) && isValidDate(values.endDate)) span = scheduleSpan(values);
	}

	function endsNextDay() {
		values.endDate = addDays(values.startDate, 1);
		span = 1;
	}
</script>

<fieldset class="card" id="sec-cuando">
	<legend>📅 ¿Cuándo es?</legend>
	{#if originalSchedule}
		<p class="hint">El evento original fue el {originalSchedule}.</p>
	{/if}
	<div class="field-label">
		<span id="{idPrefix}-start-date-label">Día que empieza <span class="req">*</span></span>
		<DayPicker
			bind:value={values.startDate}
			bind:month
			{today}
			{hintWeekday}
			id="{idPrefix}-start-date"
			describedby="{idPrefix}-start-date-help"
		/>
		<small id="{idPrefix}-start-date-help">
			{#if mode === 'editar'}Si el evento cambia de día, el día que termina se mueve con él.{:else if fromAgenda}Es
				el día que tocaste en la agenda: cambialo si hace falta.{:else}Elegí el día: arranca vacío a
				propósito para que nadie publique la fecha vieja.{/if}
			{#if hintWeekday !== undefined}Resaltamos el mismo día de la semana que el original.{/if}
		</small>
		{#if mode === 'nuevo' && values.startDate && values.startDate < today}
			<p class="warning">⚠️ Esa fecha ya pasó.</p>
		{/if}
	</div>
	<div class="grid">
		<label class="field">
			<span>Hora que empieza <span class="req">*</span></span>
			<input type="time" id="{idPrefix}-start-time" bind:value={values.startTime} required />
		</label>
		{#if values.hasEnd}
			<label class="field">
				<span>Día que termina <span class="req">*</span></span>
				<input
					type="date"
					id="{idPrefix}-end-date"
					bind:value={values.endDate}
					min={values.startDate}
					required
				/>
			</label>
			<label class="field">
				<span>Hora que termina <span class="req">*</span></span>
				<input type="time" id="{idPrefix}-end-time" bind:value={values.endTime} required />
			</label>
		{/if}
	</div>
	<label class="check">
		<input type="checkbox" id="{idPrefix}-has-end" bind:checked={values.hasEnd} />
		Tiene hora de finalización
	</label>
	{#if scheduleText && !scheduleError}
		<p class="schedule">🗓️ <span>{scheduleText}</span></p>
	{/if}
	{#if scheduleError}
		<p class="error">
			{scheduleError}
			{#if values.startDate === values.endDate}
				<button type="button" class="link" on:click={endsNextDay}>¿Termina al día siguiente?</button
				>
			{/if}
		</p>
	{/if}
</fieldset>

<style lang="scss">
	.schedule {
		margin: 0;
		background: var(--3-light);
		border-radius: 0.8em;
		padding: 0.4em 0.8em;
		span {
			display: inline-block;
			&::first-letter {
				text-transform: uppercase;
			}
		}
	}
</style>
