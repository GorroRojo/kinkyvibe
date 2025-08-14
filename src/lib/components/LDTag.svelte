<script module>
	import '$lib/types.d.js';
	let site = {
		title: 'Navillus: Jamstack developers for hire',
		description:
			"We specialize in finding simple solutions to complex software problems. We value data-driven decisions and accessibility over this month's latest tech trends.",
		url: 'https://KinkyVibe.ar',
		author: 'KinkyVibe',
		social: {
			twitter: 'navillus_dev',
			twitter_card: 'summary_large_image'
		},
		company: {
			name: 'Navillus'
		}
	};
	/**@type import('schema-dts').WithContext<import('schema-dts').Organization>*/
	const organizationSchema = {
		'@context': 'https://schema.org',
		'@type': 'Organization',
		'@id': `${site.url}#organization`,
		url: site.url,
		name: site.company.name,
		description: site.description,
		sameAs: [`https://twitter.com/${site.social.twitter}`],
		logo: `${site.url}/favicon.svg`
	};

	const websiteSchema = {
		'@context': 'https://schema.org',
		'@type': 'WebSite',
		name: site.title,
		url: site.url,
		description: site.description,
		sameAs: [`https://twitter.com/${site.social.twitter}`]
	};
	/**
	 * @param {LD.Schema} thing
	 **/
	function serializeSchema(thing) {
		return `<script type="application/ld+json">${JSON.stringify(thing, null, 2)}</${''}script>`;
	}
</script>

<script>
	
	/** @type {{schema: any}} */
	let { schema } = $props();
</script>

<svelte:head>
	{@html serializeSchema(schema)}
</svelte:head>
<!-- {
    "title": "Navillus: Jamstack developers for hire",
    "description": "We specialize in finding simple solutions to complex software problems. We value data-driven decisions and accessibility over this month's latest tech trends.",
    "url": "https://navillus.dev",
    "author": "Navillus",
    "social": {
        "twitter": "navillus_dev",
        "twitter_card": "summary_large_image"
    },
    "company": {
        "name": "Navillus"
    }
} -->
