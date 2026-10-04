<!--
	The event tags that follow rules (see eventTagGroups in $lib/utils/adminTags.js):
	KinkyVibe on/off, exactly one language (+ LSA), exactly one place, any price.
-->
<script>
	import { eventTagGroups, siteTags } from '$lib/utils/adminTags.js';

	/** @type {{kinkyvibe: boolean, language: string, sign: boolean, place: string, prices: string[]}} */
	export let state;
	/** @type {string[]} rule errors to show (from validateEventTags) */
	export let errors = [];
	export let idPrefix = 'ev';

	const tm = siteTags();
	const groups = eventTagGroups(tm);
	/** @param {string} id */
	const icon = (id) => tm.get(id)?.icon ?? '';
	/** Color de la etiqueta (el propio o el de la madre); sin color, el rosa de la marca. */
	/** @param {string} id */
	const color = (id) => tm.get(id)?.getColor?.() ?? undefined;
	/** "Montevideo" → "Uruguay", "AMBA" → "Argentina" */
	/** @param {string} id */
	const parentOf = (id) =>
		(tm.get(id)?.parents ?? []).find(
			(/** @type {string} */ p) => !['lugar', 'Presencial', 'root'].includes(p)
		) ?? '';

	/** @param {string} p */
	function togglePrice(p) {
		state.prices = state.prices.includes(p)
			? state.prices.filter((x) => x !== p)
			: groups.prices.filter((x) => x === p || state.prices.includes(x));
	}
	$: languageError = errors.find((e) => /idioma/i.test(e));
	$: placeError = errors.find((e) => /lugar|dónde/i.test(e));
</script>

<div class="rules">
	<label class="switch">
		<input type="checkbox" role="switch" id="{idPrefix}-kv" bind:checked={state.kinkyvibe} />
		<span>
			<strong>{icon(groups.kinkyvibe)} Lo organiza Kinky Vibe</strong>
			<small>Agrega la etiqueta «{groups.kinkyvibe}».</small>
		</span>
	</label>

	<fieldset class="group" aria-describedby={languageError ? `${idPrefix}-lang-error` : undefined}>
		<legend>Idioma <span class="req">*</span></legend>
		<div class="pills">
			{#each groups.languages as lang}
				<label class="pill" style:--tag-color={color(lang)}>
					<input type="radio" name="{idPrefix}-language" value={lang} bind:group={state.language} />
					<span class="kv-tag">{icon(lang)} {lang}</span>
				</label>
			{/each}
			{#if groups.signLanguage}
				<label class="pill extra" style:--tag-color={color(groups.signLanguage)}>
					<input type="checkbox" id="{idPrefix}-sign" bind:checked={state.sign} />
					<span class="kv-tag"
						>{icon(groups.signLanguage)} con intérprete de {groups.signLanguage}</span
					>
				</label>
			{/if}
		</div>
		{#if languageError}<p class="error" id="{idPrefix}-lang-error">{languageError}</p>{/if}
	</fieldset>

	<fieldset class="group" aria-describedby={placeError ? `${idPrefix}-place-error` : undefined}>
		<legend>Lugar <span class="req">*</span></legend>
		<div class="pills">
			{#each groups.places as place}
				<label class="pill" title={parentOf(place) || undefined} style:--tag-color={color(place)}>
					<input type="radio" name="{idPrefix}-place" value={place} bind:group={state.place} />
					<span class="kv-tag">{icon(place)} {place}</span>
				</label>
			{/each}
		</div>
		{#if placeError}<p class="error" id="{idPrefix}-place-error">{placeError}</p>{/if}
	</fieldset>

	<fieldset class="group">
		<legend>Precio</legend>
		<div class="pills">
			{#each groups.prices as price}
				<label class="pill" style:--tag-color={color(price)}>
					<input
						type="checkbox"
						value={price}
						checked={state.prices.includes(price)}
						on:change={() => togglePrice(price)}
					/>
					<span class="kv-tag">{icon(price)} {price}</span>
				</label>
			{/each}
		</div>
		<small>Podés marcar más de uno (por ejemplo, una parte gratis y otra paga).</small>
	</fieldset>
</div>

<style lang="scss">
	.rules {
		display: flex;
		flex-direction: column;
		gap: 0.8em;
	}
	.group {
		border: 0;
		padding: 0;
		margin: 0;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.35em;
		box-shadow: none;
		background: none;
	}
	legend {
		float: none;
		font-size: var(--step-0);
		font-weight: normal;
		color: var(--1-dark);
		padding: 0;
		margin-bottom: 0.3em;
	}
	.req {
		color: var(--error);
	}
	small {
		font-size: var(--step--1);
		opacity: 0.75;
	}
	.error {
		color: var(--error, #b00020);
		margin: 0;
		font-size: var(--step--1);
	}
	.pills {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4em;
	}
	.pill {
		position: relative;
		display: inline-flex;
		cursor: pointer;
		input {
			position: absolute;
			opacity: 0;
			width: 1px;
			height: 1px;
			margin: 0;
		}
		/* chip de etiqueta con su color (.kv-tag, style.scss); lleno cuando está elegido */
		span {
			padding: 0.35em 0.85em;
			font-size: var(--step--1);
			font-weight: 400;
			line-height: 1.3;
			user-select: none;
		}
		input:checked + span {
			font-weight: 700;
		}
		input:focus-visible + span {
			outline: 3px solid var(--2-dark, #333);
			outline-offset: 1px;
		}
		&.extra span {
			border-style: dashed;
		}
	}
	/* el interruptor en sí es el compartido (style.scss, `role="switch"`) */
	.switch {
		display: flex;
		align-items: center;
		gap: 0.7em;
		cursor: pointer;
		> span:last-child {
			display: flex;
			flex-direction: column;
		}
	}
</style>
