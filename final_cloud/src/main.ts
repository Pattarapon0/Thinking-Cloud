import './style.css';
import { Cloud } from './components/Cloud';
import { TextInput } from './components/TextInput';
import { ConnectionScreen } from './components/ConnectionScreen';
import { SignalingClient } from './networking/SignalingClient';
import { LandingPage } from './components/LandingPage';

class App {
  private cloud!: Cloud;
  private textInput!: TextInput;
  private connectionScreen!: ConnectionScreen;
  private appDiv!: HTMLDivElement;
  private cloudContainer!: HTMLDivElement;

  constructor() {
    // Show landing page first
    const landingPage = new LandingPage(import.meta.env.VITE_SIGNALING_SERVER_URL);
    landingPage.onEnter = (roomId: string, password?: string) => {
      // Initialize app with room info
      
      void this.initApp(roomId, password);
    };
    landingPage.attach(document.querySelector<HTMLDivElement>('#app')!);
  }

  private initApp(roomId: string, password?: string): void {
    // First, show connection screen
    this.connectionScreen = new ConnectionScreen();

    // Set up app container
    this.setupAppContainer();
    
    // Try to connect to room
    void this.connectToRoom(roomId, password);
  }

  private setupAppContainer(): void {
    this.appDiv = document.querySelector<HTMLDivElement>('#app')!;
    if (!this.appDiv) {
      throw new Error('No #app element found');
    }

    // Clear existing content and set up app container
    this.appDiv.innerHTML = '';
    this.appDiv.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    `;

    // Create cloud container but keep it hidden
    this.cloudContainer = document.createElement('div');
    this.cloudContainer.className = 'cloud-container';
    this.cloudContainer.style.cssText = `
      width: 100%;
      height: calc(100% - 80px);
      position: relative;
      background-color: transparent;
      border-radius: 200px;
      opacity: 0;
      transition: opacity 0.5s ease;
      display: none;
    `;
    this.appDiv.appendChild(this.cloudContainer);
  }

  private async connectToRoom(roomId: string, password?: string): Promise<void> {
    try {
      // Start with connection screen showing
      this.connectionScreen.updateStatus('connecting', 'Connecting to room...');
      await this.initComponents(roomId, password);
    } catch (error) {
      console.error('Failed to connect to room:', error);
      this.connectionScreen.updateStatus('error', 'Failed to connect to room');
    }
  }

  private async initComponents(roomId: string, password?: string): Promise<void> {
    try {
      // Initialize TextInput first
      this.textInput = new TextInput(this.appDiv, (text: string) => {
        if (this.cloud) {
          this.cloud.addText(text);
        }
      });

      // Show cloud container
      this.cloudContainer.style.display = 'block';
      // Force reflow to ensure transition works
      this.cloudContainer.offsetHeight;
      this.cloudContainer.style.opacity = '1';

      // Create cloud with server URL and room info
      this.cloud = await Cloud.create(
        this.cloudContainer, 
        import.meta.env.VITE_SIGNALING_SERVER_URL,
        roomId,
        password
      );

      // Finally add thinking dots
      this.addThinkingDots(this.cloudContainer);
    } catch (error) {
      console.error('Failed to initialize components:', error);
      this.connectionScreen.updateStatus('error', 'Failed to initialize app');
      this.cloudContainer.style.display = 'none';
      throw error;
    }
  }

  private addThinkingDots(container: HTMLElement): void {
    const dotsContainer = document.createElement('div');
    dotsContainer.className = 'thinking-dots';
    dotsContainer.style.cssText = `
      display: flex;
      gap: 16px;
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 1;
      opacity: 0.6;
    `;

    // Create three dots with animation
    const style = document.createElement('style');
    style.textContent = `
      .thinking-dot {
        width: 12px;
        height: 12px;
        background-color: #ffffff;
        border-radius: 50%;
        animation: pulse 1s infinite;
      }

      @keyframes pulse {
        0%, 100% { transform: scale(0.8); opacity: 0.5; }
        50% { transform: scale(1.2); opacity: 1; }
      }
    `;
    document.head.appendChild(style);

    // Add dots with staggered animation
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('div');
      dot.className = 'thinking-dot';
      dot.style.animationDelay = `${i * 0.2}s`;
      dotsContainer.appendChild(dot);
    }

    container.appendChild(dotsContainer);
  }

  public destroy(): void {
    if (this.cloud) {
      this.cloud.destroy();
    }
    if (this.textInput) {
      this.textInput.destroy();
    }
    this.connectionScreen.destroy();
  }
}

// Initialize app
new App();
