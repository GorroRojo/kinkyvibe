<script lang="ts">
  import { onMount } from 'svelte';
  import { PushNotificationService } from '$lib/services/pushNotificationService';
  
  let supported = false;
  let subscribed = false;
  let loading = true;
  let errorMessage: string | null = null;
  
  onMount(async () => {
    try {
      // Verificar si el navegador soporta notificaciones push
      console.log('mount test')
      supported = PushNotificationService.isSupported();
      console.log('notificaciones supported, supported', supported)
      
      if (supported) {
        // Verificar si ya estamos suscritos
        console.log('test suscribed')

        subscribed = await PushNotificationService.hasSubscription();
        console.log('suscribed', subscribed)
      }
    } catch (error) {
      console.error('Error al inicializar notificaciones:', error);
      errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    } finally {
        console.log('loading false')
      loading = false;
    }
  });
  
  async function subscribe(): Promise<void> {
    try {
      loading = true;
      errorMessage = null;
      
      const success = await PushNotificationService.subscribe();
      if (success) {
        subscribed = true;
      } else {
        throw new Error('No se pudo completar la suscripción');
      }
    } catch (error) {
      console.error('Error al suscribirse:', error);
      errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    } finally {
      loading = false;
    }
  }
  
  async function unsubscribe(): Promise<void> {
    try {
      loading = true;
      errorMessage = null;
      
      const success = await PushNotificationService.unsubscribe();
      if (success) {
        subscribed = false;
      } else {
        throw new Error('No se pudo cancelar la suscripción');
      }
    } catch (error) {
      console.error('Error al cancelar suscripción:', error);
      errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    } finally {
      loading = false;
    }
  }
</script>

<div class="push-notification-control">
  {#if loading}
    <p>Cargando...</p>
  {:else if !supported}
    <p class="warning">Tu navegador no soporta notificaciones push.</p>
  {:else if subscribed}
    <button on:click={unsubscribe} class="btn-unsub" disabled={loading}>
      {loading ? 'Procesando...' : 'Desactivar notificaciones'}
    </button>
  {:else}
    <button on:click={subscribe} class="btn-sub" disabled={loading}>
      {loading ? 'Procesando...' : 'Activar notificaciones de nuevos eventos y materiales'}
    </button>
  {/if}
  
  {#if errorMessage}
    <p class="error">{errorMessage}</p>
  {/if}
</div>

<style>
  .push-notification-control {
    margin: 1em 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5em;
  }
  
  button {
    padding: 0.5em 1em;
    border-radius: 0.3em;
    font-size: var(--step-0);
    cursor: pointer;
    transition: transform 100ms ease-in-out;
    min-width: 200px;
  }
  
  .btn-sub {
    background-color: var(--1);
    color: white;
    border: none;
  }
  
  .btn-sub:hover:not(:disabled) {
    background-color: var(--1-light);
    transform: scale(1.05);
  }
  
  .btn-unsub {
    background-color: white;
    color: var(--1);
    border: 1px solid var(--1);
  }
  
  .btn-unsub:hover:not(:disabled) {
    background-color: #f8f8f8;
    transform: scale(1.05);
  }
  
  button:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
  
  .error {
    color: #d32f2f;
    font-size: var(--step--1);
    background: rgba(211, 47, 47, 0.1);
    padding: 0.5em 1em;
    border-radius: 0.3em;
    text-align: center;
    max-width: 400px;
  }
  
  .warning {
    color: #ed6c02;
    font-size: var(--step--1);
  }
</style>