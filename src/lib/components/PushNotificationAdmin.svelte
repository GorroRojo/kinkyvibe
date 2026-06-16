<script lang="ts">
  import { PushNotificationService } from '$lib/services/pushNotificationService';
  import type { ApiResponse, PushNotificationPayload } from '$lib/types/push';
  
  let notificationData: PushNotificationPayload = {
    title: '',
    body: '',
    url: ''
  };
  
  let sending = false;
  let result: ApiResponse | null = null;
  
  function validateForm(): boolean {
    if (!notificationData.title) {
      alert('El título es obligatorio');
      return false;
    }
    
    if (!notificationData.body) {
      alert('El mensaje es obligatorio');
      return false;
    }
    
    return true;
  }
  
  async function sendNotification(): Promise<void> {
    if (!validateForm()) return;
    
    try {
      sending = true;
      result = null;
      
      result = await PushNotificationService.sendNotification(notificationData);
      
      if (result.success) {
        // Limpiar formulario tras envío exitoso
        notificationData = {
          title: '',
          body: '',
          url: ''
        };
      }
    } catch (error) {
      console.error('Error al enviar notificación:', error);
      result = { 
        success: false, 
        error: error instanceof Error ? error.message : 'Error desconocido' 
      };
    } finally {
      sending = false;
    }
  }
</script>

<div class="notification-form">
  <h2>Enviar notificación push</h2>
  
  <div class="form-group">
    <label for="title">Título <span class="required">*</span></label>
    <input 
      id="title"
      type="text" 
      bind:value={notificationData.title} 
      placeholder="Ej: Nuevo evento disponible" 
      required
    />
  </div>
  
  <div class="form-group">
    <label for="body">Mensaje <span class="required">*</span></label>
    <textarea 
      id="body"
      bind:value={notificationData.body} 
      placeholder="Ej: Hemos añadido un nuevo evento sobre shibari este fin de semana" 
      required
    ></textarea>
  </div>
  
  <div class="form-group">
    <label for="url">URL (opcional)</label>
    <input 
      id="url"
      type="text" 
      bind:value={notificationData.url} 
      placeholder="Ej: /calendario/nuevo-evento" 
    />
  </div>
  
  <button 
    on:click={sendNotification} 
    disabled={sending}
    class="send-button"
  >
    {sending ? 'Enviando...' : 'Enviar notificación'}
  </button>
  
  {#if result}
    <div class="result {result.success ? 'success' : 'error'}">
      {result.success 
        ? (result.message || '¡Notificación enviada correctamente!') 
        : `Error: ${result.error || 'Ha ocurrido un error inesperado'}`}
    </div>
  {/if}
</div>

<style>
  .notification-form {
    background: white;
    padding: 1.5em;
    border-radius: var(--round);
    margin: 1em 0;
    max-width: 600px;
  }
  
  h2 {
    margin-top: 0;
    color: var(--1);
    font-size: var(--step-1);
    margin-bottom: 1em;
  }
  
  .form-group {
    margin-bottom: 1em;
  }
  
  label {
    display: block;
    margin-bottom: 0.5em;
    color: var(--1);
  }
  
  .required {
    color: #d32f2f;
  }
  
  input, textarea {
    width: 100%;
    padding: 0.5em;
    border: 1px solid #ddd;
    border-radius: 0.3em;
    font-size: var(--step-0);
    transition: border-color 0.2s;
  }
  
  input:focus, textarea:focus {
    border-color: var(--1);
    outline: none;
  }
  
  textarea {
    min-height: 5em;
    resize: vertical;
  }
  
  .send-button {
    background: var(--1);
    color: white;
    border: none;
    padding: 0.6em 1.2em;
    border-radius: 0.3em;
    font-size: var(--step-0);
    cursor: pointer;
    transition: transform 100ms ease-in-out, background-color 100ms ease-in-out;
  }
  
  .send-button:hover:not(:disabled) {
    background: var(--1-light);
    transform: scale(1.05);
  }
  
  .send-button:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
  
  .result {
    margin-top: 1em;
    padding: 0.8em;
    border-radius: 0.3em;
    font-size: var(--step--1);
  }
  
  .success {
    background: rgba(46, 125, 50, 0.1);
    color: #2e7d32;
  }
  
  .error {
    background: rgba(211, 47, 47, 0.1);
    color: #d32f2f;
  }
</style>