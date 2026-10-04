<script>
	import '$lib/admin/panel-forms.scss';
	import { enhance } from '$app/forms';
	import { Mail, Trash2 } from '@lucide/svelte';
	import { fieldErrors, fieldValue } from '$lib/admin/ajustes.js';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';

	export let data;
	export let form;

	$: errors = fieldErrors(form);
	/** @type {(key: string) => string} */
	$: value = (key) => fieldValue(form, data.settings, key);

	// Recordatorios: el tipo elegido en cada fila (la hora solo va con «días antes») y los que se
	// borran al guardar. Se vuelven a armar cuando llegan los guardados.
	/** @type {Record<number, string>} */
	let kinds = {};
	/** @type {Record<number, boolean>} */
	let deleting = {};
	$: (data.reminders, (kinds = {}), (deleting = {}));
	$: kindOf = (/** @type {number} */ i, /** @type {{ kind: string } | null} */ r) =>
		kinds[i] ?? r?.kind ?? 'hours_before';
</script>

<PageHeader
	title="Mails"
	subtitle="Remitente, respuesta, pie de los mails, recordatorios antes de cada evento y envíos en tandas."
/>
<form
	class="kv-form settings"
	method="POST"
	action="?/save"
	use:enhance={() =>
		async ({ update }) =>
			update({ reset: false })}
