<li class="cli">
	<slot />
</li>
<style>
    li {
		list-style: none;
		position: relative;
		margin-block: 1em;
	}
	li::before {
		position: absolute;
		left: -1em;
		content: '+ ';
		color: var(--2);
	}
</style>