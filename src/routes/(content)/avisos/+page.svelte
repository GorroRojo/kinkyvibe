<script>
	import { enhance } from '$app/forms';
	import EditionList from '$lib/components/series/EditionList.svelte';

	export let data;
	export let form;

	$: s = data.series;
	$: subscribed = data.account.subscribed.includes(s.id);
	let busy = false;

	/** @type {import('@sveltejs/kit').SubmitFunction} */
	const submit = () => {
		busy = true;
		return async ({ update }) => {
			await update({ reset: false });
			busy = false;
		};
	};
</script>

<svelte:head>
	<title>Avisos de {s.name} - KinkyVibe.ar</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<section class="avisos surface-card" aria-labelledby="avisos-title">
	<h1 id="avisos-title">Avisame si se repite</h1>
	<p>
		Te escribimos una vez cada vez que se anuncia una nueva edición de
		<a href={s.href}>{s.icon ? `${s.icon} ` : ''}{s.name}</a>.
	</p>
	{#if s.next}
		<p class="hint">Ya está anunciada la próxima:</p>
		<EditionList editions={[s.next]} />
	{/if}

	{#if form?.error}
		<p class="error" role="alert">{form.error}</p>
	{/if}

	{#if form?.ok && form.status === 'pending'}
		<p class="ok" role="status">
			Te mandamos un mail para confirmar. Abrilo y tocá el link: sin confirmar no te avisamos nada.
		</p>
	{:else if form?.ok && form.status === 'confirmed'}
		<p class="ok" role="status">
			Listo: te vamos a avisar por mail.{#if data.account.sigo}
				Ahora seguís {s.name}: lo cambiás en <a href="/mi-rincon/sigo">Lo que sigo</a>.{/if}
		</p>
	{:else if form?.ok && form.status === 'removed'}
		<p class="ok" role="status">Listo: no te vamos a avisar más de {s.name}.</p>
	{:else if data.account.member && subscribed}
		<p>Ya te vamos a avisar con el mail de tu cuenta.</p>
		<form method="POST" action="?/baja" use:enhance={submit}>
			<input type="hidden" name="serie" value={s.id} />
			<button class="pill-btn ghost" type="submit" disabled={busy}>Dejar de avisarme</button>
		</form>
	{:else if data.account.member}
		<form method="POST" action="?/suscribir" use:enhance={submit}>
			<input type="hidden" name="serie" value={s.id} />
			<input type="hidden" name="cuenta" value="1" />
			<button class="pill-btn" type="submit" disabled={busy}>Avisame al mail de mi cuenta</button>
		</form>
	{:else}
		<form method="POST" action="?/suscribir" use:enhance={submit}>
			<input type="hidden" name="serie" value={s.id} />
			<label>
				<span>Tu mail</span>
				<input
					type="email"
					name="email"
					required
					autocomplete="email"
					value={form && 'email' in form ? (form.email ?? '') : ''}
				/>
			</label>
			<button class="pill-btn" type="submit" disabled={busy}>Avisame</button>
		</form>
		<p class="hint">
			Te vamos a pedir que lo confirmes. Cada mail trae un link para darte de baja, y tu mail no lo
			ve nadie más.
		</p>
	{/if}
</section>

<style>
	.avisos {
		display: grid;
		gap: 0.9em;
		width: min(30rem, 100%);
		margin: 2em auto;
		border-top: 0.35rem solid var(--2);
	}
	h1 {
		margin: 0;
		font-size: var(--step-2);
	}
	p {
		margin: 0;
	}
	form {
		display: grid;
		gap: 0.7em;
	}
	label {
		display: grid;
		gap: 0.25em;
	}
	label span {
		font-weight: 600;
	}
	input[type='email'] {
		font-size: var(--step-0);
		padding: 0.5em 0.7em;
		border: 1px solid var(--line);
		border-radius: var(--round-sm);
		min-height: var(--tap);
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
</style>
