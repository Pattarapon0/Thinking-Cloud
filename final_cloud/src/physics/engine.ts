import * as Matter from 'matter-js';
import { PHYSICS_CONFIG, DEBUG } from '../utils/constants';
import { TextBodyManager } from './bodies';
import { MatterMouseEvent } from '../utils/types';

export class PhysicsEngine {
  private engine: Matter.Engine;
  private render: Matter.Render;
  private runner: Matter.Runner;
  private world: Matter.World;
  private mouseConstraint: Matter.MouseConstraint;
  private textManager: TextBodyManager;
  private lastMousePosition: Matter.Vector = { x: 0, y: 0 };
  private isDragging: boolean = false;
  private remoteConstraints: Map<string, Matter.Constraint> = new Map();

  constructor(container: HTMLElement, textManager: TextBodyManager) {
    this.textManager = textManager;
    this.engine = Matter.Engine.create({
      enableSleeping: false,
      positionIterations: 8,     // Reduced to balance precision and performance
      velocityIterations: 8,     // Reduced to balance precision and performance
      constraintIterations: 4,   // Reduced to balance precision and performance
    });

    // Add before/after update event listeners
    Matter.Events.on(this.engine, 'beforeUpdate', () => {
      // Interpolate positions for all bodies before physics update
      const bodies = this.textManager.getAllBodies();
      bodies.forEach(body => {
        body.interpolatePosition();
      });
    });

    this.runner = Matter.Runner.create({
      isFixed: true,             // Use fixed timesteps
      delta: 1000 / 60           // Fixed 60 FPS delta time
    });

    this.world = this.engine.world;
    Matter.World.add(this.world, []);

    this.world.gravity.x = PHYSICS_CONFIG.world.gravity.x;
    this.world.gravity.y = PHYSICS_CONFIG.world.gravity.y;

    this.render = Matter.Render.create({
      element: container,
      engine: this.engine,
      options: {
        width: container.clientWidth,
        height: container.clientHeight,
        wireframes: false,
        background: 'transparent',
        showBroadphase: false,
        showAxes: false,
        showConvexHulls: false,
        pixelRatio: window.devicePixelRatio || 1
      }
    });

    if (this.render.canvas) {
      this.render.canvas.style.position = 'absolute';
      this.render.canvas.style.top = '0';
      this.render.canvas.style.left = '0';
      this.render.canvas.style.zIndex = '2';
      this.render.canvas.style.pointerEvents = 'auto';
      this.render.canvas.style.cursor = 'default';  // Default cursor
    }

    this.runner = Matter.Runner.create();
    const mouse = Matter.Mouse.create(this.render.canvas);
    const canvas = this.render.canvas as HTMLCanvasElement;
    
    mouse.pixelRatio = window.devicePixelRatio || 1;

    // Create mouse constraint but disable dragging
    this.mouseConstraint = Matter.MouseConstraint.create(this.engine, {
      mouse: mouse,
      constraint: {
        stiffness: 0,  // Set to 0 to disable dragging
        damping: 0,
        render: { visible: false }
      }
    });

    Matter.World.add(this.world, this.mouseConstraint);

    // Add collision detection
    Matter.Events.on(this.engine, 'collisionStart', (event) => {
      // Force type the event to include collision pairs
      const collisionEvent = event as unknown as { pairs: Array<{ bodyA: Matter.Body; bodyB: Matter.Body }> };
      
      collisionEvent.pairs.forEach((pair) => {
        const bodyA = pair.bodyA;
        const bodyB = pair.bodyB;
        
        // Only play sound for collisions involving text bodies (not boundaries)
        if (bodyA.plugin?.clickableBody) {
          bodyA.plugin.clickableBody.handleCollision();
        }
        if (bodyB.plugin?.clickableBody) {
          bodyB.plugin.clickableBody.handleCollision();
        }
      });
    });

    // Track mouse position
    /*Matter.Events.on(this.mouseConstraint, 'mousemove', (event: Matter.IEvent<Matter.MouseConstraint>) => {
      const mouseEvent = event as MatterMouseEvent;
      this.lastMousePosition = mouseEvent.mouse.position;
    });

    // Click detection
    Matter.Events.on(this.mouseConstraint, 'mousedown', (event: Matter.IEvent<Matter.MouseConstraint>) => {
      const mouseEvent = event as MatterMouseEvent;
      const mousePosition = mouseEvent.mouse.position;
      const clickedBodies = Matter.Query.point(this.world.bodies, mousePosition);
      
      if (clickedBodies.length > 0) {
        const interactiveBodies = clickedBodies.filter(body => !body.isStatic);
        if (interactiveBodies.length > 0) {
          const body = interactiveBodies[0];
          if (body.plugin?.clickableBody && !this.isDragging) {
            body.plugin.clickableBody.onClick(this.world, this.textManager);
          }
        }
      }
    });*/

    // Drag events (temporarily disabled)
    /*
    Matter.Events.on(this.mouseConstraint, 'startdrag', (event: Matter.IEvent<Matter.MouseConstraint>) => {
      this.isDragging = true;
      const mouseEvent = event as MatterMouseEvent;
      const body = this.mouseConstraint.body;
      if (body?.plugin?.clickableBody) {
        body.plugin.clickableBody.startDrag(this.dragId, mouseEvent.mouse.position);
        canvas.style.cursor = 'grabbing';
      }
    });

    Matter.Events.on(this.mouseConstraint, 'mousemove', (event: Matter.IEvent<Matter.MouseConstraint>) => {
      const mouseEvent = event as MatterMouseEvent;
      const body = this.mouseConstraint.body;
      if (body?.plugin?.clickableBody && this.mouseConstraint.body === body) {
        body.plugin.clickableBody.updateDrag(this.dragId, mouseEvent.mouse.position);
      }
    });

    Matter.Events.on(this.mouseConstraint, 'enddrag', (event: Matter.IEvent<Matter.MouseConstraint>) => {
      this.isDragging = false;
      const body = this.mouseConstraint.body;
      if (body?.plugin?.clickableBody) {
        body.plugin.clickableBody.endDrag(this.dragId);
        canvas.style.cursor = 'grab';
      }
    });
    */

    // Hover effects for clickable bodies
    Matter.Events.on(this.mouseConstraint, 'mousemove', (event: Matter.IEvent<Matter.MouseConstraint>) => {
      const mouseEvent = event as MatterMouseEvent;
      const bodies = Matter.Query.point(this.world.bodies, mouseEvent.mouse.position)
        .filter(body => !body.isStatic && body.plugin?.clickableBody);
      canvas.style.cursor = bodies.length ? 'pointer' : 'default';
    });
    
    this.render.mouse = mouse;

    if (this.render.context) {
      (this.render.context as CanvasRenderingContext2D).globalAlpha = 1;
    }

    if (canvas) {
      const displayScale = window.devicePixelRatio || 1;
      canvas.style.width = `${container.clientWidth}px`;
      canvas.style.height = `${container.clientHeight}px`;
      canvas.width = container.clientWidth * displayScale;
      canvas.height = container.clientHeight * displayScale;
    }
  }

