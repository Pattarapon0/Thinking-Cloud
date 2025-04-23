import * as Matter from 'matter-js';
import { PhysicsEngine } from '../physics/engine';
import { TextBodyManager, ClickableTextBody } from '../physics/bodies';
import { CloudDimensions } from '../utils/types';
import { CLOUD_CONFIG } from '../utils/constants';
import { NetworkManager } from '../networking/NetworkManager';
import { SignalingClient } from '../networking/SignalingClient';

export class Cloud {
  private container: HTMLElement;
  private physicsEngine: PhysicsEngine;
  private textManager: TextBodyManager;
  private dimensions: CloudDimensions;
  private boundaries: Matter.Body[] = [];
  private dragStartTimeout: number | null = null;
  private mouseDownPosition: Matter.Vector | null = null;
  private readonly CLICK_THRESHOLD = 8; // pixels - how far mouse can move and still be a click
  private readonly DRAG_DELAY = 300; // milliseconds - more time to distinguish between click and drag
  private mouseMoveCount: number = 0; // Track movement frequency

  private networkManager!: NetworkManager;
  private mouseConstraint!: Matter.MouseConstraint;

  private constructor(container: HTMLElement) {
    this.container = container;
    this.setupContainer();
    this.dimensions = this.calculateDimensions();
    
    this.textManager = new TextBodyManager(this.dimensions);
    this.physicsEngine = new PhysicsEngine(this.container, this.textManager);
  }

  public static async create(
    container: HTMLElement, 
    signalServerUrl: string,
    roomId: string,
    password?: string
  ): Promise<Cloud> {
    const cloud = new Cloud(container);
    await cloud.init(signalServerUrl, roomId, password);
    return cloud;
  }

  private async init(signalServerUrl: string, roomId: string, password?: string): Promise<void> {
    try {
      // Set up boundaries first
      this.setupBoundaries();
      
      // Initialize and connect NetworkManager
      this.networkManager = new NetworkManager(signalServerUrl, this.textManager, this.physicsEngine);
      await this.networkManager.connect(roomId, password);
    } catch (error) {
      console.error('Failed to initialize cloud:', error);
      throw error;
    }
    
    // Handle window resize
    window.addEventListener('resize', this.handleResize.bind(this));

    // Start physics simulation
    this.physicsEngine.start();
    
    // Setup mouse constraint handlers
    this.mouseConstraint = this.physicsEngine.getMouseConstraint();
    const mouseConstraint = this.mouseConstraint;
    // Mouse interaction handlers (Click-only version)
    Matter.Events.on(mouseConstraint, 'mousedown', (event: Matter.IEvent<Matter.MouseConstraint>) => {
      const mousePosition = mouseConstraint.mouse.position;
      const clickedBodies = Matter.Query.point(this.physicsEngine.getWorld().bodies, mousePosition)
        .filter(body => !body.isStatic); // Only get non-static bodies
      
      if (clickedBodies.length > 0) {
        const body = clickedBodies[0];
        if (body.plugin?.clickableBody) {
          this.handleClick(body);
        }
      }
    });

    /* Original drag-enabled version:
    Matter.Events.on(mouseConstraint, 'mousedown', (event: Matter.IEvent<Matter.MouseConstraint>) => {
      const mousePosition = mouseConstraint.mouse.position;
      const clickedBodies = Matter.Query.point(this.physicsEngine.getWorld().bodies, mousePosition);
      
      if (clickedBodies.length > 0) {
        const body = clickedBodies[0];
        if (body.plugin?.clickableBody) {
          // Reset movement tracking
          this.mouseMoveCount = 0;
          this.mouseDownPosition = { x: mousePosition.x, y: mousePosition.y };
          
          // Store the clicked body to check on mouseup
          (this.mouseConstraint as any).clickedBody = body;
          
          // Start click timer
          this.dragStartTimeout = window.setTimeout(() => {
            // Only trigger click if mouse hasn't moved much
            if (this.calculateMouseMovement(mouseConstraint.mouse.position) <= this.CLICK_THRESHOLD) {
              this.handleClick(body);
            }
            this.dragStartTimeout = null;
          }, this.DRAG_DELAY);
        }
      }
    });

    Matter.Events.on(mouseConstraint, 'mouseup', (event: Matter.IEvent<Matter.MouseConstraint>) => {
      // Handle quick clicks (released before DRAG_DELAY)
      if (this.dragStartTimeout !== null && this.mouseDownPosition) {
        const mousePosition = mouseConstraint.mouse.position;
        // If mouse hasn't moved much and we have a stored body
        if (this.calculateMouseMovement(mousePosition) <= this.CLICK_THRESHOLD) {
          const clickedBody = (this.mouseConstraint as any).clickedBody;
          if (clickedBody?.plugin?.clickableBody) {
            window.clearTimeout(this.dragStartTimeout);
            this.dragStartTimeout = null;
            this.handleClick(clickedBody);
          }
        }
      }
      
      // Clear stored body and position
      (this.mouseConstraint as any).clickedBody = null;
      this.mouseDownPosition = null;
      this.mouseMoveCount = 0;
    });

    Matter.Events.on(mouseConstraint, 'mousemove', () => {
      // Track mouse movement
      this.mouseMoveCount++;

      // If moving frequently during DRAG_DELAY, it's definitely a drag
      if (this.mouseMoveCount > 3 && this.dragStartTimeout !== null) {
        window.clearTimeout(this.dragStartTimeout);
        this.dragStartTimeout = null;
        (this.mouseConstraint as any).clickedBody = null;
      }

      const draggedBody = mouseConstraint.body;
      if (draggedBody && draggedBody.plugin?.clickableBody) {
        this.handleDragMove(draggedBody);
      }
    });

    Matter.Events.on(mouseConstraint, 'startdrag', () => {
      // Cancel click timer if it exists
      if (this.dragStartTimeout !== null) {
        window.clearTimeout(this.dragStartTimeout);
        this.dragStartTimeout = null;
      }
      
      const draggedBody = mouseConstraint.body;
      if (draggedBody) {
        this.handleDragStart(draggedBody, mouseConstraint.mouse.position);
      }
    });
    */

    // Only broadcast position for drag events
    
    // Setup render loop for text overlay
    this.renderLoop();
  }

