// Mediciones a pedido (`*.medir.js`): no corren en `npx vitest run` ni en la CI, porque tardan
// (la del panel, ~2 minutos). Se corren con su script, por ejemplo `npm run medir:panel`
// (docs/pruebas-y-ci.md). Usa la misma configuración que las pruebas (vite.config.js: plugins,
// setup, plantilla de la base), con un solo proyecto que toma solo las mediciones.
import { defineConfig } from 'vitest/config';
import base from './vite.config.js';

export default defineConfig({
	...base,
	test: {
		...base.test,
		projects: undefined,
		name: 'medir',
		include: ['src/**/*.medir.js'],
		// Lo que imprimen (la tabla) es el resultado: que se vea también si pasan.
		silent: false
	}
});