  public start(): void {
    Matter.Render.run(this.render);
    Matter.Runner.run(this.runner, this.engine);
  }

  public stop(): void {
    Matter.Render.stop(this.render);
    Matter.Runner.stop(this.runner);
  }

  public addBody(body: Matter.Body): void {
    Matter.World.add(this.world, [body]);
  }

  public removeBody(body: Matter.Body): void {
    Matter.World.remove(this.world, body);
  }

  public addBoundaries(boundaries: Matter.Body[]): void {
    Matter.World.add(this.world, boundaries);
  }

  public resize(width: number, height: number): void {
    const displayScale = window.devicePixelRatio || 1;
    
    if (this.render.canvas) {
      this.render.canvas.style.width = `${width}px`;
      this.render.canvas.style.height = `${height}px`;
      this.render.canvas.width = width * displayScale;
      this.render.canvas.height = height * displayScale;
      this.render.bounds.max.x = width;
      this.render.bounds.max.y = height;
    }
  }

  // Remote drag constraint methods (temporarily disabled)
  /*
  public createRemoteDragConstraint(networkId: string, body: Matter.Body, point: Matter.Vector): void {
    this.removeRemoteConstraint(networkId);
    const constraint = Matter.Constraint.create({
      bodyB: body,
      pointA: point,
      pointB: { x: 0, y: 0 },
      stiffness: 0.7,
      damping: 0.3,
      render: { visible: false }
    });
    Matter.World.add(this.world, constraint);
    this.remoteConstraints.set(networkId, constraint);
  }

  public updateRemoteConstraint(networkId: string, position: Matter.Vector): boolean {
    const constraint = this.remoteConstraints.get(networkId);
    if (constraint) {
      constraint.pointA = position;
      return true;
    }
    return false;
  }

  public removeRemoteConstraint(networkId: string): void {
    const constraint = this.remoteConstraints.get(networkId);
    if (constraint) {
      Matter.World.remove(this.world, constraint);
      this.remoteConstraints.delete(networkId);
    }
  }
  */

  public getWorld(): Matter.World {
    return this.world;
  }

  public getEngine(): Matter.Engine {
    return this.engine;
  }

  public getMouseConstraint(): Matter.MouseConstraint {
    return this.mouseConstraint;
  }
}
