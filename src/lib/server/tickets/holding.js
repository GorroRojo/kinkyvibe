/**
 * Qué órdenes ocupan cupo: las aprobadas y, mientras `expires_at` no pasó, las que retienen el
 * lugar (`HOLDING`). Es la misma regla del cupo (orders.js), de los usos de un código
 * (discounts.js) y de «Entradas por parte» con ventas (../eventos/partes.js).
 *
 * Solo imports relativos (sin ninguno, en realidad): lo importan módulos que no pasan por Vite.
 */

/** Estados de orden que ocupan cupo (y un uso de código) mientras `expires_at` no pasó. */
export const HOLDING = "('pending', 'rejected', 'awaiting_transfer')";
