/**
 * Antes de cada archivo de pruebas: el árbol de etiquetas de respaldo es el de la semilla de
 * contenido (el que tenía src/lib/utils/hardcodedTags.js antes de borrarlo, decisión 0032), así
 * las pruebas que no cargan etiquetas en una base siguen teniendo el árbol del sitio. En la app,
 * ese respaldo es vacío ($lib/utils/tagFallback.js).
 */
import { setFallbackTagList } from '../lib/utils/tagFallback.js';
import etiquetas from '../lib/server/semilla/etiquetas.json';

setFallbackTagList(structuredClone(etiquetas));
