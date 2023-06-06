<blockquote class="cblockquote">
    <slot />
</blockquote>

<style>
    blockquote {
		padding: 0rem;
		margin: 5rem 2rem;
        margin-bottom: 1rem;
		position: relative;
		--quotes-size: 2em;
		--quotes-color: rgba(0, 0, 0, 0.2);
		color: var(--2-dark);
		line-height: 1.6;
		word-spacing: 2px;
		font-style: italic;
		font-size: 2em;
	}
    :global(.cblockquote + .cblockquote) {
        margin-top: 1rem;
    }
    :global(.cblockquote::last-of-type) {
        margin-bottom: 3rem;
    }

	blockquote::before {
		content: '“';
		display: block;
		position: absolute;
		left: -0.6em;
		font-size: var(--quotes-size);
		color: var(--quotes-color);
	}
    :global(.cblockquote > :last-child::after) {
		content: '”';
		position: relative;
		left: 0.2em;
		top: 0.4em;
		font-size: var(--quotes-size);
		color: var(--quotes-color);
		line-height: 0;
	}
</style>