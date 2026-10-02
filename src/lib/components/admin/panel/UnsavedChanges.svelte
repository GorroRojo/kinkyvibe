<script>
	/**
	 * Cambios sin guardar en un editor: los guarda como borrador en este navegador mientras la
	 * persona edita, al volver ofrece recuperarlos («Tenés un borrador sin guardar de hace … ¿Lo
	 * recuperás? Recuperar / Descartar»; nunca los recupera solo, en ningún editor) y,
	 * si quiere irse con cambios pendientes (otra pestaña del objeto, otra sección, otro sitio),
	 * pregunta con un diálogo en la página. Cerrar o recargar la pestaña del navegador muestra el
	 * aviso propio del navegador (SvelteKit lo pasa por `beforeNavigate` como `leave`).
	 *
	 * Uso, dentro del editor:
	 *   <UnsavedChanges draftKey={draftKey('evento', slug)} base={sha} dirty={changed}
	 *     snapshot={{ values, body }} restore={(d) => ({ values, body } = d)}
	 *     saved={Boolean(form?.save)} saveForm="edit-form" />
	 *   (con un formulario con `use:enhance`, en vez de `saveForm` pasá `saving` mientras guarda y
	 *   hasta que termina la redirección, si la hay).
	 *
	 * Props:
	 * - `draftKey`: clave del borrador (ver `$lib/admin/draft.js`); vacía = sin borrador.
	 * - `base`: versión del archivo (por ejemplo el sha); si cambió, pregunta antes de recuperar.
	 * - `dirty`: hay cambios sin guardar.
	 * - `snapshot`: lo que hay que guardar (datos planos, se pasa por JSON).
	 * - `restore(data)`: vuelca un snapshot en el editor.
	 * - `saved`: se acaba de guardar (borra el borrador y no recupera nada al entrar).
	 * - `saveForm`: id de un formulario sin `use:enhance` que guarda; enviarlo no pregunta nada.
	 * - `saving`: se está guardando; navegar no pregunta nada.
	 * - `describe(draft, current)`: nombres de las partes en las que el borrador difiere de lo
	 *   que hay (por ejemplo «Datos, Entradas»), para decidir con más datos.
	 */
	import { onDestroy, onMount, tick } from 'svelte';
	import { beforeNavigate, goto } from '$app/navigation';
	import { clearDraft, draftAction, draftAge, loadDraft, saveDraft } from '$lib/admin/draft.js';

	export let draftKey = '';
	export let base = '';
	export let dirty = false;
	/** @type {unknown} */
	export let snapshot = null;
	/** @type {(data: any) => void} */
	export let restore = () => {};
	export let saved = false;
	export let saveForm = '';
	export let saving = false;
	/** @type {((draft: any, current: any) => string[]) | null} */
	export let describe = null;

	/** @returns {Storage | null} */
	function storage() {
		try {
			return typeof localStorage === 'undefined' ? null : localStorage;
		} catch {
			return null;
		}
	}
	/** @param {unknown} v */
	const plain = (v) => JSON.parse(JSON.stringify(v ?? null));

	let ready = false;
	/** @type {any} lo que había al abrir el editor, para comparar con el borrador */
	let original = null;
	/** @type {null | { kind: 'stale' | 'offer', age: string, data?: unknown, parts?: string[] }} */
	let notice = null;
	/** Se sale a propósito (guardar, o «Salir igual»): no preguntar. */
	let leaving = false;
	/** @type {HTMLDialogElement | undefined} */
	let dialog;
	/** @type {null | { url: URL, reload: boolean }} */
	let pending = null;

	onMount(() => {
		original = plain(snapshot);
		const s = storage();
		const draft = saved ? null : loadDraft(s, draftKey, { base });
		const action = draftAction(draft, { current: original, saved });
		// `clear`: se acaba de guardar, o el borrador es lo mismo que ya hay.
		if (action === 'clear') clearDraft(s, draftKey);
		else if (draft && (action === 'stale' || action === 'offer')) {
			const parts = describe ? describe(draft.data, original) : [];
			notice = { kind: action, age: draftAge(draft.savedAt), data: draft.data, parts };
		}
		ready = true;

		/** @param {SubmitEvent} e */
		const onSubmit = (e) => {
			if (saveForm && e.target instanceof HTMLFormElement && e.target.id === saveForm) {
				leaving = true;
				// Si el envío no llega a salir de la página (se cortó la red), vuelve a cuidar.
				setTimeout(() => (leaving = false), 30000);
			}
		};
		document.addEventListener('submit', onSubmit);
		return () => document.removeEventListener('submit', onSubmit);
	});

	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let timer;
	/** @param {unknown} snap @param {boolean} isDirty */
	function schedule(snap, isDirty) {
		clearTimeout(timer);
		timer = setTimeout(() => {
			if (isDirty) saveDraft(storage(), draftKey, plain(snap), { base });
			// Sin cambios no hay borrador; salvo uno viejo que todavía no se decidió qué hacer.
			else if (!notice) clearDraft(storage(), draftKey);
		}, 400);
	}
	$: if (ready && draftKey) schedule(snapshot, dirty);
	// Al guardar, el borrador ya no hace falta.
	$: if (ready && saved) {
		clearDraft(storage(), draftKey);
		notice = null;
	}

	onDestroy(() => {
		// Lo último que se escribió, sin esperar al temporizador (salvo al salir por guardar).
		clearTimeout(timer);
		if (ready && draftKey && dirty && !saving && !leaving)
			saveDraft(storage(), draftKey, plain(snapshot), { base });
	});

	beforeNavigate((nav) => {
		if (!dirty || leaving || saving) return;
		if (nav.type === 'leave') {
			// Cerrar o recargar la pestaña: el navegador muestra su propio aviso.
			saveDraft(storage(), draftKey, plain(snapshot), { base });
			nav.cancel();
			return;
		}
		if (!nav.to) return;
		nav.cancel();
		pending = { url: nav.to.url, reload: nav.willUnload };
		dialog?.showModal();
	});

	function stay() {
		pending = null;
		dialog?.close();
	}

	async function leave() {
		const target = pending;
		dialog?.close();
		pending = null;
		if (!target) return;
		saveDraft(storage(), draftKey, plain(snapshot), { base });
		leaving = true;
		await tick();
		if (target.reload || target.url.origin !== location.origin) location.href = target.url.href;
		else goto(target.url);
	}

	function recoverStale() {
		if (!notice) return;
		restore(notice.data);
		notice = null;
	}

	function discard() {
		clearDraft(storage(), draftKey);
		notice = null;
	}
