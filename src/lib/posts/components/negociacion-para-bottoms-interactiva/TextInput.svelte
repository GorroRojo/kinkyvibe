<script>
	let value = '';
	let textContent = '';
	let keydown = (evt) => {
		if (['I', 'B', 'S', 'U'].includes(evt.key.toUpperCase())) {
			if (evt.ctrlKey) evt.preventDefault();
		}
	};
</script>

<!-- <input class="textinput" bind:value class:filled={value} style:width={value.length > 3 ? value.length + "ch" : "4ch"} type="text" /> -->

<span
	class="textinput"
	on:keydown={keydown}
	on:click|preventDefault
	bind:textContent
	contenteditable
	style:min-width={textContent.length > 3 ? textContent.length+2 + 'ch' : '4ch'}
/>

<style>
	.textinput {
		/* white-space: */
		display: inline;
		background: none;
		border: 0;
		--border-opacity: 2%;
		border-bottom: 3px solid color-mix(in srgb, var(--curr) 30%, transparent);
		background: color-mix(in srgb, var(--curr) var(--border-opacity), transparent);
		outline: 0;
		font-size: 1em;
		color: var(--curr);
		width: auto;
		min-width: 0;
		max-width: 85vw;
		min-height: 0;
		/* max-height: 100vh; */
		padding: 0.1em 0.3em;
		/* height: 1.7em; */
		translate: 0 -3px;

		width: 3ch;
		font-family: monospace;
	}

	.textinput:hover {
		--border-opacity: 10%;
	}
	.textinput:focus {
		--border-opacity: 10%;
	}
	@media print {
		.textinput {
			border-bottom: 0;
			text-decoration: 1px underline dashed rgb(76,76,255);
			font-family:cursive;
			color: rgb(76, 76, 255);
		}
	}
</style>
