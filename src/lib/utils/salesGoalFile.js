/**
 * Meta de venta sobre el archivo (.md) de un evento nuevo: la herencia de la meta por defecto de
 * su serie (./salesGoal.js, `inheritedGoal`). La usan la carga rápida de la agenda y la
 * importación de la planilla (src/lib/server/eventos/drafts.js).
 */
import { parseDocument } from 'yaml';
import { applyFrontmatterChanges, joinMarkdown, splitMarkdown } from './eventDraft.js';
import { GOAL_KEY, inheritedGoal } from './salesGoal.js';

/**
 * `inheritedGoal` sobre el archivo completo de un evento nuevo: el mismo archivo con la meta
 * de su serie en `meta_venta` (o tal cual, si no hay nada que cambiar).
 *
 * @param {string} raw
 * @param {Record<string, string> | null | undefined} seriesGoals
 */
export function withInheritedGoal(raw, seriesGoals) {
	if (!seriesGoals || !Object.keys(seriesGoals).length) return raw;
	const { frontmatter, body } = splitMarkdown(raw);
	const doc = parseDocument(frontmatter);
	if (doc.errors.length) return raw;
	const next = inheritedGoal(/** @type {Record<string, any>} */ (doc.toJS() ?? {}), seriesGoals);
	if (next === null) return raw;
	return joinMarkdown(applyFrontmatterChanges(frontmatter, { [GOAL_KEY]: next }), body);
}
