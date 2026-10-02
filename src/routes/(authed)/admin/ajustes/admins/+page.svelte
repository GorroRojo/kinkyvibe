<script>
	import '$lib/admin/panel-forms.scss';
	import { AJUSTES_TABS } from '$lib/admin/ajustes.js';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Tabs from '$lib/components/admin/panel/Tabs.svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import { brokenImage } from '$lib/admin/brokenImage.js';

	export let data;

	/** @type {Record<number, boolean>} */
	let failed = {};

	/** @param {number} id */
	const markFailed = (id) => () => (failed = { ...failed, [id]: true });
</script>

<PageHeader title="Admins" subtitle="Quién puede entrar al panel." />
<Tabs tabs={[...AJUSTES_TABS]} />

<div class="kv-stack settings">
	<Card padded={false}>
		<ul class="admins">
			{#each data.admins as a (a.id)}
				<li>
					{#if failed[a.id] || !a.avatar}
						<span class="avatar initial" aria-hidden="true"
							>{a.login.slice(0, 1).toUpperCase()}</span
						>
					{:else}
						<img
							class="avatar"
							src={a.avatar}
							alt=""
							width="48"
							height="48"
							loading="lazy"
							referrerpolicy="no-referrer"
							use:brokenImage={markFailed(a.id)}
						/>
					{/if}
					<div class="who">
						<a href="https://github.com/{a.login}" target="_blank" rel="noopener noreferrer"
							><b>{a.login}</b></a
						>
						<small class="muted">GitHub · id {a.id}</small>
					</div>
					{#if a.me}<Badge tone="info">vos</Badge>{/if}
				</li>
			{/each}
		</ul>
	</Card>
	<p class="kv-note">
		Por ahora la lista se cambia en el código (<code>src/lib/server/auth.js</code>, por el número de
		usuarie de GitHub, que no cambia aunque cambie el nombre). Más adelante se va a poder editar
		desde acá.
	</p>
</div>

<style>
	.settings {
		max-width: 48rem;
	}
	.admins {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		padding: 0.8rem 1.2rem;
		border-top: 1px solid var(--line);
	}
	li:first-child {
		border-top: 0;
	}
	.avatar {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		flex: none;
		background: var(--surface-2);
	}
	.initial {
		display: grid;
		place-items: center;
		font-weight: 700;
		color: var(--muted);
	}
	.who {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex: 1;
	}
</style>
