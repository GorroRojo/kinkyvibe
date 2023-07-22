<script>
    export let group;
</script>
dt group name
dd 
    dl 
        div>dt+dd each member
        div>this each sub

dl
    div each group
        dt name
        dd desc
        dt+dd each member

<dt>
    {group.name}
</dt>
<dd>
    <dl>
        {#each group.members as member}
            <div>
                <dt>{member.name}</dt>
                <dd>{member.description}</dd>
            </div>
        {/each}
        {#each group.sub as sub}
            <div>
                <svelte:self group={sub} />
            </div>
        {/each}
    </dl>
</dd>