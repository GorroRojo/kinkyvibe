<script>
	/**
	 * Obsoleto: importá Badge de `$lib/components/ui` (docs/estilo.md, «Componentes»). Este archivo
	 * queda solo para que los imports viejos sigan andando hasta que un PR los pase; no le agregues
	 * nada.
	 */
	import Badge from '../../ui/Badge.svelte';
</script>

<Badge {...$$restProps}><slot /></Badge>
