<script context="module">
	import {
		CalendarRange,
		BookOpen,
		ShoppingCart,
		Download,
		MousePointerClick,
		Heart
	} from '@lucide/svelte';
	import { argDateList, argTime, eventEnd, isoDay, parseSiteDate } from '$lib/utils/dates.js';
	import CardTags from './CardTags.svelte';
	import { pronounDisplay } from '$lib/utils/mentions';
	import { onMount } from 'svelte';
	import { filteredTags } from '$lib/utils/stores';
	import { ticketCta } from '$lib/utils/ticketCta.js';
	import { partLabel } from '$lib/utils/partes.js';
	import { smallSrcset } from '$lib/utils/mediaCopies.js';
</script>

<script>
	//@ts-nocheck
	export let post;
	/** Estado de la venta de entradas de los eventos de la lista, por slug (ver ticketCta.js);
	 * `null` si no se sabe: un evento con entradas muestra igual el link a /entradas.
	 * @type {import('$lib/utils/ticketCta.js').TicketStates | null} */
	export let ticketStates = null;
	let {
		path,
		meta: {
			title,
			summary,
			tags,
			published_date,
			authors,
			start,
			end,
			status,
			featured: src,
			mark,
			link,
			link_text,
			category,
			job_title,
			redirect,
			pronoun,
			// Talleres en varias partes: «Parte N de M» (lo agrega el calendario, docs/talleres-partes.md).
			parte
		}
	} = post;
	var date = start ?? published_date;
	if (isNaN(new Date(date ?? '').getTime())) date = '';
	if (tags.includes('KinkyVibe')) {
		mark = mark ? mark : 'KinkyVibe';
		let indexOfMark = tags.indexOf('KinkyVibe');
		tags = [...tags.slice(0, indexOfMark), ...tags.slice(indexOfMark + 1)];
	}
	let mounted = false;
	let tagsExpanded = false;
	let past = start ? parseSiteDate(start).getTime() < Date.now() : false;
	// Si el evento vende entradas acá, «Comprar entradas» (o «Agotadas»…) en lugar de la
	// inscripción externa.
	$: tickets = ticketCta(post.meta, ticketStates, { past });
	onMount(() => {
		mounted = true;
	});
	let style = `scale:var(--scale,1);
				 translate:var(--translate,0 0);
				 display: inline-block;
				 margin-right: .4em;`;
</script>

<a
	href={path}
	class="post {category} {{
		amigues: 'h-card',
		calendario: 'h-event',
		material: 'h-entry'
	}[category]} u-url"
	class:mark
	class:noimg={src == 'undefined' || !src}
	id={path}
	class:past={start ? past || status == 'cancelado' : false}
	tabindex="0"
	target={redirect || path.startsWith('https') ? '_blank' : undefined}
