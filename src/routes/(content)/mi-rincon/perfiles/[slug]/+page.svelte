<script>
	import { enhance } from '$app/forms';
	import { KIND_LABELS, ROLE_LABELS, VISIBILITY_OPTIONS } from '$lib/utils/perfiles.js';
	import { TIMEZONE } from '$lib/utils/dates.js';
	import { VENUE_PRIVACY_LABELS, VENUE_PRIVACY_UNSET_LABEL } from '$lib/utils/venues.js';
	import VenueCoordinates from '$lib/components/amigues/VenueCoordinates.svelte';

	export let data;
	export let form;

	/**
	 * Lo que devuelven las actions (cada una usa una parte).
	 * @typedef {{
	 *   action?: string, error?: string, message?: string, errors?: Record<string, string>,
	 *   draft?: Record<string, any>, conflict?: boolean, input?: Record<string, any>,
	 *   codeSentFor?: string
	 * }} FormState
	 */
	/** @type {FormState | null | undefined} */
	let f;
	$: f = form;

	$: p = data.profile;
	$: group = p.kind === 'proyecto';
	$: venue = p.kind === 'lugar';
	$: owner = data.role === 'owner';

	/** Lo que se escribió y no se guardó por un error de datos (no por un conflicto). */
	$: draft = f?.action === 'guardar' && !f.conflict ? f.draft : null;
	$: conflict = f?.action === 'guardar' && f.conflict ? f.draft : null;
	$: errors = /** @type {Record<string, string>} */ (
		f?.action === 'guardar' ? (f.errors ?? {}) : {}
	);
	$: values = draft ?? p;

	/** @type {(action: string) => FormState | null} */
	$: msg = (action) => (f?.action === action ? (f ?? null) : null);

	/** @param {number} d */
	const fmtDate = (d) =>
		new Date(d).toLocaleDateString('es-AR', { timeZone: TIMEZONE, day: 'numeric', month: 'long' });

	let confirmName = '';

	/** Ya se mandó el código fresco para las acciones de dueñes y borrar el proyecto. */
	$: codeSent = f?.codeSentFor === 'grupo';
	/** El código que se escribió (uno solo para toda la página: sirve para una acción). */
	let groupCode = '';
	$: if (!codeSent) groupCode = '';

	/** Sin vaciar los campos al responder (así un código mal escrito se corrige sin perder nada). */
	/** @type {import('@sveltejs/kit').SubmitFunction} */
	const keep =
		() =>
		async ({ update }) =>
			update({ reset: false });
</script>