>
	{#if !data.dbAvailable}
		<p class="kv-flash bad">
			No hay base de datos disponible (o faltan las migraciones): se usan las variables de entorno.
		</p>
	{/if}
	{#if form?.message}
		<p class="kv-flash" role="status">{form.message}</p>
	{:else if form?.error}
		<p class="kv-flash bad" role="alert">{form.error}</p>
	{/if}

	<Card title="Remitente y respuesta">
		<div class="kv-grid-2">
			<label class="kv-field">
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
				{#if errors.from_email}<small class="kv-error field-error">{errors.from_email}</small>{/if}
			</label>
			<label class="kv-field">
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
				{#if errors.reply_to_email}<small class="kv-error field-error"
						>{errors.reply_to_email}</small
					>{/if}
			</label>
		</div>
		<p class="kv-note">
			Vacíos: <code>{data.emailDefaults.from}</code> y <code>{data.emailDefaults.replyTo}</code>. El
			dominio del remitente tiene que estar verificado en Resend.
		</p>
	</Card>

	<Card title="Pie de los mails">
		<p class="kv-note">
			Lo que va abajo de todos los mails, debajo de «por qué te llega» (ese se cambia en cada
			plantilla). Texto común, <code>**negrita**</code> y links (<code>[texto](https://…)</code>,
			también <code>mailto:</code> y <code>tel:</code>); no se acepta HTML.
		</p>
		<label class="kv-field">
			<span>Línea de contacto</span>
			<input
				type="text"
				name="mail_footer_contact"
				value={value('mail_footer_contact')}
				placeholder={data.footer.contact}
				maxlength={data.footer.limits.mail_footer_contact}
				autocomplete="off"
				aria-describedby="footer-contact-help"
				aria-invalid={errors.mail_footer_contact ? 'true' : undefined}
			/>
			{#if errors.mail_footer_contact}<small class="kv-error field-error"
					>{errors.mail_footer_contact}</small
				>{/if}
			<small id="footer-contact-help" class="kv-note">
				<code>{'{{contacto}}'}</code> es la dirección de contacto (<code
					>{data.footer.contactEmail}</code
				>), con su link para escribir.
			</small>
		</label>
		<label class="kv-field">
			<span>Firma</span>
			<input
				type="text"
				name="mail_footer_signoff"
				value={value('mail_footer_signoff')}
				placeholder={data.footer.signoff}
				maxlength={data.footer.limits.mail_footer_signoff}
				autocomplete="off"
				aria-invalid={errors.mail_footer_signoff ? 'true' : undefined}
			/>
			{#if errors.mail_footer_signoff}<small class="kv-error field-error"
					>{errors.mail_footer_signoff}</small
				>{/if}
		</label>
		<p class="kv-note">
			Vacíos: «{data.footer.contact}» y «{data.footer.signoff}». La vista previa de las plantillas
			ya los muestra.
		</p>
	</Card>

	<Card title="Plantillas">
		<p class="kv-note">
			El asunto, el título y el texto de arriba de cada mail (entradas, datos para transferir,
			recordatorio, link de la transmisión y reembolso), con vista previa y prueba.
		</p>
		<div>
			<a class="kv-btn ghost" href="/admin/mensajes/plantillas">
				<Mail size={16} aria-hidden="true" /> Editar las plantillas
			</a>
		</div>
	</Card>

	<Card title="Recordatorios">
		<p class="kv-note">
			Mails a quienes compraron, antes de cada evento (con sus entradas o el link de la
			transmisión). Un evento puede no mandarlos: se apaga en su editor, en Entradas.
			{#if data.remindersDefault}Ahora: los de por defecto ({data.defaultReminders.join(
					' y '
				)}).{/if}
		</p>
		{#if !data.cronConfigured}
			<p class="kv-flash warn">
				Falta configurar los envíos automáticos del sitio: hasta entonces no se manda ninguno.
				Avisale a quien maneja el sitio (para técnicos: falta el secreto <code>CRON_SECRET</code> del
				Worker).
			</p>
		{/if}
		{#each [...data.reminders, null] as r, i (i)}
			{#if i < data.maxReminders}
				<div class="reminder" class:new={!r} class:deleting={deleting[i]}>
					{#if r}
						<label class="kv-check">
							<input
								type="checkbox"
								name="reminder_enabled_{i}"
								checked={r.enabled}
								aria-label="Recordatorio {i + 1} activado"
							/>
							<b>{r.text}</b>
						</label>
					{:else}
						<!-- La fila para sumar uno: sin casilla tildada (se activa al completarla). -->
						<input type="hidden" name="reminder_enabled_{i}" value="on" />
						<b>Agregar otro</b>
					{/if}
					<div class="kv-row">
						<select
							class="kv-input auto"
							name="reminder_kind_{i}"
							aria-label="Tipo del recordatorio {i + 1}"
							value={kindOf(i, r)}
							on:change={(e) => (kinds = { ...kinds, [i]: e.currentTarget.value })}
						>
							<option value="hours_before">horas antes</option>
							<option value="day_at">días antes, a la hora</option>
						</select>
						<input
							class="kv-input amount"
							type="number"
							name="reminder_amount_{i}"
							min="0"
							max="336"
							aria-label="Horas o días del recordatorio {i + 1}"
							value={r ? (r.kind === 'hours_before' ? r.hours : r.days) : ''}
						/>
						{#if kindOf(i, r) === 'day_at'}
							<input
								class="kv-input auto"
								type="time"
								name="reminder_time_{i}"
								aria-label="Hora del recordatorio {i + 1}"
								value={r?.kind === 'day_at' ? r.time : '09:00'}
							/>
						{/if}
						{#if r}
							{#if deleting[i]}
								<input type="hidden" name="reminder_delete_{i}" value="on" />
								<span class="kv-note">Se borra al guardar.</span>
								<button
									type="button"
									class="kv-btn small ghost"
									on:click={() => (deleting = { ...deleting, [i]: false })}>No borrar</button
								>
							{:else}
								<button
									type="button"
									class="kv-btn small ghost"
									aria-label="Borrar el recordatorio {i + 1}"
									on:click={() => (deleting = { ...deleting, [i]: true })}
									><Trash2 size={14} aria-hidden="true" /> Borrar</button
								>
							{/if}
						{/if}
					</div>
				</div>
			{/if}
		{/each}
		{#if errors.reminders}<small class="kv-error field-error">{errors.reminders}</small>{/if}
		<p class="kv-note">
			«Horas antes»: desde la hora de inicio (48 = 2 días antes). «Días antes, a la hora»: 0 = el
			mismo día; hora de Argentina. Salen en la primera vuelta de mails (cada 15 minutos) después de
			esa hora (en un evento grande, en varias vueltas: ver «Envíos en tandas»), una sola vez por
			compra.
		</p>
	</Card>

	<Card title="Envíos en tandas">
		<label class="kv-field batch">
			<span>Mails por tanda</span>
			<input
				class="kv-input"
				type="number"
				name="mail_batch_size"
				inputmode="numeric"
				min={data.batch.min}
				max={data.batch.max}
				step="1"
				value={value('mail_batch_size')}
				placeholder={String(data.batch.default)}
				aria-describedby="batch-help"
				aria-invalid={errors.mail_batch_size ? 'true' : undefined}
			/>
			{#if errors.mail_batch_size}<small class="kv-error field-error"
					>{errors.mail_batch_size}</small
				>{/if}
		</label>
		<p class="kv-note" id="batch-help">
			Cuántos mails se mandan por vez; si alguno falla, sigue en la próxima vuelta. Vale para los
			recordatorios y para «Enviar el link a todes»: cada vuelta de mails (cada 15 minutos) manda
			como mucho esta cantidad y la siguiente sigue donde quedó. De {data.batch.min} a {data.batch
				.max}; vacío = {data.batch.default}. Un mail que falla se reintenta hasta 3 veces; después
			aparece en «Para revisar» del Inicio.
		</p>
	</Card>

	<div class="kv-row">
		<button class="kv-btn" type="submit">Guardar ajustes</button>
	</div>
</form>

<style>
	.settings {
		max-width: 48rem;
	}
	.reminder {
		display: flex;
		flex-direction: column;
		gap: var(--space-3xs);
		padding: var(--space-2xs) var(--space-xs);
		border-radius: var(--radius-m);
		background: var(--surface-2);
	}
	.reminder.new {
		opacity: 0.85;
	}
	.reminder .auto {
		width: auto;
	}
	.reminder .amount {
		width: 5.5rem;
	}
	.small {
		font-size: var(--text-sm);
	}
	.batch {
		max-width: 12rem;
	}
</style>
