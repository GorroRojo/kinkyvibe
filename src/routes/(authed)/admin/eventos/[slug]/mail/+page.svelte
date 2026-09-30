<script>
	import { deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { Send } from '@lucide/svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import EmptyState from '$lib/components/admin/panel/EmptyState.svelte';
	import { shortTime } from '$lib/admin/orderFormat.js';

	/** @type {import('./$types').PageData} */
	export let data;

	$: e = data.event;
	let subject = '';
	let body = '';
	/** El id del envío en curso (se fija al tocar "Mandar"; cambia solo con un aviso nuevo). */
	let sendId = data.sendId;
	let sending = false;
	/** @type {{ ok: boolean, message: string, errors?: Record<string, string>, progress?: { total: number, sent: number, failed: number, pending: number }, done?: boolean } | null} */
	let result = null;
	/** Ya se mandó (o se empezó a mandar) este texto: para escribir otro, "Aviso nuevo". */
	$: locked = Boolean(result?.progress);

	$: fullSubject = subject.trim()
		? subject.includes(e.title)
			? subject.trim()
			: `${subject.trim()} · ${e.title}`
		: '';
	$: paragraphs = body
		.replace(/\r\n?/g, '\n')
		.trim()
		.split(/\n{2,}/)
		.filter(Boolean);
	$: people = (/** @type {number} */ n) => (n === 1 ? '1 persona' : `${n} personas`);
	$: pct = result?.progress?.total
		? Math.round((result.progress.sent / result.progress.total) * 100)
		: 0;

	async function batch() {
		const form = new FormData();
		form.set('sendId', sendId);
		form.set('subject', subject);
		form.set('body', body);
		const res = await fetch('?/send', {
			method: 'POST',
			body: form,
			headers: { accept: 'application/json', 'x-sveltekit-action': 'true' }
		});
		/** @type {any} */
		const r = deserialize(await res.text());
		if (r.type === 'success' || r.type === 'failure') return r.data?.mail ?? null;
		if (r.type === 'redirect') {
			location.href = r.location;
			return null;
		}
		return { ok: false, message: 'No se pudo mandar (error del servidor). Probá de nuevo.' };
	}

	async function send() {
		if (!locked && !confirm(`¿Mandar este aviso por mail a ${people(data.audience)}?`)) return;
		sending = true;
		try {
			// Tandas hasta que no quede nadie; si una tanda no logra mandar ninguno, se frena (se
			// puede reintentar: a quien ya le llegó no se le manda de nuevo).
			for (let i = 0; i < 500; i++) {
				const r = await batch();
				if (!r) break;
				result = r;
				if (!r.progress || r.done || !r.sent) break;
			}
		} finally {
			sending = false;
			await invalidateAll();
		}
	}

	function another() {
		sendId = crypto.randomUUID();
		subject = '';
		body = '';
		result = null;
	}
</script>

<svelte:head><title>Mail a compradores · {e.title} · Panel</title></svelte:head>

<div class="grid">
	<Card title="Mandar un aviso">
		<p class="muted small">
			Le llega a cada persona con una compra aprobada de este evento (<strong
				>{people(data.audience)}</strong
			>; una sola vez aunque tenga varias compras). Sirve para avisos de último momento: cambio de
			lugar, de horario, algo para llevar.
			{#if data.preview}<br />🧪 En este preview solo llega a las direcciones de prueba
				(EMAIL_ALLOWLIST).{/if}
		</p>
		<form on:submit|preventDefault={send} class="compose">
			<label class="field">
				<span>Asunto</span>
				<input
					bind:value={subject}
					maxlength="150"
					required
					disabled={locked || sending}
					placeholder="Ej: Cambio de lugar"
				/>
				{#if result?.errors?.subject}<small class="error">{result.errors.subject}</small>{/if}
			</label>
			<label class="field">
				<span>Mensaje</span>
				<textarea
					bind:value={body}
					rows="8"
					maxlength="5000"
					required
					disabled={locked || sending}
					placeholder="Contá qué cambió. Dejá una línea en blanco entre párrafos."></textarea>
				<small>{body.length} / 5000 · Texto simple (sin formato).</small>
				{#if result?.errors?.body}<small class="error">{result.errors.body}</small>{/if}
			</label>

			{#if result}
				<div class="status" class:error={!result.ok} role="status" aria-live="polite">
					<p>{result.message}</p>
					{#if result.progress}
						<div
							class="progress"
							role="progressbar"
							aria-valuemin={0}
							aria-valuemax={result.progress.total}
							aria-valuenow={result.progress.sent}
							aria-label="Mails enviados"
						>
							<i style="width:{pct}%"></i>
						</div>
						{#if result.progress.failed}
							<p class="small">
								No se pudo mandar a {people(result.progress.failed)}. Tocá «Reintentar»: a quien ya
								le llegó no se le manda de nuevo.
							</p>
						{/if}
					{/if}
				</div>
			{/if}

			<div class="buttons">
				{#if !result?.done}
					<button
						type="submit"
						class="kv-btn"
						disabled={sending || !data.audience || !data.dbAvailable}
					>
						<Send size={16} aria-hidden="true" />
						{sending ? 'Mandando…' : locked ? 'Reintentar' : `Mandar a ${people(data.audience)}`}
					</button>
				{/if}
				{#if locked && !sending}
					<button type="button" class="kv-btn ghost" on:click={another}>Escribir otro aviso</button>
				{/if}
			</div>
		</form>
	</Card>

	<Card title="Así lo ven">
		<div class="mail" aria-label="Vista previa del mail">
			<p class="subject"><span class="muted">Asunto:</span> {fullSubject || '…'}</p>
			<div class="paper">
				<p class="muted small">Sobre tu entrada para <strong>{e.title}</strong></p>
				<h3>{subject.trim() || 'Asunto'}</h3>
				<p>Hola Nombre de quien compró:</p>
				{#each paragraphs as p}
					<p class="pre">{p}</p>
				{:else}
					<p class="muted">(tu mensaje)</p>
				{/each}
				<p class="muted small">
					Te escribimos porque compraste una entrada para este evento. Si tenés alguna duda,
					respondé este mail o escribinos a {data.contactEmail}.
				</p>
			</div>
		</div>
	</Card>
</div>

<Card title="Avisos anteriores">
	{#if data.sends.length === 0}
		<EmptyState emoji="✉️" title="Todavía no se mandó ningún aviso para este evento" />
	{:else}
		<div class="kv-table-wrap">
			<table class="kv-table">
				<thead>
					<tr><th>Cuándo</th><th>Asunto</th><th>Quién</th><th class="r">Llegó a</th></tr>
				</thead>
				<tbody>
					{#each data.sends as s (s.id)}
						<tr>
							<td class="nowrap">{shortTime(s.created_at)}</td>
							<td>
								<details>
									<summary>{s.subject}</summary>
									<p class="pre small">{s.body}</p>
								</details>
							</td>
							<td>{s.created_by}</td>
							<td class="r num"
								>{s.sent}{#if s.failed}<span class="bad">
										({s.failed} fallaron)</span
									>{/if}{#if !s.finished_at}
									<span class="muted"> · sin terminar</span>{/if}</td
							>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</Card>

<style>
	.grid {
		display: grid;
		gap: 1rem;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 24rem), 1fr));
		align-items: start;
		margin-bottom: 1rem;
	}
	.small {
		font-size: 0.85rem;
		margin: 0;
	}
	.compose {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.field > span {
		font-weight: 700;
	}
	.field small {
		color: var(--muted);
	}
	.field .error {
		color: var(--bad);
	}
	.field input,
	.field textarea {
		padding: 0.55rem 0.8rem;
		min-height: 2.75rem;
		box-sizing: border-box;
		border-radius: 0.8rem;
		border: 1px solid var(--line);
		background: var(--surface);
		min-width: 0;
		width: 100%;
		resize: vertical;
	}
	.field :disabled {
		opacity: 0.7;
	}
	.status {
		background: var(--ok-bg);
		border-radius: 0.8rem;
		padding: 0.6rem 0.9rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.status.error {
		background: var(--warn-bg);
	}
	.status p {
		margin: 0;
	}
	.progress {
		height: 0.55rem;
		border-radius: 1em;
		background: var(--bar-track);
		overflow: hidden;
	}
	.progress i {
		display: block;
		height: 100%;
		background: var(--ok);
		transition: width 0.3s;
	}
	.buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.mail {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.subject {
		margin: 0;
		font-weight: 700;
		overflow-wrap: anywhere;
	}
	.paper {
		/* El mail se ve siempre sobre blanco (así llega), también en modo oscuro. */
		background: #fff;
		color: #222;
		border: 1px solid var(--line);
		border-radius: 0.8rem;
		padding: 0.8rem 1rem;
		overflow-wrap: anywhere;
	}
	.paper .muted {
		color: #666;
	}
	.paper h3 {
		color: #b3127a;
		margin: 0.3rem 0 0.6rem;
	}
	.pre {
		white-space: pre-line;
	}
	.nowrap {
		white-space: nowrap;
	}
	.bad {
		color: var(--bad);
	}
	details summary {
		cursor: pointer;
	}
</style>
