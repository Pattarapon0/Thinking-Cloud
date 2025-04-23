import { DEBUG } from './constants';

export enum NetworkErrorType {
    SIGNALING_CONNECTION_FAILED = 'SIGNALING_CONNECTION_FAILED',
    PEER_CONNECTION_FAILED = 'PEER_CONNECTION_FAILED',
    INVALID_MESSAGE = 'INVALID_MESSAGE',
    PEER_NOT_FOUND = 'PEER_NOT_FOUND',
    MAX_PEERS_REACHED = 'MAX_PEERS_REACHED',
    SIGNALING_SERVER_ERROR = 'SIGNALING_SERVER_ERROR',
    DATA_CHANNEL_ERROR = 'DATA_CHANNEL_ERROR',
    ICE_CONNECTION_FAILED = 'ICE_CONNECTION_FAILED',
    POOR_CONNECTION = 'POOR_CONNECTION'
}

export class NetworkError extends Error {
    constructor(
        public type: NetworkErrorType,
        public details?: any,
        public recoverable: boolean = true
    ) {
        super(`Network Error: ${type}${details ? ` - ${JSON.stringify(details)}` : ''}`);
        this.name = 'NetworkError';
    }

    public isRecoverable(): boolean {
        return this.recoverable;
    }

    public static isNetworkError(error: any): error is NetworkError {
        return error instanceof NetworkError;
    }
}

export class NetworkErrorHandler {
    private static logError(error: NetworkError): void {
        if (DEBUG.network || !error.recoverable) {
            console.error(error.message, error.details);
        }
    }

    public static handle(error: NetworkError): void {
        this.logError(error);

        // Handle different error types
        switch (error.type) {
            case NetworkErrorType.SIGNALING_CONNECTION_FAILED:
                if (error.recoverable) {
                    console.info('Attempting to reconnect to signaling server...');
                }
                break;

            case NetworkErrorType.PEER_CONNECTION_FAILED:
                if (error.recoverable) {
                    console.info('Attempting to reestablish peer connection...');
                }
                break;

            case NetworkErrorType.MAX_PEERS_REACHED:
                console.warn('Maximum number of peer connections reached');
                break;

            case NetworkErrorType.ICE_CONNECTION_FAILED:
                if (error.recoverable) {
                    console.info('Attempting to renegotiate ICE connection...');
                }
                break;

            case NetworkErrorType.POOR_CONNECTION:
                console.warn('Poor connection quality detected:', error.details);
                break;

            default:
                if (!error.recoverable) {
                    console.error('Unrecoverable network error:', error.type);
                }
        }

        // Dispatch error event for UI handling
        window.dispatchEvent(new CustomEvent('network-error', {
            detail: {
                type: error.type,
                recoverable: error.recoverable,
                message: error.message,
                details: error.details
            }
        }));
    }

    public static async retry<T>(
        operation: () => Promise<T>,
        maxAttempts: number,
        delay: number,
        errorType: NetworkErrorType
    ): Promise<T> {
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error as Error;
                if (attempt < maxAttempts) {
                    if (DEBUG.network) {
                        console.warn(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
                    }
                    await new Promise(resolve => setTimeout(resolve, delay));
                    delay *= 2; // Exponential backoff
                }
            }
        }

        throw new NetworkError(errorType, { attempts: maxAttempts, originalError: lastError });
    }
}
