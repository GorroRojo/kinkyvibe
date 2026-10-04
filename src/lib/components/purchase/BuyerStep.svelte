<script>
	/**
	 * Paso «Tus datos» de la compra: quien compra (nombre, pronombres, email y DNI), el nombre y
	 * los pronombres de cada entrada y las preguntas de inscripción que aplican al tipo elegido
	 * (las de una vez por entrada, dentro de cada entrada; las de una vez por compra, al final).
	 * Los valores los maneja TicketPurchase.svelte (con `bind:`).
	 *
	 * Con cuenta (`signedIn`), las casillas de los datos guardados: «Guardar mis datos para la
	 * próxima» (nombre y pronombres) y, aparte, «Recordar mi DNI» (docs/cuentas.md).
	 */
	import SignupFieldInputs from '$lib/components/SignupFieldInputs.svelte';

	export let buyerName = '';
	export let buyerPronouns = '';
	export let email = '';
	export let dni = '';
	/** @type {{ name: string, pronouns: string }[]} */
	export let holders = [];
	/** La entrada 1 copia los datos de quien compra hasta que alguien la edite. */
	export let firstHolderEdited = false;
	export let firstPronounsEdited = false;
	/** Con cuenta: muestra las casillas de los datos guardados. */
	export let signedIn = false;
	export let remember = false;
	export let rememberDni = false;
	export let count = 1;
	/** @type {import('$lib/utils/signupFields.js').SignupField[]} */
	export let ticketFields = [];
	/** @type {import('$lib/utils/signupFields.js').SignupField[]} */
	export let purchaseFields = [];
	/** Respuestas que volvieron del servidor (por `name` del campo). */
	/** @type {Record<string, string>} */
	export let answers = {};
	/** @type {Record<string, string>} */
	export let errors = {};

	$: indexes = Array.from({ length: count }, (_, n) => n);
</script>

