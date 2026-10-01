<script>
	/**
	 * Eventos → Lugares: los perfiles de tipo lugar y el "sucede en" de cada evento, con la
	 * privacidad de la dirección (la del lugar o la del evento).
	 */
	import '$lib/admin/panel-forms.scss';
	import { enhance } from '$app/forms';
	import { MapPin } from '@lucide/svelte';
	import { fmtDateTime } from '$lib/admin/format.js';
	import { VISIBILITY_LABELS } from '$lib/admin/cuentas.js';
	import { DEFAULT_VENUE_PRIVACY } from '$lib/utils/venues.js';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import EmptyState from '$lib/components/admin/panel/EmptyState.svelte';
	import CsvButton from '$lib/components/admin/panel/CsvButton.svelte';

	export let data;
	export let form;

	/** @type {Map<string, { slug: string, title: string, start: string, mdAddress: boolean }>} */
	$: eventsBySlug = new Map(data.events.map((e) => [e.slug, e]));
	/** @param {string | null} p */
	const privacyText = (p) => (p ? (labels[p] ?? p) : 'la del lugar');
	/** @type {Record<string, string>} */
	$: labels = data.privacyLabels;
	let newName = '';
</script>

<PageHeader
	title="Lugares"
	subtitle="Dónde suceden los eventos: dirección, mapa, accesibilidad, cómo llegar y qué se muestra de la dirección."
>
	<svelte:fragment slot="actions">
		<a class="kv-btn ghost" href="/admin/amigues?tipo=lugar">Ver en Amigues</a>
	</svelte:fragment>
</PageHeader>

