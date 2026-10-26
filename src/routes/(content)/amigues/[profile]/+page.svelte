<script>
	import LDTag from '$lib/components/LDTag.svelte';
	import { profileSchema } from '$lib/utils/jsonLd.js';
	import DbProfile from '$lib/components/amigues/DbProfile.svelte';
	import FollowButton from '$lib/components/FollowButton.svelte';
	import ParticipacionesPorRol from '$lib/components/ParticipacionesPorRol.svelte';
	import { page } from '$app/stores';
	/** @type {any} */
	export let data;
	/** @type {any} */
	export let form;
	// El perfil sale de la base (+page.server.js, «solo base»).
</script>

<!-- Datos estructurados (schema.org): solo lo que la página muestra (jsonLd.js); el lugar, según
     su privacidad. -->
<LDTag
	schema={profileSchema({
		profile: data.profile,
		canonical: data.canonical,
		location: data.location
	})}
/>
<a href={$page.url.href} hidden aria-hidden="true" class="u-url">Link</a>
<DbProfile {data} claimResult={form?.claim} url={$page.url.href} />
<!-- «Lo que sigo» (interruptor `lo_que_sigo`): apagado, `data.follow` es null y no se ve. Viene con
     la página (+page.server.js), así no se mueve cuando llega. -->
<FollowButton
	kind="perfil"
	key={String(data.profileId)}
	name={data.profile?.title ?? ''}
	info={data.follow}
	path={$page.url.pathname + $page.url.search}
/>
{#if data.participa}
	<div class="content"><ParticipacionesPorRol groups={data.participa} /></div>
{/if}
