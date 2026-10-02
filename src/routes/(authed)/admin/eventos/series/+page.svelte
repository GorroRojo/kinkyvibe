<script>
	/**
	 * Eventos → Series: cada serie (etiqueta hija de «evento recurrente») con su imagen, la próxima
	 * edición, cuántas personas pidieron aviso (solo el número) y sus ediciones. CSV con todas las
	 * ediciones. «Crear serie»: una etiqueta nueva hija de «evento recurrente»; «Editar»: el nombre
	 * de la etiqueta (renombrar, con la misma elección que en Etiquetas; se confirma después de ver
	 * cuántas publicaciones cambian), nombre visible, ícono, imagen y descripción. Se guarda como en
	 * Etiquetas (commit al archivo, o en la base con el interruptor `etiquetas_db`).
	 */
	import '$lib/admin/panel-forms.scss';
	import { enhance } from '$app/forms';
	import PublishStatus from '$lib/components/admin/PublishStatus.svelte';
	import { Pencil, Plus, Repeat, Tags } from '@lucide/svelte';
	import SeriesFields from '$lib/components/admin/series/SeriesFields.svelte';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import CsvButton from '$lib/components/admin/panel/CsvButton.svelte';
	import EmptyState from '$lib/components/admin/panel/EmptyState.svelte';
	import { eventPanelLink } from '$lib/admin/nav.js';
	import { editionDateLabel } from '$lib/utils/series.js';

	export let data;
	/** @type {any} */
	export let form;
	const icon = { size: 18, 'aria-hidden': true };
	let creating = false;
	let busy = false;
	/** La serie que se está editando (su id), o ''. */
	let editing = '';
	$: if (form?.error && !form?.editing) creating = true;
	$: if (form?.editing) editing = form.editing;
	$: if (form?.edited) editing = '';
	/** Renombrar: lo que hay que confirmar (cuántas publicaciones cambian) en esa serie, o null. */
	$: confirmFor = (/** @type {string} */ id) =>
		form?.editing === id && form?.confirmRename ? form.confirmRename : null;
	/** Lo que se acaba de guardar (crear o editar), para el aviso. */
	$: done = form?.created
		? { ...form.created, verb: 'creó' }
		: form?.edited
			? { ...form.edited, verb: 'guardó' }
			: null;
	/** @type {import('@sveltejs/kit').SubmitFunction} */
	const submit = () => {
		busy = true;
		return async ({ update }) => {
			await update({ reset: false });
			busy = false;
		};
	};
</script>

<PageHeader
	title="Series"
	subtitle="Eventos que se repiten: cada serie es una etiqueta hija de «evento recurrente»."
	back={{ href: '/admin/eventos', label: 'Eventos' }}
