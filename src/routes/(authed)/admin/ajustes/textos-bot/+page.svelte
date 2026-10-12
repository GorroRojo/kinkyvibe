<script>
	import '$lib/admin/panel-forms.scss';
	import { enhance } from '$app/forms';
	import { RotateCcw } from '@lucide/svelte';
	import { fieldErrors } from '$lib/admin/ajustes.js';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import { areaBackLink } from '$lib/admin/nav.js';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import { argDateTimeLong } from '$lib/utils/dates.js';
	import { byteLength, isFormattedKind } from '$lib/utils/botTexts.js';
	import {
		PREVIEW_SCREENS,
		SAMPLE_QR_SIZE,
		SINGLE_SCREEN,
		buildPreview,
		sampleQrCells,
		screenForKey
	} from '$lib/admin/botTextPreview.js';

	/** El QR de mentira de la tarjeta de una entrada (un dibujo, no se puede escanear). */
	const qrCells = sampleQrCells();

	export let data;
	export let form;

	$: errors = fieldErrors(form);

	/** Lo que está escrito en cada campo (lo guardado o el original). @type {Record<string, string>} */
	let values = {};
	/** @param {Record<string, string>} saved */
	const fromSaved = (saved) =>
		Object.fromEntries(data.fields.map((f) => [f.key, saved[f.key] ?? f.value]));
	$: values = form?.values ? { ...fromSaved(data.saved), ...form.values } : fromSaved(data.saved);

	/** @param {string} key */
	const original = (key) => data.fields.find((f) => f.key === key)?.value ?? '';
	$: changedCount = data.fields.filter((f) => (values[f.key] ?? '') !== f.value).length;

	/** @param {{ kind: import('$lib/utils/botTexts.js').BotTextKind }} field @param {string} v */
	const sizeOf = (field, v) => (field.kind === 'button' ? byteLength(v) : v.length);

	/** @param {{ value: string }} field */
	const rowsFor = (field) =>
		Math.min(8, Math.max(2, field.value.split('\n').length + Math.ceil(field.value.length / 70)));

	// Vista previa: la pantalla elegida, o la del último campo tocado.
	let screenId = 'inicio';
	/** @type {string | undefined} */
	let focusedKey;
	/** @param {string} key */
	function focusField(key) {
		focusedKey = key;
		screenId = screenForKey(key);
	}
	$: preview = buildPreview(screenId, values, focusedKey);
	$: focusedLabel = data.fields.find((f) => f.key === focusedKey)?.label ?? '';

	/** El último campo con foco, para insertar variables donde está el cursor. */
	/** @type {HTMLInputElement | HTMLTextAreaElement | null} */
	let lastField = null;
	/** @param {FocusEvent} e @param {string} key */
	function track(e, key) {
		lastField = /** @type {HTMLInputElement | HTMLTextAreaElement} */ (e.currentTarget);
		focusField(key);
	}
	/** @param {string} key @param {string} name */
	function insert(key, name) {
		const token = `{${name}}`;
		const el = lastField?.name === key ? lastField : null;
		const current = values[key] ?? '';
		if (!el) {
			values = { ...values, [key]: `${current}${token}` };
			focusField(key);
			return;
		}
		const start = el.selectionStart ?? current.length;
		const end = el.selectionEnd ?? start;
		values = { ...values, [key]: current.slice(0, start) + token + current.slice(end) };
		requestAnimationFrame(() => {
			el.focus();
			el.setSelectionRange(start + token.length, start + token.length);
		});
	}
</script>

<PageHeader
	back={areaBackLink('ajustes-textos-bot')}
	title="Textos del bot"
	subtitle="Todo lo que dice el bot de Telegram: los mensajes, los botones, los avisos que salen al tocar un botón y las descripciones del menú «/»."
/>