<fieldset class="group">
	<legend>Quién compra</legend>
	<div class="row">
		<label class="field">
			<span>Tu nombre</span>
			<input
				type="text"
				name="name"
				autocomplete="name"
				minlength="2"
				maxlength="80"
				required
				bind:value={buyerName}
				aria-invalid={errors.name ? 'true' : undefined}
			/>
			{#if errors.name}<span class="field-error">{errors.name}</span>{/if}
		</label>
		<div class="field">
			<span class="label-row">
				<label for="entradas-tus-pronombres">Tus pronombres</label>
				<a
					class="help"
					href="https://pronombr.es"
					target="_blank"
					rel="noopener"
					title="¿Qué son los pronombres? (se abre en otra pestaña)"
					aria-label="¿Qué son los pronombres? (se abre en otra pestaña)">?</a
				>
			</span>
			<input
				id="entradas-tus-pronombres"
				type="text"
				name="pronouns"
				maxlength="40"
				placeholder="ella, él, elle…"
				autocomplete="off"
				required
				bind:value={buyerPronouns}
				aria-invalid={errors.pronouns ? 'true' : undefined}
			/>
			{#if errors.pronouns}<span class="field-error">{errors.pronouns}</span>{/if}
		</div>
	</div>
	<div class="row">
		<label class="field">
			<span>Email (ahí mandamos {count === 1 ? 'la entrada' : 'las entradas'})</span>
			<input
				type="email"
				name="email"
				autocomplete="email"
				maxlength="254"
				required
				bind:value={email}
				aria-invalid={errors.email ? 'true' : undefined}
			/>
			{#if errors.email}<span class="field-error">{errors.email}</span>{/if}
		</label>
		<label class="field">
			<span>DNI (número de documento)</span>
			<input
				type="text"
				name="dni"
				inputmode="numeric"
				autocomplete="off"
				maxlength="12"
				required
				placeholder="Ej.: 12.345.678"
				bind:value={dni}
				aria-invalid={errors.dni ? 'true' : undefined}
			/>
			{#if errors.dni}<span class="field-error">{errors.dni}</span>{/if}
		</label>
	</div>
	<small class="hint">
		El email y el DNI son datos administrativos de la compra: el DNI no aparece en las entradas ni
		en los mails.
	</small>
	{#if signedIn}
		<div class="save-box">
			<!-- Dice que este formulario mostró las casillas (sin esto, el servidor no toca nada). -->
			<input type="hidden" name="datos_cuenta" value="1" />
			<label class="check">
				<input type="checkbox" name="guardar_datos" value="1" bind:checked={remember} />
				<span>Guardar mis datos para la próxima</span>
			</label>
			<small class="hint"
				>Tu nombre y tus pronombres quedan en tu cuenta. Si comprás para otra persona, destildalo
				para no reemplazar tus datos.</small
			>
			<label class="check">
				<input type="checkbox" name="recordar_dni" value="1" bind:checked={rememberDni} />
				<span>Recordar mi DNI</span>
			</label>
			<small class="hint">
				Solo si lo marcás. Lo ves solo vos. En Mi rincón → Mis datos podés ver, cambiar o borrar lo
				guardado.
			</small>
		</div>
	{/if}
</fieldset>

<fieldset class="group">
	<legend>{count === 1 ? 'Tu entrada' : 'Las entradas'}</legend>
	<small class="hint">
		Nombre y pronombres de cada persona, para el evento. El nombre es como le conocen: no tiene que
		ser el del documento.
	</small>
	{#each indexes as i (i)}
		<fieldset class="holder">
			<legend
				>Entrada {i + 1}{#if i === 0}&nbsp;(vos){/if}</legend
			>
			<div class="row">
				<label class="field">
					<span>Nombre</span>
					<input
						type="text"
						name="holder_name_{i}"
						autocomplete="off"
						maxlength="80"
						required={i > 0}
						bind:value={holders[i].name}
						on:input={() => {
							if (i === 0) firstHolderEdited = true;
						}}
						aria-invalid={errors[`holder_name_${i}`] ? 'true' : undefined}
					/>
					{#if errors[`holder_name_${i}`]}
						<span class="field-error">{errors[`holder_name_${i}`]}</span>
					{/if}
				</label>
				<div class="field">
					<span class="label-row">
						<label for="entradas-pronombres-{i}">Pronombres</label>
						<a
							class="help"
							href="https://pronombr.es"
							target="_blank"
							rel="noopener"
							title="¿Qué son los pronombres? (se abre en otra pestaña)"
							aria-label="¿Qué son los pronombres? (se abre en otra pestaña)">?</a
						>
					</span>
					<input
						id="entradas-pronombres-{i}"
						type="text"
						name="holder_pronouns_{i}"
						maxlength="40"
						placeholder="ella, él, elle…"
						autocomplete="off"
						required={i > 0}
						bind:value={holders[i].pronouns}
						on:input={() => {
							if (i === 0) firstPronounsEdited = true;
						}}
						aria-invalid={errors[`holder_pronouns_${i}`] ? 'true' : undefined}
					/>
					{#if errors[`holder_pronouns_${i}`]}
						<span class="field-error">{errors[`holder_pronouns_${i}`]}</span>
					{/if}
				</div>
			</div>
			<SignupFieldInputs
				fields={ticketFields}
				ticket={i}
				legend=""
				hint={false}
				values={answers}
				{errors}
			/>
		</fieldset>
	{/each}
</fieldset>

<!-- Preguntas de inscripción del evento (si no hay, nada). -->
<SignupFieldInputs fields={purchaseFields} values={answers} {errors} />
{#if ticketFields.length && !purchaseFields.length}
	<small class="hint">Tus respuestas las ven solo les organizadores.</small>
{/if}

<style>
	fieldset {
		border: 0;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.6em;
		min-width: 0;
	}
	legend {
		font-weight: bold;
		margin-bottom: 0.4em;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25em;
		min-width: 0;
	}
	.field > span:first-child {
		font-weight: bold;
		font-size: var(--step--1);
	}
	.holder {
		padding: 0.6em 0.9em 0.8em;
		border-radius: var(--radius-s);
		background: white;
		outline: 2px solid color-mix(in srgb, var(--2) 25%, transparent);
	}
	.holder legend {
		float: left;
		margin: 0 0 0.3em;
		color: var(--2-dark);
		font-size: var(--step--1);
	}
	.holder .row {
		clear: both;
	}
	.row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.6em;
	}
	.hint {
		color: var(--muted);
		font-size: var(--step--2);
	}
	input[type='text'],
	input[type='email'] {
		font: inherit;
		padding: 0.55em 0.7em;
		border-radius: var(--radius-s);
		border: 2px solid color-mix(in srgb, var(--2) 45%, transparent);
		background: white;
		min-height: 2.8em;
		min-width: 0;
	}
	input:focus-visible {
		outline: 3px solid var(--2-light);
	}
	.label-row {
		display: flex;
		align-items: baseline;
		gap: 0.3em;
		font-weight: bold;
		font-size: var(--step--1);
	}
	/* "?" de pronombres: discreto, está por las dudas. */
	.help {
		font-weight: normal;
		font-size: var(--step--2);
		color: var(--muted);
		text-decoration: underline dotted;
		text-underline-offset: 2px;
		/* bigger hit area without moving the label */
		padding: 0.5em 0.6em;
		margin: -0.5em -0.3em;
	}
	.help:hover,
	.help:focus-visible {
		color: var(--2-dark);
	}
	.save-box {
		display: flex;
		flex-direction: column;
		gap: 0.3em;
		padding: 0.6em 0.9em;
		border-radius: var(--radius-s);
		background: color-mix(in srgb, var(--2) 8%, white);
	}
	.check {
		display: flex;
		align-items: center;
		gap: 0.5em;
		min-height: 2.75em;
		font-weight: bold;
		font-size: var(--step--1);
		cursor: pointer;
	}
	.check input {
		width: 1.25em;
		height: 1.25em;
		flex-shrink: 0;
		accent-color: var(--2-dark);
	}
	.field-error {
		color: var(--error);
		font-size: var(--step--1);
		margin: 0;
	}
	@container compra (max-width: 30rem) {
		.row {
			grid-template-columns: 1fr;
		}
	}
</style>
