<script>
	/**
	 * Ficha de una persona (src/lib/server/admin/ficha.js): Cuenta, Compras, Perfiles, Lo que
	 * sigue, Notas internas y Actividad. La usan Comunidad › Personas › <persona> y Comunidad ›
	 * Cuentas › <cuenta>. El DNI no viene con la página: cada «Mostrar» lo pide aparte (y queda en
	 * Actividad).
	 * Props: `data` (lo del load), `form` (lo de las actions), `back` ({ href, label }).
	 */
	import { askConfirm } from '$lib/admin/confirm.js';
	import '$lib/admin/panel-forms.scss';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { Check, IdCard, ReceiptText, Rss, StickyNote, Trash2, UserRound } from '@lucide/svelte';
	import { fmtDate, fmtDateTime } from '$lib/admin/format.js';
	import { orderHref, profileHref } from '$lib/admin/links.js';
	import { eventPanelLink } from '$lib/admin/nav.js';
	import { VISIBILITY_LABELS } from '$lib/admin/cuentas.js';
	import {
		ORDER_STATUS,
		ORDER_STATUS_TONE,
		PAYMENT_METHOD,
		formatDni
	} from '$lib/admin/orderFormat.js';
	import { KIND_LABELS, ROLE_LABELS } from '$lib/utils/perfiles.js';
	import { fondoOptionLabel, orderReference } from '$lib/utils/tickets.js';
	import { formatARS } from '$lib/utils/money.js';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Stat from '$lib/components/admin/panel/Stat.svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import EmptyState from '$lib/components/admin/panel/EmptyState.svelte';

	/** @type {any} */
	export let data;
	/** @type {any} */
	export let form = null;
	/** @type {{ href: string, label: string }} */
	export let back = { href: '/admin/comunidad/personas', label: 'Personas' };

	$: a = data.account;
	$: s = data.summary;
	// El nombre de «Mis datos» si lo guardó; si no, el más usado en sus compras.
	$: title = a?.saved?.name || s?.names?.[0] || data.key.email || a?.email || 'Cuenta borrada';
	$: otherNames = (s?.names ?? []).filter((/** @type {string} */ n) => n !== title);

	/** @type {Record<string, string>} */
	const SESSION_METHOD = { code: 'código por mail', password: 'contraseña', passkey: 'passkey' };
	/** @type {Record<string, string>} */
	const CHANNEL = { online: 'online', puerta: 'en la puerta', manual: 'cargada a mano' };
	/** @type {Record<string, string>} */
	const REVIEW = { late_payment: 'pago tardío', duplicate_payment: 'pago duplicado' };
	/** @type {Record<string, string>} */
	const CLAIM = { pending: 'pendiente', approved: 'aprobado', rejected: 'rechazado' };
	/** @type {Record<string, 'warn' | 'ok' | 'bad'>} */
	const CLAIM_TONE = { pending: 'warn', approved: 'ok', rejected: 'bad' };
	/** @type {Record<string, string>} */
	const NOTIFY_KIND = { nuevo: 'algo nuevo', recordatorio: 'recordatorio' };
	/** @type {Record<string, string>} */
	const MAIL_STATUS = { sent: 'mandado', sending: 'mandando', failed: 'falló' };

	/** DNIs que ya se mostraron en esta visita (clave: `orden:<id>` o `guardado`). */
	/** @type {Record<string, string>} */
	let revealed = {};
	/** @type {Record<string, string>} */
	let dniErrors = {};
	// Reactiva: así el template se vuelve a dibujar cuando cambian `revealed` o `form`.
	/** @type {(key: string) => string | null} */
	$: shownDni = (key) =>
		revealed[key] ?? (form?.dni?.ok && form.dni.key === key ? form.dni.value : null);

	/** @type {import('@sveltejs/kit').SubmitFunction} */
	const showDni = () => {
		return async ({ result }) => {
			const d = /** @type {any} */ (result).data?.dni;
			if (result.type === 'success' && d?.key) {
				revealed = { ...revealed, [d.key]: d.value };
				// Para que Actividad muestre el «Miró el DNI» recién anotado.
				await invalidateAll();
			} else if (result.type === 'failure' && d?.key)
				dniErrors = { ...dniErrors, [d.key]: d.message };
		};
	};

	/** @param {{ mailNew: boolean, mailReminder: boolean, tgNew: boolean, tgReminder: boolean, inCalendar: boolean }} f */
	function followChannels(f) {
		const out = [];
		if (f.inCalendar) out.push('en el calendario');
		if (f.mailNew) out.push('mail: algo nuevo');
		if (f.mailReminder) out.push('mail: recordatorio');
		if (f.tgNew) out.push('Telegram: algo nuevo');
		if (f.tgReminder) out.push('Telegram: recordatorio');
		return out.length ? out.join(' · ') : 'sin avisos';
	}

	/**
	 * Partes de un texto separadas por « · » (las vacías no van).
	 * @param {unknown[]} parts
	 */
	const join = (parts) => parts.filter(Boolean).join(' · ');

	/** @param {{ count: number, method: string }[]} methods */
	const sessionMethods = (methods) =>
		methods.map((m) => `${m.count} con ${SESSION_METHOD[m.method] ?? m.method}`).join(', ');

	let body = '';
	let saving = false;