>
	<div class="publication">
		<div class="icon">
			{#if category == 'calendario'}
				<CalendarRange {style} />
			{:else if category == 'material'}
				{#if tags.includes('pago')}
					<ShoppingCart {style} />
				{:else if tags.includes('descargable')}
					<Download {style} />
				{:else if tags.includes('interactivo')}
					<MousePointerClick {style} />
				{:else}
					<BookOpen {style} />
				{/if}
			{:else}
				<Heart style={style + 'fill:var(--pink);'} strokeWidth="3px" />
			{/if}
		</div>
		{#if category != 'amigues'}
			{#if date}
				{#if start}
					<time datetime={start} class="dt-start dt-end">
						{argDateList(start)} – {argTime(eventEnd(start, end))}
					</time>
				{:else}
					<address class="p-author">
						{authors ? authors.join(', ') : ''}
					</address>
					{@html authors && date ? '&ThickSpace;-&ThickSpace;' : ''}
					<time class="dt-published" datetime={isoDay(date)}>
						{date ? argDateList(date, { time: false }) : ''}
					</time>
				{/if}
				{#if (status && ['cancelado', 'agotadas'].includes(status)) || past}
					<small class="status">
						{past && !(status && status == 'cancelado') ? 'TERMINADO' : status.toUpperCase()}
					</small>
				{/if}
			{/if}
		{:else}
			<span class="job-title">{job_title ?? ''}</span>
		{/if}
	</div>
	<!-- la copia chica de 360 px si la imagen es de la biblioteca (docs/imagenes.md) -->
	{#if src}<img
			{src}
			srcset={smallSrcset(src) || undefined}
			alt=""
			loading="lazy"
			decoding="async"
		/>{/if}
	<h3>
		{title}
		{#if parte}
			<small class="part-label">{'\u00a0· ' + partLabel(parte.n, parte.m)}</small>
		{/if}
		{#if pronounDisplay(pronoun)}
			<small class="p-pronouns">
				{'\u00a0' + pronounDisplay(pronoun)}
			</small>
		{/if}
	</h3>
	<p class="summary p-summary">
		{summary ?? ''}
	</p>
	<div class="tags">
		<!-- Hasta 5 chips y «+N» para ver el resto (CardTags; docs/seo.md, opción 1b). -->
		<ul class="tagrow" class:expanded={tagsExpanded}>
			<CardTags
				tags={tags.filter((/**@type string*/ t) => t != 'KinkyVibe' && !$filteredTags.includes(t))}
				linked={mounted}
				bind:expanded={tagsExpanded}
			/>
		</ul>
	</div>
	<!-- Client-only: an <a> nested in the card's <a> is invalid HTML, so the browser would
	     restructure it if it were server-rendered, breaking hydration. -->
	{#if tickets}
		{#if tickets.kind == 'buy' && mounted}
			<!-- svelte-ignore node_invalid_placement_ssr -->
			<a href={tickets.href} class="CTA">{tickets.text}</a>
		{:else if tickets.kind == 'buy'}
			<!-- Server-rendered as a plain label (same look and place; until hydration a click opens
			     the event page, like the rest of the card). -->
			<span class="CTA">{tickets.text}</span>
		{:else if tickets.kind == 'note'}
			<span class="CTA note">{tickets.text}</span>
		{/if}
	{:else if mounted && link && status && status == 'abierto' && !past}
		<!-- svelte-ignore node_invalid_placement_ssr -->
		<a href={link} class="CTA" target="_blank">{link_text ?? 'INSCRIPCIÓN'}</a>
	{/if}
</a>

<style lang="scss">
	.post.amigues {
		border-radius: var(--radius-pill);
		padding-top: 0;
		outline: 2px solid var(--post-color, var(--2));
		padding-right: 3em;
		img {
			border-radius: var(--radius-pill);
			aspect-ratio: 1;
			object-fit: cover;
		}
		.publication {
			background: none;
			time,
			address,
			.job-title {
				display: none;
			}
			.icon {
				color: var(--post-color);
				left: -1em;
				position: relative;
				scale: 0.8;
				top: -0.2em;
			}
		}
	}
	.tagrow {
		list-style: none;
		padding: 0;
		display: flex;
		font-size: 0.8em;
		/* en una sola fila, que se desliza de costado (pedido de gorrite, 5/10) */
		flex-wrap: nowrap;
		overflow-x: auto;
		overflow-y: hidden;
		gap: 0.3em;
		/* position: absolute; */
		/* bottom: -1em; */
		/* left: 0; */
		/* width: var(--card-width); */
		transition: 100ms;
	}
	.tagrow::-webkit-scrollbar {
		display: none;
	}
	/* con «+N» desplegado, todas a la vista: en filas, y la tarjeta crece */
	.tagrow.expanded {
		flex-wrap: wrap;
		overflow-x: visible;
	}
	.post:has(.CTA) {
		grid-template-areas: 'img title title' 'img summary summary' 'img tags cta';
	}
	.CTA {
		grid-area: cta;
		background: var(--post-color);
		color: white;
		padding: 0.35em 0.9em;
		border-radius: var(--round-pill);
		font-weight: 700;
		white-space: nowrap;
		&:hover {
			color: white;
			filter: brightness(0.92);
		}
		/* «Agotadas», «Venta cerrada»…: un aviso, no un botón */
		&.note {
			background: transparent;
			color: var(--post-color);
			outline: 2px solid var(--post-color);
			outline-offset: -2px;
			font-weight: 700;
			&:hover {
				filter: none;
			}
		}
	}
	.post {
		--post-color: var(--2);
		/* position: relative; */
		width: 100%;
		/* max-width: 900px; */
		/* alto mínimo (no fijo): si las etiquetas no entran en una fila, bajan a otra y la
		   tarjeta crece, en vez de recortarlas */
		min-height: 10.5em;

		display: grid;
		grid-template-areas: 'img title' 'img summary' 'img tags';
		grid-template-columns: 9em 1fr;
		grid-template-rows: auto 1fr minmax(2.4em, auto);
		column-gap: 1em;
		align-items: center;

		margin-inline: auto;
		padding-top: 1.7em;
		padding-right: 1em;
		list-style: none;
		background: var(--surface);
		border-radius: 2em;
		box-shadow: var(--shadow);
		/* overflow: hidden; */
		&.mark {
			--post-color: var(--1);
		}
		&.past {
			opacity: 0.5;
		}
		&.noimg {
			grid-template-columns: 0 1fr;
		}
	}
	.post.calendario {
		min-height: 13.5em;
	}
	.post.material {
		min-height: 11.5em;
	}
	a h3 {
		/* display: flex; */
		/* align-items: center; */
		grid-area: title;
		font-size: var(--step-2);
		/* align-self:flex-start; */
		margin: 0;
		margin-top: 0.2em;
		margin-bottom: 0.1em;
		/* text-decoration: underline; */
		text-decoration-color: var(--post-color, var(--2));
		/* margin-left: 1em; */
		small {
			color: var(--post-color, var(--2));
			font-size: 0.7em;
			font-weight: normal;
		}
	}
	/* .time {
		grid-area: time;
	} */
	.tags {
		grid-area: tags;
		max-width: 100%;
		min-width: 0;
		--color: var(--post-color);
		z-index: 3;
		/* cursor:crosshair; */
	}
	.summary {
		grid-area: summary;
		margin: 0;
		padding: 0.2em0;
		align-self: flex-start;
		font-size: var(--step-0);
		display: block;
		max-height: 100%;
		min-height: 0;
		white-space: normal;
		overflow: hidden;
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		text-overflow: ellipsis;
	}

	img {
		grid-area: img;
		max-height: calc(100% - 1em);
		max-width: calc(100% - 0em);
		object-fit: contain;
		object-position: center;
		border-radius: var(--radius-m);
		margin-left: 1em;
		justify-self: center;
		min-height: 0;
		min-width: 0;
	}
	.publication {
		display: grid;
		grid-auto-flow: column;
		align-items: center;
		justify-content: start;
		background: var(--post-color, var(--2));
		white-space: nowrap;
		position: absolute;
		right: 0;
		left: 0;
		top: 0;
		height: 1.7em;
		padding-inline: 1.5em;
		color: white;
		font-size: var(--step--1);
		border-radius: 2em 2em 0 0;
		--translate: 0 0.1em;
		& > * {
			min-height: 0;
			min-width: 0;
		}
		/* one line, cut with "…" (long author lists or date + time used to wrap and get
		   clipped by the strip) */
		time,
		address {
			overflow: hidden;
			text-overflow: ellipsis;
		}
	}
	.calendario .publication {
		grid-template-columns: 2em 1fr auto;
	}
	a {
		color: inherit;
		text-decoration-color: transparent;
		scale: 1;
		transition: 100ms;
	}
	a:hover:not(.past),
	a:focus {
		scale: 1.03;
	}

	@container (max-width: 680px) {
		.publication {
			padding-inline: 1em;
		}
		.post:not(.amigues) {
			grid-template-areas: 'title title' 'img summary' 'img tags';
			grid-template-rows: auto 1fr minmax(2em, auto);
			/* en el celu el botón va en su propia fila, abajo de las etiquetas (al lado las
			   tapaba) */
			&:has(.CTA) {
				grid-template-areas:
					'title title'
					'img summary'
					'img tags'
					'img cta';
				grid-template-rows: auto 1fr minmax(2em, auto) auto;
				padding-bottom: var(--space-2xs);
			}
			.CTA {
				justify-self: end;
			}
			/* «Comprar entradas» mide los 44px del dedo (`--tap`) en el botón mismo: un
			   `.tap-target` invisible taparía las etiquetas de arriba (decisión de gorrite,
			   `areas-toque-restos`). Los avisos («Agotadas»…) no son botones y quedan como están,
			   a la derecha. */
			.CTA:not(.note) {
				display: inline-flex;
				align-items: center;
				min-height: var(--tap);
				/* centrado en su fila, abajo de las etiquetas (gorrite, al revisar #335) */
				justify-self: center;
			}
			/* &:has(.CTA).noimg {
				grid-template-areas:
					'title title'
					'summary summary'
					'tags cta';
			} */
		}
		:not(.amigues) > h3 {
			align-self: flex-start;
			padding-left: 1em;
			line-height: 1.3;
			height: auto;
			/* justify-self: center; */
			/* padding-top: 0.2em; */
		}
		:not(.amigues) > img {
			max-height: calc(100% - 1em);
		}
	}
</style>