  private setupContainer(): void {
    this.container.style.position = 'relative';
    this.container.style.overflow = 'hidden'; // Keep bodies within boundaries
    this.container.style.width = '100%';
    this.container.style.height = '100%';
    this.container.style.touchAction = 'none'; // Prevent touch scrolling/zooming
    this.container.style.userSelect = 'none'; // Prevent text selection during drag
    this.container.style.margin = '0'; // Remove any margin
    this.container.style.border = '1px solid transparent'; // Add invisible border for better collision
  }

  private calculateDimensions(): CloudDimensions {
    const rect = this.container.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
      x: 0,
      y: 0
    };
  }

  public addText(text: string): void {
    if (this.textManager.getBodiesCount() >= CLOUD_CONFIG.maxBodies) {
      return;
    }

    // Measure text dimensions
    const textMetrics = this.measureText(text);
    const textDimensions = {
      width: Math.ceil(textMetrics.width) + 20, // Add padding
      height: Math.ceil(textMetrics.height) + 10
    };

    // Random position in cloud area (away from edges)
    const padding = Math.max(textDimensions.width, textDimensions.height);
    const position = {
      x: padding + Math.random() * (this.dimensions.width - padding * 2),
      y: padding + Math.random() * (this.dimensions.height - padding * 2)
    };

    // Create network ID and random motion
    const networkId = `text-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const motion = {
      velocity: {
        x: (Math.random() - 0.5) * CLOUD_CONFIG.initialSpeed * 2,
        y: (Math.random() - 0.5) * CLOUD_CONFIG.initialSpeed * 2
      },
      angle: Math.random() * Math.PI * 2,
      angularVelocity: (Math.random() - 0.5) * 0.1
    };

    // Create texture
    const textureSrc = ClickableTextBody.createTexture(text, textDimensions.width, textDimensions.height);
    const img = new Image();

    // Create local text body
    img.onload = () => {
      const clickableBody = ClickableTextBody.create(
        {
          x: position.x,
          y: position.y,
          width: textDimensions.width,
          height: textDimensions.height,
          text: text,
          networkId,
          ownerId: (this.networkManager.getPeerId() ?? undefined),
        },
        img.src,
        motion.angle,
        this.networkManager,
        motion.velocity,
        motion.angularVelocity
      );

      if (clickableBody) {
        this.textManager.addToCollection(networkId, clickableBody);
        this.physicsEngine.addBody(clickableBody.body);
      }
    };
    img.src = textureSrc;

    // Broadcast to other peers - they'll calculate their own dimensions
    this.networkManager.broadcastNewText(text, position, networkId, motion.angle, motion.velocity, motion.angularVelocity);
  }

  private measureText(text: string): { width: number; height: number } {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
      return { width: 100, height: 30 }; // Fallback size
    }

    context.font = CLOUD_CONFIG.textStyle.font;
    const metrics = context.measureText(text);
    
    return {
      width: (metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight)*1.2, // Add padding
      height: parseInt(CLOUD_CONFIG.textStyle.font, 10) * 1.2
    };
  }

  private setupBoundaries(): void {
    // Remove old boundaries if they exist
    if (this.boundaries.length > 0) {
      this.boundaries.forEach(boundary => {
        Matter.World.remove(this.physicsEngine.getWorld(), boundary);
      });
      this.boundaries = [];
    }

    // Create new boundaries
    const boundaries = this.textManager.createBoundaries();
    this.boundaries = boundaries;
    this.physicsEngine.addBoundaries(boundaries);
  }

  private handleResize(): void {
    const newDimensions = this.calculateDimensions();
    this.dimensions = newDimensions;
    this.textManager.updateCloudDimensions(newDimensions);
    this.physicsEngine.resize(newDimensions.width, newDimensions.height);
    
    // Update boundaries for new dimensions
    this.setupBoundaries();
  }

  private handleClick(body: Matter.Body): void {
    if (body.plugin?.clickableBody) {
      const networkId = body.plugin.clickableBody.getNetworkId();
      if (networkId) {
        console.log('Clicked on body with network ID:', networkId);
        this.networkManager.broadcastClickEvent(networkId);
        body.plugin.clickableBody.onClick(this.physicsEngine.getWorld(), this.textManager);
        
      }
    }
  }

  /* Original drag-related methods:
  private handleDragStart(body: Matter.Body, position: Matter.Vector): void {
    if (body.plugin?.clickableBody) {
      const networkId = body.plugin.clickableBody.getNetworkId();
      if (networkId) {
        this.networkManager.broadcastDragEvent(
          networkId,
          position,
          true,
        );
      }
    }
  }

  private handleDragMove(body: Matter.Body): void {
    if (body.plugin?.clickableBody) {
      const networkId = body.plugin.clickableBody.getNetworkId();
      if (networkId) {
        this.networkManager.broadcastDragEvent(
          networkId,
          body.position,
          false,
        );
      }
    }
  }

  private calculateMouseMovement(currentPosition: Matter.Vector): number {
    if (!this.mouseDownPosition) return 0;
    const dx = currentPosition.x - this.mouseDownPosition.x;
    const dy = currentPosition.y - this.mouseDownPosition.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
  */

  private renderLoop(): void {
    // Matter.js handles all rendering through its own render system
    requestAnimationFrame(() => this.renderLoop());
  }

  public destroy(): void {
    // Clear any pending timeouts
    if (this.dragStartTimeout !== null) {
      window.clearTimeout(this.dragStartTimeout);
      this.dragStartTimeout = null;
    }
    
    // Clean up all boundaries
    this.boundaries.forEach(boundary => {
      Matter.World.remove(this.physicsEngine.getWorld(), boundary);
    });
    this.boundaries = [];

    // Clean up all bodies before stopping
    const bodies = this.physicsEngine.getWorld().bodies;
    while (bodies.length > 0) {
      const body = bodies[0];
    if (body.plugin?.clickableBody) {
        const networkId = body.plugin.clickableBody.getNetworkId();
        if (networkId) {
          this.textManager.removeFromCollection(networkId);
        }
        Matter.World.remove(this.physicsEngine.getWorld(), body);
      } else {
        Matter.World.remove(this.physicsEngine.getWorld(), body);
      }
    }
    
    this.physicsEngine.stop();
    this.networkManager.close();
    window.removeEventListener('resize', this.handleResize.bind(this));
  }
  
}
