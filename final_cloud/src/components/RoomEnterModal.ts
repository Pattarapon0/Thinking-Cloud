export class RoomEnterModal {
    private container: HTMLDivElement;
    private content: HTMLDivElement;
    private form?: HTMLFormElement;
    private input?: HTMLInputElement;
    private errorDiv: HTMLDivElement;
    private onSubmit?: (password?: string) => void;
    private onCancel?: () => void;
    private previousActiveElement: HTMLElement | null;

    constructor(roomName: string, hasPassword: boolean, userStats?: { current: number; max: number }) {
        this.container = document.createElement('div');
        this.content = document.createElement('div');
        this.errorDiv = document.createElement('div');
        this.errorDiv.className = 'error-message';
        this.previousActiveElement = document.activeElement as HTMLElement;

        this.setupStyles();
        this.setupElements(roomName, hasPassword, userStats);
        this.setupEventListeners();
    }

    private setupElements(roomName: string, hasPassword: boolean, userStats?: { current: number; max: number }): void {
        this.container.className = 'room-enter-modal';
        this.content.className = 'modal-content';
        this.content.setAttribute('role', 'dialog');
        this.content.setAttribute('aria-modal', 'true');
        this.content.setAttribute('aria-labelledby', 'room-title');
        this.content.setAttribute('aria-describedby', 'modal-description');
        
        const userStatsText = userStats 
            ? `<span class="user-count">(${userStats.current}/${userStats.max} users)</span>`
            : '';

        this.content.innerHTML = `
            <div id="modal-description" class="sr-only">
                Enter the room ${roomName}. ${userStats ? `Current occupancy: ${userStats.current} out of ${userStats.max} users.` : ''} 
                ${hasPassword ? 'This room requires a password.' : 'No password required.'}
            </div>
            <div class="modal-header">
                <div class="room-icon">🚪</div>
                <h2 class="room-title">Enter Room</h2>
            </div>
            <div class="description">
                <span class="main-text">${roomName}</span>
                ${userStatsText}
            </div>
            <form role="form" aria-labelledby="room-title" aria-describedby="modal-description">
                ${hasPassword ? `
                    <div class="input-group">
                        <div class="input-wrapper">
                            <input type="password"
                                class="password-input"
                                placeholder="Enter room password"
                                required
                                minlength="4"
                                maxlength="20"
                                pattern="[A-Za-z0-9!@#$%^&*]+"
                                autocomplete="current-password"
                                aria-label="Room password"
                                aria-required="true">
                            <button type="button" 
                                class="toggle-password" 
                                aria-label="Toggle password visibility"
                                tabindex="0">
                                👁️
                            </button>
                        </div>
                        <div class="error-message" role="alert" aria-live="polite"></div>
                    </div>
                ` : ''}
                <div class="modal-buttons">
                    <button type="button" class="cancel-btn" aria-label="Cancel">Cancel</button>
                    <button type="submit" class="submit-btn">
                        Enter Room
                        <span aria-hidden="true">→</span>
                    </button>
                </div>
            </form>
        `;

        this.form = this.content.querySelector('form') || undefined;
        this.input = this.content.querySelector('.password-input') || undefined;
        this.container.appendChild(this.content);
    }

    private setupStyles(): void {
        const style = document.createElement('style');
        style.textContent = `
            .room-enter-modal {
                position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                background: rgba(0, 0, 0, 0.5); backdrop-filter: blur(5px);
                display: flex; align-items: center; justify-content: center;
                z-index: 1000; animation: fadeIn 0.2s ease;
            }
            .modal-content {
                background: white; border-radius: 12px; padding: 30px;
                width: 340px; border: 1px solid #e5e7eb;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); color: #1a1a2e;
                transform-origin: center; animation: scaleIn 0.2s ease;
            }
            .modal-header { text-align: center; margin-bottom: 15px; }
            .room-icon { font-size: 32px; margin-bottom: 15px; animation: bounce 1s ease infinite; }
            .room-title { font-size: 24px; margin: 0; font-weight: 600; color: #1a1a2e; }
            .description {
                text-align: center; color: #4b5563; margin: 10px 0 20px;
                font-size: 15px; line-height: 1.5; display: flex;
                align-items: center; justify-content: center; gap: 6px;
            }
            .description .main-text { color: #1a1a2e; font-weight: 500; }
            .description .user-count { color: #6b7280; font-size: 0.95em; }
            form { margin: 0; padding: 0; display: contents; }
            .input-group { margin: 20px 0; }
            .input-wrapper { position: relative; display: flex; align-items: center; }
            .password-input {
                width: 100%; padding: 12px 40px 12px 15px; border-radius: 6px;
                background: white; border: 1px solid #e5e7eb; color: #1a1a2e;
                font-size: 16px; transition: all 0.3s ease;
            }
            .password-input:focus {
                outline: none; border-color: #3b82f6;
                box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
            }
            .toggle-password {
                position: absolute; right: 12px; background: none; border: none;
                color: #6b7280; cursor: pointer; padding: 0; font-size: 18px;
                transition: color 0.3s;
            }
            .toggle-password:hover { color: #1a1a2e; }
            .error-message {
                color: #ff6b6b; font-size: 12px; margin-top: 5px;
                min-height: 15px; padding-left: 2px;
                opacity: 0; transition: opacity 0.3s;
            }
            .modal-buttons { display: flex; gap: 15px; margin-top: 20px; }
            .cancel-btn, .submit-btn {
                flex: 1; padding: 12px; border-radius: 6px; border: none;
                font-size: 15px; cursor: pointer; transition: all 0.3s ease;
            }
            .cancel-btn { background: #f3f4f6; color: #6b7280; }
            .cancel-btn:hover { background: #e5e7eb; }
            .submit-btn {
                background: #3b82f6; color: white; font-weight: 600; display: flex;
                align-items: center; justify-content: center; gap: 8px;
            }
            .submit-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3);
            }
            .password-input.error { 
                border-color: #ff6b6b; 
                animation: shake 0.5s; 
            }
            .password-input:invalid {
                border-color: #ff6b6b;
            }
            .password-input:valid {
                border-color: #22c55e;
            }
            .input-help {
                display: block;
                color: #6b7280;
                font-size: 0.8em;
                margin-top: 4px;
                margin-left: 2px;
            }
            input:invalid + .input-help {
                color: #ef4444;
            }
            input:valid + .input-help {
                color: #22c55e;
            }
            .sr-only {
                position: absolute;
                width: 1px;
                height: 1px;
                padding: 0;
                margin: -1px;
                overflow: hidden;
                clip: rect(0, 0, 0, 0);
                white-space: nowrap;
                border: 0;
            }
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes scaleIn { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }
            @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
            @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
        `;
        document.head.appendChild(style);
    }

    private setupEventListeners(): void {
        // Form submission
        this.form?.addEventListener('submit', (e) => {
            e.preventDefault();
            const password = this.input?.value;
            if (this.onSubmit) {
                this.onSubmit(password);
            }
        });

        // Cancel button
        const cancelBtn = this.content.querySelector('.cancel-btn');
        cancelBtn?.addEventListener('click', () => {
            if (this.onCancel) {
                this.onCancel();
            }
        });

        // Password toggle
        const toggleBtn = this.content.querySelector('.toggle-password');
        toggleBtn?.addEventListener('click', () => {
            if (this.input) {
                const type = this.input.type === 'password' ? 'text' : 'password';
                this.input.type = type;
                toggleBtn.textContent = type === 'password' ? '👁️' : '👁️‍🗨️';
            }
        });

        // Close on overlay click
        this.container.addEventListener('click', (e) => {
            if (e.target === this.container) {
                this.cancel();
            }
        });

        // Keyboard navigation and focus trap
        this.container.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                this.cancel();
                return;
            }

            // Handle Enter key for buttons
            if (e.key === 'Enter' && document.activeElement?.tagName === 'BUTTON') {
                e.preventDefault();
                (document.activeElement as HTMLButtonElement).click();
                return;
            }

            // Handle Tab key for focus trap
            if (e.key === 'Tab') {
                const focusableElements = this.content.querySelectorAll<HTMLElement>(
                    'button:not([aria-hidden="true"]), input:not([aria-hidden="true"]), [tabindex]:not([tabindex="-1"])'
                );
                const firstElement = focusableElements[0];
                const lastElement = focusableElements[focusableElements.length - 1];

                if (e.shiftKey) {
                    // If shift + tab and on first element, move to last
                    if (document.activeElement === firstElement) {
                        e.preventDefault();
                        lastElement.focus();
                    }
                } else {
                    // If tab and on last element, move to first
                    if (document.activeElement === lastElement) {
                        e.preventDefault();
                        firstElement.focus();
                    }
                }
            }
        });

        // Input validation
        if (this.input) {
            this.input.addEventListener('input', () => {
                if (this.input!.validity.valid) {
                    this.input!.classList.remove('error');
                    this.hideError();
                } else if (this.input!.value) {
                    this.input!.classList.add('error');
                    this.showError('Password must be 4-20 characters with allowed special characters');
                }
            });
        }
    }

    public attach(parent: HTMLElement): void {
        parent.appendChild(this.container);
        // Focus first input or submit button
        setTimeout(() => {
            const firstInput = this.input || this.content.querySelector('.submit-btn') as HTMLElement;
            firstInput?.focus();
        }, 100);
    }

    public showError(message: string): void {
        this.errorDiv.textContent = message;
        this.errorDiv.style.opacity = '1';
    }

    public hideError(): void {
        this.errorDiv.style.opacity = '0';
    }

    private cancel(): void {
        if (this.onCancel) {
            this.onCancel();
        }
    }

    public destroy(): void {
        if (this.container.parentElement) {
            if (this.previousActiveElement?.focus) {
                this.previousActiveElement.focus();
            }
            this.container.parentElement.removeChild(this.container);
        }
    }
}
