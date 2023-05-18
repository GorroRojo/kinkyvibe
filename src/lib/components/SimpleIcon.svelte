<script>
    
    // @ts-nocheck
    /** Icon data from SimpleIcon's module import
     * @type {{
     *      title: string,
     *      slug: string,
     *      hex: string,
     *      source: string,
     *      svg: string,
     *      path: string,
     *      guidelines: string,
     *      license: {
     *          type:string,
     *          url: string
     *      }
     * }}
     */
    export let icon;
</script>
<svg role="img" viewbox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    {@html icon.svg.slice(71,-5)}
</svg>
<style>
    svg {
        scale: var(--scale, 1);
        translate: var(--translate, 0 0);
        color: var(--color, var(--1));
        fill: var(--color, var(--1));
        /* stroke: var(--color, var(--1)); */
    }
</style>