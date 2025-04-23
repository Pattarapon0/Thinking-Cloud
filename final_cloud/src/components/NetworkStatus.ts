import { NetworkErrorType } from '../utils/NetworkError';
import { DEBUG } from '../utils/constants';

export class NetworkStatus {
    private container: HTMLElement;
    private status: 'connected' | 'connecting' | 'disconnected' | 'error' | 'waiting-peers' | 'introvert' = 'disconnected';
    private peerCount: number = 0;

    constructor() {
        this.container = document.createElement('div');
        this.container.className = 'network-status';
        this.setupStyles();
        this.render();
        this.setupEventListeners();
        document.body.appendChild(this.container);
    }

    private setupStyles(): void {
        const style = document.createElement('style');
        style.textContent = `
            .network-status {
                position: fixed;
                top: 10px;
                right: 10px;
                padding: 8px 12px;
                border-radius: 4px;
                font-family: Arial, sans-serif;
                font-size: 14px;
                display: flex;
                align-items: center;
                gap: 8px;
                background: rgba(0, 0, 0, 0.8);
                color: white;
                transition: all 0.3s ease;
                z-index: 1000;
            }

            .network-status.connected {
                background: rgba(39, 174, 96, 0.8);
            }

            .network-status.connecting,
            .network-status.waiting-peers {
                background: rgba(241, 196, 15, 0.8);
            }

            .network-status.error {
                background: rgba(231, 76, 60, 0.8);
            }

            .network-status.introvert {
                background: rgba(142, 68, 173, 0.8);
            }

            .network-status .indicator {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: currentColor;
            }

            .network-status .peer-count {
                margin-left: 4px;
                font-size: 12px;
                opacity: 0.8;
            }

            .network-status.connecting .indicator,
            .network-status.waiting-peers .indicator {
                animation: pulse 1.5s infinite;
            }

            @keyframes pulse {
                0% { opacity: 1; }
                50% { opacity: 0.4; }
                100% { opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }

    private render(): void {
        const statusText = this.getStatusText();
        this.container.className = `network-status ${this.status}`;
        this.container.innerHTML = `
            <div class="indicator"></div>
            <span>${statusText}</span>
            ${this.peerCount > 0 ? `<span class="peer-count">(${this.peerCount} peers)</span>` : ''}
        `;
    }

    private getStatusText(): string {
        switch (this.status) {
            case 'connected':
                return 'Connected';
            case 'introvert':
                return 'Introvert Mode (Just you)';
            case 'connecting':
                return 'Connecting...';
            case 'error':
                return 'Connection Error';
            case 'waiting-peers':
                return 'Waiting for peers...';
            default:
                return 'Disconnected';
        }
    }

    private setupEventListeners(): void {
        window.addEventListener('network-error', ((event: CustomEvent) => {
            const { type, recoverable } = event.detail;
            this.setStatus('error');
            if (DEBUG.network) {
                console.log(`Network Status: Error - ${type} (${recoverable ? 'Recoverable' : 'Unrecoverable'})`);
            }
        }) as EventListener);

        // Hide on mouse over if in production
        if (!DEBUG.enabled) {
            let hideTimeout: number;
            this.container.addEventListener('mouseenter', () => {
                hideTimeout = window.setTimeout(() => {
                    this.container.style.opacity = '0';
                }, 2000);
            });
            this.container.addEventListener('mouseleave', () => {
                clearTimeout(hideTimeout);
                this.container.style.opacity = '1';
            });
        }
    }

    public getStatus(): 'connected' | 'connecting' | 'disconnected' | 'error' | 'waiting-peers' | 'introvert' {
        return this.status;
    }

    public setStatus(status: 'connected' | 'connecting' | 'disconnected' | 'error' | 'waiting-peers' | 'introvert'): void {
        this.status = status;
        this.render();
    }

    public updatePeerCount(count: number): void {
        this.peerCount = count;
        this.render();
    }

    public destroy(): void {
        this.container.remove();
    }
}
