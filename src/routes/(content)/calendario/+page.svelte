<script>
	//@ts-nocheck
	import Calendar from '$lib/components/Calendar.svelte';
	import PostList from '$lib/components/PostList.svelte';
	import { addDays, format } from 'date-fns';

	export let data = [];
	data.days = data.posts.reduce((dates, post) => {
		post.meta.start = format(addDays(new Date(post.meta.start), 1), 'yyyy-MM-dd');
		if (dates[post.meta.start]) {
			dates[post.meta.start].push(post);
		} else {
			dates[post.meta.start] = [post];
		}
		return dates;
	}, {});
</script>

<svelte:head>
	<title>KinkyVibe.ar - Calendario</title>
</svelte:head>

<div id="calendar">
	<Calendar let:date let:today let:past>
		{@const day = data.days[date]}
		<button
			class:today
			class:past
			disabled={!day}
			on:click={() =>
				alert(
					`You selected the date ${date.toLocaleDateString(undefined)}.` +
						(today ? `\nThis date is today!` : '')
				)}
		>
			<div class="date" class:today>
				{addDays(new Date(date), 1).toLocaleDateString('es-AR', { day: 'numeric' })}
				<!-- {JSON.stringify(date)} -->
			</div>
			{#if day}
				<div class="dot" />
				{#each day as event}
					<a href={event.path} class="bar" style:--evt-color={event.color || '#ff8'}>
						<span>{event.meta.title ?? ' '}</span>
					</a>
				{/each}
			{/if}
		</button>
	</Calendar>
</div>

<PostList posts={data.posts} />

<style lang="scss">
	#calendar {
		max-width: 800px;
		margin-inline: auto;
		height: 30em;
	}
	button.past {
		opacity: 0.2;
	}
	button.today {
		outline: 3px solid var(--1);
		opacity: 1;
		.date {
			scale: 1.2;
		}
	}
	button {
		opacity: 0.7;
		display: flex;
		padding: 0;
		position: relative;
		width: 100%;
		height: 100%;
		scale: 0.9;
		flex-direction: column;
		justify-content: start;
		align-items: stretch;
		gap: 0.2em;
		background-color: white;
		border: 0;
		border-radius: 0.1rem 0.1rem 1rem 1rem;
		transition: all 0.1s ease-in;
		.dot {
			display: none;
		}
		.bar {
			display: grid;
			place-content: center;
			height: 0.2em;
			margin-inline: -0.2em;
			background: white;
			border-radius: 0.3em;
			font-size: 1.5em;
			z-index: 1;
			word-break: break-word;
			outline: 3px solid var(--evt-color);
			outline-offset: -2px;
			overflow: hidden;
			transition: 200ms ease-in;
			text-decoration: none !important;

			span {
				text-transform: capitalize;
				color: #555;
			}
			* {
				text-decoration: none !important;
			}
		}

		.date {
			display: grid;
			place-content: center;
			font-size: 2em;
			color: rgba(1, 1, 1, 0.5);
			position: absolute;
			top: 0;
			right: 0;
			left: 0;
			bottom: 0;
		}
	}

	button:has(.dot) {
		cursor: pointer;
		opacity: 1;
		&:hover {
			gap: 0.5em;
			.bar {
				height: 100%;
			}
		}
	}
</style>