</script>

<PageHeader {title} subtitle={s?.pronouns?.join(' · ') ?? ''} {back}>
	<svelte:fragment slot="meta">
		{#if a && !a.deletedAt}<Badge tone="info">tiene cuenta</Badge>{/if}
		{#if !a}<Badge>sin cuenta</Badge>{/if}
		{#if a?.deletedAt}<Badge tone="bad">cuenta borrada</Badge>{/if}
		{#if a?.canHaveProfiles}<Badge tone="ok">puede tener perfiles</Badge>{/if}
		{#if s && s.attended >= 2}<Badge tone="ok">vuelve</Badge>{/if}
		{#if s && s.attended === 1}<Badge tone="info">primera vez</Badge>{/if}
	</svelte:fragment>
	{#if data.key.email}
		<p class="muted email"><a href="mailto:{data.key.email}">{data.key.email}</a></p>
	{/if}
	{#if otherNames.length}
		<p class="muted">También como: {otherNames.join(', ')}</p>
	{/if}
</PageHeader>

{#if s}
	<div class="kv-stats">
		<Stat label="Vino a" value={s.attended} sub="de {s.bought} eventos comprados" />
		<Stat label="Gastado" value={formatARS(s.spent)} sub="{s.orders} compras" />
		<Stat
			label="No vino"
			value={s.noShows}
			tone={s.noShows ? 'warn' : ''}
			sub="eventos pasados sin check-in"
		/>
		<Stat
			label="Primera / última vez"
			value={s.firstVisit ? fmtDate(s.firstVisit) : '—'}
			sub={s.lastVisit ? `última: ${fmtDate(s.lastVisit)}` : 'todavía no vino'}
		/>
	</div>
{/if}

<!-- Cuenta -->
<div class="kv-grid-2 layout" id="cuenta">
	<Card title="Cuenta" icon={UserRound}>
		{#if !a}
			<p class="muted">
				No tiene cuenta con este mail. Si entra alguna vez con «Ingresar», aparece acá.
			</p>
		{:else}
			<dl class="facts">
				<dt>Mail</dt>
				<dd>{a.email ?? '— (borrado con la cuenta)'}</dd>
				<dt>Verificado</dt>
				<dd>{a.verifiedAt ? fmtDateTime(a.verifiedAt) : 'No'}</dd>
				<dt>Creada</dt>
				<dd>{fmtDateTime(a.createdAt)}</dd>
				{#if a.updatedAt}
					<dt>Último cambio</dt>
					<dd>{fmtDateTime(a.updatedAt)}</dd>
				{/if}
				{#if a.deletedAt}
					<dt>Borrada</dt>
					<dd>{fmtDateTime(a.deletedAt)}</dd>
				{/if}
				<dt>Contraseña</dt>
				<dd>
					{a.hasPassword
						? a.passwordUpdatedAt
							? `Tiene, cambiada el ${fmtDateTime(a.passwordUpdatedAt)}`
							: 'Tiene'
						: 'No tiene (entra con código por mail)'}
				</dd>
				<dt>Sesiones abiertas</dt>
				<dd>
					{data.sessions.total}{#if data.sessions.methods.length}{' '}<span class="muted"
							>({sessionMethods(data.sessions.methods)})</span
						>{/if}
				</dd>
				<dt>Última vez</dt>
				<dd>{data.sessions.lastSeen ? fmtDate(data.sessions.lastSeen) : '—'}</dd>
				<dt>Perfiles vivos</dt>
				<dd>{data.liveProfiles}</dd>
			</dl>
			<h3>Mis datos guardados</h3>
			{#if a.saved.name || a.saved.pronouns || a.saved.hasDni}
				<dl class="facts">
					{#if a.saved.name}<dt>Nombre</dt>
						<dd>{a.saved.name}</dd>{/if}
					{#if a.saved.pronouns}<dt>Pronombres</dt>
						<dd>{a.saved.pronouns}</dd>{/if}
					{#if a.saved.hasDni}
						<dt>DNI</dt>
						<dd>
							{#if shownDni('guardado')}
								<span class="dni">{formatDni(shownDni('guardado') ?? '')}</span>
							{:else}
								<form class="inline" method="POST" action="?/dni" use:enhance={showDni}>
									<input type="hidden" name="guardado" value="1" />
									<button class="kv-btn ghost small" type="submit">Mostrar</button>
								</form>
								{#if dniErrors.guardado}<small class="muted">{dniErrors.guardado}</small>{/if}
							{/if}
						</dd>
					{/if}
				</dl>
			{:else}
				<p class="muted">No guardó datos para comprar.</p>
			{/if}
		{/if}
	</Card>

	{#if a}
		<Card title="Permiso para tener perfiles">
			<p class="kv-note">
				Apagado por defecto. Sin el permiso, la cuenta no ve nada de perfiles: ni la tarjeta en Mi
				rincón, ni sus perfiles, ni invitaciones de proyectos. Sus perfiles quedan guardados y
				vuelven a aparecer si lo prendés de nuevo. Queda en Actividad.
			</p>
			{#if form?.permiso}
				<p class="kv-flash" class:bad={!form.permiso.ok} role="status">{form.permiso.message}</p>
			{/if}
			{#if a.deletedAt}
				<p class="muted">La cuenta está borrada: no se puede cambiar.</p>
			{:else}
				<form
					method="POST"
					action="?/permiso"
					use:enhance={() => {
						saving = true;
						return async ({ update }) => {
							await update();
							saving = false;
						};
					}}
				>
					<p class="state">
						Ahora: <b>{a.canHaveProfiles ? 'puede tener perfiles' : 'no puede tener perfiles'}</b>
					</p>
					<input type="hidden" name="valor" value={a.canHaveProfiles ? '0' : '1'} />
					<button class="kv-btn" class:ghost={a.canHaveProfiles} type="submit" disabled={saving}
						>{a.canHaveProfiles ? 'Sacarle el permiso' : 'Darle el permiso'}</button
					>
				</form>
			{/if}
		</Card>
	{/if}
</div>

<!-- Compras -->
<div class="block" id="compras">
	<Card title="Compras" icon={ReceiptText}>
		{#if data.orders.length === 0}
			<EmptyState
				icon={ReceiptText}
				title="Sin compras"
				text="Ni con este mail ni con la cuenta."
			/>
		{:else}
			<ul class="orders">
				{#each data.orders as o (o.id)}
					<li>
						<div class="kv-row">
							<a class="event" href={eventPanelLink(o.slug, { tickets: true })}>{o.event}</a>
							<Badge tone={ORDER_STATUS_TONE[o.status] ?? 'neutral'}
								>{ORDER_STATUS[o.status] ?? o.status}</Badge
							>
							{#if o.needsReview}<Badge tone="warn"
									>para revisar: {REVIEW[o.needsReview] ?? o.needsReview}</Badge
								>{/if}
						</div>
						<small class="muted">
							{o.start ? `${fmtDate(o.start)} · ` : ''}<a href={orderHref(o.slug, o.id)}
								>{orderReference(o.id)}</a
							>{' '}· {join([
								`comprada ${fmtDateTime(o.createdAt)}`,
								CHANNEL[o.channel] ?? o.channel,
								o.byAccount && 'con la cuenta'
							])}
						</small>
						<dl class="facts small">
							<dt>Entrada</dt>
							<dd>
								{join([
									o.tier ? `${o.type} (${o.tier})` : o.type,
									`${o.quantity} × ${formatARS(o.unitPrice)}`
								])}
							</dd>
							<dt>Total</dt>
							<dd>
								<b>{formatARS(o.total)}</b>{#if o.discountAmount || o.surcharge}{' '}<span
										class="muted"
										>· {join([
											o.discountAmount &&
												`descuento ${formatARS(o.discountAmount)}${o.discountCode ? ` (${o.discountCode})` : ''}`,
											o.surcharge && `recargo ${formatARS(o.surcharge)}`
										])}</span
									>{/if}
							</dd>
							<dt>Fondo</dt>
							<dd>
								{join([
									fondoOptionLabel(o.fondoOption),
									o.fondoAmount && `cubrió ${formatARS(o.fondoAmount)}`,
									o.fondoContribution && `aportó ${formatARS(o.fondoContribution)}`
								])}
							</dd>
							<dt>Pago</dt>
							<dd>
								{join([
									PAYMENT_METHOD[o.method] ?? o.method,
									o.confirmedBy && `confirmó ${o.confirmedBy}`,
									o.refundedAt && `reembolsó ${o.refundedBy || '—'} el ${fmtDateTime(o.refundedAt)}`
								])}
							</dd>
							<dt>A nombre de</dt>
							<dd>
								{o.name}{#if o.pronouns}{' '}<span class="muted">({o.pronouns})</span
									>{/if}{#if o.email.trim().toLowerCase() !== data.key.email}{' '}<span
										class="muted">· {o.email}</span
									>{/if}
							</dd>
							{#if o.hasDni}
								<dt>DNI</dt>
								<dd>
									{#if shownDni(`orden:${o.id}`)}
										<span class="dni">{formatDni(shownDni(`orden:${o.id}`) ?? '')}</span>
									{:else}
										<form class="inline" method="POST" action="?/dni" use:enhance={showDni}>
											<input type="hidden" name="orden" value={o.id} />
											<button class="kv-btn ghost small" type="submit">Mostrar</button>
										</form>
										{#if dniErrors[`orden:${o.id}`]}<small class="muted"
												>{dniErrors[`orden:${o.id}`]}</small
											>{/if}
									{/if}
								</dd>
							{/if}
							{#if o.emailSentAt}
								<dt>Mail de la compra</dt>
								<dd>{fmtDateTime(o.emailSentAt)}</dd>
							{/if}
							{#if o.reminders.length}
								<dt>Recordatorios</dt>
								<dd>
									{o.reminders
										.map(
											(/** @type {any} */ r) =>
												`${r.id} (${fmtDateTime(r.sentAt)}${r.status && r.status !== 'sent' ? `, ${r.status}` : ''})`
										)
										.join(' · ')}
								</dd>
							{/if}
							{#if o.adminNote}
								<dt>Nota de la carga</dt>
								<dd class="pre">{o.adminNote}</dd>
							{/if}
							{#if o.reviewDetail}
								<dt>Detalle de revisión</dt>
								<dd class="pre">{o.reviewDetail}</dd>
							{/if}
						</dl>
						{#if o.answers.length}
							<details>
								<summary>Respuestas de inscripción ({o.answers.length})</summary>
								<dl class="facts small">
									{#each o.answers as q, i (i)}
										<dt>{q.label}</dt>
										<dd class="pre">{q.value || '—'}</dd>
									{/each}
								</dl>
							</details>
						{/if}
						{#if o.tickets.length}
							<ul class="tickets">
								{#each o.tickets as t, i (i)}
									<li>
										{t.name}{#if t.pronouns}{' '}<span class="muted">({t.pronouns})</span>{/if}
										<code>{t.code}</code>
										{#if t.checkedInAt}
											<Badge tone="ok"
												><Check size={12} aria-hidden="true" /> entró {join([
													fmtDateTime(t.checkedInAt),
													t.checkedInBy
												])}</Badge
											>
										{:else if o.start && Date.parse(o.start) < data.now && o.status === 'approved'}
											<Badge tone="warn">no entró</Badge>
										{/if}
									</li>
								{/each}
							</ul>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
		{#if data.mails.length}
			<h3>Mails a compradores que recibió</h3>
			<ul class="plain">
				{#each data.mails as m, i (i)}
					<li>
						<b>{m.subject}</b> <span class="muted">· {m.event} · {fmtDateTime(m.at)}</span>
						{#if m.status !== 'sent'}<Badge tone={m.status === 'failed' ? 'bad' : 'warn'}
								>{MAIL_STATUS[m.status] ?? m.status}</Badge
							>{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</Card>
</div>

<!-- Perfiles -->
<div class="block" id="perfiles">
	<Card title="Perfiles" icon={IdCard}>
		{#if data.profiles.length === 0 && data.claims.length === 0 && data.invites.length === 0}
			<EmptyState icon={IdCard} title="No gestiona ningún perfil" />
		{/if}
		{#if data.profiles.length}
			<div class="kv-table-wrap">
				<table class="kv-table">
					<thead>
						<tr>
							<th>Perfil</th>
							<th>Tipo</th>
							<th>Rol</th>
							<th>Visibilidad</th>
							<th class="hide-sm">Creado</th>
						</tr>
					</thead>
					<tbody>
						{#each data.profiles as p (p.id)}
							<tr>
								<td>
									<a class="name" href={profileHref(p.id)}>{p.title}</a>
									<small class="muted slug">/{p.slug}</small>
									{#if p.deletedAt}<Badge tone="bad">borrado</Badge>{/if}
								</td>
								<td class="small">{KIND_LABELS[p.kind] ?? p.kind}</td>
								<td class="small">{ROLE_LABELS[p.role] ?? p.role}</td>
								<td class="small">{VISIBILITY_LABELS[p.visibility] ?? p.visibility}</td>
								<td class="hide-sm small">{fmtDate(p.createdAt)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
		{#if data.profileEvents.length}
			<h3>Eventos donde participan sus perfiles</h3>
			<ul class="plain">
				{#each data.profileEvents as e, i (i)}
					<li>
						<a href={eventPanelLink(e.slug)}>{e.title}</a>
						<span class="muted">· {join([e.profile, e.rol, e.start && fmtDate(e.start)])}</span>
					</li>
				{/each}
			</ul>
		{/if}
		{#if data.claims.length}
			<h3>Pedidos «Es mi perfil»</h3>
			<ul class="plain">
				{#each data.claims as c (c.id)}
					<li>
						<a href={profileHref(c.profileId)}>{c.title || `Perfil ${c.profileId}`}</a>
						<Badge tone={CLAIM_TONE[c.status] ?? 'neutral'}>{CLAIM[c.status] ?? c.status}</Badge>
						<span class="muted"
							>· {join([
								`pedido ${fmtDateTime(c.createdAt)}`,
								c.decidedAt && `${c.decidedBy || '—'} el ${fmtDateTime(c.decidedAt)}`
							])}</span
						>
						{#if c.message}<p class="quote">{c.message}</p>{/if}
					</li>
				{/each}
			</ul>
		{/if}
		{#if data.invites.length}
			<h3>Invitaciones a gestionar</h3>
			<ul class="plain">
				{#each data.invites as inv, i (i)}
					<li>
						<a href={profileHref(inv.profileId)}>{inv.title || `Perfil ${inv.profileId}`}</a>
						<span class="muted"
							>· invitade el {fmtDateTime(inv.createdAt)}{inv.invitedBy
								? ` por ${inv.invitedBy}`
								: ''}</span
						>
						{#if inv.expired}<Badge>vencida</Badge>{:else}<Badge tone="warn"
								>vence {fmtDate(inv.expiresAt)}</Badge
							>{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</Card>
</div>

<!-- Lo que sigue -->
<div class="block" id="sigue">
	<Card title="Lo que sigue" icon={Rss}>
		<dl class="facts">
			<dt>Calendario personal</dt>
			<dd>
				{#if data.calendar}
					{join([
						data.calendar.links === 1 ? 'Tiene un link' : `Tiene ${data.calendar.links} links`,
						data.calendar.lastUsed
							? `usado por última vez el ${fmtDate(data.calendar.lastUsed)}`
							: 'todavía no se usó'
					])}
				{:else}
					No tiene
				{/if}
			</dd>
			<dt>Telegram</dt>
			<dd>
				{#if data.telegram}
					Vinculado el {fmtDate(data.telegram.linkedAt)}{#if data.telegram.muted}{' '}·
						<Badge tone="warn">silenciado</Badge>{/if}
				{:else}
					No vinculado
				{/if}
			</dd>
		</dl>
		{#if data.follows.length}
			<div class="kv-table-wrap">
				<table class="kv-table">
					<thead>
						<tr>
							<th>Sigue</th>
							<th>Avisos</th>
							<th class="hide-sm">Desde</th>
						</tr>
					</thead>
					<tbody>
						{#each data.follows as f (`${f.kind}:${f.key}`)}
							<tr>
								<td>
									{#if f.kind === 'perfil'}
										<a href={profileHref(f.key)}>{f.title}</a>
									{:else}
										<span class="name">#{f.title}</span>
									{/if}
									{#if f.fromSeries}<small class="muted">(vino de «Avisame si se repite»)</small
										>{/if}
								</td>
								<td class="small">{followChannels(f)}</td>
								<td class="hide-sm small">{fmtDate(f.createdAt)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<p class="muted">No sigue nada.</p>
		{/if}
		{#if data.series.length}
			<h3>«Avisame si se repite» (series)</h3>
			<ul class="plain">
				{#each data.series as sub, i (i)}
					<li>
						<b>#{sub.tag}</b>
						<span class="muted"
							>· {sub.byAccount ? 'con la cuenta' : 'por mail, sin cuenta'} · desde {fmtDate(
								sub.createdAt
							)} · {sub.sent}
							{sub.sent === 1 ? 'aviso' : 'avisos'}</span
						>
						{#if !sub.confirmedAt}<Badge tone="warn">sin confirmar</Badge>{/if}
					</li>
				{/each}
			</ul>
		{/if}
		{#if data.followNotifications.length}
			<details>
				<summary>Avisos que le mandamos ({data.followNotifications.length})</summary>
				<ul class="plain">
					{#each data.followNotifications as n, i (i)}
						<li>
							{n.event}
							<span class="muted"
								>· {NOTIFY_KIND[n.kind] ?? n.kind} por {n.channel === 'telegram'
									? 'Telegram'
									: 'mail'}
								· {fmtDateTime(n.sentAt)}</span
							>
						</li>
					{/each}
				</ul>
			</details>
		{/if}
	</Card>
</div>

<!-- Notas internas + Actividad -->
<div class="kv-grid-2 block" id="notas">
	<Card title="Notas internas" icon={StickyNote}>
		<p class="kv-note">
			Solo las ven les admins. Nada de datos sensibles (DNI, salud, etc.): alcanza con lo que ayude
			a recibir mejor a esta persona.
		</p>
		{#if form?.note}
			<p class="kv-flash" class:bad={!form.note.ok} role="status">{form.note.message}</p>
		{/if}
		{#if data.key.email || data.key.accountId}
			{#if !data.key.email}
				<p class="muted">
					Esta cuenta está borrada y ya no tiene mail: las notas quedan atadas a la cuenta.
				</p>
			{/if}
			<form
				class="kv-form"
				method="POST"
				action="?/addNote"
				use:enhance={() =>
					async ({ result, update }) => {
						await update();
						if (result.type === 'success') body = '';
					}}
			>
				<label class="kv-field">
					<span>Nueva nota</span>
					<textarea name="body" rows="3" maxlength="2000" bind:value={body}></textarea>
				</label>
				<div>
					<button class="kv-btn" type="submit" disabled={!body.trim()}>Crear nota</button>
				</div>
			</form>
		{:else}
			<p class="muted">Sin mail ni cuenta no se pueden crear notas.</p>
		{/if}
		{#if data.notes.length}
			<ul class="notes">
				{#each data.notes as n (n.id)}
					<li>
						<p>{n.body}</p>
						<div class="kv-row">
							<small class="muted">{fmtDateTime(n.createdAt)} · {n.createdBy}</small>
							<form
								method="POST"
								action="?/deleteNote"
								use:enhance={async ({ cancel }) => {
									const ok = await askConfirm({
										title: '¿Borrar esta nota?',
										confirmLabel: 'Borrar',
										tone: 'danger'
									});
									if (!ok) cancel();
								}}
							>
								<input type="hidden" name="id" value={n.id} />
								<button class="kv-btn ghost small" type="submit" aria-label="Borrar nota">
									<Trash2 size={14} aria-hidden="true" /> Borrar
								</button>
							</form>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</Card>

	<Card title="Actividad">
		<p class="kv-note">
			Lo que hicieron les admins con esta persona, su cuenta o sus compras (también cada DNI que se
			mostró).
		</p>
		{#if data.activity.length}
			<ul class="plain activity">
				{#each data.activity as e (e.id)}
					<li>
						{e.summary}
						<small class="muted">· {e.by} · {fmtDateTime(e.at)}</small>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="muted">Nada todavía.</p>
		{/if}
	</Card>
</div>

<style>
	.layout,
	.block {
		margin-bottom: 1rem;
	}
	.email {
		margin: 0.2rem 0 0;
		overflow-wrap: anywhere;
	}
	h3 {
		font-size: var(--text-sm);
		margin: 0.6rem 0 0;
	}
	.facts {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: var(--space-3xs) var(--space-xs);
		margin: 0;
	}
	.facts.small {
		font-size: var(--text-sm);
		margin-top: 0.3rem;
	}
	.facts dt {
		color: var(--muted);
	}
	.facts dd {
		margin: 0;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.pre {
		white-space: pre-wrap;
	}
	.state {
		margin: 0 0 0.6rem;
	}
	.inline {
		display: inline;
	}
	.dni {
		font-variant-numeric: tabular-nums;
		font-weight: 700;
	}
	.orders,
	.tickets,
	.notes,
	.plain {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.orders > li {
		padding: var(--space-xs) 0;
		border-top: 1px solid var(--line);
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.orders > li:first-child {
		border-top: 0;
		padding-top: 0;
	}
	.event,
	.name {
		font-weight: 700;
		overflow-wrap: anywhere;
	}
	.slug {
		display: block;
		overflow-wrap: anywhere;
	}
	.small {
		font-size: var(--text-sm);
	}
	.tickets li {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3xs) var(--space-2xs);
		align-items: center;
		font-size: var(--text-sm);
		padding: 0.15rem 0;
	}
	.plain li {
		padding: var(--space-3xs) 0;
		overflow-wrap: anywhere;
	}
	.quote {
		margin: 0.2rem 0 0;
		font-size: var(--text-sm);
		color: var(--muted);
		white-space: pre-wrap;
	}
	details summary {
		cursor: pointer;
		font-size: var(--text-sm);
	}
	.notes li {
		background: var(--surface-2);
		border-radius: var(--radius-m);
		padding: var(--space-2xs) var(--space-xs);
		margin-top: 0.5rem;
	}
	.notes p {
		margin: 0 0 0.3rem;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.notes .kv-row {
		justify-content: space-between;
	}
	@media (max-width: 700px) {
		.hide-sm {
			display: none;
		}
		.facts {
			grid-template-columns: 1fr;
			gap: 0.1rem;
		}
		.facts dd {
			margin-bottom: 0.3rem;
		}
	}
</style>
