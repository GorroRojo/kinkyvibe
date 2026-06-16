import type { PushSubscription, PushNotificationPayload, ApiResponse } from '$lib/types/push';

/**
 * Convierte una clave base64 URL-safe a Uint8Array para la API de Push
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Servicio para gestionar las notificaciones push
 */
export const PushNotificationService = {
  /**
   * Comprueba si el navegador soporta notificaciones push
   */
  isSupported(): boolean {
    return 'serviceWorker' in navigator && 
           'PushManager' in window &&
           'Notification' in window;
  },
  
  /**
   * Comprueba si se ha concedido permiso para notificaciones
   */
  hasPermission(): boolean {
    return Notification.permission === 'granted';
  },
  
  /**
   * Solicita permiso para mostrar notificaciones
   */
  async requestPermission(): Promise<boolean> {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  },
  
  /**
   * Obtiene la clave pública VAPID del servidor
   */
  async getPublicKey(): Promise<string> {
    const response = await fetch('/api/push');
    const data = await response.json() as ApiResponse;
    
    if (!data.success || !data.publicKey) {
      throw new Error('No se pudo obtener la clave pública');
    }
    
    return data.publicKey;
  },
  
  /**
   * Comprueba si ya existe una suscripción activa
   */
  async hasSubscription(): Promise<boolean> {
    if (!this.isSupported()) return false;
    
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription !== null;
  },
  
  /**
   * Suscribe al usuario a notificaciones push
   */
  async subscribe(): Promise<boolean> {
    if (!this.isSupported()) {
      throw new Error('Este navegador no soporta notificaciones push');
    }
    
    // Solicitar permiso si no lo tenemos
    if (!this.hasPermission()) {
      const granted = await this.requestPermission();
      if (!granted) {
        throw new Error('Permiso de notificaciones denegado');
      }
    }
    
    // Obtener la clave pública
    const publicKey = await this.getPublicKey();
    const convertedKey = urlBase64ToUint8Array(publicKey);
    
    // Registrar la suscripción
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: convertedKey
    });
    
    // Enviar la suscripción al servidor
    const response = await fetch('/api/push', {
      method: 'POST',
      body: JSON.stringify(subscription),
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    const result = await response.json() as ApiResponse;
    return result.success;
  },
  
  /**
   * Cancela la suscripción a notificaciones push
   */
  async unsubscribe(): Promise<boolean> {
    if (!this.isSupported()) return false;
    
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    
    if (!subscription) return true;
    
    return subscription.unsubscribe();
  },
  
  /**
   * Envía una notificación push (solo llamar desde el servidor/admin)
   */
  async sendNotification(payload: PushNotificationPayload): Promise<ApiResponse> {
    const response = await fetch('/api/push', {
      method: 'PUT',
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    return await response.json() as ApiResponse;
  }
};