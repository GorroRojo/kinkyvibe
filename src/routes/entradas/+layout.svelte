<script>
	import logo from '../logo.png';
	let { children } = $props();
</script>

<svelte:head>
	<meta name="robots" content="noindex, nofollow" />
	<meta name="referrer" content="no-referrer" />
</svelte:head>

<header class="entradas-header">
	<a href="/"><img src={logo} alt="KinkyVibe.ar" width="40" height="40" /> KinkyVibe.ar</a>
</header>
<main class="entradas-main">
	{@render children()}
</main>

<style>
	.entradas-header {
		display: flex;
		justify-content: center;
		padding: 0.8em;
		background: var(--2-dark);
	}
	.entradas-header a {
		display: flex;
		align-items: center;
		gap: 0.5em;
		color: white;
		font-weight: bold;
		text-decoration: none;
		font-size: var(--step-0);
	}
	.entradas-main {
		max-width: 36rem;
		margin: 0 auto;
		padding: 1em var(--space-xs) 3em;
		font-size: var(--step-0);
	}
</style>
