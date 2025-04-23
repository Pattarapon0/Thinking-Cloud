import { RoomDetails, RoomDetailCard } from './RoomDetailCard';
import { AddRoomButton } from './AddRoomButton';
import { CreateRoomModal } from './CreateRoomModal';
import { SignalingClient } from '../networking/SignalingClient';

export class LandingPage {
  private container: HTMLDivElement;
  private roomContainer!: HTMLDivElement;
  private addRoomButton!: AddRoomButton;
  private signalingClient: SignalingClient;
  private rooms: RoomDetails[] = [];

  constructor(serverUrl: string) {
    this.container = document.createElement('div');
    this.container.className = 'landing-page';
    this.setupStyles();
    // Initialize SignalingClient and connect
    this.signalingClient = new SignalingClient(serverUrl);
    this.signalingClient.setOnRoomListChanged((rooms) => {
      this.rooms = rooms.map(room => ({
        id: room.id,
        name: room.name,
        currentUsers: room.currentUsers,
        maxUsers: room.maxUsers,
        hasPassword: room.hasPassword,
        createdAt: new Date()  // Server will add this later
      }));
      this.updateRoomList();
    });
    this.signalingClient.setJoinRoom((roomId, password) => {
      this.handleEnter(roomId, password);});
    this.createContent();
    
    // Connect to room list
    void this.signalingClient.connectToRoomList();
  }

  private setupStyles(): void {
    // Add styles to head
    const style = document.createElement('style');
    style.textContent = `
      .landing-page {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: linear-gradient(135deg, #1a1a2e, #16213e);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: white;
      font-family: Arial, sans-serif;
      opacity: 0;
      animation: fadeIn 1s ease forwards;
      padding-right: 24px;
      overflow-x: hidden;
      }

      @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
      }

      @keyframes fadeOut {
      from { opacity: 1; }
      to { opacity: 0; }
      }

      .cloud-logo {
      width: 100px;
      height: 100px;
      margin-bottom: 20px;
      position: relative;
      animation: float 3s ease-in-out infinite;
      }

      @keyframes float {
      0%, 100% { transform: translateY(0px); }
      50% { transform: translateY(-20px); }
      }

      .cloud-logo::before,
      .cloud-logo::after {
      content: '';
      position: absolute;
      background: white;
      border-radius: 50%;
      }

      .cloud-logo::before {
      width: 60px;
      height: 60px;
      top: 20px;
      left: 20px;
      box-shadow: 0 0 20px rgba(255, 255, 255, 0.3);
      }

      .cloud-logo::after {
      width: 40px;
      height: 40px;
      top: 10px;
      left: 40px;
      }

      .title {
      font-size: 3em;
      margin: 20px 0;
      text-shadow: 0 0 10px rgba(255, 255, 255, 0.3);
      animation: glow 2s ease-in-out infinite alternate;
      }

      @keyframes glow {
      from { text-shadow: 0 0 10px rgba(255, 255, 255, 0.3); }
      to { text-shadow: 0 0 20px rgba(255, 255, 255, 0.6); }
      }

      .enter-button {
      padding: 15px 40px;
      font-size: 1.2em;
      background: rgba(255, 255, 255, 0.1);
      border: 2px solid rgba(255, 255, 255, 0.2);
      border-radius: 30px;
      color: white;
      cursor: pointer;
      transition: all 0.3s ease;
      margin-top: 30px;
      backdrop-filter: blur(5px);
      }

      .enter-button:hover {
      background: rgba(255, 255, 255, 0.2);
      border-color: rgba(255, 255, 255, 0.4);
      transform: translateY(-2px);
      box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
      }

      .particles {
      position: absolute;
      width: 100%;
      height: 100%;
      overflow: hidden;
      z-index: 0;
      }

      .room-container {
        position: relative;
        z-index: 1;
        margin: 20px auto;
        width: min(100%, 800px);
        height: 100%;
        max-height: 70vh;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        gap: 15px;
        overflow-y: auto;
      }

      /* Custom scrollbar for room container */
      .room-container::-webkit-scrollbar {
      width: 8px;
      }

      .room-container::-webkit-scrollbar-track {
      background: rgba(255, 255, 255, 0.1);
      border-radius: 4px;
      }

      .room-container::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.3);
      border-radius: 4px;
      }

      .room-container::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.4);
      }

      .particle {
      position: absolute;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 50%;
      pointer-events: none;
      animation: rise var(--duration) ease-in infinite;
      --size: var(--particle-size);
      width: var(--size);
      height: var(--size);
      }

      @keyframes rise {
      0% {
        transform: translateY(100vh) scale(0);
        opacity: 0;
      }
      50% {
        opacity: 0.5;
      }
      100% {
        transform: translateY(-100px) scale(1);
        opacity: 0;
      }
      }
    `;
    document.head.appendChild(style);
  }

