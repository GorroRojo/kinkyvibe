<script>
	/**
	 * Confirmar el borrado de una publicación (en la página, sin confirm()): lo que lo impide, lo
	 * que depende de ella y, si hay dependencias, escribir la dirección. Después: «Deshacer».
	 */
	import '$lib/admin/panel-forms.scss';
	import { enhance } from '$app/forms';
	import { Ban, Trash2, TriangleAlert } from '@lucide/svelte';
	import { eventHref } from '$lib/admin/nav.js';
	import { undoneMessage } from '$lib/admin/deleteText.js';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import UndoToast from '$lib/components/admin/panel/UndoToast.svelte';
	import PublishStatus from '$lib/components/admin/PublishStatus.svelte';

	/** @type {import('./$types').PageData} */
	export let data;
	/** @type {import('./$types').ActionData} */
	export let form;

	let typed = '';
	let busy = false;

	$: plan = data.plan;
	$: deleted = form && 'deleted' in form ? form.deleted : null;
	$: undone = form && 'undone' in form ? form.undone : null;
	$: problem = form && 'error' in form ? form.error : '';
	$: editHref =
		data.kind === 'calendario' ? eventHref(data.slug, 'editar') : `${data.info.list}/${data.slug}`;
	$: ready = !plan?.needsTyping || typed.trim() === data.slug;

	/** @type {import('./$types').SubmitFunction} */
	const submit = () => {
		busy = true;
		return async ({ update }) => {
			await update({ reset: false });
			busy = false;
		};
	};
</script>

<PageHeader
	title="Borrar {data.info.one}"
	subtitle="«{deleted?.title ?? undone?.title ?? data.title}» · {data.kind}/{data.slug}"
	back={{ href: data.info.list, label: 'Volver' }}
/>

<div class="kv-stack narrow">
	{#if undone}
		<UndoToast canUndo={false} message={undoneMessage(undone)} />
		{#if undone.publish}<PublishStatus pr={undone.publish} />{/if}
		<p><a href={editHref}>Abrir {data.info.the}</a></p>
	{:else if deleted}
		<form method="POST" action="?/deshacer" use:enhance={submit}>
			<input type="hidden" name="id" value={deleted.id} />
			<!-- El botón Deshacer de UndoToast no tiene `type`: dentro del form, lo envía. -->
			<UndoToast {busy} message="Borraste «{deleted.title}»." />
		</form>
		<PublishStatus pr={deleted.publish} commitUrl={deleted.publish ? null : deleted.commit} />
		{#if problem}<p class="kv-flash bad" role="alert">{problem}</p>{/if}
		<p class="kv-note">
			Si te arrepentís más tarde, lo podés recuperar desde <a href="/admin/ajustes/actividad"
				>Actividad</a
			>.
		</p>
		<p><a class="kv-btn ghost" href={data.info.list}>Volver a la lista</a></p>
	{:else if !data.exists || !plan}
		<Card>
			<p>Esa publicación no existe (¿ya la borraron?).</p>
			<p class="kv-note">
				Los borrados recientes se pueden recuperar desde <a href="/admin/ajustes/actividad"
					>Actividad</a
				>.
			</p>
		</Card>
	{:else}
		{#if plan.blockers.length}
			<Card title="No se puede borrar" icon={Ban}>
				<ul class="reasons bad">
					{#each plan.blockers as b (b)}<li>{b}</li>{/each}
				</ul>
				{#if plan.alternative}<p>{plan.alternative}</p>{/if}
				<p><a class="kv-btn ghost" href={editHref}>Ir a Editar</a></p>
			</Card>
		{:else}
			<Card title="¿Borrar «{data.title}»?" icon={Trash2}>
				{#if plan.warnings.length}
					<div class="warn">
						<p class="head"><TriangleAlert size={18} aria-hidden="true" /> Depende de esto</p>
						<ul class="reasons">
							{#each plan.warnings as w (w)}<li>{w}</li>{/each}
						</ul>
					</div>
				{/if}
				<ul class="reasons">
					{#each plan.notes as n (n)}<li>{n}</li>{/each}
					<li>Hasta que se publique lo podés deshacer, y después recuperarlo desde Actividad.</li>
				</ul>
				<form method="POST" action="?/borrar" use:enhance={submit} class="kv-form">
					{#if plan.needsTyping}
						<label class="kv-field">
							<span>Para confirmar, escribí <code>{data.slug}</code></span>
							<input
								name="confirmar"
								bind:value={typed}
								autocomplete="off"
								autocapitalize="off"
								spellcheck="false"
							/>
						</label>
					{/if}
					{#if problem}<p class="kv-flash bad" role="alert">{problem}</p>{/if}
					<div class="kv-row">
						<button class="kv-btn danger" type="submit" disabled={busy || !ready}>
							<Trash2 size={16} aria-hidden="true" />
							{busy ? 'Borrando…' : `Borrar ${data.info.one}`}
						</button>
						<a class="kv-btn ghost" href={editHref}>Cancelar</a>
					</div>
				</form>
			</Card>
		{/if}
	{/if}
</div>

<style>
	.narrow {
		max-width: 44rem;
	}
	.reasons {
		margin: 0;
		padding-left: var(--space-s);
		display: flex;
		flex-direction: column;
		gap: var(--space-3xs);
	}
	.reasons.bad {
		color: var(--bad);
		font-weight: 700;
	}
	.warn {
		background: var(--warn-bg);
		border-radius: var(--radius-m);
		padding: var(--space-2xs) var(--space-xs);
	}
	.warn .head {
		margin: 0 0 0.3rem;
		font-weight: 700;
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.kv-btn.danger {
		background: var(--bad);
		color: var(--surface);
	}
</style>
