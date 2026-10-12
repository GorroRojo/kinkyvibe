/**
 * El tipo de entrada que se tocó en «Anotate en la lista de espera» de una tarjeta agotada
 * (TicketsStep): el formulario de la lista (WaitlistSignup) lo deja elegido. `''` = ninguno.
 */
import { writable } from 'svelte/store';

export const waitlistPick = writable('');
