<!-- 
<label><input type=checkbox class=mark hidden/>
<slot></slot>
</label> -->
<script>
	let checked = false;
	let indeterminate = false;
	let state = 'false';
	let click = ()=>{
	if (state === 'true') {
		checked, state = 'indeterminate'
		indeterminate = true;
	} else if (state === 'indeterminate') {
		checked = false;
		state = 'false';
		indeterminate = false;
	} else {
		checked = true;
		state = 'true';
	}
}
</script>
<label  class={state}><input on:input|preventDefault={click} bind:checked bind:indeterminate type=checkbox /><slot /></label>
<style>
	label:has(:focus) {
		outline: 1px solid white;
	}
	input {
		opacity: 0;
		pointer-events: none;
		position: absolute;
	}
	label {
		display: inline-block;
		scale: .8;
		margin-inline: 0em;
		padding: .1em .3em;
		border-radius: .4em;
		cursor: pointer;
		/* --curr: var(--off); */
		text-decoration: var(--curr-decoration);
		opacity: .7;
		--background-opacity: 5%;
		--faded-curr: color-mix(in srgb, var(--curr) var(--background-opacity), transparent);
		background: var(--faded-curr);
		color: var(--curr);
		transition: 100ms;
		user-select: none;
	}
	label:hover {
		scale: .9;
	}
	label.true{
		--curr: var(--good);
		--background-opacity: 1%;
		text-decoration: none;
		opacity: 1;
		scale: 1;
	}
	label.indeterminate {
		--background-opacity: 1%;
		--curr: var(--bad);
		opacity: 1;
		scale: 1;
		text-decoration: var(--bad-decoration);
	}
</style>