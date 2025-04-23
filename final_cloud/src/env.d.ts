/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SIGNALING_SERVER_URL: string;
  readonly VITE_ENABLE_DEBUG: string;
  readonly VITE_DEBUG_PHYSICS: string;
  readonly VITE_DEBUG_NETWORK: string;
  readonly VITE_MAX_PEER_CONNECTIONS: string;
  readonly VITE_UPDATE_INTERVAL: string;
  readonly VITE_RECONNECT_ATTEMPTS: string;
  readonly VITE_RECONNECT_DELAY: string;
  readonly VITE_POSITION_SYNC_INTERVAL: string;
  readonly VITE_DRAG_SYNC_INTERVAL: string;
  readonly VITE_INITIAL_STATE_TIMEOUT: string;
  readonly VITE_INITIAL_STATE_RETRIES: string;
  readonly VITE_INITIAL_STATE_RETRY_DELAY: string;
  readonly VITE_RELIABLE_MESSAGE_TIMEOUT: string;
  readonly VITE_MAX_QUEUED_MESSAGES: string;
  readonly VITE_MAX_BODIES: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