>
	<svelte:fragment slot="actions">
		<CsvButton href="/admin/eventos/series/ediciones.csv" label="CSV de ediciones" />
		<a class="kv-btn ghost" href="/admin/etiquetas"><Tags {...icon} /> Etiquetas</a>
		{#if data.canCreate}
			<button
				type="button"
				class="kv-btn"
				aria-expanded={creating}
				aria-controls="crear-serie"
				on:click={() => (creating = !creating)}><Plus {...icon} /> Crear serie</button
			>
		{/if}
	</svelte:fragment>
</PageHeader>

{#if done}
	<p class="kv-flash" role="status">
		Listo: se {done.verb} la serie «{done.name}»{#if done.renamedFrom}
			(antes «{done.renamedFrom}»){/if}.
		{#if done.db}
			Ya está en la base: en menos de un minuto se ve en el sitio.
			{#if done.posts}
				El commit que cambia {done.posts} publicaci{done.posts === 1 ? 'ón' : 'ones'} se ve cuando termine
				de publicarse el sitio.
				{#if done.publish}<PublishStatus pr={done.publish} />{:else if done.commit}<a
						href={done.commit}
						target="_blank"
						rel="noreferrer">Ver el commit</a
					>{/if}
			{/if}
		{:else}
			Se ve cuando termine de publicarse el sitio.
			{#if done.publish}<PublishStatus pr={done.publish} />{:else if done.commit}<a
					href={done.commit}
					target="_blank"
					rel="noreferrer">Ver el commit</a
				>{/if}
		{/if}
		{#if done.verb === 'creó'}Ponele la etiqueta a sus eventos.{/if}
	</p>
{/if}

{#if data.canCreate && creating}
	<Card>
		<form id="crear-serie" class="kv-form" method="POST" action="?/crear" use:enhance={submit}>
			<h2 class="form-title">Crear serie</h2>
			<p class="muted small">
				Una serie es una etiqueta hija de «evento recurrente»: después, ponésela a cada edición.
			</p>
			<SeriesFields
				mode="create"
				id="crear"
				values={form?.editing ? {} : (form?.values ?? {})}
				assets={data.assets}
			/>
			{#if form?.error && !form?.editing}<p class="kv-flash bad" role="alert">{form.error}</p>{/if}
			<div class="kv-row">
				<button class="kv-btn" type="submit" disabled={busy}
					>{busy ? 'Guardando…' : 'Crear serie'}</button
				>
				<button type="button" class="kv-btn ghost" on:click={() => (creating = false)}
					>Cancelar</button
				>
			</div>
		</form>
	</Card>
{/if}

{#if data.series.length === 0}
	<Card>
		<EmptyState
			icon={Repeat}
			title="Todavía no hay series"
			text="Creá una etiqueta hija de «evento recurrente» en Etiquetas y ponésela a los eventos."
		/>
	</Card>
{:else}
	<div class="list">
		{#each data.series as s (s.id)}
			<Card>
				<div class="head">
					{#if s.image}<img src={s.image} alt="" width="96" height="96" />{/if}
					<div class="info">
						<h2>
							{s.icon}
							<a href={s.href} target="_blank" rel="noopener">{s.name}</a>
						</h2>
						<p class="muted small">
							{s.total}
							{s.total === 1 ? 'edición' : 'ediciones'} · {s.upcoming}
							{s.upcoming === 1 ? 'próxima' : 'próximas'}
						</p>
						<p class="small">
							{#if s.next}
								Próxima: <a href={eventPanelLink(s.next.slug)}>#{s.next.number} {s.next.title}</a>
								· {editionDateLabel(s.next.start)}
							{:else if s.last}
								Sin próxima anunciada. Última: #{s.last.number} · {editionDateLabel(s.last.start)}
							{/if}
						</p>
						<p class="small">
							<Badge tone={s.subscribers.confirmed ? 'info' : 'neutral'}
								>{s.subscribers.confirmed} con aviso</Badge
							>
							{#if s.subscribers.pending}<Badge tone="neutral"
									>{s.subscribers.pending} sin confirmar</Badge
								>{/if}
						</p>
					</div>
					<div class="kv-row">
						{#if data.canCreate}
							<button
								type="button"
								class="kv-btn ghost small"
								aria-expanded={editing === s.id}
								on:click={() => (editing = editing === s.id ? '' : s.id)}
								><Pencil size={16} aria-hidden="true" /> Editar</button
							>
						{/if}
						<CsvButton
							href="/admin/eventos/series/ediciones.csv?serie={encodeURIComponent(s.id)}"
							label="CSV"
						/>
					</div>
				</div>
				{#if s.description && editing !== s.id}<p class="small description">{s.description}</p>{/if}
				{#if data.canCreate && editing === s.id}
					<form class="kv-form edit" method="POST" action="?/editar" use:enhance={submit}>
						<input type="hidden" name="id" value={s.id} />
						{#key form}
							<SeriesFields
								mode="edit"
								id="editar-{s.edit.id}"
								values={form?.editing === s.id && form?.values
									? { ...s.edit, ...form.values }
									: s.edit}
								dbMode={data.dbMode}
								assets={data.assets}
							/>
						{/key}
						{#if form?.editing === s.id && form?.error}<p class="kv-flash bad" role="alert">
								{form.error}
							</p>{/if}
						{#if confirmFor(s.id)}
							{@const confirm = confirmFor(s.id)}
							<div class="kv-flash" role="status">
								<p>
									Vas a renombrar «{confirm.from}» a «{confirm.to}».
									{#if confirm.db && confirm.keepAlias === '1'}
										No cambia ninguna publicación: «{confirm.from}» queda como alias.
									{:else if confirm.posts}
										Cambia{confirm.posts === 1 ? '' : 'n'}
										<strong>{confirm.posts} publicaci{confirm.posts === 1 ? 'ón' : 'ones'}</strong>,
										con un commit{#if confirm.db}, y «{confirm.from}» deja de existir{/if}.
									{:else}
										Ninguna publicación usa «{confirm.from}»: no hace falta cambiar ninguna.
									{/if}
								</p>
								<p>Si está bien, confirmá. Si cambiás algo, se vuelve a contar.</p>
							</div>
							<input type="hidden" name="confirmTo" value={confirm.to} />
							<input type="hidden" name="confirmAlias" value={confirm.keepAlias} />
						{/if}
						<div class="kv-row">
							<button class="kv-btn" type="submit" disabled={busy}
								>{busy
									? 'Guardando…'
									: confirmFor(s.id)
										? 'Confirmar y guardar'
										: 'Guardar'}</button
							>
							<button type="button" class="kv-btn ghost" on:click={() => (editing = '')}
								>Cancelar</button
							>
						</div>
					</form>
				{/if}
				{#if s.editions.length}
					<details>
						<summary>Ver las {s.editions.length} ediciones</summary>
						<div class="kv-table-wrap">
							<table class="kv-table">
								<thead>
									<tr>
										<th>#</th>
										<th>Edición</th>
										<th>Fecha</th>
										<th class="hide-sm">Estado</th>
									</tr>
								</thead>
								<tbody>
									{#each s.editions as e (e.slug)}
										<tr>
											<td class="small">{e.number}</td>
											<td><a href={eventPanelLink(e.slug)}>{e.title}</a></td>
											<td class="small nowrap">{editionDateLabel(e.start)}</td>
											<td class="hide-sm small">
												{#if e.upcoming}<Badge tone="ok">próxima</Badge>{/if}
												{#if e.status === 'cancelado'}<Badge tone="bad">cancelada</Badge>{/if}
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</details>
				{/if}
			</Card>
		{/each}
	</div>
	<p class="kv-note">
		Los mails de quienes pidieron aviso no se muestran en ningún lado: solo cuántas personas son.
	</p>
{/if}

<style>
	.description {
		margin: 0.5rem 0 0;
		white-space: pre-line;
	}
	.edit {
		margin-top: 0.75rem;
	}
	.list {
		display: grid;
		gap: 1rem;
	}
	.head {
		display: flex;
		gap: 1rem;
		align-items: flex-start;
		flex-wrap: wrap;
	}
	.head img {
		width: 96px;
		height: 96px;
		object-fit: cover;
		border-radius: 0.8rem;
		flex: none;
	}
	.info {
		flex: 1 1 14rem;
		min-width: 0;
		display: grid;
		gap: 0.3rem;
	}
	h2 {
		margin: 0;
		font-size: 1.2rem;
	}
	.form-title {
		margin-bottom: 0.3rem;
	}
	p {
		margin: 0;
	}
	.small {
		font-size: 0.9rem;
	}
	.muted {
		color: var(--muted);
	}
	.nowrap {
		white-space: nowrap;
	}
	details {
		margin-top: 0.8rem;
	}
	summary {
		cursor: pointer;
		font-weight: 600;
		min-height: 2.5rem;
		display: flex;
		align-items: center;
	}
	@media (max-width: 640px) {
		.hide-sm {
			display: none;
		}
	}
</style>
