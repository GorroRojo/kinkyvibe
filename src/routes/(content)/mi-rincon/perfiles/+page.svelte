<script>
	import { KIND_LABELS, ROLE_LABELS, VISIBILITY_OPTIONS } from '$lib/utils/perfiles.js';

	export let data;
	export let form;

	/**
	 * Lo que devuelven las actions (cada una usa una parte).
	 * @typedef {{
	 *   action?: string, error?: string, message?: string, errors?: Record<string, string>,
	 *   draft?: Record<string, any>, conflict?: boolean, input?: Record<string, any>
	 * }} FormState
	 */
	/** @type {FormState | null | undefined} */
	let f;
	$: f = form;

	/** @type {Record<string, string>} */
	const VISIBILITY_SHORT = { public: 'Público', members: 'Solo con cuenta', hidden: 'Oculto' };

	$: input = f?.action === 'crear' ? f.input : null;
	$: errors = /** @type {Record<string, string>} */ (f?.action === 'crear' ? (f.errors ?? {}) : {});
	let kind = 'persona';
	$: if (input?.kind === 'persona' || input?.kind === 'proyecto' || input?.kind === 'lugar')
		kind = input.kind;
</script>

<svelte:head>
	<title>Perfiles - Mi rincón - KinkyVibe.ar</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="rincon">
	<p class="back"><a href="/mi-rincon">← Mi rincón</a></p>
	<h1>Tus perfiles</h1>
	<p class="hint">
		Con una cuenta podés tener varios perfiles: los tuyos (nadie ve que son de la misma cuenta) y
		los de proyectos que gestionás con otras personas. Quiénes gestionan un proyecto no se muestra
		nunca. Por ahora los perfiles no tienen página pública; la vamos a sumar pronto.
	</p>

	{#if data.invites.length}
		<section class="surface-card" aria-labelledby="inv-title">
			<h2 id="inv-title">Te invitaron a gestionar</h2>
			{#if f?.action === 'invitacion' && f.error}
				<p class="error" role="alert">{f.error}</p>
			{/if}
			<ul class="list">
				{#each data.invites as inv (inv.id)}
					<li>
						<strong>{inv.title}</strong>
						<div class="row">
							<form method="POST" action="?/aceptar">
								<input type="hidden" name="invite" value={inv.id} />
								<button class="pill-btn" type="submit">Aceptar</button>
							</form>
							<form method="POST" action="?/rechazar">
								<input type="hidden" name="invite" value={inv.id} />
								<button class="pill-btn ghost" type="submit">Rechazar</button>
							</form>
						</div>
					</li>
				{/each}
			</ul>
		</section>
	{:else if f?.action === 'invitacion' && f.message}
		<p class="ok" role="status">{f.message}</p>
	{/if}

	{#if data.memberInvites.length || data.memberships.length}
		<section class="surface-card" aria-labelledby="groups-title">
			<h2 id="groups-title">Proyectos</h2>
			{#if f?.action === 'proyectos' && f.error}
				<p class="error" role="alert">{f.error}</p>
			{:else if f?.action === 'proyectos' && f.message}
				<p class="ok" role="status">{f.message}</p>
			{/if}
			<p class="hint">
				Un proyecto te puede invitar con la dirección de tu perfil de persona; no figurás en el
				proyecto hasta que aceptás. Salir es un clic y no le tenés que pedir nada a nadie. Si
				rechazás o te vas, ese proyecto no te puede volver a invitar por 30 días.
			</p>
			{#if data.memberInvites.length}
				<h3>Invitaciones</h3>
				<ul class="list">
					{#each data.memberInvites as inv (`${inv.groupId}:${inv.personaSlug}`)}
						<li>
							<span><strong>{inv.groupTitle}</strong> te invitó a sumarte</span>
							<span class="hint">con tu perfil {inv.personaTitle}</span>
							<div class="row">
								<form method="POST" action="?/aceptarGrupo">
									<input type="hidden" name="persona" value={inv.personaSlug} />
									<input type="hidden" name="group" value={inv.groupId} />
									<button class="pill-btn" type="submit">Aceptar</button>
								</form>
								<form method="POST" action="?/rechazarGrupo">
									<input type="hidden" name="persona" value={inv.personaSlug} />
									<input type="hidden" name="group" value={inv.groupId} />
									<button class="pill-btn ghost" type="submit">Rechazar</button>
								</form>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
			{#if data.memberships.length}
				<h3>En los que estás</h3>
			{/if}
			<ul class="list">
				{#each data.memberships as m (`${m.groupId}:${m.personaSlug}`)}
					<li>
						<span>Sos parte de <strong>{m.groupTitle}</strong></span>
						<span class="hint">con tu perfil {m.personaTitle}</span>
						<form method="POST" action="?/salirGrupo">
							<input type="hidden" name="persona" value={m.personaSlug} />
							<input type="hidden" name="group" value={m.groupId} />
							<button class="pill-btn ghost" type="submit">Salir del proyecto</button>
						</form>
					</li>
				{/each}
			</ul>
		</section>
	{:else if f?.action === 'proyectos' && f.message}
		<p class="ok" role="status">{f.message}</p>
	{/if}

	<section class="surface-card" aria-labelledby="optout-title">
		<h2 id="optout-title">Invitaciones de proyectos</h2>
		{#if f?.action === 'invitacionesGrupos' && f.error}
			<p class="error" role="alert">{f.error}</p>
		{:else if f?.action === 'invitacionesGrupos' && f.message}
			<p class="ok" role="status">{f.message}</p>
		{/if}
		{#if data.noGroupInvites}
			<p>
				No recibís invitaciones de proyectos: si alguien te invita, no te llega nada (y no se
				entera).
			</p>
			<form method="POST" action="?/invitacionesGrupos">
				<input type="hidden" name="recibir" value="si" />
				<button class="pill-btn ghost" type="submit">Volver a recibir invitaciones</button>
			</form>
		{:else}
			<p class="hint">
				Si no querés que los proyectos te inviten, lo podés apagar. Vale para todos tus perfiles de
				persona; quien invite no se entera.
			</p>
			<form method="POST" action="?/invitacionesGrupos">
				<input type="hidden" name="recibir" value="no" />
				<button class="pill-btn ghost" type="submit">No recibir invitaciones de proyectos</button>
			</form>
		{/if}
	</section>

	<section class="surface-card" aria-labelledby="mine-title">
		<h2 id="mine-title">Los que gestionás</h2>
		{#if data.profiles.length === 0}
			<p class="hint">Todavía no tenés perfiles. Creá el primero acá abajo.</p>
		{:else}
			<ul class="list">
				{#each data.profiles as p (p.slug)}
					<li>
						<a href="/mi-rincon/perfiles/{p.slug}"><strong>{p.title}</strong></a>
						<span class="hint">
							{KIND_LABELS[p.kind]} · {VISIBILITY_SHORT[p.visibility] ?? p.visibility}
							{#if p.kind === 'proyecto'}· {ROLE_LABELS[p.role]}{/if}
							{#if p.review === 'pending'}· Espera aprobación{/if}
						</span>
						{#if p.review === 'rejected'}
							<span class="rejected"
								><strong>Rechazado</strong>{#if p.rejectReason}: <q>{p.rejectReason}</q>{/if}. Entrá
								para corregirlo y volver a mandarlo.</span
							>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="surface-card" aria-labelledby="new-title">
		<h2 id="new-title">Crear un perfil</h2>
		{#if f?.action === 'crear' && f.error}
			<p class="error" role="alert">{f.error}</p>
		{/if}
		<form method="POST" action="?/crear">
			<fieldset>
				<legend>¿De quién es?</legend>
				<label class="choice">
					<input type="radio" name="kind" value="persona" bind:group={kind} />
					<span>De una persona <small class="hint">(vos, con el nombre que uses)</small></span>
				</label>
				<label class="choice">
					<input type="radio" name="kind" value="proyecto" bind:group={kind} />
					<span
						>De un proyecto <small class="hint"
							>(una marca, productora, emprendimiento, colectivo o fiesta; lo pueden gestionar
							varias cuentas)</small
						></span
					>
				</label>
				<label class="choice">
					<input type="radio" name="kind" value="lugar" bind:group={kind} />
					<span
						>De un lugar <small class="hint"
							>(un espacio donde pasan cosas: un bar, un centro cultural, una sala)</small
						></span
					>
				</label>
				{#if errors.kind}<p class="field-error">{errors.kind}</p>{/if}
			</fieldset>
			<label>
				<span>Nombre</span>
				<input
					name="title"
					type="text"
					maxlength="200"
					required
					autocomplete="off"
					value={input?.title ?? ''}
					aria-invalid={errors.title ? 'true' : undefined}
				/>
				{#if errors.title}<span class="field-error">{errors.title}</span>{/if}
			</label>
			<fieldset>
				<legend>¿Quién lo puede ver?</legend>
				{#each VISIBILITY_OPTIONS as v (v.value)}
					<label class="choice">
						<input
							type="radio"
							name="visibility"
							value={v.value}
							checked={(input?.visibility || 'public') === v.value}
						/>
						<span>{v.label} <small class="hint">{v.hint}</small></span>
					</label>
				{/each}
			</fieldset>
			{#if kind === 'lugar'}
				<p class="hint">
					Después de crearlo completás la dirección y lo demás. Aparece en el sitio recién cuando
					une admin lo aprueba.
				</p>
			{:else}
				<p class="hint">Después de crearlo completás el resto (presentación, pronombres, links).</p>
			{/if}
			<button class="pill-btn" type="submit">Crear perfil</button>
		</form>
	</section>
</div>

<style>
	.rincon {
		display: grid;
		gap: 1em;
		width: min(40rem, 100%);
		margin: 1.5em auto;
	}
	h1 {
		margin: 0;
		font-size: var(--step-3);
	}
	h3 {
		margin: 0.5em 0 0;
		font-size: var(--step-0);
	}
	h2 {
		margin: 0 0 0.5em;
		font-size: var(--step-1);
	}
	section {
		display: grid;
		gap: 0.6em;
	}
	p {
		margin: 0;
	}
	.back a {
		color: var(--2-dark);
	}
	form {
		display: grid;
		gap: 0.8em;
		justify-items: start;
	}
	fieldset {
		border: 0;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 0.4em;
		width: 100%;
	}
	legend {
		font-weight: 700;
		margin-bottom: 0.3em;
	}
	label {
		display: grid;
		gap: 0.25em;
		width: 100%;
	}
	label > span:first-child {
		font-weight: 700;
	}
	label.choice {
		display: flex;
		gap: 0.6em;
		align-items: center;
		min-height: var(--tap);
	}
	label.choice span {
		font-weight: 400;
	}
	input[type='text'] {
		font-size: var(--step-0);
		padding: 0.5em 0.7em;
		border: 1px solid var(--line);
		border-radius: var(--round-sm);
		min-height: var(--tap);
	}
	.list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 0.8em;
	}
	.list li {
		display: grid;
		gap: 0.3em;
		padding-bottom: 0.8em;
		border-bottom: 1px solid var(--line);
	}
	.list a {
		color: var(--2-dark);
		min-height: var(--tap);
		display: flex;
		align-items: center;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5em;
	}
	.rejected {
		color: var(--1-ink);
		font-size: var(--step--1);
	}
	.hint {
		color: var(--muted);
		font-size: var(--step--1);
	}
	.ok {
		color: var(--3-ink);
		background: var(--3-tint);
		padding: 0.5em 0.8em;
		border-radius: var(--round-sm);
	}
	.error {
		color: var(--1-ink);
		background: var(--1-tint);
		padding: 0.5em 0.8em;
		border-radius: var(--round-sm);
	}
	.field-error {
		color: var(--1-ink);
		font-size: var(--step--1);
	}
</style>
