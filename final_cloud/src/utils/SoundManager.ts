export class SoundManager {
    private static instance: SoundManager;
    private sounds: {
        click: HTMLAudioElement;
        vanish: HTMLAudioElement;
        collision: HTMLAudioElement;
        join: HTMLAudioElement;
        leave: HTMLAudioElement;
        backgroundMusic: HTMLAudioElement;
    };

    private constructor() {
        this.sounds = {
            click: new Audio('/sounds/click.mp3'),
            vanish: new Audio('/sounds/vanish.mp3'),
            collision: new Audio('/sounds/collision.mp3'),
            join: new Audio('/sounds/join.mp3'),
            leave: new Audio('/sounds/leave.mp3'),
            backgroundMusic: new Audio('/sounds/background.mp3')
        };

        // Set volume for all sounds
        Object.values(this.sounds).forEach(sound => {
            sound.volume = 0.5;
        });
    }

    public static getInstance(): SoundManager {
        if (!SoundManager.instance) {
            SoundManager.instance = new SoundManager();
        }
        return SoundManager.instance;
    }

    public playClick(): void {
        this.sounds.click.currentTime = 0;
        this.sounds.click.play().catch(e => console.warn('Error playing click sound:', e));
    }

    public playVanish(): void {
        this.sounds.vanish.currentTime = 0;
        this.sounds.vanish.play().catch(e => console.warn('Error playing vanish sound:', e));
    }

    public playCollision(): void {
        // Prevent sound overlap for rapid collisions
        if (!this.sounds.collision.paused && this.sounds.collision.currentTime > 0) {
            return;
        }
        this.sounds.collision.currentTime = 0;
        this.sounds.collision.play().catch(e => console.warn('Error playing collision sound:', e));
    }

    public playJoin(): void {
        this.sounds.join.currentTime = 0;
        this.sounds.join.play().catch(e => console.warn('Error playing join sound:', e));
    }

    public playLeave(): void {
        this.sounds.leave.currentTime = 0;
        this.sounds.leave.play().catch(e => console.warn('Error playing leave sound:', e));
    }

    public playBackgroundMusic(): void {
        this.sounds.backgroundMusic.loop = true;
        this.sounds.backgroundMusic.volume = 0.3; // Lower volume for background music
        this.sounds.backgroundMusic.play()
            .catch(e => console.warn('Error playing background music:', e));
    }

    public stopBackgroundMusic(): void {
        this.sounds.backgroundMusic.pause();
        this.sounds.backgroundMusic.currentTime = 0;
    }
}
