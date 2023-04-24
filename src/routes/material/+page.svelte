<script>
    //@ts-nocheck
    export let data;
</script>
<ul>
    {#each data.posts as post}
        <li>
            <a href={post.href}>{post.title}</a>
        </li>
    {/each}
</ul>