<svelte:head>
	<title>{p.title} - Mi rincón - KinkyVibe.ar</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="rincon">
	<p class="back"><a href="/mi-rincon/perfiles">← Tus perfiles</a></p>
	<h1>{p.title}</h1>
	<p class="hint">
		Perfil de {KIND_LABELS[p.kind].toLowerCase()}{#if group}
			· {ROLE_LABELS[data.role]}{/if} · dirección: <code>{p.slug}</code>
	</p>
	{#if data.isNew && !f}
		<p class="ok" role="status">Listo, creaste el perfil. Completá lo que quieras y guardá.</p>
	{/if}
	{#if data.pending}
		<p class="hint" role="status">
			Todavía no aparece en el sitio: une admin lo tiene que aprobar. Mientras tanto lo ves vos (y
			quienes lo gestionan).
		</p>
	{:else if data.rejection}
		<div class="error rejected" role="status">
			<p>
				<strong>Rechazado.</strong> Une admin no lo aprobó ({fmtDate(data.rejection.at)}), así que
				no aparece en el sitio. Lo seguís viendo vos (y quienes lo gestionan).
			</p>
			{#if data.rejection.reason}
				<p>Motivo: <q>{data.rejection.reason}</q></p>
			{/if}
			<p>
				Podés corregirlo abajo (sigue rechazado) y, cuando esté listo, volver a mandarlo para que
				une admin lo revise.
			</p>
			{#if msg('revision')?.error}
				<p role="alert"><strong>{msg('revision')?.error}</strong></p>
			{/if}
			<form method="POST" action="?/volverAMandar" use:enhance={keep}>
				<button class="pill-btn" type="submit">Volver a mandar</button>
			</form>
		</div>
	{/if}
	{#if msg('revision')?.message}
		<p class="ok" role="status">{msg('revision')?.message}</p>
	{/if}

	<section class="surface-card" aria-labelledby="edit-title">
		<h2 id="edit-title">Datos del perfil</h2>
		{#if msg('guardar')?.error}
			<p class="error" role="alert">{msg('guardar')?.error}</p>
		{:else if msg('guardar')?.message}
			<p class="ok" role="status">{msg('guardar')?.message}</p>
		{/if}
		{#if conflict}
			<details class="draft" open>
				<summary>Lo que habías escrito (no se guardó)</summary>
				<dl>
					<dt>Nombre</dt>
					<dd>{conflict.title}</dd>
					<dt>Pronombres</dt>
					<dd>{conflict.pronouns || '—'}</dd>
					<dt>Presentación</dt>
					<dd class="pre">{conflict.bio || '—'}</dd>
					<dt>Links</dt>
					<dd class="pre">{conflict.links || '—'}</dd>
				</dl>
			</details>
		{/if}
		<!-- Sin enhance: después de guardar (o de un conflicto) la página se vuelve a cargar con la
		versión nueva. -->
		<form method="POST" action="?/guardar">
			<input type="hidden" name="version" value={p.version} />
			<label>
				<span>Nombre</span>
				<input
					name="title"
					type="text"
					maxlength="200"
					required
					value={values.title}
					aria-invalid={errors.title ? 'true' : undefined}
				/>
				{#if errors.title}<span class="field-error">{errors.title}</span>{/if}
			</label>
			{#if venue}
				<input type="hidden" name="pronouns" value={values.pronouns} />
			{:else}
				<label>
					<span>Pronombres <small class="hint">(opcional)</small></span>
					<input
						name="pronouns"
						type="text"
						maxlength="40"
						value={values.pronouns}
						aria-invalid={errors.pronouns ? 'true' : undefined}
					/>
					{#if errors.pronouns}<span class="field-error">{errors.pronouns}</span>{/if}
				</label>
			{/if}
			<label>
				<span>Presentación <small class="hint">(opcional, hasta 1000 caracteres)</small></span>
				<textarea
					name="bio"
					rows="5"
					maxlength="1000"
					aria-invalid={errors.bio ? 'true' : undefined}>{values.bio}</textarea
				>
				{#if errors.bio}<span class="field-error">{errors.bio}</span>{/if}
			</label>
			<label>
				<span>Links <small class="hint">(uno por línea, hasta 8)</small></span>
				<textarea
					name="links"
					rows="3"
					inputmode="url"
					placeholder="https://"
					aria-invalid={errors.links ? 'true' : undefined}>{values.links}</textarea
				>
				{#if errors.links}<span class="field-error">{errors.links}</span>{/if}
			</label>
			<fieldset>
				<legend>¿Quién lo puede ver?</legend>
				{#each VISIBILITY_OPTIONS as v (v.value)}
					<label class="choice">
						<input
							type="radio"
							name="visibility"
							value={v.value}
							checked={values.visibility === v.value}
						/>
						<span>{v.label} <small class="hint">{v.hint}</small></span>
					</label>
				{/each}
			</fieldset>
			{#if venue}
				<fieldset>
					<legend>El lugar</legend>
					<label>
						<span>Dirección <small class="hint">(calle y número)</small></span>
						<input
							name="address"
							type="text"
							maxlength="300"
							autocomplete="off"
							value={values.venue?.address ?? ''}
							aria-invalid={errors.address ? 'true' : undefined}
						/>
						{#if errors.address}<span class="field-error">{errors.address}</span>{/if}
					</label>
					<label>
						<span>Barrio</span>
						<input
							name="area"
							type="text"
							maxlength="100"
							value={values.venue?.area ?? ''}
							aria-invalid={errors.area ? 'true' : undefined}
						/>
						{#if errors.area}<span class="field-error">{errors.area}</span>{/if}
					</label>
					<label>
						<span>Ciudad</span>
						<input
							name="city"
							type="text"
							maxlength="100"
							value={values.venue?.city ?? ''}
							aria-invalid={errors.city ? 'true' : undefined}
						/>
						{#if errors.city}<span class="field-error">{errors.city}</span>{/if}
					</label>
					<div class="coords">
						<VenueCoordinates
							lat={values.venue?.lat ?? ''}
							lng={values.venue?.lng ?? ''}
							{errors}
							gridClass="coords-grid"
						/>
					</div>
					<label>
						<span>Accesibilidad <small class="hint">(escaleras, baño accesible…)</small></span>
						<textarea
							name="accessibility"
							rows="3"
							maxlength="2000"
							aria-invalid={errors.accessibility ? 'true' : undefined}
							>{values.venue?.accessibility ?? ''}</textarea
						>
						{#if errors.accessibility}<span class="field-error">{errors.accessibility}</span>{/if}
					</label>
					<label>
						<span>Cómo llegar</span>
						<textarea
							name="how_to_get_there"
							rows="3"
							maxlength="2000"
							aria-invalid={errors.how_to_get_there ? 'true' : undefined}
							>{values.venue?.how_to_get_there ?? ''}</textarea
						>
						{#if errors.how_to_get_there}<span class="field-error">{errors.how_to_get_there}</span
							>{/if}
					</label>
					<label>
						<span>¿Qué se muestra de la dirección?</span>
						<select
							name="venue_privacy"
							value={values.venue?.venue_privacy ?? ''}
							aria-invalid={errors.venue_privacy ? 'true' : undefined}
						>
							<option value="">{VENUE_PRIVACY_UNSET_LABEL}</option>
							{#each Object.entries(VENUE_PRIVACY_LABELS) as [value, label] (value)}
								<option {value}>{label}</option>
							{/each}
						</select>
						{#if errors.venue_privacy}<span class="field-error">{errors.venue_privacy}</span>{/if}
					</label>
					<p class="hint">
						Cada evento puede mostrar menos. Quien compra una entrada recibe siempre la dirección
						completa.
					</p>
				</fieldset>
			{/if}
			{#if group}
				<label class="choice">
					<input type="checkbox" name="show_members" checked={values.show_members} />
					<span
						>Mostrar integrantes <small class="hint"
							>(las personas que aceptaron la invitación; quienes gestionan no se muestran nunca)</small
						></span
					>
				</label>
			{/if}
			<button class="pill-btn" type="submit">Guardar</button>
		</form>
	</section>

	{#if group}
		<section class="surface-card" aria-labelledby="members-title">
			<h2 id="members-title">Integrantes</h2>
			{#if msg('integrantes')?.error}
				<p class="error" role="alert">{msg('integrantes')?.error}</p>
			{:else if msg('integrantes')?.message}
				<p class="ok" role="status">{msg('integrantes')?.message}</p>
			{/if}
			<p class="hint">
				Invitás a una persona con la dirección de su perfil (te la pasa ella). Solo perfiles de
				persona que podés ver, nunca ocultos. Le llega a su Mi rincón y figura como integrante
				recién cuando acepta; se puede ir cuando quiera. Si rechaza o se va, no la pueden volver a
				invitar por 30 días.
				{p.show_members
					? 'Les integrantes se muestran en el perfil del proyecto, a quien pueda ver cada perfil.'
					: 'Por ahora no se muestran: lo elegís arriba.'}
			</p>
			{#if data.members.length}
				<ul class="list">
					{#each data.members as m (m.id)}
						<li>
							<details>
								<summary>
									<span>{m.title}</span>
									<span class="hint"><code>{m.slug}</code></span>
								</summary>
								<form method="POST" action="?/sacarIntegrante" use:enhance>
									<input type="hidden" name="persona" value={m.id} />
									<button class="pill-btn ghost" type="submit">Sacar del proyecto</button>
								</form>
							</details>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="hint">Todavía no hay integrantes.</p>
			{/if}
			{#if data.pendingMembers.length}
				<h3>Invitaciones pendientes</h3>
				<p class="hint">Las ven solo quienes gestionan el proyecto y la persona invitada.</p>
				<ul class="list">
					{#each data.pendingMembers as m (m.id)}
						<li>
							<span>{m.title} <small class="hint">(pendiente)</small></span>
							<form method="POST" action="?/retirarInvitacionIntegrante" use:enhance>
								<input type="hidden" name="persona" value={m.id} />
								<button class="link" type="submit">Retirar la invitación</button>
							</form>
						</li>
					{/each}
				</ul>
			{/if}
			<form method="POST" action="?/invitarIntegrante" use:enhance>
				<label>
					<span>Invitar a una persona</span>
					<input
						name="persona"
						type="text"
						required
						autocomplete="off"
						placeholder="dirección de su perfil"
						aria-invalid={msg('integrantes')?.errors?.persona ? 'true' : undefined}
					/>
				</label>
				<button class="pill-btn" type="submit">Invitar</button>
			</form>
		</section>

		<section class="surface-card" aria-labelledby="managers-title">
			<h2 id="managers-title">Quiénes lo gestionan</h2>
			<p class="hint">
				Esto lo ven solo quienes gestionan el proyecto: nunca se muestra en público.
				{owner
					? 'Como dueñe, podés sumar gente, sacarla y pasar la propiedad.'
					: 'Les dueñes pueden sumar gente, sacarla y pasar la propiedad.'}
			</p>
			{#if msg('gestion')?.error}
				<p class="error" role="alert">{msg('gestion')?.error}</p>
			{:else if msg('gestion')?.message}
				<p class="ok" role="status">{msg('gestion')?.message}</p>
			{/if}
			{#if owner}
				<div class="stepup">
					<p class="hint">
						Para hacer dueñe a alguien, sacarle la propiedad o sacar a otre dueñe te pedimos un
						código por mail, así nadie puede hacerlo con tu sesión abierta.
					</p>
					{#if codeSent}
						<label>
							<span>Código que te llegó por mail</span>
							<input
								type="text"
								inputmode="numeric"
								autocomplete="one-time-code"
								maxlength="9"
								bind:value={groupCode}
							/>
						</label>
						<form method="POST" action="?/confirmar" use:enhance>
							<input type="hidden" name="donde" value="gestion" />
							<button class="link" type="submit">Mandame otro código</button>
						</form>
					{:else}
						<form method="POST" action="?/confirmar" use:enhance>
							<input type="hidden" name="donde" value="gestion" />
							<button class="pill-btn ghost" type="submit">Mandame un código para confirmar</button>
						</form>
					{/if}
				</div>
			{/if}
			<ul class="list">
				{#each data.managers as m (m.accountId)}
					<li>
						{#if owner && !m.me}
							<details>
								<summary>
									<span>{m.email}</span>
									<span class="hint">{ROLE_LABELS[m.role]}</span>
								</summary>
								<div class="row">
									<form method="POST" action="?/rol" use:enhance={keep}>
										<input type="hidden" name="account" value={m.accountId} />
										<input
											type="hidden"
											name="role"
											value={m.role === 'owner' ? 'manager' : 'owner'}
										/>
										{#if codeSent}<input type="hidden" name="code" value={groupCode} />{/if}
										<button class="pill-btn ghost" type="submit" disabled={!codeSent}
											>{m.role === 'owner' ? 'Sacarle la propiedad' : 'Hacer dueñe'}</button
										>
									</form>
									<form method="POST" action="?/sacar" use:enhance={keep}>
										<input type="hidden" name="account" value={m.accountId} />
										{#if codeSent && m.role === 'owner'}
											<input type="hidden" name="code" value={groupCode} />
										{/if}
										<button
											class="pill-btn delete"
											type="submit"
											disabled={m.role === 'owner' && !codeSent}>Sacar de la gestión</button
										>
									</form>
									{#if !codeSent}
										<p class="hint">
											{m.role === 'owner'
												? 'Primero pedí el código de arriba.'
												: 'Para hacerle dueñe, primero pedí el código de arriba.'}
										</p>
									{/if}
								</div>
							</details>
						{:else}
							<span
								>{m.email}
								{#if m.me}<small class="hint">(vos)</small>{/if}</span
							>
							<span class="hint">{ROLE_LABELS[m.role]}</span>
						{/if}
					</li>
				{/each}
			</ul>

			{#if owner}
				<h3>Invitar a alguien más</h3>
				{#if msg('invitar')?.error}
					<p class="error" role="alert">{msg('invitar')?.error}</p>
				{:else if msg('invitar')?.message}
					<p class="ok" role="status">{msg('invitar')?.message}</p>
				{/if}
				<form method="POST" action="?/invitar" use:enhance>
					<label>
						<span>Mail de la persona</span>
						<input name="email" type="email" required autocomplete="off" maxlength="254" />
					</label>
					<p class="hint">
						Si ese mail tiene cuenta, le mandamos un aviso corto con el nombre del proyecto (sin tu
						mail). La invitación la ve cuando entre a Mi rincón con ese mail.
					</p>
					<button class="pill-btn" type="submit">Invitar</button>
				</form>
				{#if data.invites.length}
					<h3>Invitaciones pendientes</h3>
					<ul class="list">
						{#each data.invites as inv (inv.id)}
							<li>
								<span class="hint"
									>{inv.invitedBy ? `La mandó ${inv.invitedBy}` : 'Invitación'} el {fmtDate(
										inv.createdAt
									)}; vence el {fmtDate(inv.expiresAt)}.</span
								>
								<form method="POST" action="?/cancelarInvitacion" use:enhance>
									<input type="hidden" name="invite" value={inv.id} />
									<button class="link" type="submit">Cancelar esta invitación</button>
								</form>
							</li>
						{/each}
					</ul>
				{/if}
			{/if}
		</section>
	{:else if !venue}
		<section class="surface-card" aria-labelledby="groups-title">
			<h2 id="groups-title">Proyectos</h2>
			{#if msg('proyectos')?.error}
				<p class="error" role="alert">{msg('proyectos')?.error}</p>
			{:else if msg('proyectos')?.message}
				<p class="ok" role="status">{msg('proyectos')?.message}</p>
			{/if}
			{#if data.memberships.length}
				<ul class="list">
					{#each data.memberships as g (g.id)}
						<li>
							<span>Sos parte de <strong>{g.title}</strong></span>
							<form method="POST" action="?/salirGrupo" use:enhance>
								<input type="hidden" name="group" value={g.id} />
								<button class="pill-btn ghost" type="submit">Salir del proyecto</button>
							</form>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="hint">Este perfil no es parte de ningún proyecto.</p>
			{/if}
			<p class="hint">
				Un proyecto te invita con la dirección de este perfil (<code>{p.slug}</code>): pasásela a
				quienes lo gestionan. Las invitaciones aparecen en Mi rincón → Perfiles y figurás recién
				cuando aceptás. Salir es un clic y no le tenés que pedir nada a nadie; si rechazás o te vas,
				ese proyecto no te puede volver a invitar por 30 días.
			</p>
		</section>
	{/if}

	{#if data.organizes?.length}
		<section class="surface-card" aria-labelledby="answers-title">
			<h2 id="answers-title">Respuestas de inscripción</h2>
			<p class="hint">
				Este perfil organiza estos eventos: podés ver lo que respondió cada persona que compró su
				entrada. Son datos personales: usalos solo para el evento.
			</p>
			<ul class="list">
				{#each data.organizes as ev (ev.slug)}
					<li>
						<a href="/mi-rincon/perfiles/{p.slug}/respuestas/{ev.slug}">{ev.title}</a>
						{#if ev.start}<span class="hint">{fmtDate(Date.parse(ev.start))}</span>{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<section class="surface-card danger" aria-labelledby="danger-title">
		<h2 id="danger-title">{group ? 'Dejar o borrar' : 'Borrar este perfil'}</h2>
		{#if group}
			{#if msg('dejar')?.error}
				<p class="error" role="alert">{msg('dejar')?.error}</p>
			{/if}
			<details open={f?.action === 'dejar'}>
				<summary>Dejar de gestionar este proyecto</summary>
				<p>
					El proyecto sigue igual; vos ya no lo vas a ver en Mi rincón. Para volver, alguien que es
					dueñe te tiene que invitar de nuevo.
					{#if owner}Si sos la única persona dueña, antes hacé dueñe a otra.{/if}
				</p>
				<form method="POST" action="?/dejar" use:enhance>
					<button class="pill-btn delete" type="submit">Dejar de gestionar</button>
				</form>
			</details>
		{/if}
		{#if owner}
			{#if msg('borrar')?.error}
				<p class="error" role="alert">{msg('borrar')?.error}</p>
			{/if}
			<details open={f?.action === 'borrar'}>
				<summary>Borrar {group ? 'el proyecto' : 'el perfil'}</summary>
				<p>
					{group
						? 'Se borra el perfil del proyecto para todes, también para quienes lo gestionan con vos.'
						: 'Se borra este perfil. Tus otros perfiles y tu cuenta siguen igual.'}
					Deja de verse en todos lados. Si fue un error, escribinos: les admins lo pueden recuperar.
				</p>
				{#if group && !codeSent}
					{#if msg('borrar')?.message}
						<p class="ok" role="status">{msg('borrar')?.message}</p>
					{/if}
					<p class="hint">Para borrar el proyecto te pedimos un código por mail.</p>
					<form method="POST" action="?/confirmar" use:enhance>
						<input type="hidden" name="donde" value="borrar" />
						<button class="pill-btn ghost" type="submit">Mandame un código para confirmar</button>
					</form>
				{:else}
					{#if group && msg('borrar')?.message}
						<p class="ok" role="status">{msg('borrar')?.message}</p>
					{/if}
					<form method="POST" action="?/borrar" use:enhance={keep}>
						<input type="hidden" name="version" value={p.version} />
						{#if group}
							<label>
								<span>Código que te llegó por mail</span>
								<input
									type="text"
									inputmode="numeric"
									autocomplete="one-time-code"
									maxlength="9"
									bind:value={groupCode}
								/>
							</label>
							<input type="hidden" name="code" value={groupCode} />
						{/if}
						<label>
							<span>Para confirmar, escribí «{p.title}»</span>
							<input name="confirm" type="text" autocomplete="off" bind:value={confirmName} />
						</label>
						<button
							class="pill-btn delete"
							type="submit"
							disabled={confirmName.trim().toLowerCase() !== p.title.trim().toLowerCase()}
							>Borrar</button
						>
					</form>
					{#if group}
						<form method="POST" action="?/confirmar" use:enhance>
							<input type="hidden" name="donde" value="borrar" />
							<button class="link" type="submit">Mandame otro código</button>
						</form>
					{/if}
				{/if}
			</details>
		{/if}
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
		overflow-wrap: anywhere;
	}
	h2 {
		margin: 0 0 0.5em;
		font-size: var(--step-1);
	}
	h3 {
		margin: 0.5em 0 0;
		font-size: var(--step-0);
	}
	section {
		display: grid;
		gap: 0.6em;
	}
	p {
		margin: 0;
	}
	code {
		overflow-wrap: anywhere;
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
	input[type='text'],
	input[type='email'],
	textarea {
		font: inherit;
		font-size: var(--step-0);
		padding: 0.5em 0.7em;
		border: 1px solid var(--line);
		border-radius: var(--round-sm);
		min-height: var(--tap);
		width: 100%;
		box-sizing: border-box;
	}
	textarea {
		resize: vertical;
	}
	.list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 0.6em;
	}
	.list li {
		display: grid;
		gap: 0.3em;
		padding-bottom: 0.6em;
		border-bottom: 1px solid var(--line);
		overflow-wrap: anywhere;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5em;
	}
	summary {
		cursor: pointer;
		font-weight: 700;
		min-height: var(--tap);
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.2em 0.6em;
	}
	details {
		display: grid;
		gap: 0.6em;
	}
	details > p,
	details > form,
	details > .row {
		margin-bottom: 0.6em;
	}
	.draft dl {
		display: grid;
		gap: 0.2em;
		margin: 0.5em 0 0;
	}
	.draft dt {
		font-weight: 700;
	}
	.draft dd {
		margin: 0 0 0.4em;
	}
	.pre {
		white-space: pre-wrap;
	}
	.hint {
		color: var(--muted);
		font-size: var(--step--1);
	}
	.link {
		background: none;
		border: 0;
		padding: 0;
		color: var(--2-dark);
		text-decoration: underline;
		cursor: pointer;
		font: inherit;
		min-height: var(--tap);
	}
	.danger {
		border-top: 0.25rem solid var(--1-dark);
	}
	.stepup {
		display: grid;
		gap: 0.5em;
		padding: 0.6em 0.8em;
		border: 1px solid var(--line);
		border-radius: var(--round-sm);
	}
	button:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}
	.pill-btn.delete {
		background: var(--1-dark);
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
	.field-error,
	.coords :global(.field-error) {
		color: var(--1-ink);
		font-size: var(--step--1);
	}
	.rejected {
		display: grid;
		gap: 0.4em;
	}
	/* La ubicación en el mapa (componente compartido con el panel): mismos estilos que los demás campos. */
	.coords {
		display: grid;
		gap: 0.4em;
		width: 100%;
	}
	.coords :global(.coords-grid) {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
		gap: 0.4em 0.8em;
	}
	.coords :global(label) {
		display: grid;
		gap: 0.25em;
	}
	.coords :global(label > span:first-child) {
		font-weight: 700;
	}
	.coords :global(input) {
		font: inherit;
		font-size: var(--step-0);
		padding: 0.5em 0.7em;
		border: 1px solid var(--line);
		border-radius: var(--round-sm);
		min-height: var(--tap);
		width: 100%;
		box-sizing: border-box;
	}
	.coords :global(.hint) {
		color: var(--muted);
		font-size: var(--step--1);
		margin: 0;
	}
</style>
