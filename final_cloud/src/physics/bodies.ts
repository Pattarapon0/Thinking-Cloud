import * as Matter from 'matter-js';
import { TextBodyOptions, CloudDimensions, IClickableTextBody, NetworkTextBodyData } from '../utils/types';
import { PHYSICS_CONFIG, CLOUD_CONFIG, DEBUG } from '../utils/constants';
import { NetworkManager } from '../networking/NetworkManager';
import { SoundManager } from '../utils/SoundManager';

export class ClickableTextBody implements IClickableTextBody {
    private clickLeft: number = 0;
    private networkId: string;
    private ownerId: string;
    private targetPosition: Matter.Vector | null = null;
    private targetVelocity: Matter.Vector | null = null;
    private interpolationFactor = 0.3; // Smooth interpolation
    private dragState: {
        draggers: Set<string>;  // Set of peer IDs currently dragging this body
        dragPoints: Map<string, Matter.Vector>;  // Drag points for each dragger
        currentForces: Map<string, Matter.Vector>;  // Forces from each dragger
        combinedForce: Matter.Vector;  // Total combined force
        lastDragPosition: Matter.Vector | null;  // Last known scaled drag position
    };

    private networkManager?: NetworkManager;

    constructor(
        public body: Matter.Body,
        existingNetworkId?: string,
        networkManager?: NetworkManager,
        ownerId?: string
    ) {
        this.networkId = existingNetworkId || `text-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.ownerId = ownerId || this.networkId; // Default owner is creator

        if (DEBUG.network) {
            console.log('Created ClickableTextBody:', {
                networkId: this.networkId,
                ownerId: this.ownerId,
                isOwner: this.networkId === this.ownerId,
                text: this.body.label
            });
        }

        this.dragState = {
            draggers: new Set(),
            dragPoints: new Map(),
            currentForces: new Map(),
            combinedForce: { x: 0, y: 0 },
            lastDragPosition: null
        };
        this.networkManager = networkManager;
    }

    // Multi-user Drag Methods (temporarily disabled)
    /*
    public startDrag(peerId: string, dragPoint: Matter.Vector): void {
        if (this.networkManager) {
            this.networkManager.broadcastDragEvent(this.networkId, dragPoint, true);
        }
    }

    public updateDrag(peerId: string, position: Matter.Vector): void {
        if (this.networkManager) {
            this.networkManager.broadcastDragEvent(this.networkId, position, false);
        }
    }

    public endDrag(peerId: string): void {
        if (this.networkManager) {
            this.networkManager.broadcastDragEvent(
                this.networkId, 
                this.body.position,
                false
            );
        }
    }
    */

    // Stub methods to satisfy interface
    public startDrag(): void { }
    public updateDrag(): void { }
    public endDrag(): void { }

    public isDragged(): boolean {
        return this.dragState.draggers.size > 0;
    }

    public getDraggers(): string[] {
        return Array.from(this.dragState.draggers);
    }

    public getDragPoint(peerId: string): Matter.Vector | undefined {
        return this.dragState.dragPoints.get(peerId);
    }

    public getNetworkId(): string {
        return this.networkId;
    }

    public getOwnerId(): string {
        return this.ownerId;
    }

    public updateFromNetwork(data: NetworkTextBodyData): void {
        // Skip updates if we own this text
        if (this.networkId === this.ownerId) {
            if (DEBUG.network) {
                console.log('Skipping network update for owned text:', this.networkId);
            }
            return;
        }

        // Check if the text would be out of bounds
        const padding = CLOUD_CONFIG.padding;
        const width = data.dimensions.width;
        const height = data.dimensions.height;

        if (
            data.position.x - width/2 < padding ||  // Left boundary
            data.position.x + width/2 > window.innerWidth - padding ||  // Right boundary
            data.position.y - height/2 < padding ||  // Top boundary
            data.position.y + height/2 > window.innerHeight - padding  // Bottom boundary
        ) {
            // Text is out of bounds, remove it using internal TextBodyManager reference
            if (DEBUG.network) {
                console.log('Text out of bounds, removing:', {
                    networkId: this.networkId,
                    position: data.position,
                    dimensions: data.dimensions
                });
            }
            if (this.networkManager) {
                const world = this.networkManager.getPhysicsEngine().getWorld();
                this.remove(world, this.networkManager.getTextManager());
            }
            return;
        }

        // Enforce minimum and maximum speeds
        const speed = Math.sqrt(data.velocity.x * data.velocity.x + data.velocity.y * data.velocity.y);
        if (speed !== 0) {  // Don't modify if object is stationary
            const { min, max } = PHYSICS_CONFIG.bodies.speeds;
            let targetSpeed = speed;
            
            if (speed < min) targetSpeed = min;
            if (speed > max) targetSpeed = max;
            
            if (targetSpeed !== speed) {
                const scale = targetSpeed / speed;
                data.velocity.x *= scale;
                data.velocity.y *= scale;
            }
        }

        // Store target values for interpolation
        this.targetPosition = data.position;
        this.targetVelocity = data.velocity;

        // Only update angle and clicks immediately
        Matter.Body.setAngle(this.body, data.angle);
    }

    public interpolatePosition(): void {
        // Skip interpolation if we own this text
        if (this.networkId === this.ownerId) {
            return; // We are the source of truth, ignore interpolation
        }

        if (this.targetPosition && this.targetVelocity) {
            // Smooth move towards target
            const dx = this.targetPosition.x - this.body.position.x;
            const dy = this.targetPosition.y - this.body.position.y;

            const newPosition = {
                x: this.body.position.x + dx * this.interpolationFactor,
                y: this.body.position.y + dy * this.interpolationFactor
            };

            Matter.Body.setPosition(this.body, newPosition);
            Matter.Body.setVelocity(this.body, {
                x: this.body.velocity.x + (this.targetVelocity.x - this.body.velocity.x) * this.interpolationFactor,
                y: this.body.velocity.y + (this.targetVelocity.y - this.body.velocity.y) * this.interpolationFactor
            });

            // Clear targets when close enough
            if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) {
                this.targetPosition = null;
                this.targetVelocity = null;
            }
        }
    }

    public getNetworkState(): NetworkTextBodyData {
        return {
            networkId: this.networkId,
            ownerId: this.ownerId,
            text: this.body.label,
            position: this.body.position,
            velocity: this.body.velocity,
            angle: this.body.angle,
            angularVelocity: this.body.angularVelocity,
            clickLeft: this.clickLeft,
            dimensions: {
                width: (this.body.bounds.max.x - this.body.bounds.min.x),
                height: (this.body.bounds.max.y - this.body.bounds.min.y)
            }
        };
    }

    static createTexture(text: string, width: number, height: number): string {
        const canvas = document.createElement('canvas');
        const pixelRatio = window.devicePixelRatio || 1;
        canvas.width = width * pixelRatio;
        canvas.height = height * pixelRatio;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        const context = canvas.getContext('2d');
        if (!context) {
            throw new Error('Failed to get 2D context');
        }

        // Scale for retina displays
        context.scale(pixelRatio, pixelRatio);

        // Clear background
        context.clearRect(0, 0, width, height);

        // Set text properties
        context.font = CLOUD_CONFIG.textStyle.font;
        context.fillStyle = '#000';
        context.textAlign = 'center';
        context.textBaseline = 'middle';

        // Add text
        const centerX = width / 2;
        const centerY = height / 2;
        context.fillText(text, centerX, centerY);
        return canvas.toDataURL();
    }
    static create(
        options: TextBodyOptions,
        texture: string,
        angle: number,
        networkManager?: NetworkManager,
        initialVelocity?: Matter.Vector,
        initialAngularVelocity?: number
    ): ClickableTextBody {
        if (DEBUG.network) {
            console.log('Creating text body with options:', {
                ...options,
                isOwned: options.ownerId === options.networkId
            });
        }

        const body = Matter.Bodies.rectangle(
            options.x,
            options.y,
            options.width,
            options.height,
            {
                label: options.text,
                chamfer: { radius: 5 },
                restitution: 0.7,         // Reduced bounce for better control
                friction: 0,              // No friction for predictable movement
                frictionStatic: 0,        // No static friction
                frictionAir: 0.0005,      // Very slight air resistance
                slop: 0,                  // Zero slop for precise collisions
                density: 0.001,           // Very light for consistent momentum
                inertia: Infinity,        // Perfect circular motion
                angularVelocity: 0,       // No initial rotation
                torque: 0,                // No rotational forces
                render: {
                    sprite: {
                        texture: texture,
                        xScale: 1,
                        yScale: 1
                    }
                },
                collisionFilter: {
                    category: 0x0002,       // Text bodies category
                    mask: 0x0003           // Collide with boundaries and other text
                },
                bounds: {
                    min: { x: -options.width / 2, y: -options.height / 2 },
                    max: { x: options.width / 2, y: options.height / 2 }
                }
            }
        );
        // Set initial velocity and angular velocity
        Matter.Body.setVelocity(body, initialVelocity || {
            x: Math.cos(angle) * CLOUD_CONFIG.initialSpeed,
            y: Math.sin(angle) * CLOUD_CONFIG.initialSpeed
        });
        Matter.Body.setAngularVelocity(body, initialAngularVelocity || 0);

        // Get the signaling client's peer ID for ownership
        const clickableBody = new ClickableTextBody(
            body,
            options.networkId,
            networkManager,
            options.ownerId || options.networkId  // Use provided ownerId or fallback to networkId
        );
        body.plugin = { clickableBody };
        clickableBody.clickLeft = clickableBody.body.label.length; // Set clickLeft based on the text length
        if (DEBUG.network) {
            console.log('Created ClickableTextBody:', {
                networkId: clickableBody.getNetworkId(),
                ownerId: clickableBody.getOwnerId(),
                isOwned: clickableBody.getNetworkId() === clickableBody.getOwnerId()
            });
        }
        return clickableBody;
    }

    static getRandomPosition(dimensions: CloudDimensions): { x: number; y: number } {
        const padding = CLOUD_CONFIG.padding;
        return {
            x: dimensions.x + padding + Math.random() * (dimensions.width - padding * 2),
            y: dimensions.y + padding + Math.random() * (dimensions.height - padding * 2)
        };
    }

    onClick(world: Matter.World, textManager: TextBodyManager): void {
        this.clickLeft--;
        console.log(`Click count for text "${this.body.label}": ${this.clickLeft}`);
        
        // Play click sound
        SoundManager.getInstance().playClick();
        
        if (this.clickLeft <= 0) {
            console.log(`Text "${this.body.label}" clicked out!`);
            // Play vanish sound before removing
            SoundManager.getInstance().playVanish();
            this.remove(world, textManager);
        } else {
            console.log(`Text "${this.body.label}" remaining clicks: ${this.clickLeft}`);
        }
    }

    // Listen for collisions
    public handleCollision(): void {
        // Enforce minimum speed after collision
        const speed = Math.sqrt(
            this.body.velocity.x * this.body.velocity.x + 
            this.body.velocity.y * this.body.velocity.y
        );

        if (speed < PHYSICS_CONFIG.bodies.speeds.min) {
            const angle = Math.atan2(this.body.velocity.y, this.body.velocity.x);
            Matter.Body.setVelocity(this.body, {
                x: Math.cos(angle) * PHYSICS_CONFIG.bodies.speeds.min,
                y: Math.sin(angle) * PHYSICS_CONFIG.bodies.speeds.min
            });
        }

        SoundManager.getInstance().playCollision();
    }

    getClickLeft(): number {
        return this.clickLeft;
    }

    remove(world: Matter.World, textManager: TextBodyManager): void {
        Matter.World.remove(world, this.body);
        textManager.removeFromCollection(this.networkId);
    }
}

export class TextBodyManager {
    private bodies: Map<string, ClickableTextBody> = new Map();
    private activePeers: Map<string, {
        lastSeen: number;
        activeDrags: Set<string>; // networkIds of bodies being dragged
    }> = new Map();
    private maxTexts: number = CLOUD_CONFIG.defaultRoomSettings.maxTexts;

    constructor(private cloudDimensions: CloudDimensions) { }

    public updateRoomSettings(settings: { maxTexts?: number }) {
        if (settings.maxTexts !== undefined) {
            this.maxTexts = settings.maxTexts;
        }
    }

    public canAddMoreTexts(): boolean {
        return this.getBodiesCount() < this.maxTexts;
    }

    // Peer Management Methods
    public addPeer(peerId: string): void {
        this.activePeers.set(peerId, {
            lastSeen: Date.now(),
            activeDrags: new Set()
        });
    }

    public removePeer(peerId: string): void {
        this.activePeers.delete(peerId);
    }

    public updatePeerLastSeen(peerId: string): void {
        const peerData = this.activePeers.get(peerId);
        if (peerData) {
            peerData.lastSeen = Date.now();
            this.activePeers.set(peerId, peerData);
        }
    }

    public isPeerActive(peerId: string): boolean {
        const peerData = this.activePeers.get(peerId);
        if (!peerData) return false;

        const inactiveThreshold = 10000; // 10 seconds
        return (Date.now() - peerData.lastSeen) < inactiveThreshold;
    }

    // Drag Operation Methods
    public startPeerDrag(peerId: string, networkId: string): void {
        const peerData = this.activePeers.get(peerId);
        if (peerData) {
            peerData.activeDrags.add(networkId);
            this.activePeers.set(peerId, peerData);
        }
    }

    public endPeerDrag(peerId: string, networkId: string): void {
        const peerData = this.activePeers.get(peerId);
        if (peerData) {
            peerData.activeDrags.delete(networkId);
            this.activePeers.set(peerId, peerData);
        }
    }

    public getPeersDraggingBody(networkId: string): string[] {
        const draggingPeers: string[] = [];
        for (const [peerId, peerData] of this.activePeers.entries()) {
            if (peerData.activeDrags.has(networkId) && this.isPeerActive(peerId)) {
                draggingPeers.push(peerId);
            }
        }
        return draggingPeers;
    }

    public addToCollection(bodyId: string, body: ClickableTextBody): boolean {
        if (this.getBodiesCount() >= this.maxTexts) {
            return false;
        }
        this.bodies.set(bodyId, body);
        return true;
    }

    public removeFromCollection(bodyId: string): void {
        this.bodies.delete(bodyId);
    }

    public getBody(bodyId: string): ClickableTextBody | undefined {
        return this.bodies.get(bodyId);
    }

    public getBodiesCount(): number {
        return this.bodies.size;
    }

    public getAllBodies(): ClickableTextBody[] {
        return Array.from(this.bodies.values());
    }

    public getBodyByNetworkId(networkId: string): ClickableTextBody | undefined {
        return this.getAllBodies().find(body => body.getNetworkId() === networkId);
    }

    public updateCloudDimensions(dimensions: CloudDimensions): void {
        this.cloudDimensions = dimensions;
    }

    public createBoundaries(): Matter.Body[] {
        const thickness = 5; // Thinner boundary thickness
        const padding = CLOUD_CONFIG.padding;
        const commonProperties = {
            isStatic: true,
            restitution: 0.7,      // Match body restitution
            friction: 0,           // No friction for predictable bounces
            frictionStatic: 0,     // No static friction
            frictionAir: 0.0005,   // Match body air resistance
            slop: 0,
            density: 1,
            collisionFilter: {
                category: 0x0001,
                mask: 0x0002  // Only collide with text bodies
            },
            render: {
                fillStyle: '#FFFFFF',
                opacity: 0.05,
                visible: true,
                strokeStyle: '#F0F0F0',
                lineWidth: 1
            }
        };


        return [
            // Top
            Matter.Bodies.rectangle(
                this.cloudDimensions.x + this.cloudDimensions.width / 2,
                this.cloudDimensions.y + padding - thickness / 2, // Adjusted position
                this.cloudDimensions.width,
                thickness,
                commonProperties
            ),
            // Bottom
            Matter.Bodies.rectangle(
                this.cloudDimensions.x + this.cloudDimensions.width / 2,
                this.cloudDimensions.y + this.cloudDimensions.height - padding + thickness / 2, // Adjusted position
                this.cloudDimensions.width,
                thickness,
                commonProperties
            ),
            // Left
            Matter.Bodies.rectangle(
                this.cloudDimensions.x + padding - thickness / 2, // Adjusted position
                this.cloudDimensions.y + this.cloudDimensions.height / 2,
                thickness,
                this.cloudDimensions.height,
                commonProperties
            ),
            // Right
            Matter.Bodies.rectangle(
                this.cloudDimensions.x + this.cloudDimensions.width - padding + thickness / 2, // Adjusted position
                this.cloudDimensions.y + this.cloudDimensions.height / 2,
                thickness,
                this.cloudDimensions.height,
                commonProperties
            )
        ];}
}
