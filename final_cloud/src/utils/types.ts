import * as Matter from 'matter-js';

export interface CloudDimensions {
    width: number;
    height: number;
    x: number;
    y: number;
}

export interface TextBodyOptions {
    x: number;
    y: number;
    width: number;
    height: number;
    text: string;
    networkId: string;
    ownerId?: string;  // Make optional since it might not always be present
}

export interface RoomSettings {
    maxTexts: number;
    maxUsers: number;
}

export interface NetworkTextBodyData {
    networkId: string;
    ownerId: string;
    text: string;
    position: Matter.Vector;
    velocity: Matter.Vector;
    angle: number;
    angularVelocity: number;
    clickLeft: number;
    dimensions: {
        width: number;
        height: number;
    };
}

export interface IClickableTextBody {
    body: Matter.Body;
    onClick: (world: Matter.World, manager: any) => void;
    getClickLeft: () => number;
    remove: (world: Matter.World, manager: any) => void;
    interpolatePosition: () => void;
    updateFromNetwork: (data: NetworkTextBodyData) => void;
    getNetworkId: () => string;
    getOwnerId: () => string;
    getNetworkState: () => NetworkTextBodyData;
    startDrag: () => void;
    updateDrag: () => void;
    endDrag: () => void;
    isDragged: () => boolean;
    getDraggers: () => string[];
    getDragPoint: (peerId: string) => Matter.Vector | undefined;
}

// Custom types for Matter.js events
export interface MatterMouseEvent extends Matter.IEvent<Matter.MouseConstraint> {
    mouse: Matter.Mouse;
    source: Matter.MouseConstraint;
    sourceEvents?: {
        mousemove?: MouseEvent;
        mousedown?: MouseEvent;
        mouseup?: MouseEvent;
    };
}
