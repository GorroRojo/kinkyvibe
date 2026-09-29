<script>
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	/** @type {Record<string, string>} */
	let errors = $derived(form && 'errors' in form ? (form.errors ?? {}) : {});
	/** @param {string} key */
	function value(key) {
		if (form && 'values' in form && form.values) return String(form.values[key] ?? '');
		return String(/** @type {Record<string, any>} */ (data.settings ?? {})[key] ?? '');
	}
	let transferSet = $derived(data.fields.some((f) => value(f.key).trim()));
	/** Comisión que se usa si el campo queda vacío (TICKETS_MP_FEE_PERCENT o 2 %). */
	let feeDefault = $derived(String(data.env.feePercent).replace('.', ','));

	/** @param {number | null} ms */
	function date(ms) {
		return ms
			? new Date(ms).toLocaleString('es-AR', {
					dateStyle: 'short',
					timeStyle: 'short',
					hourCycle: 'h23',
					timeZone: 'America/Argentina/Buenos_Aires'
				})
			: '';
	}
</script>

<svelte:head>
	<title>Ajustes de venta - KV Admin</title>
</svelte:head>

<div class="settings-page">
	<p><a href="/admin/entradas">← Entradas</a></p>
	<h1>Ajustes de venta</h1>

	{#if !data.dbAvailable}
		<p class="flash error">
			No hay base de datos disponible (o faltan las migraciones): se usan las variables de entorno.
		</p>
	{/if}
	{#if form?.message}
		<p class="flash" role="status">{form.message}</p>
	{:else if form?.error}
		<p class="flash error" role="alert">{form.error}</p>
	{/if}

	<form
		method="POST"
		action="?/save"
		use:enhance={() =>
			async ({ update }) =>
				update({ reset: false })}
	>
		<fieldset>
			<legend>Datos para transferir</legend>
			<p class="note">
				Es lo que ve quien elige pagar por transferencia (en la página de su compra y en el mail).
				Texto libre; se muestran solo los campos completos.
				{#if transferSet}
					La opción <strong>Transferencia</strong> se ofrece en los eventos que la habilitan (<code
						>payment_methods</code
					>).
				{:else if data.env.transfer}
					Vacío: se usan los datos de la variable <code>TICKETS_TRANSFER_INFO</code> del servidor.
				{:else}
					<strong>Vacío: no se ofrece pagar por transferencia</strong> en ningún evento.
				{/if}
			</p>
			{#each data.fields as f (f.key)}
				<label class="field">
					<span>{f.label}</span>
					<input
						type="text"
						name={f.key}
						value={value(f.key)}
						maxlength={f.max}
						autocomplete="off"
						spellcheck="false"
						aria-invalid={errors[f.key] ? 'true' : undefined}
					/>
					{#if errors[f.key]}<span class="field-error">{errors[f.key]}</span>{/if}
				</label>
			{/each}
		</fieldset>

		<fieldset>
			<legend>Fondo KinkyVibe</legend>
			<p class="fondo-now">
				Descuento del Fondo ahora: <strong>{data.fondo.percent} %</strong>
				<small>
					{#if data.fondo.source === 'admin'}
						— fijado a mano acá abajo (vaciá el campo para que vuelva a ser automático).
					{:else if data.fondo.source === 'live'}
						— se actualiza solo desde
						<a href="https://fondo.kinkyvibe.ar" target="_blank" rel="noopener"
							>fondo.kinkyvibe.ar</a
						>{#if data.fondo.updatedAt}; último dato: {date(data.fondo.updatedAt)}{/if}.
					{:else if data.fondo.source === 'stored'}
						— fondo.kinkyvibe.ar no responde ahora: se usa el último dato ({date(
							data.fondo.updatedAt
						)}).
					{:else if data.fondo.source === 'override'}
						— valor de prueba (FONDO_PERCENT_OVERRIDE, solo en desarrollo).
					{:else}
						— no se pudo leer de fondo.kinkyvibe.ar y no hay un dato anterior: sin descuento.
					{/if}
				</small>
			</p>
			<label class="field">
				<span>Fijar el porcentaje a mano (%)</span>
				<input
					type="text"
					name="fondo_percent_override"
					inputmode="numeric"
					value={value('fondo_percent_override')}
					placeholder="automático"
					maxlength="4"
					autocomplete="off"
					aria-invalid={errors.fondo_percent_override ? 'true' : undefined}
				/>
				{#if errors.fondo_percent_override}<span class="field-error"
						>{errors.fondo_percent_override}</span
					>{/if}
			</label>
			<p class="note">
				Vacío = automático: el porcentaje del mes de fondo.kinkyvibe.ar, en todos los tipos de
				entrada con precio (no en los a la gorra). Un evento con <code>fondo_percent</code> en su frontmatter
				usa ese. Cada compra guarda el porcentaje con el que se calculó.
			</p>
		</fieldset>

		<fieldset>
			<legend>Mercado Pago</legend>
			<label class="field">
				<span>Comisión que se suma como recargo (%)</span>
				<input
					type="text"
					name="mp_fee_percent"
					inputmode="decimal"
					value={form && 'values' in form
						? value('mp_fee_percent')
						: value('mp_fee_percent') || feeDefault}
					placeholder={feeDefault}
					maxlength="6"
					autocomplete="off"
					aria-invalid={errors.mp_fee_percent ? 'true' : undefined}
				/>
				{#if errors.mp_fee_percent}<span class="field-error">{errors.mp_fee_percent}</span>{/if}
			</label>
			<p class="note">
				Se suma al pagar con Mercado Pago para que, después de la comisión, llegue el precio de la
				entrada. La comisión real cambia según el plan y el plazo de acreditación de la cuenta de
				MP: revisala y ajustala acá (con <code>0</code>, sin recargo). Si un evento tiene
				<code>mp_fee_percent</code> en su frontmatter, manda ese. Vacío: {feeDefault} % (la variable
				<code>TICKETS_MP_FEE_PERCENT</code> o, si no está, 2 %).
			</p>
		</fieldset>

		<fieldset>
			<legend>Mails</legend>
			<label class="field">
				<span>Remitente</span>
				<input
					type="text"
					name="from_email"
					value={value('from_email')}
					placeholder={data.emailDefaults.from}
					maxlength="120"
					autocomplete="off"
					spellcheck="false"
					aria-invalid={errors.from_email ? 'true' : undefined}
				/>
				{#if errors.from_email}<span class="field-error">{errors.from_email}</span>{/if}
			</label>
			<label class="field">
				<span>Responder a (y adonde mandan los comprobantes)</span>
				<input
					type="email"
					name="reply_to_email"
					value={value('reply_to_email')}
					placeholder={data.emailDefaults.replyTo}
					maxlength="120"
					autocomplete="off"
					spellcheck="false"
					aria-invalid={errors.reply_to_email ? 'true' : undefined}
				/>
				{#if errors.reply_to_email}<span class="field-error">{errors.reply_to_email}</span>{/if}
			</label>
			<p class="note">
				Vacíos: <code>{data.emailDefaults.from}</code> y <code>{data.emailDefaults.replyTo}</code>.
				El dominio del remitente tiene que estar verificado en Resend.
			</p>
		</fieldset>

		<fieldset>
			<legend>Recordatorios</legend>
			<p class="note">
				Mails a quienes compraron, antes de cada evento (con sus entradas o el link de la
				transmisión). Un evento puede no mandarlos con <code>recordatorios: false</code> en su
				frontmatter.
				{#if data.remindersDefault}Ahora: los de por defecto ({data.defaultReminders.join(
						' y '
					)}).{/if}
				{#if !data.cronConfigured}
					<strong
						>Falta configurar el cron (CRON_SECRET y el Worker de <code>workers/cron/</code>): hasta
						entonces no se manda ninguno.</strong
					>
				{/if}
			</p>
			{#each [...data.reminders, null] as r, i (i)}
				{#if i < data.maxReminders}
					<div class="reminder" class:new={!r}>
						<label class="check">
							<input
								type="checkbox"
								name="reminder_enabled_{i}"
								checked={r ? r.enabled : true}
								aria-label="Recordatorio {i + 1} activado"
							/>
							<span>{r ? r.text : 'Agregar otro'}</span>
						</label>
						<div class="reminder-row">
							<select
								name="reminder_kind_{i}"
								aria-label="Tipo del recordatorio {i + 1}"
								value={r?.kind ?? 'hours_before'}
							>
								<option value="hours_before">horas antes</option>
								<option value="day_at">días antes, a la hora</option>
							</select>
							<input
								type="number"
								name="reminder_amount_{i}"
								min="0"
								max="336"
								aria-label="Horas o días del recordatorio {i + 1}"
								value={r ? (r.kind === 'hours_before' ? r.hours : r.days) : ''}
							/>
							<input
								type="time"
								name="reminder_time_{i}"
								aria-label="Hora del recordatorio {i + 1} (solo días antes)"
								value={r?.kind === 'day_at' ? r.time : '09:00'}
							/>
							{#if r}
								<label class="check small">
									<input type="checkbox" name="reminder_delete_{i}" /> borrar
								</label>
							{/if}
						</div>
					</div>
				{/if}
			{/each}
			{#if errors.reminders}<span class="field-error">{errors.reminders}</span>{/if}
			<p class="note">
				"Horas antes": desde la hora de inicio (48 = 2 días antes). "Días antes, a la hora": 0 = el
				mismo día; hora de Argentina. Se mandan en la primera pasada del cron (cada 15 minutos)
				después de esa hora, una sola vez por compra.
			</p>
		</fieldset>

		<button type="submit">Guardar ajustes</button>
		{#if data.settings?.updatedAt}
			<p class="note">
				Último cambio: {date(data.settings.updatedAt)} por {data.settings.updatedBy}.
			</p>
		{/if}
	</form>
</div>

<style>
	.settings-page {
		max-width: 36rem;
		margin: 0 auto;
		padding: 0 16px 3em;
	}
	h1 {
		font-size: var(--step-3);
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 1.2em;
	}
	fieldset {
		border: 0;
		margin: 0;
		padding: 0.8em 1em 1em;
		border-radius: 0.8em;
		background: white;
		outline: 2px solid color-mix(in srgb, var(--2) 30%, transparent);
		display: flex;
		flex-direction: column;
		gap: 0.7em;
		min-width: 0;
	}
	legend {
		font-weight: bold;
		font-size: var(--step-1);
		padding: 0 0.3em;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25em;
	}
	.field > span:first-child {
		font-weight: bold;
		font-size: var(--step--1);
	}
	input {
		font: inherit;
		padding: 0.55em 0.7em;
		min-height: 2.8em;
		border-radius: 0.5em;
		border: 2px solid color-mix(in srgb, var(--2) 45%, transparent);
		min-width: 0;
	}
	.note {
		font-size: var(--step--1);
		color: #555;
		margin: 0;
	}
	button {
		font: inherit;
		font-weight: bold;
		align-self: flex-start;
		border: 0;
		border-radius: 0.6em;
		padding: 0.8em 1.4em;
		min-height: 3em;
		background: var(--3-dark);
		color: white;
		cursor: pointer;
	}
	.flash {
		background: var(--3-light);
		padding: 0.5em 0.7em;
		border-radius: 0.5em;
	}
	.flash.error {
		background: hsl(0, 90%, 90%);
	}
	.reminder {
		display: flex;
		flex-direction: column;
		gap: 0.3em;
		padding: 0.5em 0.7em;
		border-radius: 0.6em;
		background: color-mix(in srgb, var(--2) 6%, white);
	}
	.reminder.new {
		opacity: 0.85;
	}
	.reminder-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4em;
		align-items: center;
	}
	.reminder-row input[type='number'] {
		width: 5em;
	}
	.reminder select {
		font: inherit;
		min-height: 2.8em;
		border-radius: 0.5em;
		border: 2px solid color-mix(in srgb, var(--2) 45%, transparent);
		background: white;
	}
	.check {
		display: flex;
		gap: 0.4em;
		align-items: center;
		font-weight: bold;
	}
	.check.small {
		font-weight: normal;
		font-size: var(--step--1);
	}
	.check input {
		min-height: auto;
		width: 1.2em;
		height: 1.2em;
	}
	.fondo-now {
		margin: 0;
	}
	.fondo-now strong {
		font-size: var(--step-1);
	}
	.field-error {
		color: hsl(0, 75%, 40%);
		font-size: var(--step--1);
	}
</style>
