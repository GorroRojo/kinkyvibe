<script>
	/**
	 * Lugares → «Importar de eventos»: vista previa de los lugares que salen del «Dónde» de los
	 * eventos. Nada se guarda hasta confirmar «Crear lugares».
	 */
	import '$lib/admin/panel-forms.scss';
	import { deserialize, enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { MapPin } from '@lucide/svelte';
	import { VENUE_PRIVACY_LABELS } from '$lib/utils/venues.js';
	import {
		DEFAULT_VENUE_LISTING,
		VENUE_LISTING_LABELS,
		importLinks,
		newVenueFor,
		refitEvents,
		venueListing
	} from '$lib/utils/venueImport.js';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import EmptyState from '$lib/components/admin/panel/EmptyState.svelte';
	import CsvButton from '$lib/components/admin/panel/CsvButton.svelte';

	export let data;

	/** @typedef {import('$lib/utils/venueImport.js').VenueCandidate} VenueCandidate */
	/** @typedef {import('$lib/utils/venueImport.js').VenueListing} VenueListing */
	/**
	 * `listing`: lo elegido para ese lugar ('' = como todos).
	 * @typedef {{ create: boolean, title: string, location: string, events: Record<string, boolean>, listing: VenueListing | '' }} Choice
	 */

	/** Cómo se crean los lugares nuevos (decisión de gorrite: no listados por defecto). */
	/** @type {VenueListing} */
	let listingAll = DEFAULT_VENUE_LISTING;
	/** @type {VenueListing[]} */
	const LISTINGS = ['unlisted', 'listed'];

	/** @param {VenueCandidate[]} candidates @returns {Record<string, Choice>} */
	const initialChoices = (candidates) =>
		Object.fromEntries(
			candidates.map((c) => [
				c.key,
				{
					create: c.suggested,
					title: c.title,
					location: c.address || c.area,
					events: Object.fromEntries(c.events.map((e) => [e.slug, e.fits])),
					listing: /** @type {VenueListing | ''} */ ('')
				}
			])
		);

	/** @type {Record<string, Choice>} */
	let choices = initialChoices(data.candidates);
	/**
	 * Después de guardar, la lista cambia: lo nuevo arranca con lo propuesto y lo que ya estaba
	 * queda como lo dejaste.
	 * @param {VenueCandidate[]} candidates
	 */
	function syncChoices(candidates) {
		const fresh = initialChoices(candidates);
		for (const key of Object.keys(fresh)) if (choices[key]) fresh[key] = choices[key];
		choices = fresh;
	}
	$: syncChoices(data.candidates);

	/**
	 * Los eventos del candidato con lo que mostrarían (otra vez si se cambió el nombre o el «Dónde»
	 * de un lugar nuevo).
	 * @param {VenueCandidate} c
	 * @param {Choice} choice
	 */
	const eventsOf = (c, choice) =>
		c.existing
			? c.events
			: refitEvents(c, newVenueFor(c, { title: choice.title, location: choice.location }));

	$: views = data.candidates.map((c) => {
		const choice = choices[c.key];
		const events = eventsOf(c, choice);
		const chosen = events.filter((e) => choice.events[e.slug]).map((e) => e.slug);
		const { venuePrivacy, links } = importLinks({ ...c, events }, chosen);
		const listing = venueListing(listingAll, choice.listing);
		return { c, events, chosen, venuePrivacy, links, listing };
	});
	$: selected = views.filter((v) => choices[v.c.key].create && v.chosen.length);
	$: toCreate = selected.filter((v) => !v.c.existing).length;
	$: toCreateListed = selected.filter((v) => !v.c.existing && v.listing === 'listed').length;
	$: toLink = selected.reduce((n, v) => n + v.chosen.length, 0);

	let confirming = false;
	let busy = false;
	/** @typedef {{ created: number, linked: number, remaining: number, problems: { key: string, title: string, message: string }[] }} Progress */
	/** @type {Progress | null} */
	let progress = null;
	/** @type {string | null} */
	let failure = null;

	/**
	 * Manda el formulario de a tandas hasta que no quede nada (o una tanda no pueda hacer nada).
	 * @type {import('@sveltejs/kit').SubmitFunction}
	 */
	const runAll = ({ cancel, action, formData }) => {
		cancel();
		busy = true;
		failure = null;
		progress = { created: 0, linked: 0, remaining: selected.length, problems: [] };
		(async () => {
			try {
				for (;;) {
					const res = await fetch(action, {
						method: 'POST',
						body: formData,
						headers: { 'x-sveltekit-action': 'true' }
					});
					const result = deserialize(await res.text());
					const out = result.type === 'success' ? /** @type {any} */ (result.data) : null;
					if (!out?.importResult) {
						failure =
							result.type === 'failure' && /** @type {any} */ (result.data)?.error
								? /** @type {any} */ (result.data).error
								: 'No se pudo guardar. Probá de nuevo en un rato.';
						break;
					}
					const r = out.importResult;
					/** @type {Progress} */
					const p = progress ?? { created: 0, linked: 0, remaining: 0, problems: [] };
					progress = {
						created: p.created + r.created,
						linked: p.linked + r.linked,
						remaining: r.remaining,
						problems: [...p.problems, ...r.problems]
					};
					if (!r.remaining || r.created + r.linked === 0) break;
				}
			} catch {
				failure = 'Se cortó la conexión. Lo creado quedó guardado: podés seguir.';
			} finally {
				busy = false;
				confirming = false;
				await invalidateAll();
			}
		})();
	};

	/** @param {string} s */
	const day = (s) => (s ? s.slice(0, 10) : 'sin fecha');
	/** @param {VenueCandidate} c */
	const range = (c) => (c.first === c.last ? day(c.first) : `${day(c.first)} a ${day(c.last)}`);
	/** @param {number} n @param {string} one @param {string} many */
	const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

	/** @type {import('$lib/admin/csv.js').CsvColumn<VenueCandidate>[]} */
	const CSV_COLUMNS = [
		{ label: 'Lugar', key: 'title' },
		{ label: 'Ya existe', value: (c) => (c.existing ? c.existing.title : '') },
		{ label: 'Dirección', key: 'address' },
		{ label: 'Barrio', key: 'area' },
		{ label: 'Link al mapa', key: 'mapUrl' },
		{ label: 'Eventos', value: (c) => c.events.length },
		{ label: 'Desde', value: (c) => day(c.first) },
		{ label: 'Hasta', value: (c) => day(c.last) },
		{ label: 'Qué se muestra (propuesto)', value: (c) => VENUE_PRIVACY_LABELS[c.level] },
		{ label: 'Nombres', value: (c) => c.names.map((v) => `${v.text} (${v.count})`).join('; ') },
		{
			label: 'Dónde (como lo escribieron)',
			value: (c) => c.locations.map((v) => `${v.text} (${v.count})`).join('; ')
		},
		{ label: 'Juntados', value: (c) => c.merges.join(' ') },
		{ label: 'Eventos (direcciones)', value: (c) => c.events.map((e) => e.slug).join(' ') },
		{
			label: 'Eventos que cambiarían',
			value: (c) =>
				c.events
					.filter((e) => !e.fits)
					.map((e) => `${e.slug}: ${e.diffs.join('; ')}`)
					.join(' | ')
		}
	];
</script>

<PageHeader
	title="Importar de eventos"
	subtitle="Lugares armados con el «Dónde» que ya tienen los eventos. Nada se guarda hasta que confirmes."
	back={{ href: '/admin/eventos/lugares', label: 'Lugares' }}
/>

<div class="kv-stack">
	<p class="kv-note">
		Leímos {plural(data.total, 'evento', 'eventos')}
		({data.fromDb ? 'de la base' : 'de los archivos .md'}). Salteamos {plural(
			data.skipped.online,
			'online',
			'online'
		)}, {plural(data.skipped.empty, 'sin «Dónde»', 'sin «Dónde»')} y {plural(
			data.skipped.linked,
			'que ya tiene lugar',
			'que ya tienen lugar'
		)}.
	</p>
	<p class="kv-note">
		<strong>Privacidad:</strong> lo que ya está en los eventos es público, así que cada evento queda
		mostrando lo mismo que ahora: con nombre y dirección, «{VENUE_PRIVACY_LABELS.public}»; solo el
		nombre, «{VENUE_PRIVACY_LABELS.name}»; solo una dirección con número, «{VENUE_PRIVACY_LABELS.address}»;
		solo un barrio, «{VENUE_PRIVACY_LABELS.area}». Los eventos que con el lugar mostrarían otra cosa
		(otro nombre, otra forma de escribir la dirección) quedan sin marcar y te decimos qué cambiaría.
	</p>
	{#if !data.flagOn}
		<p class="kv-flash warn">
			El interruptor «Perfiles públicos» está apagado: los lugares y los vínculos quedan listos,
			pero el sitio sigue mostrando lo que dice cada evento.
		</p>
	{/if}
	{#if failure}
		<p class="kv-flash bad" role="alert">{failure}</p>
	{/if}
	{#if progress}
		<p class="kv-flash" role="status">
			{busy ? 'Guardando…' : 'Listo:'}
			{plural(progress.created, 'lugar creado', 'lugares creados')} y {plural(
				progress.linked,
				'evento vinculado',
				'eventos vinculados'
			)}{busy && progress.remaining ? ` (faltan ${progress.remaining})` : ''}.
		</p>
		{#if progress.problems.length}
			<ul class="problems">
				{#each progress.problems as p (p.key)}
					<li>{p.title}: {p.message}</li>
				{/each}
			</ul>
		{/if}
	{/if}

	<Card title="Candidatos" icon={MapPin}>
		<svelte:fragment slot="actions">
			<CsvButton
				rows={data.candidates}
				filename="lugares-desde-eventos.csv"
				columns={CSV_COLUMNS}
			/>
		</svelte:fragment>
		{#if !data.candidates.length}
			<EmptyState icon={MapPin} title="No hay lugares para armar" />
		{:else}
			<form method="POST" action="?/crear" use:enhance={runAll}>
				<fieldset class="listing">
					<legend>Cómo se crean</legend>
					{#each LISTINGS as l (l)}
						<label class="pick">
							<input type="radio" name="listado" value={l} bind:group={listingAll} />
							{VENUE_LISTING_LABELS[l].all}
						</label>
					{/each}
					<p class="small muted block">
						Es si el perfil del lugar aparece en Amigues. Los eventos muestran lo mismo de cualquier
						forma (según la privacidad de cada uno) y la página del lugar anda por su link. Podés
						cambiarlo en cada lugar.
					</p>
				</fieldset>
				<ul class="candidates">
					{#each views as v (v.c.key)}
						{@const c = v.c}
						<li class="candidate" class:off={!choices[c.key].create}>
							<div class="head">
								<label class="pick">
									<input
										type="checkbox"
										name="crear"
										value={c.key}
										bind:checked={choices[c.key].create}
										aria-label={c.existing
											? `Vincular eventos a «${c.existing.title}»`
											: `Crear «${choices[c.key].title}»`}
									/>
									{#if c.existing}
										<span>
											Ya existe: <a href="/admin/comunidad/perfiles/{c.existing.slug}"
												><strong>{c.existing.title}</strong></a
											>
											<Badge tone="info">vincular sus eventos</Badge>
										</span>
									{/if}
								</label>
								{#if !c.existing}
									<label class="kv-field grow">
										<span>Nombre del lugar</span>
										<input
											name="titulo:{c.key}"
											bind:value={choices[c.key].title}
											maxlength="200"
											list="nombres-{c.key}"
											required={choices[c.key].create}
										/>
										<datalist id="nombres-{c.key}">
											{#each c.names as n (n.text)}<option value={n.text}></option>{/each}
										</datalist>
									</label>
									{#if c.locations.length > 1}
										<label class="kv-field grow">
											<span>Dirección</span>
											<select name="donde:{c.key}" bind:value={choices[c.key].location}>
												{#each c.locations as l (l.text)}
													<option value={l.text}>{l.text} ({l.count})</option>
												{/each}
											</select>
										</label>
									{:else}
										<input type="hidden" name="donde:{c.key}" value={choices[c.key].location} />
									{/if}
									<label class="kv-field">
										<span>En Amigues</span>
										<select name="listado:{c.key}" bind:value={choices[c.key].listing}>
											<option value="">Como todos ({VENUE_LISTING_LABELS[listingAll].one})</option>
											{#each LISTINGS as l (l)}
												<option value={l}>{VENUE_LISTING_LABELS[l].one}</option>
											{/each}
										</select>
									</label>
								{/if}
							</div>
							<p class="small muted">
								{#if !c.existing}
									{c.address || c.area || 'sin dirección'}{c.mapUrl ? ' · con link al mapa' : ''} ·
								{/if}
								{plural(c.events.length, 'evento', 'eventos')} ({range(c)}) ·
								{#if c.existing}
									cada evento queda mostrando lo que mostraba
								{:else}
									se muestra: {VENUE_PRIVACY_LABELS[v.venuePrivacy]} ·
									{v.listing === 'listed' ? 'aparece en Amigues' : 'no aparece en Amigues'}
								{/if}
								{#if !c.hasName}<Badge tone="warn">sin nombre: escribí uno</Badge>{/if}
							</p>
							{#if c.mapUrl}
								<p class="small">
									<a href={c.mapUrl} target="_blank" rel="noopener noreferrer"
										>Ver el link al mapa</a
									>
								</p>
							{/if}
							{#each c.merges as m (m)}
								<p class="small warn">{m}</p>
							{/each}
							<details>
								<summary class="small"
									>{plural(v.chosen.length, 'evento marcado', 'eventos marcados')} de {c.events
										.length}</summary
								>
								<ul class="events">
									{#each v.events as e (e.slug)}
										{@const link = v.links.find((l) => l.slug === e.slug)}
										<li>
											<label>
												<input
													type="checkbox"
													name="evento:{c.key}"
													value={e.slug}
													bind:checked={choices[c.key].events[e.slug]}
												/>
												<a href="/calendario/{e.slug}" target="_blank" rel="noopener">{e.title}</a>
												<small class="muted">({day(e.start)})</small>
											</label>
											<small class="muted block"
												>{[e.name, e.location].filter(Boolean).join(' · ')} → {VENUE_PRIVACY_LABELS[
													e.level
												]}{link?.privacy ? ' (propio del evento)' : ''}</small
											>
											{#each e.diffs as d (d)}
												<small class="warn block">Cambiaría: {d}</small>
											{/each}
										</li>
									{/each}
								</ul>
							</details>
						</li>
					{/each}
				</ul>

				{#if confirming}
					<div class="confirm kv-flash warn" role="alert">
						<p>
							Vas a crear {plural(toCreate, 'lugar', 'lugares')} y vincular {plural(
								toLink,
								'evento',
								'eventos'
							)}.{#if toCreate}
								Lugares nuevos: {plural(toCreate - toCreateListed, 'no listado', 'no listados')} (no aparecen
								en Amigues) y {plural(toCreateListed, 'público', 'públicos')}; todos nacen
								aprobados.{/if} Los eventos no se tocan: el vínculo se guarda aparte y se puede sacar
							en Lugares.
						</p>
						<div class="kv-row">
							<button class="kv-btn" type="submit" disabled={busy}
								>{busy ? 'Guardando…' : 'Crear lugares'}</button
							>
							<button
								class="kv-btn ghost"
								type="button"
								disabled={busy}
								on:click={() => (confirming = false)}>Cancelar</button
							>
						</div>
					</div>
				{:else}
					<div class="kv-row actions">
						<button
							class="kv-btn"
							type="button"
							disabled={busy || !selected.length}
							on:click={() => (confirming = true)}>Crear lugares…</button
						>
						<span class="small muted"
							>{plural(toCreate, 'lugar nuevo', 'lugares nuevos')}, {plural(
								toLink,
								'evento',
								'eventos'
							)} para vincular</span
						>
					</div>
				{/if}
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
		flex: 1 1 14rem;
	}
	.candidates,
	.events,
	.problems {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.candidate {
		border-top: 1px solid var(--line, rgba(127, 127, 127, 0.25));
		padding: 0.8rem 0;
	}
	.candidate.off {
		opacity: 0.7;
	}
	.candidate p {
		margin: 0.3rem 0;
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		gap: 0.8rem;
		align-items: flex-end;
	}
	.pick {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		min-height: 2.4rem;
	}
	.events li {
		padding: 0.35rem 0;
	}
	.listing {
		display: flex;
		flex-wrap: wrap;
		gap: 0 1.2rem;
		align-items: center;
		border: 0;
		padding: 0;
		margin: 0 0 0.6rem;
	}
	.listing legend {
		font-weight: 600;
		padding: 0;
		margin-bottom: 0.2rem;
	}
	.actions,
	.confirm {
		margin-top: 1rem;
	}
	.actions {
		align-items: center;
	}
</style>
