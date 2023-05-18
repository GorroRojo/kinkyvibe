<script>
    //@ts-nocheck
    export let data;
    let c = atob(data.res??'','base64')
    function save(e) {
        alert(document.querySelector("textarea").value)
    }
</script>
<textarea value={c}></textarea>
<button on:click={save}>Save</button>
<form method="POST" action="/logout">
    <input type="submit" value="Log out"/>
 </form>