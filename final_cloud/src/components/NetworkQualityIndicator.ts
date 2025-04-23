import { ConnectionStats } from '../networking/NetworkQuality';
import { DEBUG } from '../utils/constants';

type ViewMode = 'compact' | 'detailed';

export class NetworkQualityIndicator {
    private container: HTMLElement;
    private detailsContainer: HTMLElement;
    private viewMode: ViewMode = 'compact';
    private isVisible: boolean = true;
    private hideTimeout?: number;
    private stats?: ConnectionStats;

    constructor(initialViewMode: ViewMode = 'compact') {
        this.viewMode = initialViewMode;
        this.container = document.createElement('div');
        this.container.className = 'network-quality-indicator';
        
        this.detailsContainer = document.createElement('div');
        this.detailsContainer.className = 'network-details';
        this.container.appendChild(this.detailsContainer);

        this.setupStyles();
        this.setupEventListeners();
        document.body.appendChild(this.container);

        if (!DEBUG.network) {
            this.setupAutoHide();
        }
    }

    private setupStyles(): void {
        const style = document.createElement('style');
        style.textContent = `
            .network-quality-indicator {
                position: fixed;
                bottom: 10px;
                right: 10px;
                padding: 8px;
                border-radius: 8px;
                font-family: Arial, sans-serif;
                font-size: 14px;
                background: rgba(0, 0, 0, 0.85);
                color: white;
                cursor: pointer;
                transition: all 0.3s ease;
                z-index: 1000;
                display: flex;
                align-items: flex-start;
                gap: 8px;
                opacity: 1;
                backdrop-filter: blur(5px);
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
                min-width: 120px;
            }

            .network-quality-indicator.hidden {
                opacity: 0;
                pointer-events: none;
                transform: translateY(10px);
            }

            .network-quality-indicator .icon {
                width: 12px;
                height: 12px;
                border-radius: 50%;
                margin-right: 4px;
                position: relative;
                flex-shrink: 0;
            }

            .network-quality-indicator .icon::after {
                content: '';
                position: absolute;
                top: -2px;
                left: -2px;
                right: -2px;
                bottom: -2px;
                border-radius: 50%;
                opacity: 0.5;
            }

            .network-quality-indicator.excellent .icon {
                background: #27ae60;
            }
            .network-quality-indicator.excellent .icon::after {
                box-shadow: 0 0 8px #27ae60;
            }

            .network-quality-indicator.good .icon {
                background: #2ecc71;
            }
            .network-quality-indicator.good .icon::after {
                box-shadow: 0 0 8px #2ecc71;
            }

            .network-quality-indicator.fair .icon {
                background: #f1c40f;
            }
            .network-quality-indicator.fair .icon::after {
                box-shadow: 0 0 8px #f1c40f;
            }

            .network-quality-indicator.poor .icon {
                background: #e74c3c;
            }
            .network-quality-indicator.poor .icon::after {
                box-shadow: 0 0 8px #e74c3c;
            }

            .network-details {
                font-size: 12px;
                opacity: 0.8;
                margin-top: 4px;
                line-height: 1.4;
            }

            .network-quality-indicator.compact .network-details {
                display: none;
            }

            .network-details .metric {
                display: flex;
                justify-content: space-between;
                gap: 12px;
            }

            .network-details .metric .label {
                opacity: 0.7;
            }

            .network-details .metric .value {
                font-family: monospace;
            }

            @keyframes pulse {
                0% { transform: scale(1); }
                50% { transform: scale(1.1); }
                100% { transform: scale(1); }
            }

            .network-quality-indicator.poor .icon {
                animation: pulse 1s infinite;
            }

            .network-quality-indicator:hover {
                background: rgba(0, 0, 0, 0.95);
                transform: translateY(-2px);
            }

            .network-quality-indicator .status {
                flex-grow: 1;
            }

            .network-quality-indicator .toggle-view {
                opacity: 0.5;
                font-size: 16px;
                line-height: 1;
                padding: 2px;
                margin: -2px;
                transition: opacity 0.2s;
            }

            .network-quality-indicator .toggle-view:hover {
                opacity: 1;
            }

            .network-quality-indicator.detailed .toggle-view {
                transform: rotate(180deg);
            }
        `;
        document.head.appendChild(style);
    }

    private setupEventListeners(): void {
        this.container.addEventListener('click', (e) => {
            if ((e.target as HTMLElement).closest('.toggle-view')) {
                this.toggleViewMode();
            }
        });

        this.container.addEventListener('mouseenter', () => {
            this.cancelAutoHide();
        });

        this.container.addEventListener('mouseleave', () => {
            if (!DEBUG.network) {
                this.setupAutoHide();
            }
        });

        window.addEventListener('network-error', () => {
            this.show();
        });
    }

    private toggleViewMode(): void {
        this.viewMode = this.viewMode === 'compact' ? 'detailed' : 'compact';
        localStorage.setItem('network-quality-view-mode', this.viewMode);
        this.render();
    }

    private setupAutoHide(): void {
        this.hideTimeout = window.setTimeout(() => {
            this.isVisible = false;
            this.container.classList.add('hidden');
        }, 3000);
    }

    private cancelAutoHide(): void {
        if (this.hideTimeout) {
            clearTimeout(this.hideTimeout);
            this.hideTimeout = undefined;
        }
        this.show();
    }

    private show(): void {
        this.isVisible = true;
        this.container.classList.remove('hidden');
        if (!DEBUG.network && this.viewMode === 'compact') {
            this.setupAutoHide();
        }
    }

    private formatValue(value: number, unit: string, decimalPlaces: number = 1): string {
        return `${value.toFixed(decimalPlaces)}${unit}`.padStart(8);
    }

    private getMetricHTML(label: string, value: number, unit: string): string {
        return `
            <div class="metric">
                <span class="label">${label}:</span>
                <span class="value">${this.formatValue(value, unit)}</span>
            </div>
        `;
    }

    public updateStats(stats: ConnectionStats): void {
        this.stats = stats;
        this.show();
        this.render();
    }

    private render(): void {
        if (!this.stats) return;

        // Update quality class
        this.container.className = `network-quality-indicator ${this.stats.quality} ${this.viewMode}`;

        // Update content
        this.container.innerHTML = `
            <div class="icon"></div>
            <div class="status">
                ${this.stats.quality.charAt(0).toUpperCase() + this.stats.quality.slice(1)}
                ${this.viewMode === 'detailed' ? `
                    <div class="network-details">
                        ${this.getMetricHTML('Latency', this.stats.latency, 'ms')}
                        ${this.getMetricHTML('Jitter', this.stats.jitter, 'ms')}
                        ${this.getMetricHTML('Packet Loss', this.stats.packetLoss, '%')}
                        ${this.getMetricHTML('Bandwidth', this.stats.bandwidth, 'Kbps')}
                    </div>
                ` : ''}
            </div>
            <div class="toggle-view" title="Toggle details">⌃</div>
        `;
    }

    public setViewMode(mode: ViewMode): void {
        this.viewMode = mode;
        this.render();
    }

    public destroy(): void {
        if (this.hideTimeout) {
            clearTimeout(this.hideTimeout);
        }
        this.container.remove();
    }
}
