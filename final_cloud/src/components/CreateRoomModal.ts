interface CreateRoomFormData {
    name: string;
    password?: string;
    maxUsers: number;
    maxTexts: number;
}

export class CreateRoomModal {
    private container: HTMLDivElement;
    private formData: CreateRoomFormData;
    private onSubmit?: (data: CreateRoomFormData) => void;
    private onClose?: () => void;
    private errorTimeout?: number;
    private previousActiveElement: HTMLElement | null;

    constructor() {
        this.container = document.createElement('div');
        this.previousActiveElement = document.activeElement as HTMLElement;
        this.formData = {
            name: '',
            maxUsers: 10,
            maxTexts: 50
        };
        this.setupStyles();
        this.createContent();
    }

    private setupStyles(): void {
        const style = document.createElement('style');
        style.textContent = `
            .modal-overlay {
            box-sizing: border-box;
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(4px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            animation: fadeIn 0.2s ease;
            }

            .modal-content {
            box-sizing: border-box;
            background: white;
            border-radius: 12px;
            padding: 24px;
            width: 100%;
            max-width: 400px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
            animation: slideUp 0.3s ease;
            margin: 0 16px;
            }

            .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            }

            .modal-title {
            font-size: 1.5em;
            font-weight: 600;
            color: #1a1a2e;
            margin: 0;
            }

            .close-button {
            background: none;
            border: none;
            font-size: 1.5em;
            color: #666;
            cursor: pointer;
            padding: 4px;
            margin: -4px;
            opacity: 0.7;
            transition: opacity 0.2s;
            }

            .close-button:hover {
            opacity: 1;
            }

            .form-group {
            margin-bottom: 16px;
            }

            .form-label {
                display: block;
                font-size: 0.9em;
                color: #666;
                margin-bottom: 6px;
            }

            .input-help {
                display: block;
                color: #6b7280;
                font-size: 0.8em;
                margin-top: 4px;
                margin-left: 2px;
            }

            /* Show red text for invalid input */
            input:invalid + .input-help {
                color: #ef4444;
            }

            .form-input {
                width: 100%;
                padding: 8px 12px;
                border: 2px solid #e2e8f0;
                border-radius: 6px;
                font-size: 1em;
                color: #1a1a2e;
                transition: all 0.2s ease;
                box-sizing: border-box;
            }

            .form-input:focus {
                outline: none;
                border-color: #3b82f6;
                box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
            }

            .form-input:invalid {
                border-color: #ff6b6b;
                color: #ef4444;
            }

            .form-input:valid {
                border-color: #22c55e;
                color: #1a1a2e;
            }

            /* Show validation state text colors */
            input:invalid + .input-help {
                color: #ef4444;
            }

            input:valid + .input-help {
                color: #22c55e;
            }

            .form-input.error {
                border-color: #ff6b6b;
                animation: shake 0.5s;
            }

            .buttons {
            display: flex;
            justify-content: flex-end;
            gap: 12px;
            margin-top: 24px;
            }

            .button {
            padding: 8px 16px;
            border-radius: 6px;
            font-size: 0.9em;
            cursor: pointer;
            transition: all 0.2s;
            }

            .cancel-button {
            background: #f1f5f9;
            border: none;
            color: #64748b;
            }

            .cancel-button:hover,
            .cancel-button:focus {
                background: #e2e8f0;
                outline: none;
                box-shadow: 0 0 0 3px rgba(100, 116, 139, 0.2);
            }

            .submit-button {
                background: #3b82f6;
                border: none;
                color: white;
                position: relative;
                overflow: hidden;
            }

            .submit-button:hover,
            .submit-button:focus {
                background: #2563eb;
                outline: none;
                box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.3);
            }

            /* Ripple effect for buttons */
            .button::after {
                content: '';
                position: absolute;
                top: 50%;
                left: 50%;
                width: 5px;
                height: 5px;
                background: rgba(255, 255, 255, 0.5);
                opacity: 0;
                border-radius: 100%;
                transform: scale(1, 1) translate(-50%, -50%);
                transform-origin: 50% 50%;
            }

            .button:focus:not(:active)::after {
                animation: ripple 1s ease-out;
            }

            @keyframes ripple {
                0% {
                    transform: scale(0, 0) translate(-50%, -50%);
                    opacity: 0.5;
                }
                100% {
                    transform: scale(50, 50) translate(-50%, -50%);
                    opacity: 0;
                }
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

            .error-popup {
                position: fixed;
                top: 20px;
                right: 20px;
            background: #ef4444;
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(239, 68, 68, 0.2);
            z-index: 1100;
            animation: slideIn 0.3s ease;
            }

            @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
            }

            @keyframes slideUp {
            from { transform: translateY(20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
            }

            @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
            }

            .shake {
            animation: shake 0.4s ease;
            }

            @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-4px); }
            75% { transform: translateX(4px); }
            }
        `;
        document.head.appendChild(style);
    }

