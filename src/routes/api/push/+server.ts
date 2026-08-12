import webpush from 'web-push';
import { json, type RequestHandler } from '@sveltejs/kit';
import type { PushSubscription, PushNotificationPayload, ApiResponse } from '$lib/types/push';

// Configura las credenciales VAPID (necesitarás generar estas claves)
const VAPID_PUBLIC_KEY = 'BOZ2qYh0wf6_0yR1BKVRD2NRlIbOU_q3qsfxx5bRu09gQFM5lgz0jD2NOlkVQJysFGwjUlKHUn8UZyPVeJM2-ro';
const VAPID_PRIVATE_KEY = 'SE0vY91_WFGj5vpIdxkaam9B5uvLbBEGBfNCRbaZmd0';
const VAPID_SUBJECT = 'mailto:kinkyvibe@gmail.com'; // Email de contacto

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// En una aplicación real, guardarías estas suscripciones en una base de datos
let subscriptions: PushSubscription[] = [];

export const GET: RequestHandler = async () => {
  return json({ 
    success: true, 
    publicKey: VAPID_PUBLIC_KEY 
  });
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const subscription = await request.json() as PushSubscription;
    
    // Validar que los campos requeridos estén presentes
    if (!subscription.endpoint || !subscription.keys || !subscription.keys.p256dh || !subscription.keys.auth) {
      return json({
        success: false,
        error: 'Formato de suscripción inválido'
      }, { status: 400 });
    }
    
    // Almacena la nueva suscripción
    if (!subscriptions.some(sub => sub.endpoint === subscription.endpoint)) {
      subscriptions.push(subscription);
    }
    
    return json({ 
      success: true,
      message: 'Suscripción guardada correctamente'
    });
  } catch (error) {
    console.error('Error al procesar suscripción:', error);
    return json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Error desconocido' 
    }, { status: 500 });
  }
};

// Endpoint para enviar notificaciones (protegerías esto con autenticación)
export const PUT: RequestHandler = async ({ request }) => {
  try {
    const payload = await request.json() as PushNotificationPayload;
    
    // Validar campos obligatorios
    if (!payload.title || !payload.body) {
      return json({
        success: false,
        error: 'Título y mensaje son requeridos'
      }, { status: 400 });
    }
    
    // Si no hay suscriptores, devolver error
    if (subscriptions.length === 0) {
      return json({
        success: false,
        error: 'No hay suscriptores para enviar notificaciones'
      }, { status: 404 });
    }
    
    // Preparar la notificación
    const notificationPayload = JSON.stringify(payload);
    
    // Enviar notificaciones
    const results = await Promise.allSettled(
      subscriptions.map(subscription => 
        webpush.sendNotification(subscription, notificationPayload)
          .catch(error => {
            if (error.statusCode === 410) {
              // La suscripción ya no es válida, eliminarla
              subscriptions = subscriptions.filter(
                sub => sub.endpoint !== subscription.endpoint
              );
            }
            throw error;
          })
      )
    );
    
    // Contar éxitos y fallos
    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    
    return json({
      success: true,
      message: `Notificación enviada a ${succeeded} dispositivos (${failed} fallos)`,
      results: results.map(r => r.status)
    });
  } catch (error) {
    console.error('Error al enviar notificaciones:', error);
    return json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Error desconocido' 
    }, { status: 500 });
  }
};