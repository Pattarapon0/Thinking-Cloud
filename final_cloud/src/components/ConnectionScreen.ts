export class ConnectionScreen {
    private container: HTMLDivElement;
    private statusElement: HTMLDivElement;
    private loadingElement: HTMLDivElement;
    
    constructor() {
        this.container = document.createElement('div');
        this.statusElement = document.createElement('div');
        this.loadingElement = document.createElement('div');
        this.setupStyles();
        this.setupElements();
    }

    private setupStyles(): void {
        const style = document.createElement('style');
        style.textContent = `
            .connection-screen {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: rgba(0, 0, 0, 0.9);
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                z-index: 9999;
                transition: opacity 0.5s ease;
            }

            .connection-status {
                padding: 16px 24px;
                border-radius: 8px;
                font-family: Arial, sans-serif;
                font-size: 18px;
                display: flex;
                align-items: center;
                gap: 12px;
                background: rgba(0, 0, 0, 0.8);
                color: white;
                margin-bottom: 20px;
            }

            .connection-status.connected {
                background: rgba(39, 174, 96, 0.8);
            }

            .connection-status.connecting,
            .connection-status.waiting-peers {
                background: rgba(241, 196, 15, 0.8);
                color: #000;
            }

            .connection-status.error {
                background: rgba(231, 76, 60, 0.8);
            }

            .connection-status .indicator {
                width: 10px;
                height: 10px;
                border-radius: 50%;
                background: currentColor;
            }

            .loading-dots {
                display: flex;
                gap: 8px;
                margin-top: 12px;
            }

            .loading-dots .dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: #FFF;
                animation: pulse 1.5s infinite;
            }

            .loading-dots .dot:nth-child(2) {
                animation-delay: 0.2s;
            }

            .loading-dots .dot:nth-child(3) {
                animation-delay: 0.4s;
            }

            @keyframes pulse {
                0%, 100% { opacity: 0.3; transform: scale(1); }
                50% { opacity: 1; transform: scale(1.2); }
            }
        `;
        document.head.appendChild(style);
    }

    private setupElements(): void {
        // Setup container
        this.container.className = 'connection-screen';
        
        // Setup status element
        this.statusElement.className = 'connection-status connecting';
        this.statusElement.innerHTML = `
            <div class="indicator"></div>
            <span>Connecting to server...</span>
        `;
        
        // Setup loading dots
        this.loadingElement.className = 'loading-dots';
        this.loadingElement.innerHTML = `
            <div class="dot"></div>
            <div class="dot"></div>
            <div class="dot"></div>
        `;
        
        // Assemble elements
        this.container.appendChild(this.statusElement);
        this.container.appendChild(this.loadingElement);
        document.body.appendChild(this.container);
    }

    public updateStatus(status: 'connected' | 'connecting' | 'error' | 'waiting-peers', message: string): void {
        this.statusElement.className = `connection-status ${status}`;
        this.statusElement.innerHTML = `
            <div class="indicator"></div>
            <span>${message}</span>
        `;
    }

    public hide(): void {
        this.container.style.opacity = '0';
        setTimeout(() => {
            this.container.style.display = 'none';
        }, 500);
    }

    public show(): void {
        this.container.style.display = 'flex';
        // Force reflow
        this.container.offsetHeight;
        this.container.style.opacity = '1';
    }

    public destroy(): void {
        this.container.remove();
    }
}
