<script>
	/**
	 * Comunidad › Avisos de puerta (decisión 0051): cargar, renovar y quitar avisos para personas que
	 * la organización no admite en los eventos de Kinky Vibe. Solo admins. El motivo se ve solo acá.
	 * En la puerta se ve únicamente el texto genérico (`data.text`).
	 */
	import '$lib/admin/panel-forms.scss';
	import { enhance } from '$app/forms';
	import { DoorClosed } from '@lucide/svelte';
	import { fmtDate } from '$lib/admin/format.js';
	import { accountHref } from '$lib/admin/links.js';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import { Badge } from '$lib/components/ui';
	import EmptyState from '$lib/components/admin/panel/EmptyState.svelte';

	export let data;
	/** @type {any} */
	export let form;

	let expiry = data.presets[0]?.id ?? '6m';
	/** Los avisos que coinciden con la última búsqueda por mail. */
	$: found = new Set(form?.search?.ids ?? []);
	const DAY_MS = 24 * 60 * 60 * 1000;
	/** @param {number} at */
	const soon = (at) => at - Date.now() <= data.remindDays * DAY_MS;
</script>

<PageHeader
	title="Avisos de puerta"
	subtitle="Personas que la organización no admite en los eventos de Kinky Vibe. Solo lo ven les admins."
/>

