<script>
	/**
	 * Editor de un formulario (docs/formularios.md): lo general, quién responde, privacidad (con el
	 * aviso de qué pasa con lo que ya llegó), quién ve las respuestas y las preguntas con el editor
	 * compartido. Arriba, abrirlo o cerrarlo (o, en una encuesta, si se manda) y el link. Solo
	 * piezas compartidas del panel.
	 */
	import '$lib/admin/panel-forms.scss';
	import { enhance } from '$app/forms';
	import { askConfirm } from '$lib/admin/confirm.js';
	import { ExternalLink, Inbox, Send, Trash2 } from '@lucide/svelte';
	import FormMailEditor from '$lib/components/admin/forms/FormMailEditor.svelte';
	import ChipCombobox from '$lib/components/admin/ChipCombobox.svelte';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import QuestionEditor from '$lib/components/admin/forms/QuestionEditor.svelte';
	import { Badge, Button, Card, ChoiceCard, Field, Notice, Switch } from '$lib/components/ui';
	import { fmtDateTime } from '$lib/admin/format.js';
	import {
		ACCESS,
		ACCESS_HELP,
		ACCESS_LABELS,
		AUDIENCE,
		AUDIENCE_LABELS,
		PRIVACY,
		PRIVACY_HELP,
		PRIVACY_LABELS,
		privacyChangeWarning
	} from '$lib/utils/formularios.js';

	/** @type {import('./$types').PageData} */
	export let data;
	/** @type {any} */
	export let form;

	$: f = data.form;
	$: survey = f.kind === 'survey';
	$: template = f.kind === 'template';

	let title = data.form.title;
	let slug = data.form.slug;
	let intro = data.form.intro;
	let access = data.form.access;
	let privacy = data.form.privacy;
	let audience = data.form.audience;
	let eventSlug = data.form.eventSlug ?? '';
	let open = data.form.open;
	/** @type {'' | 'saving' | 'saved' | 'error'} */
	let openStatus = '';
	let saving = false;
	let dirty = false;

	$: warning = privacyChangeWarning(data.form.privacy, privacy, data.responses);
	$: needsEvent = !survey && !template && (access === 'ticket' || audience === 'organizers');
	$: eventTitle = data.events.find((e) => e.slug === eventSlug)?.title ?? eventSlug;
	$: save = form?.save ?? null;
	$: errors = save && !save.ok ? (save.errors ?? {}) : {};
	$: mail = form?.mail ?? null;

	/** @param {string} q */
	const searchEvents = (q) => {
		const needle = q.trim().toLowerCase();
		return data.events
			.filter((e) => !needle || e.title.toLowerCase().includes(needle) || e.slug.includes(needle))
			.slice(0, 12)
			.map((e) => ({ value: e.slug, label: e.title, detail: e.start?.slice(0, 10) ?? '' }));
	};

	/** @type {HTMLFormElement} */
	let openForm;
</script>

<PageHeader
	title={survey ? `Encuesta: ${eventTitle}` : f.title}
	subtitle={template
		? 'Plantilla: no se publica. «Usar esta plantilla» (en la lista) hace una copia para editar.'
		: survey
			? `Se manda ${data.delayText}, con un link personal a quienes tenían entrada.`
			: ''}
	back={{ href: '/admin/comunidad/formularios', label: 'Formularios' }}
