<script>
	import LDTag from '$lib/components/LDTag.svelte';
	import DbProfile from '$lib/components/amigues/DbProfile.svelte';
	import FollowButton from '$lib/components/FollowButton.svelte';
	import ParticipacionesPorRol from '$lib/components/ParticipacionesPorRol.svelte';
	import { currentPostData } from '$lib/utils/stores.js';
	import { page } from '$app/stores';
	/** @type {any} */
	export let data;
	/** @type {any} */
	export let form;
	// El perfil sale de la base (+page.server.js, «solo base»).
	currentPostData.set({ category: 'amigues', path: $page.url.pathname });
	/**@type {(s:string|number|Date)=>(string)}*/
	let toISO = (s) => {
		try {
			return new Date(s).toISOString();
		} catch (e) {
			return s + '';
		}
	};
	$: ld = data.profile;
</script>

<LDTag
	schema={{
		'@context': 'https://schema.org',
		'@type': 'NewsArticle',
		headline: ld.title,
		image: [ld.image + ''],
		datePublished: toISO(ld.publishedDate ?? ''),
		dateModified: toISO(ld.updatedDate ?? ld.publishedDate ?? ''),
		author: ld.authors?.map((/** @type {string} */ a) => ({
			'@type': 'Person',
			name: a,
			url: 'https://kinkyvibe.ar/' + a
		}))
	}}
/>
<a href={$page.url.href} hidden aria-hidden="true" class="u-url">Link</a>
<DbProfile {data} claimResult={form?.claim} url={$page.url.href} />
<!-- «Lo que sigo» (interruptor `lo_que_sigo`): apagado, /api/sigo da 404 y no se ve -->
<FollowButton kind="perfil" key={String(data.profileId)} name={data.profile?.title ?? ''} />
{#if data.participa}
	<div class="content"><ParticipacionesPorRol groups={data.participa} /></div>
{/if}