{#if !data.dbAvailable}
	<p class="kv-flash bad">No hay base de datos disponible (o falta aplicar la migración 0066).</p>
{/if}
{#if form?.removed}<p class="kv-flash" role="status">{form.removed.message}</p>{/if}
{#if form?.row?.error && !form.row.id}<p class="kv-flash bad" role="alert">{form.row.error}</p>{/if}

<Card>
	<h2 class="h">Cómo funciona</h2>
	<ul class="how">
		<li>
			Solo en los eventos que organiza Kinky Vibe (los que tienen «Lo organiza KinkyVibe»). En los
			demás, nunca aparece.
		</li>
		<li>
			Si alguien escanea o busca una entrada comprada con ese mail o esa cuenta, la puerta muestra
			solo: <strong>«{data.text}»</strong>. Sin el motivo ni ningún otro detalle.
		</li>
		<li>
			No frena el ingreso: decide quien está en la puerta, después de hablar con la organización.
		</li>
		<li>
			Vence siempre. {data.remindDays} días antes llega un mail a la casilla de la organización para renovarlo
			o dejarlo vencer; al vencer, se borra solo.
		</li>
		<li>Cargar, renovar y quitar queda en Actividad (quién y cuándo), sin el mail ni el motivo.</li>
	</ul>
</Card>

<Card>
	<h2 class="h">Cargar un aviso</h2>
	{#if form?.add?.message}<p class="kv-flash" role="status">{form.add.message}</p>{/if}
	{#if form?.add?.error}<p class="kv-flash bad" role="alert">{form.add.error}</p>{/if}
	<form method="POST" action="?/agregar" use:enhance class="add">
		<label class="kv-field">
			<span>Mail</span>
			<input type="email" name="mail" required autocomplete="off" spellcheck="false" />
			<small
				>Nunca un nombre. Si el mail es de una cuenta, el aviso queda en la cuenta (sigue aunque
				cambie el mail). Del mail se guarda solo un código que no se puede leer.</small
			>
		</label>
		<fieldset class="kv-field">
			<legend>Vence</legend>
			<div class="choices">
				{#each data.presets as p (p.id)}
					<label class="choice"
						><input type="radio" name="vence" value={p.id} bind:group={expiry} /> {p.label}</label
					>
				{/each}
				<label class="choice"
					><input type="radio" name="vence" value="fecha" bind:group={expiry} /> Otra fecha</label
				>
				{#if expiry === 'fecha'}
					<input
						type="date"
						name="fecha"
						required
						max={data.maxDate}
						aria-label="Fecha en que vence"
					/>
				{/if}
			</div>
			<small>Hasta 2 años.</small>
		</fieldset>
		<label class="kv-field">
			<span>Motivo (opcional, privado)</span>
			<textarea name="motivo" rows="3" maxlength={data.reasonMax}></textarea>
			<small
				>Lo ven solo les admins en esta página. Nunca va a la puerta, a la entrada de la persona, a
				los mails ni a Actividad.</small
			>
		</label>
		<button class="kv-btn" type="submit" disabled={!data.dbAvailable}>Cargar el aviso</button>
	</form>
</Card>

<Card>
	<h2 class="h">Avisos vigentes</h2>
	<form method="POST" action="?/buscar" use:enhance class="search" role="search">
		<label class="kv-field grow">
			<span>¿Hay un aviso para este mail?</span>
			<input type="email" name="mail" required autocomplete="off" spellcheck="false" />
		</label>
		<button class="kv-btn ghost" type="submit" disabled={!data.dbAvailable}>Buscar</button>
	</form>
	{#if form?.search}
		<p class="kv-note" role="status">
			{form.search.none ? 'No hay ningún aviso vigente para ese mail.' : 'Marcado abajo.'}
		</p>
	{/if}

	{#if data.notices.length === 0}
		<EmptyState icon={DoorClosed} title="No hay avisos vigentes" />
	{:else}
		<ul class="list">
			{#each data.notices as n (n.id)}
				<li class:found={found.has(n.id)}>
					<p class="who">
						{#if n.accountId}
							Cuenta: <a href={accountHref(n.accountId)}>{n.accountEmail ?? 'cuenta borrada'}</a>
						{:else}
							Mail (guardado como código; buscalo arriba)
						{/if}
						{#if soon(n.expiresAt)}<Badge tone="warn">vence pronto</Badge>{/if}
					</p>
					<p class="meta">
						Vence el {fmtDate(n.expiresAt)} · cargado el {fmtDate(n.createdAt)} por {n.createdBy}
					</p>
					{#if n.reason}<p class="reason"><strong>Motivo:</strong> {n.reason}</p>{/if}
					{#if form?.row?.id === n.id}
						<p class="kv-flash" class:bad={form.row.error} role="status">
							{form.row.error ?? form.row.message}
						</p>
					{/if}
					<div class="actions">
						<form method="POST" action="?/renovar" use:enhance class="inline">
							<input type="hidden" name="id" value={n.id} />
							<label class="kv-field">
								<span class="sr-only">Renovar por</span>
								<select name="vence">
									{#each data.presets as p (p.id)}<option value={p.id}>{p.label} desde hoy</option
										>{/each}
								</select>
							</label>
							<button class="kv-btn ghost" type="submit">Renovar</button>
						</form>
						<form
							method="POST"
							action="?/quitar"
							use:enhance
							on:submit={(e) => {
								if (!confirm('¿Quitar este aviso? En la puerta deja de aparecer.'))
									e.preventDefault();
							}}
						>
							<input type="hidden" name="id" value={n.id} />
							<button class="kv-btn ghost danger" type="submit">Quitar</button>
						</form>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</Card>

<style>
	.h {
		font-size: var(--text-l);
		margin: 0 0 var(--space-xs);
	}
	.how {
		margin: 0;
		padding-left: 1.2rem;
		display: grid;
		gap: var(--space-3xs);
	}
	.add {
		display: grid;
		gap: var(--space-s);
		max-width: 36rem;
	}
	fieldset {
		border: 0;
		padding: 0;
		margin: 0;
	}
	.choices {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-xs);
		align-items: center;
	}
	.choice {
		display: inline-flex;
		gap: 0.3rem;
		align-items: center;
	}
	small {
		color: var(--muted);
	}
	.search {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-xs);
		align-items: flex-end;
		margin-bottom: var(--space-s);
	}
	.grow {
		flex: 1 1 16rem;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-xs);
	}
	.list li {
		border: 1px solid var(--border, var(--surface-2));
		border-radius: var(--radius-m);
		padding: var(--space-xs);
		display: grid;
		gap: var(--space-3xs);
		overflow-wrap: anywhere;
	}
	.list li.found {
		outline: 3px solid var(--link);
	}
	.list p {
		margin: 0;
	}
	.who {
		font-weight: 700;
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		align-items: center;
	}
	.meta {
		font-size: var(--text-sm);
		color: var(--muted);
	}
	.reason {
		white-space: pre-line;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-xs);
		align-items: flex-end;
	}
	.inline {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2xs);
		align-items: flex-end;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