</script>

{#if notice}
	<div class="notice" class:stale={notice.kind === 'stale'} role="status">
		{#if notice.kind === 'offer'}
			<p>
				<b>Tenés un borrador sin guardar</b> de {notice.age}{notice.parts?.length
					? ` (${notice.parts.join(', ')})`
					: ''}. ¿Lo recuperás?
			</p>
			<div class="btns">
				<button type="button" class="btn" id="draft-recover" on:click={recoverStale}
					>Recuperar</button
				>
				<button type="button" class="btn ghost" id="draft-discard" on:click={discard}
					>Descartar</button
				>
			</div>
		{:else}
			<p>
				<b>Hay cambios sin guardar</b> de {notice.age}, pero el archivo cambió desde entonces
				(alguien lo guardó). Si los recuperás, pisan esos cambios.
				{#if notice.parts?.length}Tu borrador cambia: {notice.parts.join(', ')}.{/if}
			</p>
			<div class="btns">
				<button type="button" class="btn" on:click={recoverStale}>Recuperarlos igual</button>
				<button type="button" class="btn ghost" on:click={discard}>Descartarlos</button>
			</div>
		{/if}
	</div>
{/if}

<dialog
	bind:this={dialog}
	class="confirm"
	aria-labelledby="kv-unsaved-title"
	on:cancel={() => (pending = null)}
>
	<h2 id="kv-unsaved-title">Tenés cambios sin guardar</h2>
	<p>
		Si salís ahora no se publican. Los dejamos guardados en este navegador y los recuperamos cuando
		vuelvas a editar.
	</p>
	<div class="btns">
		<!-- svelte-ignore a11y-autofocus -->
		<button type="button" class="btn" autofocus on:click={stay}>Seguir editando</button>
		<button type="button" class="btn ghost" on:click={leave}>Salir igual</button>
	</div>
</dialog>

<style>
	.notice {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem 1rem;
		background: var(--info-bg, #f3eef6);
		color: var(--text, #333);
		border-radius: var(--card-round, 1rem);
		padding: 0.7rem 1rem;
		margin: 0 0 1rem;
	}
	.notice.stale {
		background: var(--warn-bg, #fff3c4);
	}
	.notice p {
		margin: 0;
		flex: 1 1 18rem;
	}
	.btns {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.btn {
		display: inline-flex;
		align-items: center;
		border: 0;
		border-radius: 3em;
		padding: 0.5em 1.1em;
		font: inherit;
		font-weight: 700;
		cursor: pointer;
		background: var(--accent, hsl(319, 90%, 60%));
		color: var(--accent-ink, white);
	}
	.btn.ghost {
		background: transparent;
		color: var(--accent, hsl(319, 90%, 60%));
		box-shadow: inset 0 0 0 2px var(--accent, hsl(319, 90%, 60%));
	}
	.confirm {
		border: 0;
		border-radius: var(--card-round, 1rem);
		background: var(--surface, white);
		color: var(--text, #333);
		box-shadow: var(--shadow, 0 0.1em 0.3em rgba(0, 0, 0, 0.1));
		padding: 1.2rem 1.3rem;
		width: min(26rem, calc(100vw - 32px));
	}
	.confirm::backdrop {
		background: var(--scrim, rgba(0, 0, 0, 0.4));
		backdrop-filter: blur(3px);
	}
	.confirm h2 {
		margin: 0 0 0.4rem;
		font-size: 1.2rem;
	}
	.confirm p {
		margin: 0 0 1rem;
	}
</style>
