<script>
    import {
		filteredTags,
		tagsConfig,
		alias,
	} from '$lib/utils/stores';
	import { aliaserFactory } from '$lib/utils/index.js';
	import '$lib/styles/style.scss';
    export let data;
	// onMount(() => {
	tagsConfig.set(data.tagsConfig);
	filteredTags.set([]);
	// });
	alias.update(() => aliaserFactory($tagsConfig));
</script>
<slot></slot>