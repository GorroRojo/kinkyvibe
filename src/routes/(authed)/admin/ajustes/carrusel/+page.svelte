<script>
	/**
	 * Ajustes › Carrusel de la portada (ver +page.server.js): el estilo de las diapositivas, qué
	 * entra (días y máximo), cómo se ve ahora y los colores de los flyers que faltan, calculados acá
	 * mismo en el navegador.
	 */
	import '$lib/admin/panel-forms.scss';
	import { deserialize, enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { Palette } from '@lucide/svelte';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import { areaBackLink } from '$lib/admin/nav.js';
	import { Button, Card, ChoiceCard, Field, Notice } from '$lib/components/ui';
	import {
		CARRUSEL_ESTILOS,
		ROTAR,
		estiloDeDiapositiva,
		nombreDelEstilo
	} from '$lib/utils/carruselEstilos.js';
	import { colorsFromImage, parseColors } from '$lib/utils/flyerColors.js';
	import { paletasDelCarrusel } from '$lib/utils/carruselPaletas.js';
	import { categoryTileLook } from '$lib/utils/ogObjeto.js';
	import { cssColorHex } from '$lib/utils/flyerColors.js';
	import { argDateList, argDateTimeLong } from '$lib/utils/dates.js';

	export let data;
	export let form;

	/** Lo elegido (antes de guardar, la lista de abajo ya lo muestra). */
	let modo = data.modo;
	$: savedModo = data.modo;

	/** La respuesta de `?/cantidad` (o de otra acción), leída sin la unión de tipos de las tres. */
	/** @type {Record<string, any> | null | undefined} */
	let f;
	$: f = form;
	/** Qué entra: lo escrito (o lo guardado). */
	let dias = String(/** @type {any} */ (form)?.values?.dias ?? data.dias);
	let maximo = String(/** @type {any} */ (form)?.values?.maximo ?? data.maximo);
	/** @type {Record<string, string>} */
	$: cantidadErrors = f?.cantidad ? (f?.errors ?? {}) : {};

	const OPCIONES = [
		{
			id: ROTAR,
			nombre: 'Rotar',
			texto: 'Cada diapositiva con un estilo distinto, en orden: A, B, C, D, E y de vuelta.'
		},
		...CARRUSEL_ESTILOS.map((e) => ({ ...e, nombre: `${e.id.toUpperCase()} · ${e.nombre}` }))
	];

	// Los mismos colores que la portada (carruselPaletas.js), en el mismo orden: lo que no es un
	// evento y no tiene imagen lleva la ficha de su tipo, y la paleta se elige contra su color.
	$: tiles = data.slides.map((s) =>
		s.featured ? null : categoryTileLook(s.category ?? '', s.tags ?? [])
	);
	$: paletas = paletasDelCarrusel(
		data.slides.map((s, i) => {
			const tileHex = tiles[i] && cssColorHex(tiles[i]?.bg);
			return tileHex
				? { hasImage: true, colors: [tileHex] }
				: { hasImage: Boolean(s.featured), colors: s.colors };
		})
	);
	$: shown = data.slides.map((s, i) => ({
		...s,
		estilo: estiloDeDiapositiva(
			/** @type {import('$lib/utils/carruselEstilos.js').CarruselModo} */ (modo),
			s.estiloDelEvento,
			i
		),
		paleta: paletas[i],
		ficha: tiles[i],
		segunFlyer: Boolean(s.featured && parseColors(s.colors))
	}));

	// «Calcular los colores que faltan»: de a una imagen (la copia chica), de a tandas al servidor.
	/** @type {'idle' | 'running' | 'done' | 'error'} */
	let state = 'idle';
	let done = 0;
	let saved = 0;
	let failed = 0;
	let total = 0;

	/** @param {number} w @param {number} h */
	function makeCanvas(w, h) {
		const c = document.createElement('canvas');
		c.width = w;
		c.height = h;
		return c;
	}

	/**
	 * Los colores de una imagen de la biblioteca, o `null` si no carga.
	 * @param {string} src
	 * @returns {Promise<string[] | null>}
	 */
	async function colorsOf(src) {
		const img = new Image();
		img.decoding = 'async';
		img.src = src;
		try {
			await img.decode();
		} catch {
			return null;
		}
		return colorsFromImage(img, makeCanvas);
	}

	/** @param {{ id: number, colors: string[] }[]} items */
	async function send(items) {
		const body = new FormData();
		body.set('items', JSON.stringify(items));
		const res = await fetch('?/colores', {
			method: 'POST',
			body,
			headers: { 'x-sveltekit-action': 'true', accept: 'application/json' }
		});
		const r = /** @type {any} */ (deserialize(await res.text()));
		if (r.type !== 'success') throw new Error(r.data?.error ?? 'No se pudo guardar.');
		saved += Number(r.data?.saved ?? 0);
	}

	async function calcular() {
		state = 'running';
		done = saved = failed = 0;
		total = data.missing.total;
		try {
			// Varias vueltas si hay más de las que trae la página (se recarga entre una y otra).
			for (let round = 0; round < 20 && data.missing.images.length; round++) {
				const before = saved;
				/** @type {{ id: number, colors: string[] }[]} */
				let batch = [];
				for (const image of data.missing.images) {
					const colors = (await colorsOf(image.small)) ?? (await colorsOf(image.url));
					done++;
					if (colors) batch.push({ id: image.id, colors });
					else failed++;
					if (batch.length === 20) {
						await send(batch);
						batch = [];
					}
				}
				if (batch.length) await send(batch);
				await invalidateAll();
				if (saved === before) break;
			}
			state = 'done';
		} catch {
			state = 'error';
			await invalidateAll();
		}
	}
</script>

<PageHeader
	back={areaBackLink('ajustes-carrusel')}
	title="Carrusel de la portada"
	subtitle="Lo que se ve arriba de la portada: los próximos eventos de Kinky Vibe y lo nuevo de Material, Amigues y la Kinkipedia. Acá se elige el estilo de cada diapositiva y cuánto entra."
/>

<div class="kv-form settings">
	{#if !data.enabled}
		<Notice tone="warn" role={null}>
			El carrusel está apagado (Ajustes › Interruptores, «Carrusel en la portada»). Lo que elijas
			acá se ve cuando se prenda.
		</Notice>
	{/if}

	<form
		method="POST"
		action="?/save"
		use:enhance={() =>
			async ({ update }) =>
				update({ reset: false })}
	>
		<Card title="Estilo">
			{#if form?.message && !form?.cantidad}
				<Notice>{form.message}</Notice>
			{:else if form?.error && !form?.cantidad}
				<Notice tone="error">{form.error}</Notice>
			{/if}
			<p class="kv-note">
				Para todo el carrusel. Cada evento puede elegir otro en Editar → Datos, «Estilo en el
				carrusel de la portada», y ese manda.
				{#if data.updatedAt}
					Último cambio: {argDateTimeLong(data.updatedAt)}{data.updatedBy
						? `, por ${data.updatedBy}`
						: ''}.
				{/if}
			</p>
			<div class="opciones">
				{#each OPCIONES as o (o.id)}
					<ChoiceCard bind:group={modo} name="modo" value={o.id} title={o.nombre} text={o.texto}>
						{#if o.id === savedModo}<span class="tag">el de ahora</span>{/if}
					</ChoiceCard>
				{/each}
			</div>
			<div class="actions">
				<Button type="submit">Guardar</Button>
				{#if modo !== savedModo}<span class="kv-note">Sin guardar.</span>{/if}
			</div>
		</Card>
	</form>

	<form
		method="POST"
		action="?/cantidad"
		use:enhance={() =>
			async ({ update }) =>
				update({ reset: false })}
	>
		<Card title="Qué entra">
			{#if f?.message && f?.cantidad}
				<Notice>{f.message}</Notice>
			{:else if f?.error && f?.cantidad}
				<Notice tone="error">{f.error}</Notice>
			{/if}
			<p class="kv-note">
				Primero los próximos eventos de Kinky Vibe, por fecha. Después, lo nuevo de Material,
				Amigues y la Kinkipedia (lo más nuevo primero, intercalando), hasta el máximo.
			</p>
			<div class="cantidad">
				<Field
					label="Lo nuevo de los últimos (días)"
					type="number"
					name="dias"
					inputmode="numeric"
					bind:value={dias}
					error={cantidadErrors.dias ?? ''}
					help="De {data.rangos.dias.min} a {data.rangos.dias.max}. Cuenta desde que se publicó."
				/>
				<Field
					label="Máximo de diapositivas"
					type="number"
					name="maximo"
					inputmode="numeric"
					bind:value={maximo}
					error={cantidadErrors.maximo ?? ''}
					help="De {data.rangos.maximo.min} a {data.rangos.maximo.max}, contando los eventos."
				/>
			</div>
			<div class="actions">
				<Button type="submit">Guardar</Button>
			</div>
		</Card>
	</form>

	<Card title="Cómo se ve ahora">
		{#if shown.length === 0}
			<p class="kv-note">
				Ahora no entra nada: ni próximos eventos de Kinky Vibe ni nada nuevo de los últimos {data.dias}
				días. Sin nada, el carrusel no aparece.
			</p>
		{:else}
			<p class="kv-note">
				Lo que entra hoy, en orden{modo !== savedModo
					? ', con el estilo elegido (todavía sin guardar)'
					: ''}.
			</p>
			<ol class="slides">
				{#each shown as s (s.path)}
					<li>
						{#if s.featured}
							<img src={s.featured} alt="" width="64" height="64" loading="lazy" />
						{:else}
							<span class="sin-flyer" aria-hidden="true"></span>
						{/if}
						<div class="slide-text">
							<strong>{s.title}</strong>
							<small class="kv-note"
								>{s.tipo}{#if s.start}{' · ' + argDateList(s.start)}{/if}</small
							>
							<span>
								Estilo: {s.estilo.toUpperCase()} · {nombreDelEstilo(s.estilo)}
								{#if s.estiloDelEvento}<span class="tag">elegido en el evento</span>{/if}
							</span>
							<span class="colores">
								<span
									class="muestra"
									style:background={s.paleta.bg}
									style:color={s.paleta.tituloInk}>Aa</span
								>
								<span
									class="muestra"
									style:background={s.paleta.alt}
									style:color={s.paleta.altTituloInk}>Aa</span
								>
								<span
									class="muestra"
									style:background={s.paleta.cinta}
									style:color={s.paleta.cintaInk}>Aa</span
								>
								{#if s.ficha}
									<small class="kv-note"
										>Sin imagen: va la ficha de su tipo, y el fondo de la marca elegido para que
										resalte.</small
									>
								{:else if s.segunFlyer}
									<small class="kv-note"
										>Fondo de la marca elegido para que {s.start ? 'el flyer' : 'la imagen'} resalte.</small
									>
								{:else if s.featured}
									<small class="kv-note"
										>Fondo de la marca, rotando: faltan los colores {s.start
											? 'del flyer'
											: 'de la imagen'} (calculalos abajo).</small
									>
								{:else}
									<small class="kv-note"
										>Fondo de la marca, rotando: {s.start
											? 'el evento no tiene flyer'
											: 'no tiene imagen'}.</small
									>
								{/if}
							</span>
							{#if s.editHref}
								<a class="kv-link" href={s.editHref}>Cambiar el estilo de este evento</a>
							{:else}
								<a class="kv-link" href={s.path}>Ver la página</a>
							{/if}
						</div>
					</li>
				{/each}
			</ol>
		{/if}
	</Card>

	<Card title="Colores de los flyers" icon={Palette}>
		<p class="kv-note">
			Los fondos son siempre de la marca: los colores de cada flyer eligen cuál va detrás (el que
			más lo hace resaltar) y le dan su color a la estrella y a la cinta. Se calculan solos al subir
			una imagen; las que se subieron antes los necesitan una vez.
		</p>
		{#if state === 'running'}
			<p role="status">Calculando… {done} de {total}.</p>
		{:else if state === 'done'}
			<Notice
				>Listo: {saved === 1
					? 'se guardaron los colores de 1 imagen'
					: `se guardaron los colores de ${saved} imágenes`}.{failed
					? ` ${failed === 1 ? '1 no se pudo abrir' : `${failed} no se pudieron abrir`}.`
					: ''}</Notice
			>
		{:else if state === 'error'}
			<Notice tone="error">Se cortó a la mitad. Lo guardado quedó; probá de nuevo.</Notice>
		{/if}
		{#if data.missing.total > 0}
			<p>
				{data.missing.total === 1
					? 'Falta 1 imagen de la biblioteca.'
					: `Faltan ${data.missing.total} imágenes de la biblioteca.`}
			</p>
			<div class="actions">
				<Button on:click={calcular} busy={state === 'running'} disabled={state === 'running'}
					>Calcular los colores que faltan</Button
				>
			</div>
		{:else}
			<p>Todas las imágenes de la biblioteca tienen sus colores.</p>
		{/if}
	</Card>
</div>

<style>
	.settings {
		display: grid;
		gap: 1rem;
		max-width: 52rem;
	}
	.cantidad {
		display: grid;
		gap: 0.75rem;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 14rem), 1fr));
		margin-block: 0.75rem;
	}
	.opciones {
		display: grid;
		gap: 0.5rem;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 15rem), 1fr));
		margin-block: 0.75rem;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
	}
	.tag {
		display: inline-block;
		margin-inline-start: 0.4em;
		padding: 0 0.45em;
		border-radius: 999px;
		font-size: 0.75em;
		background: var(--surface-2, hsl(262 30% 92%));
		color: var(--text-2, inherit);
	}
	.slides {
		display: grid;
		gap: 0.75rem;
		margin: 0.75rem 0 0;
		padding: 0;
		list-style: none;
	}
	.slides li {
		display: flex;
		gap: 0.75rem;
		align-items: flex-start;
	}
	.slides img,
	.sin-flyer {
		flex-shrink: 0;
		width: 4rem;
		height: 4rem;
		border-radius: 0.5rem;
		object-fit: cover;
	}
	.sin-flyer {
		background: var(--surface-2, hsl(262 30% 92%));
	}
	.slide-text {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;
	}
	.colores {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.35rem;
	}
	.muestra {
		display: inline-grid;
		place-items: center;
		width: 2rem;
		height: 1.6rem;
		border-radius: 0.35rem;
		font-weight: 700;
		font-size: 0.85rem;
		box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.12);
	}
</style>
