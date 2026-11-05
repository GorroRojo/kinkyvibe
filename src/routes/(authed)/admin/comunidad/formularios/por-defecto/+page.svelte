<script>
	/**
	 * Comunidad › Formularios › Cómo salen por defecto (docs/formularios.md): un solo lugar para lo
	 * que valen la encuesta de cada evento y los formularios nuevos, con los mails y su vista previa.
	 * Vale para lo que se crea (o se manda) desde que se guarda; lo que ya existe no cambia. Solo
	 * piezas compartidas del panel.
	 */
	import '$lib/admin/panel-forms.scss';
	import { enhance } from '$app/forms';
	import { Pencil } from '@lucide/svelte';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import FormMailEditor from '$lib/components/admin/forms/FormMailEditor.svelte';
	import { Button, Card, ChoiceCard, Field, Notice, Switch } from '$lib/components/ui';
	import {
		ACCESS_HELP,
		ACCESS_LABELS,
		AUDIENCE,
		AUDIENCE_LABELS,
		PRIVACY,
		PRIVACY_HELP,
		PRIVACY_LABELS
	} from '$lib/utils/formularios.js';

	/** @type {import('./$types').PageData} */
	export let data;
	/** @type {any} */
	export let form;

	const d = data.defaults;
	let surveyAuto = d.surveyAuto;
	let surveyDelayDays = String(d.surveyDelayDays);
	let surveyPrivacy = d.surveyPrivacy;
	let surveyAudience = d.surveyAudience;
	let formAccess = d.formAccess;
	let formPrivacy = d.formPrivacy;
	let saving = false;

	$: save = form?.save ?? null;
	$: errors = save && !save.ok ? (save.errors ?? {}) : {};
	$: texts = form?.texts ?? d;
	$: preview = form?.preview ?? null;
	/** @param {'survey' | 'form'} kind */
	const previewOf = (kind) => (preview?.kind === kind ? (preview.mail ?? null) : null);
	/** @param {'survey' | 'form'} kind @param {'subject' | 'body'} part */
	const errorOf = (kind, part) =>
		(preview?.kind === kind ? preview.errors?.[part] : '') ||
		errors[`${kind}Mail${part === 'subject' ? 'Subject' : 'Body'}`] ||
		'';
	const newFormAccess = /** @type {const} */ (['link', 'account']);
</script>

<PageHeader
	title="Cómo salen por defecto"
	subtitle="Lo que vale para cada encuesta y cada formulario nuevo. Lo que ya existe no cambia: se edita en su página."
	back={{ href: '/admin/comunidad/formularios', label: 'Formularios' }}
/>

<form
	class="kv-stack defaults"
	method="POST"
	action="?/save"
	use:enhance={() => {
		saving = true;
		return async ({ update }) => {
			await update({ reset: false });
			saving = false;
		};
	}}
