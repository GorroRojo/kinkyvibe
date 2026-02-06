<script>
	//@ts-nocheck
	import TextInput from './TextInput.svelte';
	import MarkInput from './MarkInput.svelte';
	import Phrase from './Phrase.svelte';
	import Leaf from './Leaf.svelte';
	let currentPage = 0;
	import { pages } from './frases.js';
	import { goto } from '$app/navigation';
	let textinput = () => ({ component: TextInput, content: '' });
	let markinput = (t) => ({
		component: MarkInput,
		content: ('' + t).replaceAll('-', ' ')
	});
	let leaf = (t) => ({ component: Leaf, content: t });

	/**@param {string} s*/
	function parseString(s) {
		if (s.length == 0) return [];
		/**@type {*}*/
		let textInputs = s.split(/_+/);
		if (textInputs.length > 1) {
			textInputs = textInputs
				.map((a) => {
					if (a == '' || a == ' ') return textinput();
					return a;
				})
				.flat();
		}
		let markInputs = textInputs
			.map((a) => {
				if (typeof a != 'string') return a;
				let slashSeparated = a.split('/');
				if (slashSeparated == '') return false;
				if (slashSeparated.length == 1) return leaf(a);
				return slashSeparated
					.map((b, slashIndex, arr) => {
						let res = slashIndex == 0 ? [] : [leaf('')];
						let spaceSeparated = b.split(/[\.\ ]+/);
						if (spaceSeparated == '') return [...res, false];
						if (spaceSeparated.length == 1) return [...res, markinput(b)];
						if (slashIndex == arr.length - 1) {
							let separator = b.match(/[\. ]+/).slice(-1)[0];
							return [
								...res,
								markinput(spaceSeparated[0]),
								leaf(b.match(/[\. ]+/)[0] + b.slice(spaceSeparated[0].length + separator.length))
							];
						}
						return [
							...res,
							leaf(b.slice(0, -spaceSeparated.slice(-1)[0].length)),
							markinput(spaceSeparated.slice(-1))
						];
					})
					.filter((i) => i != false)
					.flat();
			})
			.filter((i) => i != false)
			.flat();
		// if (markInputs[0].component == Leaf) {

		// }
		// markInputs = [markInputs[0], ...markInputs].flat()
		return markInputs;
		return [{ component: Leaf, content: s }];
	}
	let y = 0;
</script>

<div id="top" />
<svelte:window bind:scrollY={y} />
<div class="stepper">
	{#if currentPage > 0}<button
			on:click={() => {
				currentPage--;
				goto('#top');
			}}>Anterior</button
		>{/if}
	<div class="stepnumber">{currentPage + 1} / {pages.length}</div>
	{#if currentPage < pages.length - 1}
		<button
			on:click={() => {
				currentPage++;
				goto('#top');
			}}>Siguiente</button
		>
	{:else}
		<button
			style:color="white"
			style:background="var(--1)"
			on:click={() => window.print()}>Exportar respuestas</button
		>
	{/if}
</div>
<div class="negociacioninteractiva">
	{#each pages as page, i}
		<div class="page" class:current={currentPage == i}>
			<h2>{@html page.section ?? ''}</h2>
			<h3>{@html page.title ?? ''}</h3>
			<p>{@html page.description ?? ''}</p>
			<ul>
				{#each page.items ?? [] as inputs}
					<li><Phrase inputs={parseString(inputs)} /></li>
				{/each}
			</ul>
		</div>
	{/each}
</div>


<style>
	.negociacioninteractiva {
		position: relative;
		font-size: 1.5rem;
		--good: green;
		--bad: coral;
		--neutral: gold;
		--off: rgba(0, 0, 0, 0.7);
		--bad-decoration: 2px line-through color-mix(in srgb, var(--bad) 60%, white);
		scroll-behavior: smooth;
	}
	:global(.negociacioninteractiva *) {
		max-width: 100%;
	}
	:global(.negociacioninteractiva a) {
		color: currentcolor;
		text-decoration-color: var(--1);
	}
	:global(.negociacioninteractiva a:visited) {
		color: currentcolor;
	}
	:global(.negociacioninteractiva h3) {
		font-size: 1.5em;
		margin-right: 0.5em;
		margin-top: 0;
	}
	:global(.negociacioninteractiva h2) {
		font-size: 0.9em;
	}
	:global(.negociacioninteractiva p) {
		line-height: 1.5;
		margin-right: 0.5em;
	}
	.stepper {
		/* position: fixed; */
		/* display: none; */
		justify-content: space-between;
		align-items: center;
		width: 100%;
		/* bottom: 0; */
		/* left: 0em; */
		/* right: 0em; */
		/* background: #222; */
		/* padding-inline: 1em; */
	}
	button {
		display: none;
		cursor: pointer;
	}
	.negociacioninteractiva {
		display: grid;
		grid-template-areas: 'page';
	}
	ul {
		padding: 0 0.1em;
	}
	li {
		list-style: none;
		margin-block: 1em;
		line-height: 1.5;
		--curr: var(--off);
	}
	:global(.negociacioninteractiva li) {
		user-select: none;
		display: none;
	}
	:global(.negociacioninteractiva ul li:has(.true)),
	:global(.negociacioninteractiva ul li:has(.indeterminate)),
	:global(.negociacioninteractiva ul li:has(.filled)) {
		display: list-item;
	}
	@media screen {
		button {
			display: block;
			padding: 1em;
			margin-block: 1em;
			font-size: 1em;
			background-color: var(--2);
			border-radius: 1em;
			border: 0;
			color: white;
			font-size: 1.2em;
		}
		:global(.negociacioninteractiva li:has(.true)),
		:global(.negociacioninteractiva li:has(.indeterminate)),
		:global(.negociacioninteractiva li:has(.filled)) {
			display: list-item;
		}
		:global(.negociacioninteractiva ul li) {
			display: list-item;
		}
		.stepper {
			display: flex;
			position: sticky;
			top: 0;
			background: #eee;
			z-index: 2;
			border-bottom: 2px solid var(--2);
		}
		.stepnumber {
			color: var(--2);
			font-weight: bold;
			font-size: 1.5em;
		}
		.page {
			/* position: absolute; */
			scale: 0 1;
			rotate: 0deg;
			opacity: 0;
			/* transform-origin: 0 0; */
			transition: 300ms;
			transition-delay: 0ms;
			padding-bottom: 5em;
			grid-area: page;
			height: 0;
			min-width: 0;
			min-height: 0;
		}
		.page.current {
			opacity: 1;
			scale: 1 1;
			translate: 1 1;
			rotate: 0deg;
			transition-delay: 0ms;
			height: auto;
		}
	}
	@media print {
		:global(.negociacioninteractiva [type="text"]) {
			border-bottom: 0 !important;
		}
	}
</style>