>
	<svelte:fragment slot="actions">
		{#if !template}
			<Button variant="secondary" icon={Inbox} href="/admin/comunidad/formularios/{f.id}/respuestas"
				>Respuestas ({data.responses})</Button
			>
		{/if}
	</svelte:fragment>
</PageHeader>

<div class="kv-stack editor">
	{#if !template}
		<Card status={open ? 'ok' : ''}>
			<div class="state">
				<form
					bind:this={openForm}
					method="POST"
					action="?/setOpen"
					use:enhance={() => {
						openStatus = 'saving';
						return async ({ result, update }) => {
							openStatus = result.type === 'success' ? 'saved' : 'error';
							if (result.type !== 'success') open = data.form.open;
							await update({ reset: false });
						};
					}}
				>
					<Switch
						name="open"
						bind:checked={open}
						label={survey ? 'Mandar la encuesta un día después del evento' : 'Recibe respuestas'}
						onLabel={survey ? 'Se manda' : 'Abierto'}
						offLabel={survey ? 'Apagada' : 'Cerrado'}
						status={openStatus}
						error={form?.open?.message ?? ''}
						on:change={() => openForm.requestSubmit()}
					/>
				</form>
				{#if data.path}
					<span class="link">
						<code>kinkyvibe.ar{data.path}</code>
						<Button
							variant="link"
							icon={ExternalLink}
							href={data.path}
							target="_blank"
							rel="noopener">Ver</Button
						>
					</span>
				{/if}
			</div>
			{#if form?.open && !form.open.ok}<Notice tone="error" compact>{form.open.message}</Notice
				>{/if}
			{#if data.stats}
				<p class="kv-note">
					Links mandados: {data.stats.sent}{#if data.stats.pending}
						· por salir: {data.stats.pending}{/if}{#if data.stats.failed}
						· fallaron: {data.stats.failed}{/if} · usados: {data.stats.used}
				</p>
			{/if}
			{#if !survey && f.access === 'ticket'}
				<form
					class="kv-row"
					method="POST"
					action="?/send"
					use:enhance={async ({ cancel }) => {
						const ok = await askConfirm({
							title: '¿Mandar el link a quienes tienen entrada?',
							text: `A cada compra confirmada de ${eventTitle} le llega un mail con su link personal, una sola vez. Las compras que lleguen después no lo reciben.`,
							confirmLabel: 'Mandar'
						});
						if (!ok) cancel();
					}}
				>
					<Button type="submit" variant="secondary" icon={Send}>
						Mandar el link a quienes tienen entrada
					</Button>
					{#if f.sendAt}<small class="kv-note">Pedido el {fmtDateTime(f.sendAt)}</small>{/if}
				</form>
				{#if form?.send}<Notice tone={form.send.ok ? 'ok' : 'error'} compact
						>{form.send.message}</Notice
					>{/if}
			{/if}
		</Card>
	{/if}

	<form
		id="form-editor"
		class="kv-stack"
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
		<Card title="General">
			<div class="kv-stack">
				<Field label="Nombre" name="title" bind:value={title} error={errors.title ?? ''} />
				{#if !survey && !template}
					<Field
						label="Dirección"
						name="slug"
						bind:value={slug}
						help="kinkyvibe.ar/formularios/{slug || '…'} · letras, números y guiones"
						error={errors.slug ?? ''}
					/>
				{:else}
					<input type="hidden" name="slug" value={slug} />
				{/if}
				<Field
					label="Texto de arriba (opcional)"
					type="textarea"
					rows={3}
					name="intro"
					bind:value={intro}
					error={errors.intro ?? ''}
				/>
			</div>
		</Card>

		{#if survey}
			<input type="hidden" name="access" value="ticket" />
			<input type="hidden" name="eventSlug" value={eventSlug} />
		{:else}
			<Card title="Quién puede responder">
				<div class="choices">
					{#each ACCESS as a (a)}
						<ChoiceCard
							name="access"
							value={a}
							title={ACCESS_LABELS[a]}
							text={ACCESS_HELP[a]}
							bind:group={access}
						/>
					{/each}
				</div>
				{#if errors.access}<small class="kv-error">{errors.access}</small>{/if}
			</Card>
		{/if}

		<Card title="Privacidad">
			<p class="kv-note">La podés cambiar cuando quieras.</p>
			<div class="choices">
				{#each PRIVACY as p (p)}
					<ChoiceCard
						name="privacy"
						value={p}
						title={PRIVACY_LABELS[p]}
						text={PRIVACY_HELP[p]}
						bind:group={privacy}
					/>
				{/each}
			</div>
			{#if warning}
				<Notice tone="warn" compact>{warning} Se aplica al guardar.</Notice>
			{/if}
		</Card>

		<Card title="Quién ve las respuestas">
			<div class="choices">
				{#each AUDIENCE as a (a)}
					<ChoiceCard name="audience" value={a} title={AUDIENCE_LABELS[a]} bind:group={audience} />
				{/each}
			</div>
			<p class="kv-note">
				Se ven todas las respuestas, siempre. Les organizadores las ven en Mi rincón, solo las de
				sus eventos (como las respuestas de inscripción).
			</p>
		</Card>

		{#if needsEvent}
			<Card title="Evento">
				<label class="kv-label" for="evento-elegido">
					{access === 'ticket'
						? 'El evento (les llega a quienes tenían entrada)'
						: 'El evento (para saber quiénes organizan)'}
				</label>
				<ChipCombobox
					id="evento-elegido"
					values={eventSlug ? [eventSlug] : []}
					placeholder="Buscá el evento"
					search={searchEvents}
					add={(_values, value) => [value]}
					chip={() => ({ label: eventTitle })}
					removeLabel="Sacar el evento"
					addedMessage={(v) => `Elegiste ${v}`}
					onChange={(values) => (eventSlug = values[0] ?? '')}
				/>
				{#if errors.eventSlug}<small class="kv-error">{errors.eventSlug}</small>{/if}
				{#if audience === 'organizers' && !eventSlug && access !== 'ticket'}
					<p class="kv-note">Sin evento no hay organizadores: las ven solo les admins.</p>
				{/if}
			</Card>
			<input type="hidden" name="eventSlug" value={eventSlug} />
		{:else if !survey}
			<input type="hidden" name="eventSlug" value="" />
		{/if}

		<Card title="Preguntas">
			{#key data.form.updatedAt}
				<QuestionEditor
					questions={data.form.questions}
					errors={save && !save.ok ? (save.questionErrors ?? {}) : {}}
					bind:dirty
				/>
			{/key}
		</Card>

		<div class="kv-row save-row">
			<Button type="submit" busy={saving} disabled={saving}>Guardar</Button>
			{#if dirty}<Badge tone="warn">Preguntas sin guardar</Badge>{/if}
			{#if save}<Notice tone={save.ok ? 'ok' : 'error'} compact>{save.message}</Notice>{/if}
		</div>
	</form>

	{#if data.mail}
		<Card title={survey ? 'El mail de la encuesta' : 'El mail con el link'}>
			<p class="kv-note">
				Vacío, va el de <a href="/admin/comunidad/formularios/por-defecto">Cómo salen por defecto</a
				>.
			</p>
			<FormMailEditor
				subject={mail?.subject ?? f.mailSubject}
				body={mail?.body ?? f.mailBody}
				fallbackSubject={data.mail.fallback.subject}
				fallbackBody={data.mail.fallback.body}
				kind={survey ? 'survey' : 'form'}
				idPrefix="form-mail"
				preview={mail?.preview ?? data.mail.preview}
				errors={mail?.errors ?? {}}
				message={mail?.message ?? ''}
				ok={mail?.ok ?? true}
			/>
		</Card>
	{/if}

	{#if !template}
		<form
			method="POST"
			action="?/delete"
			use:enhance={async ({ cancel }) => {
				const ok = await askConfirm({
					title: survey ? '¿Borrar esta encuesta?' : '¿Borrar este formulario?',
					text: survey
						? 'Deja de salir para su evento. Las respuestas no se pierden: la recuperás con todo desde Ajustes › Actividad.'
						: 'Se cierra y sale de la lista. Las respuestas no se pierden: lo recuperás con todo desde Ajustes › Actividad.',
					confirmLabel: 'Borrar',
					tone: 'danger'
				});
				if (!ok) return cancel();
			}}
		>
			<Button type="submit" variant="danger" size="small" icon={Trash2}
				>{survey ? 'Borrar la encuesta' : 'Borrar el formulario'}</Button
			>
		</form>
	{/if}
</div>

<style>
	.editor {
		max-width: 80rem;
	}
	.state {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2xs) var(--space-s);
	}
	.link {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2xs);
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.choices {
		display: grid;
		gap: var(--space-2xs);
	}
	@media (min-width: 900px) {
		.choices {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
	.kv-label {
		display: block;
		font-weight: 700;
		margin-bottom: 0.35rem;
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
