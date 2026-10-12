<script>
	/**@type {{component: *, content: string}[]}*/
	export let inputs = [];
	let checked = false;
	let indeterminate = false;
	let state = 'false';
	let click = () => {
		if (state === 'true') {
			checked, (state = 'indeterminate');
			indeterminate = true;
		} else if (state === 'indeterminate') {
			checked = undefined;
			state = 'false';
			indeterminate = false;
		} else {
			checked = true;
			state = 'true';
		}
	};
</script>

<label class={state}
	><input
		on:input|preventDefault={click}
		bind:checked
		bind:indeterminate
		type="checkbox"
		class="blockcheck"
	/>
	{#each inputs as input}
		<svelte:component this={input.component}>{input.content}</svelte:component>
	{/each}
</label>

<style>
	label {
		color: var(--curr);
		transition: 300ms;
		display: block;
		cursor: pointer;
		padding-left: 1em;
		position: relative;
		--curr-decoration: none;
	}
	label.true {
		--curr: var(--good);
	}
	label.indeterminate {
		--curr: var(--bad);
		/* --good: var(--bad); */
		text-decoration: var(--bad-decoration);
		--curr-decoration: var(--bad-decoration);
	}
	[type='checkbox'] {
		margin-right: 0.4em;
		/* font-size: .8em; */
		/* height: 1em; */
		/* width: 1em; */
		/* translate: 0 0.3em; */
		accent-color: var(--curr);
		cursor: pointer;
		position: absolute;
		left: -0.5em;
		top: 0.8em;
	}
</style>
