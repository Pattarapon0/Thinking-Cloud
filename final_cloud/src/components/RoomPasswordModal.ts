export class RoomPasswordModal {
    private container: HTMLDivElement;
    private content: HTMLDivElement;
    private input: HTMLInputElement;
    private errorDiv: HTMLDivElement;
    private onSubmit?: (password: string) => void;
    private onCancel?: () => void;

    constructor(roomName: string) {
        this.container = document.createElement('div');
        this.content = document.createElement('div');
        this.input = document.createElement('input');
        this.errorDiv = document.createElement('div');
        
        this.setupElements(roomName);
        this.setupStyles();
        this.setupEventListeners();
    }

    private setupElements(roomName: string): void {
        // Container setup
        this.container.className = 'room-password-modal';
        
        // Content setup
        this.content.className = 'modal-content';
        
        // Header with lock icon and room name
        const header = document.createElement('header');
        header.className = 'modal-header';
        
        const icon = document.createElement('div');
        icon.className = 'lock-icon';
        icon.textContent = '🔒';
        
        const title = document.createElement('h2');
        title.className = 'room-title';
        title.textContent = roomName;

        header.appendChild(icon);
        header.appendChild(title);

        // Input group setup
        const inputGroup = document.createElement('div');
        inputGroup.className = 'input-group';

        const inputWrapper = document.createElement('div');
        inputWrapper.className = 'input-wrapper';

        this.input.className = 'password-input';
        this.input.type = 'password';
        this.input.placeholder = 'Enter room password';

        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'toggle-password';
        toggleBtn.textContent = '👁️';
        toggleBtn.onclick = () => {
            this.input.type = this.input.type === 'password' ? 'text' : 'password';
            toggleBtn.textContent = this.input.type === 'password' ? '👁️' : '👁️‍🗨️';
        };

        inputWrapper.appendChild(this.input);
        inputWrapper.appendChild(toggleBtn);

        this.errorDiv.className = 'error-message';
        inputGroup.appendChild(inputWrapper);
        inputGroup.appendChild(this.errorDiv);

        // Button group setup
        const buttonGroup = document.createElement('div');
        buttonGroup.className = 'modal-buttons';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'cancel-btn';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.onclick = () => this.handleCancel();

        const submitBtn = document.createElement('button');
        submitBtn.className = 'submit-btn';
        submitBtn.innerHTML = '<span class="btn-icon">→</span><span class="btn-text">Join Room</span>';
        submitBtn.onclick = () => this.handleSubmit();

        buttonGroup.appendChild(cancelBtn);
        buttonGroup.appendChild(submitBtn);

        // Assemble all parts
        this.content.appendChild(header);
        this.content.appendChild(inputGroup);
        this.content.appendChild(buttonGroup);
        this.container.appendChild(this.content);
    }

    private setupStyles(): void {
        const style = document.createElement('style');
        style.textContent = `
            .room-password-modal {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: rgba(0, 0, 0, 0.5);
                backdrop-filter: blur(5px);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 1000;
                animation: fadeIn 0.2s ease;
            }

            .modal-content {
                background: white;
                border-radius: 12px;
                padding: 30px;
                width: 340px;
                border: 1px solid #e5e7eb;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                color: #1a1a2e;
                transform-origin: center;
                animation: scaleIn 0.2s ease;
            }

            .modal-header {
                text-align: center;
                margin-bottom: 25px;
            }

            .lock-icon {
                font-size: 32px;
                margin-bottom: 15px;
                animation: bounce 1s ease infinite;
            }

            .room-title {
                font-size: 24px;
                margin: 0;
                font-weight: 600;
                color: #1a1a2e;
            }

            .input-group {
                margin: 25px 0;
            }

            .input-wrapper {
                position: relative;
                display: flex;
                align-items: center;
            }

            .password-input {
                width: 100%;
                padding: 12px 40px 12px 15px;
                border-radius: 6px;
                background: white;
                border: 1px solid #e5e7eb;
                color: #1a1a2e;
                font-size: 16px;
                transition: all 0.3s ease;
            }

            .password-input:focus {
                outline: none;
                border-color: #3b82f6;
                box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
            }

            .toggle-password {
                position: absolute;
                right: 12px;
                background: none;
                border: none;
                color: #6b7280;
                cursor: pointer;
                padding: 0;
                font-size: 18px;
                transition: color 0.3s;
            }

            .toggle-password:hover {
                color: #1a1a2e;
            }

            .error-message {
                color: #ff6b6b;
                font-size: 12px;
                margin-top: 5px;
                min-height: 15px;
                padding-left: 15px;
                opacity: 0;
                transition: opacity 0.3s;
            }

            .modal-buttons {
                display: flex;
                gap: 15px;
                margin-top: 10px;
            }

            .cancel-btn, .submit-btn {
                flex: 1;
                padding: 12px;
                border-radius: 12px;
                border: none;
                font-size: 15px;
                cursor: pointer;
                transition: all 0.3s ease;
            }

            .cancel-btn {
                background: #f3f4f6;
                color: #6b7280;
            }

            .cancel-btn:hover {
                background: #e5e7eb;
            }

            .submit-btn {
                background: #3b82f6;
                color: white;
                font-weight: 600;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
            }

            .submit-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3);
            }

            .password-input.error {
                border-color: #ff6b6b;
                animation: shake 0.5s;
            }

            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }

            @keyframes scaleIn {
                from { transform: scale(0.8); opacity: 0; }
                to { transform: scale(1); opacity: 1; }
            }

            @keyframes bounce {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-5px); }
            }

            @keyframes shake {
                0%, 100% { transform: translateX(0); }
                25% { transform: translateX(-5px); }
                75% { transform: translateX(5px); }
            }
        `;
        document.head.appendChild(style);
    }

    private setupEventListeners(): void {
        // ESC key to cancel
        window.addEventListener('keydown', this.handleKeyPress);
        
        // Click outside to cancel
        this.container.addEventListener('click', this.handleOutsideClick);
        
        // Enter key to submit
        this.input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.handleSubmit();
            }
        });
    }

    private handleKeyPress = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') {
            this.handleCancel();
        }
    };

    private handleOutsideClick = (e: MouseEvent): void => {
        if (e.target === this.container) {
            this.handleCancel();
        }
    };

    private handleSubmit(): void {
        const password = this.input.value.trim();
        if (!password) {
            this.showError('Please enter password');
            return;
        }
        this.onSubmit?.(password);
    }

    private handleCancel(): void {
        this.onCancel?.();
    }

    public showError(message: string): void {
        this.errorDiv.textContent = message;
        this.errorDiv.style.opacity = '1';
        this.input.classList.add('error');

        // Clear error state after animation
        setTimeout(() => {
            this.input.classList.remove('error');
        }, 500);
    }

    public attach(parent: HTMLElement): void {
        parent.appendChild(this.container);
        // Focus input after animation
        setTimeout(() => {
            this.input.focus();
        }, 200);
    }

    public destroy(): void {
        // Clean up event listeners
        window.removeEventListener('keydown', this.handleKeyPress);
        this.container.remove();
    }

    public setOnSubmit(callback: (password: string) => void): void {
        this.onSubmit = callback;
    }

    public setOnCancel(callback: () => void): void {
        this.onCancel = callback;
    }
}
