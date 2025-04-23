export class TextInput {
  private container: HTMLElement;
  private input!: HTMLInputElement;
  private button!: HTMLButtonElement;
  private onSubmit: (text: string) => void;

  constructor(container: HTMLElement, onSubmit: (text: string) => void) {
    this.container = container;
    this.onSubmit = onSubmit;
    this.createInputElements();
    this.setupEventListeners();
  }

  private createInputElements(): void {
    const inputContainer = document.createElement('div');
    inputContainer.className = 'input-container';
    inputContainer.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 10px;
      z-index: 9999;
      padding: 10px 15px;
      background: rgba(255, 255, 255, 0.95);
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    `;

    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.placeholder = 'Type your thought...';
    this.input.style.cssText = `
      padding: 10px 15px;
      border-radius: 6px;
      border: 2px solid #646cff;
      outline: none;
      font-size: 16px;
      min-width: 300px;
      background: white;
      transition: all 0.2s ease;
    `;

    this.button = document.createElement('button');
    this.button.textContent = 'Add';
    this.button.style.cssText = `
      padding: 10px 20px;
      border-radius: 6px;
      border: none;
      background-color: #646cff;
      color: white;
      cursor: pointer;
      font-size: 16px;
      font-weight: 600;
      transition: all 0.2s ease;
    `;

    // Hover effect
    this.button.addEventListener('mouseenter', () => {
      this.button.style.backgroundColor = '#535bf2';
    });
    this.button.addEventListener('mouseleave', () => {
      this.button.style.backgroundColor = '#646cff';
    });

    inputContainer.appendChild(this.input);
    inputContainer.appendChild(this.button);
    this.container.appendChild(inputContainer);
  }

  private setupEventListeners(): void {
    const handleSubmit = () => {
      const text = this.input.value.trim();
      if (text) {
        this.onSubmit(text);
        this.input.value = '';
      }
    };

    this.button.addEventListener('click', handleSubmit);
    this.input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        handleSubmit();
      }
    });

    // Focus input styles
    this.input.addEventListener('focus', () => {
      this.input.style.borderColor = '#535bf2';
      this.input.style.boxShadow = '0 0 0 2px rgba(83, 91, 242, 0.2)';
    });

    this.input.addEventListener('blur', () => {
      this.input.style.borderColor = '#646cff';
      this.input.style.boxShadow = 'none';
    });
  }

  public destroy(): void {
    const inputContainer = this.input.parentElement;
    if (inputContainer) {
      this.container.removeChild(inputContainer);
    }
  }
}