>
	<Card title="La encuesta de después de cada evento">
		<div class="kv-stack">
			<Switch
				name="surveyAuto"
				bind:checked={surveyAuto}
				label="Sale sola en cada evento con entradas"
				onLabel="Sale sola"
				offLabel="Solo en los eventos que la prendan"
			/>
			<p class="kv-note">
				{surveyAuto
					? 'Cada evento la puede apagar en su ficha › Mails › Encuesta.'
					: 'Ningún evento la manda salvo que la prendas en su ficha › Mails › Encuesta.'}
				Sale siempre, aunque sea tarde.
			</p>
			<Field
				label="Cuántos días después de que termina el evento"
				name="surveyDelayDays"
				inputmode="numeric"
				bind:value={surveyDelayDays}
				help="De 0 (apenas termina) a 14. Hoy: {data.builtIn.surveyDelayDays} si no lo cambiás."
				error={errors.surveyDelayDays ?? ''}
			/>
			<span class="kv-label">Privacidad</span>
			<div class="choices">
				{#each PRIVACY as p (p)}
					<ChoiceCard
						name="surveyPrivacy"
						value={p}
						title={PRIVACY_LABELS[p]}
						text={PRIVACY_HELP[p]}
						bind:group={surveyPrivacy}
					/>
				{/each}
			</div>
			{#if surveyPrivacy !== 'anonymous'}
				<Notice tone="warn" compact role={null}
					>El texto de arriba de la plantilla dice que es anónima: revisalo.</Notice
				>
			{/if}
			<span class="kv-label">Quién ve las respuestas</span>
			<div class="choices two">
				{#each AUDIENCE as a (a)}
					<ChoiceCard
						name="surveyAudience"
						value={a}
						title={AUDIENCE_LABELS[a]}
						bind:group={surveyAudience}
					/>
				{/each}
			</div>
			{#if data.surveyTemplateId}
				<p>
					<Button
						variant="secondary"
						icon={Pencil}
						href="/admin/comunidad/formularios/{data.surveyTemplateId}"
						>Editar las preguntas de la encuesta (plantilla «¿Cómo la pasaste?»)</Button
					>
				</p>
			{/if}
		</div>
	</Card>

	<Card title="El mail de la encuesta">
		<p class="kv-note">Cada evento lo puede cambiar en su ficha › Mails › Encuesta.</p>
		<FormMailEditor
			standalone={false}
			prefix="surveyMail"
			kind="survey"
			idPrefix="defecto-encuesta"
			subject={texts.surveyMailSubject}
			body={texts.surveyMailBody}
			fallbackSubject={data.fallback.survey.subject}
			fallbackBody={data.fallback.survey.body}
			preview={previewOf('survey')}
			errors={{ subject: errorOf('survey', 'subject'), body: errorOf('survey', 'body') }}
		/>
	</Card>

	<Card title="Los formularios nuevos">
		<div class="kv-stack">
			<span class="kv-label">Quién puede responder</span>
			<div class="choices two">
				{#each newFormAccess as a (a)}
					<ChoiceCard
						name="formAccess"
						value={a}
						title={ACCESS_LABELS[a]}
						text={ACCESS_HELP[a]}
						bind:group={formAccess}
					/>
				{/each}
			</div>
			<p class="kv-note">
				«{ACCESS_LABELS.ticket}» se elige en cada formulario, junto con su evento.
			</p>
			<span class="kv-label">Privacidad</span>
			<div class="choices">
				{#each PRIVACY as p (p)}
					<ChoiceCard
						name="formPrivacy"
						value={p}
						title={PRIVACY_LABELS[p]}
						text={PRIVACY_HELP[p]}
						bind:group={formPrivacy}
					/>
				{/each}
			</div>
		</div>
	</Card>

	<Card title="El mail con el link de un formulario">
		<p class="kv-note">
			Para los formularios «{ACCESS_LABELS.ticket}». Cada uno lo puede cambiar en su página.
		</p>
		<FormMailEditor
			standalone={false}
			prefix="formMail"
			kind="form"
			idPrefix="defecto-formulario"
			subject={texts.formMailSubject}
			body={texts.formMailBody}
			fallbackSubject={data.fallback.form.subject}
			fallbackBody={data.fallback.form.body}
			preview={previewOf('form')}
			errors={{ subject: errorOf('form', 'subject'), body: errorOf('form', 'body') }}
		/>
	</Card>

	<div class="kv-row save-row">
		<Button type="submit" busy={saving} disabled={saving}>Guardar</Button>
		{#if save}<Notice tone={save.ok ? 'ok' : 'error'} compact>{save.message}</Notice>{/if}
	</div>
</form>

<style>
	.defaults {
		max-width: 56rem;
	}
	.choices {
		display: grid;
		gap: var(--space-2xs);
	}
	@media (min-width: 900px) {
		.choices {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
		.choices.two {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	.kv-label {
		display: block;
		font-weight: 700;
	}
	.save-row {
		align-items: center;
		position: sticky;
		bottom: 0;
		padding: var(--space-2xs) 0;
		background: var(--bg);
		z-index: 2;
	}
</style>