    private createContent(): void {
        this.container.className = 'modal-overlay';
        this.container.innerHTML = `
            <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="modal-title" aria-describedby="modal-description">
                <div id="modal-description" class="sr-only">
                    Create a new room by entering a name, optional password, and configuring user and text limits
                </div>
                <div class="modal-header">
                    <h2 class="modal-title" id="modal-title">Create New Room</h2>
                    <button class="close-button" aria-label="Close" tabindex="0">&times;</button>
                </div>
                <form role="form" aria-labelledby="modal-title">
                    <!-- Hidden username for password managers -->
                    <input type="text" 
                        name="username" 
                        autocomplete="username" 
                        style="display: none" 
                        aria-hidden="true">
            <div class="form-group">
                <label class="form-label" for="room-name">Room Name</label>
                <input type="text" 
                    id="room-name"
                    class="form-input" 
                    name="name" 
                    required
                    pattern="[A-Za-z0-9\\s]+"
                    title="Letters, numbers and spaces only"
                    minlength="1"
                    maxlength="50"
                    autocomplete="off"
                    aria-describedby="name-help">
                <small id="name-help" class="input-help">Use letters, numbers and spaces only (e.g. My Room 123)</small>
                    </div>
            <div class="form-group">
                <label class="form-label" for="room-password">Password (optional)</label>
                <input type="password" 
                    id="room-password"
                    class="form-input" 
                    name="password"
                    autocomplete="new-password"
                    pattern="[A-Za-z0-9!@#$%^&*]+"
                    minlength="4"
                    maxlength="20"
                    title="4-20 characters: letters, numbers, and special characters (!@#$%^&*)"
                    aria-describedby="password-help">
                <small id="password-help" class="input-help">4-20 characters: letters, numbers, and special characters (!@#$%^&*)</small>
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="max-users">Max Users</label>
                        <input type="number" 
                            id="max-users"
                            class="form-input" 
                            name="maxUsers" 
                            value="10"
                            min="1"
                            max="100000"
                            required
                            autocomplete="off"
                            title="Enter a number between 1 and 100,000"
                            aria-describedby="max-users-help">
                        <small id="max-users-help" class="input-help">Enter a number between 1 and 100,000</small>
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="max-texts">Max Text Bodies</label>
                        <input type="number" 
                            id="max-texts"
                            class="form-input" 
                            name="maxTexts" 
                            value="50"
                            min="1"
                            max="100000"
                            required
                            autocomplete="off"
                            title="Enter a number between 1 and 100,000"
                            aria-describedby="max-texts-help">
                        <small id="max-texts-help" class="input-help">Enter a number between 1 and 100,000</small>
                    </div>
                    <div class="buttons">
                        <button type="button" 
                            class="button cancel-button" 
                            tabindex="0"
                            aria-label="Cancel room creation">Cancel</button>
                        <button type="submit" 
                            class="button submit-button" 
                            tabindex="0"
                            aria-label="Create room with specified settings">Create Room</button>
                    </div>
                </form>
            </div>
        `;

        // Add event listeners
        this.container.querySelector('.close-button')?.addEventListener('click', () => this.close());
        this.container.querySelector('.cancel-button')?.addEventListener('click', () => this.close());
        this.container.querySelector('form')?.addEventListener('submit', (e) => this.handleSubmit(e));
        this.container.addEventListener('click', (e) => {
            if (e.target === this.container) {
                this.close();
            }
        });

        // Add input validation feedback
        const form = this.container.querySelector('form');
        const inputs = form?.querySelectorAll<HTMLInputElement>('input:not([type="hidden"])');
        
        inputs?.forEach((input: HTMLInputElement) => {
            input.addEventListener('input', () => {
                if (input.validity.valid) {
                    input.classList.remove('error');
                    input.setAttribute('aria-invalid', 'false');
                } else if (input.value) {
                    input.classList.add('error');
                    input.setAttribute('aria-invalid', 'true');

                    // Show appropriate error message based on input type
                    let errorMessage = '';
                    switch (input.name) {
                        case 'name':
                            errorMessage = 'Room name must contain only letters, numbers, and spaces';
                            break;
                        case 'password':
                            errorMessage = 'Password must be 4-20 characters with allowed special characters';
                            break;
                        case 'maxUsers':
                        case 'maxTexts':
                            errorMessage = 'Value must be between 1 and 100,000';
                            break;
                    }
                    if (errorMessage) {
                        this.showError(errorMessage);
                    }
                }
            });
        });
    }

