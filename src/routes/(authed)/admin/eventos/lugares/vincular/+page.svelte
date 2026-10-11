<script>
	/**
	 * Lugares → «Vincular lugares»: para cada «Dónde» escrito a mano en los eventos sin lugar, el
	 * perfil de lugar que probablemente es (con el puntaje y por qué). Le admin elige y vincula de a
	 * uno o todos los marcados; también puede buscar otro lugar, crear uno nuevo o dejarlo como
	 * texto. Nada se guarda hasta «Vincular».
	 */
	import '$lib/admin/panel-forms.scss';
	import { deserialize, enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { Link2, MapPin, MessageSquareText, Plus, Search } from '@lucide/svelte';
	import { VENUE_PRIVACY_LABELS } from '$lib/utils/venues.js';
	import { eventFit, eventShowLevel } from '$lib/utils/venueImport.js';
	import { linkPrivacy, searchVenues } from '$lib/utils/venueMatch.js';
	import { argDateList } from '$lib/utils/dates.js';
	import {
		Badge,
		Button,
		Card,
		EmptyState,
		Notice,
		PageHeader,
		askConfirm
	} from '$lib/components/ui';

	export let data;
	export let form;

	/** @typedef {import('$lib/server/amigues/venueLinking.js').LinkGroup} LinkGroup */
	/** @typedef {import('$lib/server/amigues/venueLinking.js').LinkVenue} LinkVenue */
	/** @typedef {import('$lib/server/amigues/venueLinking.js').LinkResult} LinkResult */
	/**
	 * Lo elegido en cada grupo: el lugar (id, o 0 sin elegir), si va en «todas las marcadas», los
	 * lugares que se agregaron buscando y lo que se está buscando.
	 * @typedef {{ venue: number, marked: boolean, picked: number[], query: string, searching: boolean }} Choice
	 */

	/** @type {Map<number, LinkVenue>} */
	$: venuesById = new Map(data.venues.map((v) => [v.id, v]));

	/** @param {LinkGroup[]} groups @returns {Record<string, Choice>} */
	const initialChoices = (groups) =>
		Object.fromEntries(
			groups.map((g) => [
				g.key,
				{
					venue: g.suggestions[0]?.id ?? 0,
					marked: g.marked,
					picked: [],
					query: '',
					searching: false
				}
			])
		);

	/** @type {Record<string, Choice>} */
	let choices = initialChoices(data.groups);
	/**
	 * Después de guardar, la lista cambia: lo nuevo arranca con lo propuesto y lo que ya estaba
	 * queda como lo dejaste.
	 * @param {LinkGroup[]} groups
	 */
	function syncChoices(groups) {
		const fresh = initialChoices(groups);
		for (const key of Object.keys(fresh)) if (choices[key]) fresh[key] = choices[key];
		choices = fresh;
	}
	$: syncChoices(data.groups);

	/**
	 * Qué cambiaría en los eventos del grupo con ese lugar (con el nivel que se va a guardar).
	 * @param {LinkGroup} g
	 * @param {LinkVenue | undefined} venue
	 */
	function changes(g, venue) {
		if (!venue) return [];
		return g.events
			.map((e) => {
				const level = linkPrivacy(eventShowLevel(e), venue.privacy) ?? venue.privacy;
				return { e, level, diffs: eventFit(e, venue, level).diffs };
			})
			.filter((x) => x.diffs.length);
	}

	$: views = data.groups.map((g) => {
		const choice = choices[g.key];
		const venue = venuesById.get(choice.venue);
		const suggested = new Set(g.suggestions.map((s) => s.id));
		return {
			g,
			venue,
			changed: changes(g, venue),
			picked: choice.picked.filter((id) => !suggested.has(id)).map((id) => venuesById.get(id)),
			found: choice.searching ? searchVenues(data.venues, choice.query) : []
		};
	});
	$: selected = views.filter((v) => choices[v.g.key].marked && v.venue);
	$: selectedEvents = selected.reduce((n, v) => n + v.g.events.length, 0);

	/** @type {Record<string, LinkResult>} */
	let results = {};
	/** @type {{ title: string, venue: string }[]} lo vinculado en esta visita, para el resumen */
	let done = [];
	let busy = false;
	/** @type {string | null} */
	let failure = null;

	/**
	 * «Vincular» (un grupo) y «Vincular todas las marcadas»: manda de a tandas hasta que no quede
	 * nada. «Dejar como texto» y «Volver a sugerir» van como un formulario común.
	 * @type {import('@sveltejs/kit').SubmitFunction}
	 */
	const submit = async ({ cancel, action, formData, submitter }) => {
		if (!action.search.includes('vincular')) {
			return async ({ update }) => {
				await update({ reset: false });
			};
		}
		cancel();
		const solo = submitter?.getAttribute('value') && submitter.getAttribute('name') === 'solo';
		if (!solo) {
			const ok = await askConfirm({
				title: `¿Vincular ${plural(selected.length, 'lugar', 'lugares')}?`,
				text: `Se vinculan ${plural(selectedEvents, 'evento', 'eventos')} a los lugares marcados. El «Dónde» que escribieron queda como está (se ve si se saca el lugar). Cada vínculo se puede sacar en Lugares.`,
				confirmLabel: 'Vincular'
			});
			if (!ok) return;
		}
		const titles = new Map(data.groups.map((g) => [g.key, g.title]));
		busy = true;
		failure = null;
		let body = formData;
		try {
			for (;;) {
				const res = await fetch(action, {
					method: 'POST',
					body,
					headers: { 'x-sveltekit-action': 'true' }
				});
				const result = deserialize(await res.text());
				const out = result.type === 'success' ? /** @type {any} */ (result.data) : null;
				if (!out?.linkResult) {
					failure =
						result.type === 'failure' && /** @type {any} */ (result.data)?.error
							? /** @type {any} */ (result.data).error
							: 'No se pudo guardar. Probá de nuevo en un rato.';
					break;
				}
				/** @type {{ results: LinkResult[], remaining: string[] }} */
				const r = out.linkResult;
				for (const x of r.results) {
					results[x.key] = x;
					if (x.linked.length) {
						done = [...done, { title: titles.get(x.key) ?? '', venue: x.title }];
					}
				}
				results = results;
				if (!r.remaining.length || !r.results.length) break;
				body = new FormData();
				for (const [k, v] of formData) if (k !== 'solo' && k !== 'marcar') body.append(k, v);
				for (const k of r.remaining) body.append('marcar', k);
			}
		} catch {
			failure = 'Se cortó la conexión. Lo vinculado quedó guardado: podés seguir.';
		} finally {
			busy = false;
			await invalidateAll();
		}
	};

	/** @param {string} key @param {number} id */
	function pick(key, id) {
		const c = choices[key];
		choices[key] = {
			...c,
			venue: id,
			picked: c.picked.includes(id) ? c.picked : [...c.picked, id],
			searching: false,
			query: ''
		};
	}

	/** @param {string} s */
	const day = (s) => (s ? argDateList(s, { time: false }) : 'sin fecha');
	/** @param {{ first: string, last: string }} g */
	const range = (g) => (g.first === g.last ? day(g.first) : `${day(g.first)} a ${day(g.last)}`);
	/** @param {number} n @param {string} one @param {string} many */
	const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
	/** @param {LinkVenue} v */
	const addressLine = (v) => [v.address, v.area, v.city].filter(Boolean).join(', ');
	/** @param {number} score */
	const tone = (score) => (score >= 85 ? 'ok' : score >= 65 ? 'info' : 'warn');
	/** @param {LinkGroup} g */
	const newVenueHref = (g) => {
		const params = new URLSearchParams({ tipo: 'lugar' });
		if (g.names[0]) params.set('nombre', g.names[0].text);
		const street = g.locations.find((l) => /\d/.test(l.text)) ?? g.locations[0];
		if (street) params.set('direccion', street.text);
		return `/admin/comunidad/perfiles/nuevo?${params}`;
	};
	/** @param {LinkResult} r */
	const resultText = (r) =>
		[
			r.linked.length &&
				`${plural(r.linked.length, 'evento vinculado', 'eventos vinculados')} a «${r.title}»`,
			r.skipped.length &&
				`${plural(r.skipped.length, 'salteado', 'salteados')} (ya tenían lugar o se dejaron como texto)`
		]
			.filter(Boolean)
			.join(', ');
</script>

<PageHeader
	title="Vincular lugares"
	subtitle="Eventos con el «Dónde» escrito a mano y sin lugar: elegí a qué lugar corresponde cada uno. Nada se guarda hasta «Vincular»."
	back={{ href: '/admin/eventos/lugares', label: 'Lugares' }}
/>

<div class="kv-stack">
	<p class="kv-note">
		Leímos {plural(data.total, 'evento', 'eventos')}: {plural(
			data.groups.reduce((n, g) => n + g.events.length, 0),
			'tiene',
			'tienen'
		)} el «Dónde» escrito y no tienen lugar ({plural(
			data.groups.length,
			'lugar distinto',
			'lugares distintos'
		)}). Salteamos los online, los que no tienen «Dónde» y los que ya tienen lugar.
	</p>
	<p class="kv-note">
		Con el lugar, el evento muestra lo del lugar (y su mapa) según la privacidad: el del lugar o, si
		el evento mostraba menos, lo que mostraba (por ejemplo «{VENUE_PRIVACY_LABELS.name}»). Nunca se
		muestra del lugar más de lo que el lugar deja ver. El «Dónde» escrito queda como está.
	</p>

	{#if failure}
		<Notice tone="error">{failure}</Notice>
	{/if}
	{#if form?.dismiss}
		<Notice tone={form.dismiss.ok ? 'ok' : 'error'}>{form.dismiss.message}</Notice>
	{/if}
	{#if busy}
		<p class="kv-flash" role="status">Vinculando…</p>
	{/if}
	{#if done.length}
		<Notice tone="ok">
			Listo: {plural(done.length, 'lugar vinculado', 'lugares vinculados')}.
			<ul class="plain">
				{#each Object.values(results) as r (r.key)}
					{#if r.linked.length || r.skipped.length}<li>{resultText(r)}</li>{/if}
				{/each}
			</ul>
		</Notice>
	{/if}
	{#each Object.values(results).filter((r) => r.errors.length) as r (r.key)}
		<Notice tone="error">
			«{r.title || 'Lugar'}»: no se pudo vincular {plural(r.errors.length, 'evento', 'eventos')}.
			<ul class="plain">
				{#each r.errors as e, i (i)}
					<li>{e.slug ? `${e.slug}: ` : ''}{e.message}</li>
				{/each}
			</ul>
		</Notice>
	{/each}

	<Card title="Para vincular" icon={Link2}>
		{#if !data.groups.length}
			<EmptyState
				icon={MapPin}
				title="No queda nada para vincular"
				text="Todos los eventos con «Dónde» tienen lugar o quedaron como texto."
			/>
		{:else}
			<form method="POST" action="?/vincular" use:enhance={submit}>
				<div class="kv-row bulk">
					<Button type="submit" icon={Link2} disabled={busy || !selected.length}
						>Vincular todas las marcadas</Button
					>
					<span class="small muted"
						>{plural(selected.length, 'lugar marcado', 'lugares marcados')}, {plural(
							selectedEvents,
							'evento',
							'eventos'
						)}</span
					>
				</div>
				<ul class="groups">
					{#each views as v (v.g.key)}
						{@const g = v.g}
						<li class="group" class:off={!choices[g.key].marked}>
							<div class="head">
								<label class="pick">
									<input
										type="checkbox"
										name="marcar"
										value={g.key}
										bind:checked={choices[g.key].marked}
										disabled={!v.venue}
										aria-label="Marcar «{g.title}»"
									/>
									<strong>{g.title}</strong>
								</label>
								<span class="small muted"
									>{plural(g.events.length, 'evento', 'eventos')} · {range(g)}</span
								>
							</div>
							<p class="small muted written">
								Escrito así: {[...g.names, ...g.locations]
									.map((x) => `«${x.text}»${x.count > 1 ? ` (${x.count})` : ''}`)
									.join(', ')}{g.mapUrl ? ' · con link al mapa' : ''}
							</p>
							<input type="hidden" name="titulo:{g.key}" value={g.title} />
							{#each g.events as e (e.slug)}
								<input type="hidden" name="evento:{g.key}" value={e.slug} />
							{/each}

							<fieldset class="options">
								<legend class="small">Lugar</legend>
								{#if !g.suggestions.length && !v.picked.length}
									<p class="small muted">Sin sugerencias: buscá un lugar o creá uno nuevo.</p>
								{/if}
								{#each g.suggestions as s (s.id)}
									{@const venue = venuesById.get(s.id)}
									{#if venue}
										<label class="option">
											<input
												type="radio"
												name="lugar:{g.key}"
												value={s.id}
												bind:group={choices[g.key].venue}
											/>
											<span>
												<strong>{venue.title}</strong>
												<Badge tone={tone(s.score)}>{s.score} %</Badge>
												{#if addressLine(venue)}<small class="muted block"
														>{addressLine(venue)}</small
													>{/if}
												<small class="block why">{s.reasons.join(' · ')}</small>
											</span>
										</label>
									{/if}
								{/each}
								{#each v.picked as venue (venue?.id)}
									{#if venue}
										<label class="option">
											<input
												type="radio"
												name="lugar:{g.key}"
												value={venue.id}
												bind:group={choices[g.key].venue}
											/>
											<span>
												<strong>{venue.title}</strong>
												<Badge tone="neutral">elegido a mano</Badge>
												{#if addressLine(venue)}<small class="muted block"
														>{addressLine(venue)}</small
													>{/if}
											</span>
										</label>
									{/if}
								{/each}
							</fieldset>

							{#if choices[g.key].searching}
								<div class="search">
									<label class="kv-field">
										<span>Buscar otro lugar</span>
										<input
											type="search"
											placeholder="Nombre, calle o barrio"
											bind:value={choices[g.key].query}
											on:keydown={(e) => e.key === 'Enter' && e.preventDefault()}
										/>
									</label>
									{#if choices[g.key].query.trim()}
										{#if v.found.length}
											<ul class="plain found">
												{#each v.found as f (f.id)}
													<li>
														<Button variant="link" size="small" on:click={() => pick(g.key, f.id)}
															>{f.title}{addressLine(f) ? ` · ${addressLine(f)}` : ''}</Button
														>
													</li>
												{/each}
											</ul>
										{:else}
											<p class="small muted">No hay lugares con eso.</p>
										{/if}
									{/if}
								</div>
							{/if}

							{#if v.changed.length}
								<details class="changes">
									<summary class="small warn"
										>Con «{v.venue?.title}», {plural(
											v.changed.length,
											'evento se va a ver distinto',
											'eventos se van a ver distinto'
										)}</summary
									>
									<ul class="plain">
										{#each v.changed as c (c.e.slug)}
											<li class="small">
												<a href="/calendario/{c.e.slug}" target="_blank" rel="noopener"
													>{c.e.title}</a
												>
												({VENUE_PRIVACY_LABELS[c.level]}): {c.diffs.join('; ')}
											</li>
										{/each}
									</ul>
								</details>
							{/if}

							<details>
								<summary class="small"
									>{g.events.length === 1
										? 'Ver el evento'
										: `Ver los ${g.events.length} eventos`}</summary
								>
								<ul class="plain events">
									{#each g.events as e (e.slug)}
										<li class="small">
											<a href="/calendario/{e.slug}" target="_blank" rel="noopener">{e.title}</a>
											<span class="muted">({day(e.start)})</span>
											<span class="muted block"
												>{[e.name, e.location].filter(Boolean).join(' · ')}</span
											>
										</li>
									{/each}
								</ul>
							</details>

							<div class="kv-row actions">
								<Button
									type="submit"
									size="small"
									icon={Link2}
									name="solo"
									value={g.key}
									disabled={busy || !v.venue}>Vincular</Button
								>
								<Button
									variant="secondary"
									size="small"
									icon={Search}
									on:click={() => (choices[g.key].searching = !choices[g.key].searching)}
									>{choices[g.key].searching ? 'Cerrar búsqueda' : 'Buscar otro lugar'}</Button
								>
								<Button variant="secondary" size="small" icon={Plus} href={newVenueHref(g)}
									>Crear lugar nuevo</Button
								>
								<button
									class="kv-btn ghost small"
									type="submit"
									name="dejar"
									value={g.key}
									formaction="?/dejar"
									disabled={busy}
									><MessageSquareText size={16} aria-hidden="true" />Dejar como texto</button
								>
							</div>
						</li>
					{/each}
				</ul>
			</form>
		{/if}
	</Card>

	{#if data.dismissed.length}
		<Card title="Quedaron como texto" icon={MessageSquareText}>
			<p class="kv-note">
				No se sugieren más mientras su «Dónde» no cambie. Podés volver a pedir sugerencias.
			</p>
			<form method="POST" action="?/volver" use:enhance={submit}>
				<ul class="groups">
					{#each data.dismissed as g (g.key)}
						<li class="group dismissed">
							<span>
								<strong>{g.title}</strong>
								<small class="muted block"
									>{plural(g.events.length, 'evento', 'eventos')} · {range(g)}</small
								>
							</span>
							<input type="hidden" name="titulo:{g.key}" value={g.title} />
							{#each g.events as e (e.slug)}
								<input type="hidden" name="dejado:{g.key}" value={e.slug} />
							{/each}
							<button class="kv-btn ghost small" type="submit" name="volver" value={g.key}
								>Volver a sugerir</button
							>
						</li>
					{/each}
				</ul>
			</form>
		</Card>
	{/if}
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
		font-size: var(--text-sm);
	}
	.plain,
	.groups {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.group {
		border-top: 1px solid var(--line, rgba(127, 127, 127, 0.25));
		padding: var(--space-s) 0;
	}
	.group.off {
		opacity: 0.85;
	}
	.group p {
		margin: 0.3rem 0;
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2xs) var(--space-xs);
		align-items: center;
		justify-content: space-between;
	}
	.pick {
		display: flex;
		gap: var(--space-2xs);
		align-items: center;
		min-height: 2.4rem;
	}
	.written {
		overflow-wrap: anywhere;
	}
	.options {
		border: 0;
		padding: 0;
		margin: var(--space-2xs) 0;
		display: grid;
		gap: var(--space-2xs);
	}
	.options legend {
		font-weight: 700;
		padding: 0;
		margin-bottom: 0.2rem;
	}
	.option {
		display: flex;
		gap: var(--space-2xs);
		align-items: flex-start;
	}
	.option input {
		margin-top: 0.3rem;
	}
	.why {
		color: var(--text);
	}
	.search {
		margin: var(--space-2xs) 0;
		max-width: 32rem;
	}
	.found li {
		padding: var(--space-3xs) 0;
	}
	.events li {
		padding: var(--space-3xs) 0;
	}
	.changes {
		margin: var(--space-2xs) 0;
	}
	.actions {
		margin-top: var(--space-xs);
		flex-wrap: wrap;
	}
	.bulk {
		align-items: center;
		margin-bottom: var(--space-xs);
		flex-wrap: wrap;
	}
	.dismissed {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-xs);
		align-items: center;
		justify-content: space-between;
	}
</style>
