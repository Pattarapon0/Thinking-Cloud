export class AddRoomButton {
    private container: HTMLDivElement;
    private onClick?: () => void;

    constructor() {
        this.container = document.createElement('div');
        this.setupStyles();
        this.createContent();
    }

    private setupStyles(): void {
        const style = document.createElement('style');
        style.textContent = `
            .add-room-button {
                position: fixed;
                bottom: 30px;
                right: 30px;
                padding: 15px 25px;
                border-radius: 25px;
                background: linear-gradient(135deg, #3b82f6, #2563eb);
                color: white;
                font-size: 1em;
                font-weight: 500;
                display: flex;
                align-items: center;
                gap: 8px;
                cursor: pointer;
                transition: all 0.3s ease;
                box-shadow: 0 4px 15px rgba(59, 130, 246, 0.3);
                border: none;
                z-index: 100;
            }

            .add-room-button:hover {
                transform: translateY(-2px) scale(1.02);
                box-shadow: 0 6px 20px rgba(59, 130, 246, 0.4);
                background: linear-gradient(135deg, #2563eb, #1d4ed8);
            }

            .add-room-button:active {
                transform: translateY(0) scale(0.98);
            }

            .plus-icon {
                width: 20px;
                height: 20px;
                position: relative;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .plus-icon::before,
            .plus-icon::after {
                content: '';
                position: absolute;
                background: white;
                border-radius: 2px;
            }

            .plus-icon::before {
                width: 2px;
                height: 16px;
            }

            .plus-icon::after {
                width: 16px;
                height: 2px;
            }
        `;
        document.head.appendChild(style);
    }

    private createContent(): void {
        this.container.className = 'add-room-button';
        
        // Create plus icon
        const plusIcon = document.createElement('div');
        plusIcon.className = 'plus-icon';
        this.container.appendChild(plusIcon);

        // Add text
        const text = document.createTextNode('Add Room');
        this.container.appendChild(text);

        // Add click handler
        this.container.onclick = () => {
            if (this.onClick) {
                this.onClick();
            }
        };
    }

    public setOnClick(callback: () => void): void {
        this.onClick = callback;
    }

    public attach(parent: HTMLElement): void {
        parent.appendChild(this.container);
    }

    public destroy(): void {
        if (this.container.parentElement) {
            this.container.parentElement.removeChild(this.container);
        }
    }
}
