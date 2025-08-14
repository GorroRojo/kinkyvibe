<script module>
	import {
		CalendarRange,
		BookOpen,
		ShoppingCart,
		Download,
		MousePointerClick,
		Heart
	} from 'lucide-svelte';
	import 'add-to-calendar-button';
	import { addHours, format, isPast } from 'date-fns';
	import Tag from './Tag.svelte';
	import { onMount } from 'svelte';
	import { tagManager, filteredTags } from '$lib/utils/stores';
</script>

<script>
	/** @type {{post: ProcessedPost}} */
	let { post } = $props();
	let {
		path,
		meta: {
			title,
			summary,
			tags: initialTags,
			published_date,
			authors,
			start,
			end,
			status,
			featured: src,
			link,
			link_text,
			category,
			job_title,
			redirect,
			pronoun
		}
	} = post;
	let tags = $state(initialTags)
	let mark = $state('');
	let date = format(
		new Date(start ? addHours(new Date(start), 3) : (published_date ?? '')),
		'yyyy-MM-dd'
	);
	$effect(()=>{
		if (tags.includes('KinkyVibe')) {
			mark = 'KinkyVibe';
			let indexOfMark = tags.indexOf('KinkyVibe');
			tags = [...tags.slice(0, indexOfMark), ...tags.slice(indexOfMark + 1)];
		}
	})
	let mounted = $state(false);
	onMount(() => (mounted = true));
	let past = start && isPast(new Date(start));
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
		material: 'h-entry',
		wiki: 'h-entry'
	}[category]} u-url"
	class:mark
	class:noimg={src == 'undefined' || !src}
	id={path}
	class:past={start ? isPast(new Date(start)) || status == 'cancelado' : false}
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
				<Heart style={style + 'fill:var(--post-color);'} strokeWidth="3px" />
			{/if}
			&ThickSpace;
		</div>
		{#if category != 'amigues'}
			{#if date}
				{#if start}
					<time datetime={start} class="dt-start dt-end">
						{@html format(new Date(start), 'yyyy-MM-dd|HH:mm - ').replace(
							'|',
							'&ThickSpace;&ThickSpace;|&ThickSpace;&ThickSpace;'
						) + format(new Date(end ?? ''), 'HH:mm')}
					</time>
				{:else}
					<address class="p-author">
						{authors ? authors.join(', ') : ''}
					</address>
					{@html authors && date ? '&ThickSpace;-&ThickSpace;' : ''}
					<time class="dt-published" datetime={date ? format(new Date(date), 'yyyy-MM-dd') : ''}>
						{date ? format(new Date(date), 'yyyy-MM-dd') : ''}
					</time>
				{/if}
				{#if !((status && ['cancelado', 'agotadas'].includes(status)) || past) && link && status && status == 'abierto' && !past}
					<add-to-calendar-button
						style={`
							--btn-text: white;
							--keyboard-focus: var(--post-color, var(--2));
							--btn-background: transparent;
							--btn-shadow: none;
							--btn-shadow-hover: none;
							--list-background: white;
							--list-background-hover: var(--1-light) ;
							--list-text-hover: white;
							--btn-border: none;
							--list-shadow: 0 0 1em 0 var(--1-light);
							`}
						name={title}
						description={summary}
						startDate={format(new Date(start), 'yyyy-MM-dd')}
						startTime={format(new Date(start), 'HH:mm')}
						endDate={format(new Date(end ?? ''), 'yyyy-MM-dd')}
						endTime={format(new Date(end ?? ''), 'HH:mm')}
						timeZone="America/Buenos_Aires"
						options="'iCal','Apple','Outlook.com','Google','MicrosoftTeams','Microsoft365','Yahoo'"
						language="es"
						iCalFileName="Sample Event"
						listStyle="overlay"
						buttonStyle="3d"
						inline
						organizer="Mel|kinkyvibe@gmail.com"
						size="1"
						hideBackground
					></add-to-calendar-button>
					<!-- TODO add authors WITH EMAILS to organizers, otherwise it doesn't let me add organizers -->
					<!-- label="CUSTOM LABEL" -->
					<!-- buttonStyle="round" -->
					<!-- location="World Wide Web" -->
					<!-- trigger="hover" -->
				{/if}
				{#if (status && ['cancelado', 'agotadas'].includes(status)) || past}
					<small class="status">
						{past && !(status && status == 'cancelado') ? 'TERMINADO' : status.toUpperCase()}
					</small>
				{/if}
			{/if}
		{:else}
			<span class="job-title">{job_title}</span>
		{/if}
	</div>
	{#if src}<img {src} alt="" />{/if}
	<h3>
		{title}
		{#if pronoun && (pronoun + '').split('/').pop() != 'evitar'}
			<small class="p-pronouns">
				{@html '&nbsp;' +
					(pronoun + '').split('/').pop()?.split(',')[0].replaceAll('&', '&nbsp;/&nbsp;')}
			</small>
		{/if}
	</h3>
	<p class="summary p-summary">
		{summary ?? ''}
	</p>
	<div class="tags">
		<ul class="tagrow">
			{#each [...tags.filter((/**@type string*/ t) => t != 'KinkyVibe' && !$filteredTags.includes(t) /* && !$redundantTags.has(t)*/)] as tag}
				{@const config = $tagManager.get(tag)}
				{@const color = config?.getColor() ?? 'var(--color-2,var(--1))'}
				<li
					style:--tag-color={color}
					style:--filled-text-color={'color-mix(in srgb, var(--tag-color) 90%, black'}
					style:--filled-outline={'1px solid var(--tag-color)'}
					style:--fill-color={'color-mix(in srgb, var(--tag-color) 5%, transparent'}
					style:--filled-outline-offset={'-2px'}
					style:--hover-text-decoration={'underline var(--tag-color)'}
					style:white-space={'nowrap'}
				>
					<Tag {tag} icon={config.icon ?? ''} isLink={mounted} />
				</li>
			{/each}
		</ul>
	</div>
	{#if link && status && status == 'abierto' && !past}
		<a href={link} class="CTA" target="_blank">{link_text ?? 'INSCRIPCIÓN'}</a>
	{/if}
</a>

<style lang="scss">
	.post.amigues {
		border-radius: 999em;
		padding-top: 0;
		outline: 2px solid var(--post-color, var(--2));
		padding-right: 3em;
		img {
			border-radius: 10em;
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
		/* padding: 0 0.4em; */
		overflow-x: scroll;
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
	.post:has(.CTA) {
		grid-template-areas: 'img title title' 'img summary summary' 'img tags cta';
	}
	.CTA {
		grid-area: cta;
		background: var(--post-color);
		color: white;
		padding: 0.5em;
		border-radius: 1em;
		/* outline: 2px dashed var(--post-color);
		outline-offset: 2px; */
	}
	.post {
		--post-color: var(--2);
		/* position: relative; */
		width: 100%;
		/* max-width: 900px; */
		height: 10.5em;

		display: grid;
		grid-template-areas: 'img title' 'img summary' 'img tags';
		grid-template-columns: 9em 1fr;
		grid-template-rows: auto 1fr 2.4em;
		column-gap: 1em;
		align-items: center;

		margin-inline: auto;
		padding-top: 1.7em;
		padding-right: 1em;
		list-style: none;
		background: white;
		border-radius: 2em;
		box-shadow: 0 0.1em 0.3em rgba(0, 0, 0, 0.1);
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
		height: 13.5em;
	}
	.post.material {
		height: 11.5em;
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
		border-radius: 1em;
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
		color: whiite;
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
		.post:not(.amigues) {
			grid-template-areas: 'title title' 'img summary' 'img tags';
			grid-template-rows: auto 1fr 2em;
			&:has(.CTA) {
				grid-template-areas:
					'title title title'
					'img summary summary'
					'img tags cta';
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