    private handleSubmit(event: Event): void {
        event.preventDefault();
        const form = event.target as HTMLFormElement;
        
        // Check all inputs for validity
        const inputs = form.querySelectorAll<HTMLInputElement>('input:not([type="hidden"])');
        for (const input of inputs) {
            if (!input.validity.valid) {
                input.focus();
                let errorMessage = '';
                switch (input.name) {
                    case 'name':
                        errorMessage = 'Room name must contain only letters, numbers, and spaces';
                        break;
                    case 'password':
                        if (input.value) { // Only validate if password is provided
                            errorMessage = 'Password must be 4-20 characters with allowed special characters';
                        }
                        break;
                    case 'maxUsers':
                    case 'maxTexts':
                        errorMessage = 'Value must be between 1 and 100,000';
                        break;
                }
                if (errorMessage) {
                    this.showError(errorMessage);
                    return;
                }
            }
        }

        const formData = new FormData(form);
        const name = formData.get('name') as string;
        const password = formData.get('password') as string;
        const maxUsers = Number(formData.get('maxUsers'));
        const maxTexts = Number(formData.get('maxTexts'));

        this.formData = {
            name: name.trim(),
            password: password || undefined,
            maxUsers,
            maxTexts
        };

        if (this.onSubmit) {
            this.onSubmit(this.formData);
        }
        this.close();
    }

    private showError(message: string): void {
        const existingError = document.querySelector('.error-popup');
        if (existingError) {
            existingError.remove();
        }

        const error = document.createElement('div');
        error.className = 'error-popup';
        error.setAttribute('role', 'alert');
        error.setAttribute('aria-live', 'assertive');
        error.textContent = message;
        error.setAttribute('aria-atomic', 'true');
        document.body.appendChild(error);

        if (this.errorTimeout) {
            clearTimeout(this.errorTimeout);
        }

        this.errorTimeout = window.setTimeout(() => {
            error.style.animation = 'slideIn 0.3s ease reverse';
            setTimeout(() => error.remove(), 300);
        }, 3000);
    }

    public setOnSubmit(callback: (data: CreateRoomFormData) => void): void {
        this.onSubmit = callback;
    }

    public setOnClose(callback: () => void): void {
        this.onClose = callback;
    }

    public attach(parent: HTMLElement): void {
        parent.appendChild(this.container);

        // Focus management
        const firstInput = this.container.querySelector<HTMLInputElement>('#room-name');
        setTimeout(() => {
            firstInput?.focus();
        }, 100);

        // Trap focus within modal
        this.container.addEventListener('keydown', (e: KeyboardEvent) => {
            // Handle Escape key
            if (e.key === 'Escape') {
                e.preventDefault();
                this.close();
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
                const focusableElements = this.container.querySelectorAll<HTMLElement>(
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
    }

    private close(): void {
        if (this.onClose) {
            this.onClose();
        }
        this.destroy();
    }

    public destroy(): void {
        if (this.container.parentElement) {
            // Return focus to the element that had focus before the modal was opened
            if (this.previousActiveElement?.focus) {
                this.previousActiveElement.focus();
            }
            this.container.parentElement.removeChild(this.container);
        }
    }
}