<div class="kv-stack">
	{#if !data.flagOn}
		<p class="kv-flash warn">
			El interruptor «Perfiles públicos» está apagado: los eventos siguen mostrando (y mandando a
			quienes compran) lo que dice su archivo. Podés dejar todo listo acá antes de prenderlo.
		</p>
	{/if}
	{#if form?.link}
		<p class="kv-flash" class:bad={!form.link.ok} role="status">{form.link.message}</p>
	{/if}
	{#if form?.perfil && !form.perfil.ok}
		<p class="kv-flash bad" role="alert">{form.perfil.message}</p>
	{/if}

	<Card title="Lugares" icon={MapPin}>
		<svelte:fragment slot="actions">
			<CsvButton
				rows={data.venues}
				filename="lugares.csv"
				columns={[
					{ label: 'Lugar', key: 'title' },
					{ label: 'Dirección', key: 'slug' },
					{ label: 'Barrio', key: 'area' },
					{ label: 'Ciudad', key: 'city' },
					{ label: 'Privacidad', value: (v) => privacyText(v.privacy) },
					{ label: 'Eventos', key: 'events' }
				]}
			/>
		</svelte:fragment>
		{#if data.venues.length === 0}
			<EmptyState icon={MapPin} title="Todavía no hay lugares" />
		{:else}
			<div class="kv-table-wrap">
				<table class="kv-table">
					<thead>
						<tr>
							<th>Lugar</th>
							<th>Dirección por defecto</th>
							<th class="hide-sm">Eventos</th>
						</tr>
					</thead>
					<tbody>
						{#each data.venues as v (v.id)}
							<tr>
								<td>
									<a href="/admin/amigues/{v.slug}"><strong>{v.title}</strong></a>
									<small class="muted block"
										>{[v.area, v.city].filter(Boolean).join(', ') || 'sin barrio'}{v.hasMap
											? ' · con mapa'
											: ''}</small
									>
									{#if v.visibility !== 'public'}<Badge tone="info"
											>{VISIBILITY_LABELS[v.visibility] ?? v.visibility}</Badge
										>{/if}
								</td>
								<td class="small">{privacyText(v.privacy ?? DEFAULT_VENUE_PRIVACY)}</td>
								<td class="hide-sm small">{v.events}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
		<form method="POST" action="?/crearPerfil" use:enhance class="new kv-row">
			<input type="hidden" name="kind" value="lugar" />
			<input type="hidden" name="visibility" value="public" />
			<input type="hidden" name="version" value="0" />
			<label class="kv-field grow">
				<span>Lugar nuevo</span>
				<input
					name="title"
					bind:value={newName}
					placeholder="Nombre del lugar"
					required
					maxlength="200"
				/>
			</label>
			<button class="kv-btn" type="submit" disabled={!newName.trim()}>Crear y completar</button>
		</form>
		<p class="kv-note">
			Se crea con la dirección "solo el nombre" y después completás el resto en su página.
		</p>
	</Card>

	<Card title="Dónde sucede cada evento">
		<svelte:fragment slot="actions">
			<CsvButton
				rows={data.links}
				filename="eventos-lugares.csv"
				columns={[
					{ label: 'Evento', key: 'eventSlug' },
					{ label: 'Lugar', key: 'venueTitle' },
					{ label: 'Dirección', value: (l) => privacyText(l.privacy) },
					{ label: 'Cambió', key: 'updatedBy' }
				]}
			/>
		</svelte:fragment>
		<p class="kv-note">
			Cada evento puede mostrar la dirección más o menos que su lugar. Quien compra entrada la
			recibe completa en el mail y en su entrada. La página del lugar lista solo los eventos que
			muestran el nombre del lugar.
		</p>
		{#if data.links.length}
			<div class="kv-table-wrap">
				<table class="kv-table">
					<thead>
						<tr>
							<th>Evento</th>
							<th>Lugar</th>
							<th>Dirección</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						{#each data.links as l (l.eventSlug)}
							{@const ev = eventsBySlug.get(l.eventSlug)}
							<tr>
								<td>
									<a href="/calendario/{l.eventSlug}">{ev?.title ?? l.eventSlug}</a>
									{#if !ev}<Badge tone="bad">el evento ya no existe</Badge>{/if}
									{#if ev?.mdAddress && l.privacy !== 'public'}
										<small class="warn block"
											>Su archivo tiene la dirección escrita (el repo es público): sacala del
											evento.</small
										>
									{/if}
								</td>
								<td>
									{l.venueTitle}
									{#if l.venueDeleted}<Badge tone="bad">borrado</Badge>{/if}
								</td>
								<td class="small">{privacyText(l.privacy)}</td>
								<td>
									<form method="POST" action="?/desvincular" use:enhance>
										<input type="hidden" name="evento" value={l.eventSlug} />
										<button class="kv-btn ghost small" type="submit">Sacar</button>
									</form>
									<small class="muted block">@{l.updatedBy}, {fmtDateTime(l.updatedAt)}</small>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
		{#if data.venues.length}
			<form method="POST" action="?/vincular" use:enhance class="link-form">
				<label class="kv-field grow">
					<span>Evento</span>
					<select name="evento" required>
						<option value="">Elegí un evento</option>
						{#each data.events as e (e.slug)}
							<option value={e.slug}>{e.title} ({e.start.slice(0, 10) || 'sin fecha'})</option>
						{/each}
					</select>
				</label>
				<label class="kv-field">
					<span>Sucede en</span>
					<select name="lugar" required>
						{#each data.venues as v (v.id)}
							<option value={v.id}>{v.title}</option>
						{/each}
					</select>
				</label>
				<label class="kv-field">
					<span>Dirección en este evento</span>
					<select name="privacidad">
						<option value="">La del lugar</option>
						{#each Object.entries(data.privacyLabels) as [value, label] (value)}
							<option {value}>{label}</option>
						{/each}
					</select>
				</label>
				<button class="kv-btn" type="submit">Guardar</button>
			</form>
		{/if}
	</Card>
</div>

<style>
	.muted {
		color: var(--muted);
	}
	.warn {
		color: var(--warn);
	}
	.block {
		display: block;
	}
	.small {
		font-size: 0.88rem;
	}
	.grow {
		flex: 1 1 16rem;
	}
	.new {
		margin-top: 1rem;
		align-items: flex-end;
	}
	.link-form {
		display: flex;
		flex-wrap: wrap;
		gap: 0.8rem;
		align-items: flex-end;
		margin-top: 1rem;
	}
	@media (max-width: 700px) {
		.hide-sm {
			display: none;
		}
	}
</style>
