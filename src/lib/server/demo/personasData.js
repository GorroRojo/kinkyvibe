/**
 * Las personas de prueba de «Entrar como persona de prueba» (ver ./personas.js), sin imports: las
 * usan también el seed de la demo (./seed.js, que corre en Node) para volver a cargar sus compras.
 */

/** Dominio reservado (RFC 2606): ningún mail de acá existe ni puede verificarse. */
export const DEMO_EMAIL_DOMAIN = '@example.invalid';

/** Clave de `accounts.preferences` que marca una cuenta creada por el seed de la demo. */
export const DEMO_ACCOUNT_MARK = 'datos_de_prueba';

/**
 * Las personas de prueba. Ids con forma de UUID armados a mano (prefijo `5eed`, "seed"): los de
 * las cuentas reales son al azar.
 */
export const DEMO_PERSONAS = Object.freeze([
	Object.freeze({
		key: 'con-entradas',
		id: '5eed0000-0000-4000-8000-0000000000a1',
		email: 'demo.entradas@example.invalid',
		label: 'Persona con entradas',
		hint: 'Compró entradas y sigue etiquetas y un perfil.'
	}),
	Object.freeze({
		key: 'gestiona-perfil',
		id: '5eed0000-0000-4000-8000-0000000000a2',
		email: 'demo.gestiona@example.invalid',
		label: 'Persona que gestiona un perfil',
		hint: 'Es dueñe de «Persona de Prueba» y puede editarlo.'
	}),
	Object.freeze({
		key: 'nueva',
		id: '5eed0000-0000-4000-8000-0000000000a3',
		email: 'demo.nueva@example.invalid',
		label: 'Cuenta recién creada',
		hint: 'Sin compras ni nada seguido: como alguien que recién entra.'
	})
]);
