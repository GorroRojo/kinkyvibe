<script>
	/**
	 * «Seguir» de «Lo que sigo» (docs/lo-que-sigo.md) en la página de una etiqueta o un perfil.
	 * Pregunta a /api/sigo al cargar (la página puede estar prerenderizada): con `lo_que_sigo`
	 * apagado (404) no muestra nada. Sin sesión, lleva a /ingresar y vuelve acá. Con
	 * sesión, manda a /mi-rincon/sigo (?/seguir o ?/dejar); con JavaScript cambia acá mismo, sin
	 * JavaScript muestra el resultado en Mi rincón → Lo que sigo.
	 * Props: `kind` (`etiqueta` o `perfil`), `key` (nombre de la etiqueta o id del perfil),
	 * `name` (cómo se llama, para el texto).
	 */
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { Bell, BellOff } from '@lucide/svelte';

	/** @type {'etiqueta' | 'perfil'} */
	export let kind;
	/** @type {string} */
	export let key;
	/** @type {string} */
	export let name = '';

	/** @type {null | { member: false } | { member: true, kind: string, key: string, following: boolean }} */
	let info = null;
	let here = '/';
	let busy = false;
	let message = '';
	let error = '';

	onMount(async () => {
		here = location.pathname + location.search;
		if (!key) return;
		try {
			const qs = new URLSearchParams({ tipo: kind, clave: key });
			const r = await fetch(`/api/sigo?${qs}`);
			if (r.ok) info = await r.json();
		} catch {
			info = null;
		}
	});

	/** @type {import('@sveltejs/kit').SubmitFunction} */
	const submit = ({ action }) => {
		busy = true;
		error = '';
		message = '';
		const following = action.search.includes('seguir');
		return async ({ result }) => {
			busy = false;
			if (result.type === 'success' && info?.member) {
				info = { ...info, following };
				message = following
					? 'Listo. Elegí qué querés recibir en Mi rincón → Lo que sigo.'
					: 'Listo: ya no lo seguís.';
			} else if (result.type === 'redirect') {
				window.location.href = result.location;
			} else if (result.type === 'failure') {
				error = String(result.data?.error ?? 'No pudimos guardarlo. Probá de nuevo.');
			} else {
				error = 'No pudimos guardarlo. Probá de nuevo en un rato.';
			}
		};
	};
</script>

{#if info}
	<div class="follow">
		{#if !info.member}
			<a class="pill-btn ghost" href="/ingresar?next={encodeURIComponent(here)}">
				<Bell size={18} aria-hidden="true" /> Seguir
			</a>
			<span class="hint">Entrá con tu cuenta para seguir {name || 'esto'}.</span>
		{:else}
			<form
				method="POST"
				action="/mi-rincon/sigo?/{info.following ? 'dejar' : 'seguir'}"
				use:enhance={submit}
			>
				<input type="hidden" name="tipo" value={info.kind} />
				<input type="hidden" name="clave" value={info.key} />
				<input type="hidden" name="volver" value={here} />
				<button
					class="pill-btn {info.following ? 'ghost' : ''}"
					type="submit"
					disabled={busy}
					aria-pressed={info.following}
				>
					{#if info.following}
						<BellOff size={18} aria-hidden="true" /> Dejar de seguir
					{:else}
						<Bell size={18} aria-hidden="true" /> Seguir
					{/if}
				</button>
			</form>
			{#if info.following}
				<a class="hint" href="/mi-rincon/sigo">Qué recibís</a>
			{/if}
		{/if}
		{#if message}<p class="ok" role="status">{message}</p>{/if}
		{#if error}<p class="error" role="alert">{error}</p>{/if}
	</div>
{/if}

<style>
	.follow {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5em 0.8em;
		width: min(45rem, 100%);
		margin: 1em auto 0;
	}
	.follow :global(.pill-btn) {
		display: inline-flex;
		align-items: center;
		gap: 0.4em;
	}
	p {
		margin: 0;
		flex-basis: 100%;
	}
	.hint {
		color: var(--muted);
		font-size: var(--step--1);
	}
	.ok {
		color: var(--3-ink);
		font-weight: 700;
	}
	.error {
		color: var(--1-ink);
		font-weight: 700;
	}
</style>
