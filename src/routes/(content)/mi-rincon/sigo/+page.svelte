<script>
	import { enhance } from '$app/forms';
	import { FOLLOW_OPTIONS } from '$lib/utils/sigo.js';

	export let data;
	export let form;

	/** @type {string | null} la fila que se está guardando */
	let busy = null;

	/** @param {string} id */
	const submit = (id) => {
		/** @type {import('@sveltejs/kit').SubmitFunction} */
		const fn = () => {
			busy = id;
			return async ({ update }) => {
				await update({ reset: false });
				busy = null;
			};
		};
		return fn;
	};

	/** Casilla tocada: guarda en el momento (sin JavaScript, con el botón «Guardar»). */
	/** @param {Event} e */
	const autoSave = (e) => /** @type {HTMLInputElement} */ (e.currentTarget).form?.requestSubmit();

	/** @param {{ kind: string, key: string }} f */
	const rowId = (f) => `${f.kind}:${f.key}`;
</script>

<svelte:head>
	<title>Lo que sigo - KinkyVibe.ar</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="rincon">
	<p><a href="/mi-rincon">← Mi rincón</a></p>
	<h1>Lo que sigo</h1>
	<p class="hint">
		Etiquetas, series, perfiles y lugares que seguís. Por cada uno elegís si sus eventos van a tu
		calendario, si te escribimos cuando se anuncia algo nuevo y si te recordamos el día antes. Lo
		que seguís es privado: no lo ve nadie más.
	</p>

	{#if form?.error}
		<p class="error" role="alert">{form.error}</p>
	{:else if form?.ok && form.action === 'seguir'}
		<p class="ok" role="status">Listo: ahora seguís {form.title}.</p>
	{:else if form?.ok && form.action === 'dejar'}
		<p class="ok" role="status">Listo: dejaste de seguirlo.</p>
	{/if}

	<section class="surface-card" aria-labelledby="sigo-title">
		<div class="head">
			<h2 id="sigo-title">Lo que seguís</h2>
			{#if data.follows.length}
				<a
					class="pill-btn ghost small"
					href="/mi-rincon/sigo/sigo.csv"
					download
					data-sveltekit-reload>Bajar CSV</a
				>
			{/if}
		</div>
		{#if data.follows.length === 0}
			<p class="hint">
				Todavía no seguís nada. En la página de una etiqueta o una serie (en la Kinkipedia) o en la
				de une amigue o un lugar, tocá «Seguir».
			</p>
		{:else}
			<ul class="follows">
				{#each data.follows as f (rowId(f))}
					<li class:gone={!f.available}>
						<div class="name">
							<span class="kind">{f.label}</span>
							{#if f.href}
								<a href={f.href}>{f.title}</a>
							{:else}
								<span>{f.title}</span>
							{/if}
						</div>
						<form
							method="POST"
							action="?/opciones"
							use:enhance={submit(rowId(f))}
							class="options"
							aria-label="Qué querés de {f.title}"
						>
							<input type="hidden" name="tipo" value={f.kind} />
							<input type="hidden" name="clave" value={f.key} />
							{#each FOLLOW_OPTIONS as o (o.name)}
								<label>
									<input
										type="checkbox"
										name={o.name}
										checked={f.options[o.name]}
										disabled={!f.available || busy === rowId(f)}
										on:change={autoSave}
									/>
									{o.label}
								</label>
							{/each}
							<noscript
								><button class="pill-btn ghost small" type="submit">Guardar</button></noscript
							>
						</form>
						<form method="POST" action="?/dejar" use:enhance={submit(rowId(f))}>
							<input type="hidden" name="tipo" value={f.kind} />
							<input type="hidden" name="clave" value={f.key} />
							<button class="pill-btn ghost small" type="submit" disabled={busy === rowId(f)}
								>Dejar de seguir</button
							>
						</form>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>

<style>
	.rincon {
		display: grid;
		gap: 1em;
		width: min(40rem, 100%);
		margin: 1.5em auto;
		padding-inline: 16px;
		box-sizing: border-box;
	}
	h1 {
		margin: 0;
		font-size: var(--step-3);
	}
	h2 {
		margin: 0;
		font-size: var(--step-1);
	}
	section {
		display: grid;
		gap: 0.7em;
	}
	p {
		margin: 0;
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: 0.5em;
	}
	.hint {
		color: var(--muted);
		font-size: var(--step--1);
	}
	.ok {
		color: var(--3-ink);
		font-weight: 600;
	}
	.error {
		color: var(--1-ink);
		font-weight: 600;
	}
	.follows {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.9em;
	}
	.follows li {
		display: grid;
		gap: 0.4em;
		padding-bottom: 0.9em;
		border-bottom: 1px solid var(--line);
	}
	.follows li:last-child {
		border-bottom: 0;
		padding-bottom: 0;
	}
	.gone .name {
		color: var(--muted);
	}
	.name {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.5em;
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.kind {
		font-size: var(--step--1);
		font-weight: 400;
		color: var(--muted);
	}
	.options {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3em 1em;
	}
	.options label {
		display: flex;
		align-items: center;
		gap: 0.35em;
		min-height: var(--tap);
	}
	.small {
		font-size: var(--step--1);
		min-height: 2.2rem;
		justify-self: start;
	}
</style>
