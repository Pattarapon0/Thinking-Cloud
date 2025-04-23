import { RoomEnterModal } from './RoomEnterModal';

export interface RoomDetails {
    id: string;
    name: string;
    currentUsers: number;
    maxUsers: number;
    createdAt: Date;
    hasPassword: boolean;
}

export class RoomDetailCard {
    private container: HTMLDivElement;
    private room: RoomDetails;
    private onJoin?: (roomId: string, password?: string) => void;

    constructor(room: RoomDetails) {
        this.room = room;
        this.container = document.createElement('div');
        this.setupStyles();
        this.createContent();
    }

    private setupStyles(): void {
        const style = document.createElement('style');
        style.textContent = `
            .room-card {
            box-sizing: border-box;
            background: white;
            border-radius: 12px;
            width: 100%;
            height: 80px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            transition: transform 0.2s, box-shadow 0.2s;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 15px;
            padding-left: 24px; /* Added left space */
            padding-right: 24px; /* Added right space */
            }

            .room-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 8px rgba(0, 0, 0, 0.15);
            }

            .room-info {
            flex: 1;
            min-width: 0;
            display: grid;
            grid-template-columns: 200px 1fr;
            align-items: center;
            gap: 15px;
            }

            @media (max-width: 600px) {
            .room-card {
                padding-left: 12px; /* Responsive left space */
            }
            .room-info {
                grid-template-columns: 150px 1fr;
                gap: 10px;
            }

            .room-stats {
                font-size: 0.85em;
                gap: 8px;
            }

            .join-button {
                min-width: 80px;
                padding: 6px 12px;
            }
            }

            .room-name {
            font-size: 1.1em;
            font-weight: 600;
            color: #1a1a2e;
            margin: 0;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            }

            .room-stats {
            font-size: 0.9em;
            color: #666;
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
            margin: 0;
            }

            .join-button {
            background: #3b82f6;
            color: white;
            border: none;
            border-radius: 6px;
            padding: 8px 16px;
            font-size: 0.9em;
            cursor: pointer;
            transition: all 0.2s;
            white-space: nowrap;
            min-width: 90px;
            margin-left: 15px;
            flex-shrink: 0;
            }

            .join-button:hover {
            background: #2563eb;
            }

            .join-button:active {
            background: #1d4ed8;
            transform: translateY(1px);
            }

            .lock-icon {
            display: inline-block;
            margin-left: 5px;
            opacity: 0.5;
            }
        `;
        document.head.appendChild(style);
    }

    private createContent(): void {
        this.container.className = 'room-card';
        
        // Create info container
        const infoContainer = document.createElement('div');
        infoContainer.className = 'room-info';
        
        // Room name with optional lock icon
        const nameContainer = document.createElement('div');
        nameContainer.className = 'room-name';
        nameContainer.textContent = this.room.name;
        if (this.room.hasPassword) {
            const lockIcon = document.createElement('span');
            lockIcon.className = 'lock-icon';
            lockIcon.textContent = '🔒';
            nameContainer.appendChild(lockIcon);
        }
        infoContainer.appendChild(nameContainer);

        // Stats container
        const statsContainer = document.createElement('div');
        statsContainer.className = 'room-stats';

        // User count
        statsContainer.appendChild(this.createStat(`Users: ${this.room.currentUsers}/${this.room.maxUsers}`));
        
        // Creation time
        statsContainer.appendChild(this.createStat(`Created: ${this.getTimeAgo(this.room.createdAt)}`));
        
        infoContainer.appendChild(statsContainer);
        this.container.appendChild(infoContainer);

        // Join button
        const joinButton = document.createElement('button');
        joinButton.className = 'join-button';
        joinButton.textContent = 'Join Room';
        joinButton.onclick = () => {
            const modal = new RoomEnterModal(
                this.room.name, 
                this.room.hasPassword,
                { 
                    current: this.room.currentUsers, 
                    max: this.room.maxUsers 
                }
            );
            modal.onSubmit = (password) => {
                this.onJoin?.(this.room.id, password);
                modal.destroy();
            };
            modal.onCancel = () => {
                modal.destroy();
            };
            modal.attach(document.body);
        };
        this.container.appendChild(joinButton);
    }

    private getTimeAgo(date: Date): string {
        const now = new Date();
        const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

        if (diffInSeconds < 60) {
            return 'just now';
        }

        const diffInMinutes = Math.floor(diffInSeconds / 60);
        if (diffInMinutes < 60) {
            return `${diffInMinutes} min ago`;
        }

        const diffInHours = Math.floor(diffInMinutes / 60);
        if (diffInHours < 24) {
            return `${diffInHours} hours ago`;
        }

        const diffInDays = Math.floor(diffInHours / 24);
        return `${diffInDays} days ago`;
    }

    public setOnJoin(callback: (roomId: string, password?: string) => void): void {
        this.onJoin = callback;
    }

    public attach(parent: HTMLElement): void {
        parent.appendChild(this.container);
    }

    private createStat(text: string): HTMLDivElement {
        const div = document.createElement('div');
        div.className = 'room-stats';
        div.textContent = text;
        return div;
    }

    public destroy(): void {
        if (this.container.parentElement) {
            this.container.parentElement.removeChild(this.container);
        }
    }
}
