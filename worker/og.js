/**
 * El dibujante de las tarjetas de vista previa en el Worker (worker/og-render.js) con el
 * WebAssembly de satori y de resvg como módulos: wrangler los sube compilados (regla por defecto
 * para `.wasm`), que es la única forma de usar WebAssembly en Workers. Vite no ve este archivo: lo
 * importa worker/index.js y se lo pasa a SvelteKit en `platform.env.OG_RENDER` (solo en `/og/…`).
 */
import yogaWasm from 'satori/yoga.wasm';
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm';
import { createOgRenderer } from './og-render.js';

export const renderOg = createOgRenderer(yogaWasm, resvgWasm);