  private createContent(): void {
    // Create particles container
    const particlesContainer = document.createElement('div');
    particlesContainer.className = 'particles';
    this.container.appendChild(particlesContainer);

    // Add floating particles
    this.createParticles(particlesContainer);

    // Add room button
    this.addRoomButton = new AddRoomButton();
    this.addRoomButton.setOnClick(() => this.handleAddRoom());
    this.addRoomButton.attach(this.container);

    // Create cloud logo
    const cloudLogo = document.createElement('div');
    cloudLogo.className = 'cloud-logo';
    this.container.appendChild(cloudLogo);

    // Create title
    const title = document.createElement('h1');
    title.className = 'title';
    title.textContent = 'Thinking Cloud';
    this.container.appendChild(title);

    // Create room container
    this.roomContainer = document.createElement('div');
    this.roomContainer.className = 'room-container';
    this.container.appendChild(this.roomContainer);

    // Initial empty room container
    // Rooms will be added when received from server
  }

  private createParticles(container: HTMLElement): void {
    const particleCount = 20;
    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement('div');
      particle.className = 'particle';
      // Random size between 3 and 8 pixels
      const size = Math.random() * 5 + 3;
      // Random animation duration between 3 and 8 seconds
      const duration = Math.random() * 5 + 3;
      // Random left position
      const left = Math.random() * 100;
      
      particle.style.cssText = `
        --particle-size: ${size}px;
        --duration: ${duration}s;
        left: ${left}%;
        animation-delay: ${Math.random() * 5}s;
      `;
      
      container.appendChild(particle);
    }
  }

  private handleAddRoom(): void {
    const modal = new CreateRoomModal();
    modal.setOnSubmit((data) => {
      // Use SignalingClient to create room
      this.signalingClient.createRoom({
        name: data.name,
        maxUsers: data.maxUsers,
        maxTexts: data.maxTexts,
        password: data.password || undefined
      });
    });
    modal.attach(document.body);
  }

  private handleEnter(roomId: string, password?: string): void {
    // Add fadeOut animation
    const style = document.createElement('style');
    style.textContent = `
      .landing-page.fade-out {
        animation: fadeOut 0.5s ease forwards;
      }
    `;
    document.head.appendChild(style);
    
    // Add fade-out class
    this.container.classList.add('fade-out');

    // After animation, remove landing page and show app
    setTimeout(() => {
      this.destroy();
      // Let parent handle joining room
      if (this.onEnter) {
        this.onEnter(roomId, password);
      }
    }, 500);
  }

  public onEnter: ((roomId: string, password?: string) => void) | null = null;

  public attach(parent: HTMLElement): void {
    parent.appendChild(this.container);
  }

  // New method to update room list
  private updateRoomList(): void {
    // Clear existing room cards
    while (this.roomContainer.firstChild) {
      this.roomContainer.removeChild(this.roomContainer.firstChild);
    }

    // Add current rooms
    this.rooms.forEach(room => {
      const roomCard = new RoomDetailCard(room);
      roomCard.setOnJoin((roomId, password) => this.signalingClient.enterRoom(roomId, password));
      roomCard.attach(this.roomContainer);
    });
  }

  public destroy(): void {
    if (this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }
    // Close SignalingClient connection
    this.signalingClient.close();
  }
}
