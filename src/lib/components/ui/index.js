/**
 * Componentes compartidos de la interfaz (sistema de diseño, docs/estilo.md, «Componentes»).
 * Un componente por concepto; todos se ven en la galería /estilo (solo en previews y en dev).
 *
 *   import { Button, Card, Badge } from '$lib/components/ui';
 *
 * Antes de crear un componente nuevo, mirá /estilo y preguntale a gorrite.
 */
export { default as Badge } from './Badge.svelte';
export { default as Button } from './Button.svelte';
export { default as Card } from './Card.svelte';
export { default as Checkbox } from './Checkbox.svelte';
export { default as Chip } from './Chip.svelte';
export { default as ChoiceCard } from './ChoiceCard.svelte';
export { default as ConfirmDialog } from './ConfirmDialog.svelte';
export { default as Dialog } from './Dialog.svelte';
export { default as EmptyState } from './EmptyState.svelte';
export { default as Field } from './Field.svelte';
export { default as Notice } from './Notice.svelte';
export { default as PageHeader } from './PageHeader.svelte';
export { default as SaveStatus } from './SaveStatus.svelte';
export { default as Segmented } from './Segmented.svelte';
export { default as Sheet } from './Sheet.svelte';
export { default as Switch } from './Switch.svelte';
export { default as Table } from './Table.svelte';
export { default as Tabs } from './Tabs.svelte';
export { default as TagChip } from './TagChip.svelte';
// «Guardaste X» con Deshacer: todavía vive con el panel (un PR posterior lo mueve).
export { default as UndoToast } from '../admin/panel/UndoToast.svelte';
// Confirmaciones (diálogo centrado, nunca window.confirm) y el gesto de cerrar hojas.
export { askConfirm } from '$lib/admin/confirm.js';
export { sheetDrag } from '$lib/admin/sheetDragAction.js';
