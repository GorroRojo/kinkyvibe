export interface PushSubscription {
    endpoint: string;
    expirationTime: number | null;
    keys: {
      p256dh: string;
      auth: string;
    };
  }
  
  export interface PushNotificationPayload {
    title: string;
    body: string;
    url?: string;
    icon?: string;
    badge?: string;
  }
  
  export interface ApiResponse {
    success: boolean;
    error?: string;
    message?: string;
    publicKey?: string;
    results?: string[];
  }