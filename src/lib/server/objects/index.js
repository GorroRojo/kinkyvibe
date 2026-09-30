/**
 * Objetos: "todo es un objeto" (eventos, lugares, perfiles, series… conectados por edges).
 * Ver docs/objetos.md. Todavía no se usa en las páginas.
 */
export { saveObject, slugify } from './save.js';
export { getObject, searchObjects } from './read.js';
export { getEdges } from './edges.js';
export { canSee, visibleWhere, ANON, VISIBILITIES, DEFAULT_VISIBILITY } from './visibility.js';
export { checkObjectsIntegrity, findIntegrityProblems } from './integrity.js';
export { coreTypes, createRegistry, validateData } from './types/index.js';
export { ObjectError, VersionConflictError } from './errors.js';
