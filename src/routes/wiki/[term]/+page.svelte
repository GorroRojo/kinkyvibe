<script>
	import { aliaserFactory } from '$lib/utils/index.js';
	import PostList from '$lib/components/PostList.svelte';
	import Tags from '$lib/components/Tags.svelte';
	import { tagsConfig, currentPostData } from '$lib/utils/stores.js';
	import { CornerRightUp } from 'lucide-svelte';
	import { page } from '$app/stores';
	export let data;
	import { onMount } from 'svelte';
	import { ChevronLeft, ChevronRight } from 'lucide-svelte';
	currentPostData.set({ category: 'wiki', path: $page.url.pathname });

	/** @type {(termino:string, groups?: Group[], level?: number)=>Array<Group&{level?:number}>|undefined}*/
	function getGroups(termino, groups = $tagsConfig.groups, level = 0) {
		let matches = [];
		for (let group of groups) {
			if (group.name == termino) {
				matches.push({ ...group, level });
			} else {
				if (group.members && group.members.includes(termino)) {
					matches.push({ ...group, level: level + 1 });
				}
				if (group.sub) {
					const sub = getGroups(termino, group.sub, level + 1);
					if (sub) matches.push(...sub);
				}
			}
		}
		return matches;
	}

	/**@type {(termino:string, groups?: Group[], parents?: {name:string, disabled?: boolean}[])=>{name:string, disabled?: boolean}[][]}*/
	function getAscendance(termino, groups = $tagsConfig.groups, parents = []) {
		/**@type {{name:string}[][]}*/
		let branches = [];
		for (let group of groups) {
			let haswiki = data.entries?.find((e) => e.meta.wiki == group.name);
			if (group.name == termino) {
				branches.push(parents);
			} else if (group.members && group.members.includes(termino)) {
				branches.push([...parents, { name: group.name, disabled: !haswiki }]);
			}

			if (group.sub) {
				branches = [
					...branches,
					...getAscendance(termino, group.sub, [
						...parents,
						{ name: group.name, disabled: !haswiki }
					])
				];
			}
		}
		return branches;
	}

	/**@type {(termino:string, groups?: Group[], parents?: {name:string,disabled?:boolean}[])=>{name:string,disabled?:boolean}[][]}*/
	function getDescendance(termino, groups = getGroups(termino), parents = []) {
		/**@type {{name:string, disabled?: boolean}[][]}*/
		let branches = [];
		let maxDepth = 2;
		if (parents.length >= maxDepth) {
			return branches;
		}
		if (groups) {
			let haswikifn = (/**@type string*/ n) => data.entries?.some((e) => e.meta.wiki == n);
			for (let group of groups) {
				let localParents = [...parents];
				if (group.name != termino) {
					let haswiki = haswikifn(group.name);
					// if (localParents.length == 0) {
					// 	return branches;
					// }
					localParents.push({ name: group.name, disabled: !haswiki });
					if (localParents.length >= maxDepth) {
						branches.push(localParents);
						continue;
					}
				}
				if (group.members) {
					branches.push(
						...group.members.map((name) => [...localParents, { name, disabled: !haswikifn(name) }])
					);
				}
				if (group.sub) {
					branches = [...branches, ...getDescendance(termino, group.sub, localParents)];
				}
			}
		}
		return branches.filter(branch=>branch.some(i=>!i.disabled));
	}
	const guessedTitle = decodeURI($page.url.pathname.slice(6)).replaceAll('-', ' ');
	const ascendance = getAscendance(data.wiki ?? guessedTitle ?? 'BDSM');
	const descendance = getDescendance(data.wiki ?? guessedTitle ?? 'inglés');
	// const descendance = [[{ name: 'Shibari' }], [{ name: 'Momificación' }]];

	const style = `
	scale: .8;
	translate: 0 .5em;
	color: var(--1);
	`;
</script>

<svelte:head>
	<title>{data.title} - Kinkipedia</title>
	<link rel="icon" href="favicon-32x32.png" />

	<meta name="theme-color" content="hsl(319, 90%, 60%)" />

	<meta property="og:url" content={$page.url.href} />

	<meta property="og:title" content={data.title} />
	<meta name="twitter:title" content={data.title} />

	<meta name="description" content={data.summary} />
	<meta name="twitter:description" content={data.summary} />
	<meta property="og:description" content={data.summary} />

	<meta property="og:image" content={data.featured + ''} />
	<meta name="twitter:image" content={data.featured + ''} />

	<meta name="twitter:site" content="@kinkyvibearg" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta property="og:type" content="article" />

	<meta property="article:published_time" content={data.published_date?.toString()} />
	<meta property="article:modified_time" content={data.updated_date?.toString()} />
	<meta property="article:author" content={data.authors?.join(', ')} />
	<!-- <meta property="article:section" content="" /> -->
	<meta property="article:tag" content={data.tags?.join(', ')} />
</svelte:head>

<article class="wiki" id="title">
	<h1>{data.title == 'Error' ? guessedTitle : data.title}</h1>
	<div class="lineage">
		<div class="ascendance">
			{#each ascendance as line}
				<div>
					{#each line as { name, disabled = false }}
						{#if disabled}
							<span><ChevronLeft {style} />{name}</span>
						{:else}
							<a href={'/wiki/' + name}><ChevronLeft {style} />{name}</a>
						{/if}
					{/each}
				</div>
			{/each}
		</div>
		<div class="descendance">
			{#each descendance as line}
				<div>
					{#each line as { name, disabled = false }}
						{#if disabled}
							<span>{name}<ChevronRight {style}/></span>
						{:else}
							<a href={'/wiki/' + name}>{name}<ChevronRight {style} /></a>
						{/if}
					{/each}
				</div>
			{/each}
		</div>
	</div>
	{#if !data.error}
		{#if data.summary}
			<div class="content">
				<p>
					{data.summary}
				</p>
			</div>
		{/if}
		<div class="content">
			<svelte:component this={data.content} />
		</div>
	{:else}
		<div class="content">
			<h2>Esta wiki todavía no existe!</h2>
			<p>
				Podés comunicarte con <a href="/Gorro_Rojo">@Gorro_Rojo</a> para pedir que se agregue :D
			</p>
		</div>
	{/if}
</article>

<hr />
<h2>Materiales, amigues y eventos relevantes</h2>
<PostList posts={data.posts} />

<style>
	h2 {
		text-align: center;
		width: 100%;
		font-size: var(--step-3);
	}

	.lineage {
		max-width: 45rem;
		width: 100%;
		margin-inline: auto;
		display: flex;
		justify-content: space-between;
		margin-top: 1em;
	}
	.ascendance,
	.descendance {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5em;
		flex-direction: column;
	}
	.ascendance div > *,
	.descendance div > *{
		position: relative;
	}
	.ascendance div,
	.descendance div {
		display: flex;
		gap: 0.5em;
	}
</style>