<div class="layout">
	<form
		class="kv-form settings"
		method="POST"
		action="?/save"
		use:enhance={() =>
			async ({ update }) =>
				update({ reset: false })}
	>
		{#if !data.dbAvailable}
			<p class="kv-flash bad">No hay base de datos disponible: el bot usa los textos originales.</p>
		{/if}
		{#if form?.message}
			<p class="kv-flash" role="status">{form.message}</p>
		{:else if form?.error}
			<p class="kv-flash bad" role="alert">{form.error}</p>
		{/if}
		<div class="kv-note intro">
			<p>
				Cada campo trae el texto original; si lo cambiás, «Volver al texto original» lo deja como
				estaba (se aplica al guardar). Las palabras entre llaves, como <code>{'{evento}'}</code>,
				son variables: ahí el bot pone el dato (tocá una para sumarla donde está el cursor).
			</p>
			<p>
				En los mensajes podés usar <code>**negrita**</code> y <code>[texto](https://…)</code> para un
				link; lo demás sale tal cual. Los botones, los avisos y los comandos van sin formato. Los datos
				de los eventos, las fechas y los links los pone siempre el bot.
			</p>
			{#if data.updatedAt}
				<p>
					Último cambio: {argDateTimeLong(data.updatedAt)}{data.updatedBy
						? `, por ${data.updatedBy}`
						: ''}.
				</p>
			{/if}
		</div>

		<nav class="jump" aria-label="Secciones">
			{#each data.sections as s (s.id)}
				<a href={'#seccion-' + s.id}>{s.label}</a>
			{/each}
		</nav>

		{#each data.sections as section (section.id)}
			<div id={'seccion-' + section.id} class="section">
				<Card title={section.label}>
					{#each data.fields.filter((f) => f.section === section.id) as field (field.key)}
						{@const value = values[field.key] ?? ''}
						{@const changed = value !== field.value}
						{@const size = sizeOf(field, value)}
						<div class="kv-field text-field">
							<label for={'f-' + field.key}>
								{field.label}
								<span class="tag">{data.kinds[field.kind]}</span>
								{#if changed}<span class="tag changed">cambiado</span>{/if}
							</label>
							{#if isFormattedKind(field.kind)}
								<textarea
									id={'f-' + field.key}
									name={field.key}
									rows={rowsFor(field)}
									bind:value={values[field.key]}
									on:focus={(e) => track(e, field.key)}
									aria-invalid={errors[field.key] ? 'true' : undefined}
									aria-describedby={'n-' + field.key}></textarea>
							{:else}
								<input
									id={'f-' + field.key}
									type="text"
									name={field.key}
									autocomplete="off"
									bind:value={values[field.key]}
									on:focus={(e) => track(e, field.key)}
									aria-invalid={errors[field.key] ? 'true' : undefined}
									aria-describedby={'n-' + field.key}
								/>
							{/if}
							{#if errors[field.key]}<small class="kv-error field-error">{errors[field.key]}</small
								>{/if}
							{#if field.vars.length}
								<ul class="vars" aria-label="Variables">
									{#each field.vars as v (v.name)}
										<li>
											<button
												type="button"
												class="var"
												title={v.label}
												on:click={() => insert(field.key, v.name)}
											>
												<code>{'{' + v.name + '}'}</code>
											</button>
											<small class="muted"
												>{v.label}{field.required?.includes(v.name)
													? ' (tiene que estar)'
													: ''}</small
											>
										</li>
									{/each}
								</ul>
							{/if}
							<small class="kv-note" id={'n-' + field.key}>
								{#if field.help}{field.help}{/if}
								<span class:over={size > field.max}
									>{size}/{field.max}{field.kind === 'button' ? ' bytes' : ''}.</span
								>
							</small>
							{#if changed}
								<div class="original">
									<small class="kv-note">Original: «{field.value}»</small>
									<button
										type="button"
										class="kv-btn ghost small"
										on:click={() => (values = { ...values, [field.key]: original(field.key) })}
									>
										<RotateCcw size={14} aria-hidden="true" /> Volver al texto original
									</button>
								</div>
							{/if}
						</div>
					{/each}
				</Card>
			</div>
		{/each}

		<div class="actions">
			<button class="kv-btn" type="submit">Guardar</button>
			{#if changedCount}
				<button type="button" class="kv-btn ghost" on:click={() => (values = fromSaved({}))}>
					<RotateCcw size={16} aria-hidden="true" /> Volver todos al original
				</button>
				<span class="kv-note">{changedCount} cambiados.</span>
			{/if}
		</div>
	</form>

	<aside class="preview" aria-label="Vista previa">
		<Card title="Así se ve en Telegram">
			<label class="kv-field">
				<span>Pantalla</span>
				<select bind:value={screenId}>
					{#each PREVIEW_SCREENS as s (s.id)}<option value={s.id}>{s.label}</option>{/each}
					<option value={SINGLE_SCREEN}>El texto que estás editando</option>
				</select>
			</label>
			{#if screenId === SINGLE_SCREEN && focusedLabel}
				<p class="kv-note">{focusedLabel}</p>
			{/if}
			<div class="chat">
				{#if preview.commands}
					<ul class="menu">
						{#each preview.commands as c (c.command)}
							<li><b>/{c.command}</b> <span>{c.description}</span></li>
						{/each}
					</ul>
				{:else if preview.toast}
					<div class="toast" role="status">{preview.toast}</div>
				{:else}
					<div class="bubble" class:with-photo={preview.qr}>
						{#if preview.qr}
							<svg
								class="qr"
								viewBox="-2 -2 {SAMPLE_QR_SIZE + 4} {SAMPLE_QR_SIZE + 4}"
								role="img"
								aria-label="QR de ejemplo"
							>
								<rect
									x="-2"
									y="-2"
									width={SAMPLE_QR_SIZE + 4}
									height={SAMPLE_QR_SIZE + 4}
									fill="#fff"
								/>
								{#each qrCells as [x, y] (`${x}-${y}`)}<rect {x} {y} width="1" height="1" />{/each}
							</svg>
						{/if}
						<!-- HTML armado por renderBotText: lo escrito sale escapado. -->
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						<div class="tg-text">{@html preview.html ?? ''}</div>
					</div>
					{#if preview.buttons?.length}
						<div class="keyboard">
							{#each preview.buttons as row, i (i)}
								<div class="row">
									{#each row as b, j (j)}
										<span
											class="key"
											class:disabled={b.disabled}
											class:primary={b.primary}
											class:success={b.success}
											>{b.text}{#if b.link}<span class="corner" aria-hidden="true">↗</span
												>{/if}</span
										>
									{/each}
								</div>
							{/each}
						</div>
					{/if}
				{/if}
			</div>
			<p class="kv-note">
				Es una aproximación con datos de ejemplo: Telegram puede cortar las líneas distinto. Tocá un
				campo y la vista previa salta a su pantalla.
			</p>
		</Card>
	</aside>
</div>

<style>
	.layout {
		display: grid;
		gap: 1rem;
		grid-template-columns: minmax(0, 1fr);
	}
	@media (min-width: 64rem) {
		.layout {
			grid-template-columns: minmax(0, 1fr) 22rem;
			align-items: start;
		}
		.preview {
			position: sticky;
			top: 1rem;
		}
	}
	.intro p {
		margin: 0 0 0.4rem;
	}
	.jump {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.jump a {
		padding: 0.2rem 0.6rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		font-size: 0.85rem;
		text-decoration: none;
		color: var(--link);
	}
	.section {
		scroll-margin-top: 1rem;
	}
	.text-field textarea,
	.text-field input {
		width: 100%;
	}
	.tag {
		display: inline-block;
		margin-inline-start: 0.4em;
		padding: 0 0.45em;
		border-radius: 999px;
		font-size: 0.75em;
		font-weight: 400;
		background: var(--surface-2, hsl(262 30% 92%));
		color: var(--text-2, inherit);
	}
	.tag.changed {
		background: hsl(50 100% 80%);
		color: hsl(50 100% 15%);
	}
	.vars {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.2rem 0.9rem;
	}
	.vars li {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		align-items: baseline;
	}
	.var {
		background: none;
		border: 0;
		padding: 0;
		cursor: pointer;
		min-height: 2rem;
	}
	.var code {
		color: var(--link);
		font-weight: 700;
	}
	.over {
		color: var(--error, #b00020);
		font-weight: 700;
	}
	.original {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}
	.original small {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
	}
	/* Telegram, tema claro. */
	.chat {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		padding: 0.9rem 0.7rem;
		border-radius: 0.75rem;
		background: #c9d8b7;
	}
	.bubble {
		max-width: 19rem;
		padding: 0.45rem 0.6rem;
		border-radius: 0.9rem 0.9rem 0.9rem 0.25rem;
		background: #fff;
		color: #000;
		box-shadow: 0 1px 1px rgb(0 0 0 / 0.12);
	}
	.bubble.with-photo {
		padding-top: 0.25rem;
	}
	.qr {
		display: block;
		width: 100%;
		max-width: 12rem;
		margin: 0 auto 0.4rem;
		border-radius: 0.6rem;
		fill: #000;
	}
	.tg-text {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		font-size: 0.875rem;
		line-height: 1.35;
	}
	.tg-text :global(a) {
		color: #168acd;
	}
	.keyboard {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		max-width: 19rem;
	}
	.row {
		display: flex;
		gap: 0.25rem;
	}
	.key {
		position: relative;
		flex: 1 1 0;
		min-width: 0;
		padding: 0.45rem 0.6rem;
		border-radius: 0.5rem;
		background: rgb(0 0 0 / 0.22);
		color: #fff;
		font-size: 0.8rem;
		font-weight: 600;
		text-align: center;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.key.primary {
		background: #3a8bd6;
	}
	.key.success {
		background: #3fa34d;
	}
	.key.disabled {
		opacity: 0.55;
	}
	.corner {
		position: absolute;
		top: 0.1rem;
		right: 0.3rem;
		font-size: 0.65rem;
	}
	.toast {
		align-self: center;
		max-width: 17rem;
		padding: 0.6rem 0.8rem;
		border-radius: 0.6rem;
		background: rgb(0 0 0 / 0.75);
		color: #fff;
		font-size: 0.85rem;
		white-space: pre-wrap;
		text-align: center;
	}
	.menu {
		list-style: none;
		margin: 0;
		padding: 0.3rem 0;
		border-radius: 0.6rem;
		background: #fff;
		color: #000;
		font-size: 0.85rem;
	}
	.menu li {
		padding: 0.35rem 0.7rem;
	}
	.menu li + li {
		border-top: 1px solid #eee;
	}
	.menu span {
		color: #707579;
	}
</style>
