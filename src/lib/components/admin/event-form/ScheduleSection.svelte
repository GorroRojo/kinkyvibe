<script>
	/**
	 * Sección «📅 ¿Cuándo es?» del formulario al crear o duplicar un evento: el día (DayPicker,
	 * arranca vacío a propósito), las horas, el fin opcional y el resumen del horario. Movida tal
	 * cual desde /admin/eventos/nuevo. (Al editar, Empieza y Termina todavía están en «Datos».)
	 *
	 * Props:
	 * - `values` (bind): el formulario (`startDate`, `startTime`, `hasEnd`, `endDate`, `endTime`).
	 * - `month` (bind): el mes que muestra el calendario.
	 * - `today`: hoy en Argentina (YYYY-MM-DD).
	 * - `hintWeekday`: día de la semana del evento original, para resaltarlo (duplicar).
	 * - `originalSchedule`: cuándo fue el original, en palabras (duplicar).
	 * - `scheduleText`, `scheduleError`: el horario en palabras o lo que tiene mal.
	 * - `onEndsNextDay()`: el botón «¿Termina al día siguiente?».
	 * - `fromAgenda`: el día vino de la agenda (se tocó un día), así que no arranca vacío.
	 */
	import DayPicker from '$lib/components/admin/DayPicker.svelte';

	/** @type {any} */
	export let values;
	export let month = '';
	export let today = '';
	/** @type {number | undefined} */
	export let hintWeekday = undefined;
	export let originalSchedule = '';
	export let scheduleText = '';
	/** @type {string | null} */
	export let scheduleError = null;
	export let onEndsNextDay = () => {};
	export let fromAgenda = false;
</script>

<fieldset class="card" id="sec-cuando">
	<legend>📅 ¿Cuándo es?</legend>
	{#if originalSchedule}
		<p class="hint">El evento original fue el {originalSchedule}.</p>
	{/if}
	<div class="field-label">
		<span id="ev-start-date-label">Día que empieza <span class="req">*</span></span>
		<DayPicker
			bind:value={values.startDate}
			bind:month
			{today}
			{hintWeekday}
			describedby="ev-start-date-help"
		/>
		<small id="ev-start-date-help">
			{#if fromAgenda}Es el día que tocaste en la agenda: cambialo si hace falta.{:else}Elegí el
				día: arranca vacío a propósito para que nadie publique la fecha vieja.{/if}
			{#if hintWeekday !== undefined}Resaltamos el mismo día de la semana que el original.{/if}
		</small>
		{#if values.startDate && values.startDate < today}
			<p class="warning">⚠️ Esa fecha ya pasó.</p>
		{/if}
	</div>
	<div class="grid">
		<label class="field">
			<span>Hora que empieza <span class="req">*</span></span>
			<input type="time" id="ev-start-time" bind:value={values.startTime} required />
		</label>
		{#if values.hasEnd}
			<label class="field">
				<span>Día que termina <span class="req">*</span></span>
				<input
					type="date"
					id="ev-end-date"
					bind:value={values.endDate}
					min={values.startDate}
					required
				/>
			</label>
			<label class="field">
				<span>Hora que termina <span class="req">*</span></span>
				<input type="time" id="ev-end-time" bind:value={values.endTime} required />
			</label>
		{/if}
	</div>
	<label class="check">
		<input type="checkbox" id="ev-has-end" bind:checked={values.hasEnd} />
		Tiene hora de finalización
	</label>
	{#if scheduleText && !scheduleError}
		<p class="schedule">🗓️ <span>{scheduleText}</span></p>
	{/if}
	{#if scheduleError}
		<p class="error">
			{scheduleError}
			{#if values.startDate === values.endDate}
				<button type="button" class="link" on:click={onEndsNextDay}
					>¿Termina al día siguiente?</button
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
