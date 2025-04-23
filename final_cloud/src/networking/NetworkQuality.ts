import { DEBUG } from '../utils/constants';

export interface ConnectionStats {
    latency: number;        // Round-trip time in ms
    packetLoss: number;     // Percentage of lost packets
    bandwidth: number;      // Estimated bandwidth in Kbps
    jitter: number;         // Variation in latency (ms)
    quality: 'excellent' | 'good' | 'fair' | 'poor';
}

interface ExtendedRTCStats extends RTCStats {
    currentRoundTripTime?: number;
    jitter?: number;
    bytesReceived?: number;
    timestamp: number;
    packetsLost?: number;
    packetsReceived?: number;
    packetsSent?: number;
    bytesSent?: number;
}

export class NetworkQuality {
    private static readonly HISTORY_SIZE = 50;
    private static readonly UPDATE_INTERVAL = 1000; // 1 second

    private rtcPeerConnection: RTCPeerConnection;
    private lastStats: Map<string, ExtendedRTCStats> = new Map();
    private latencyHistory: number[] = [];
    private packetLossHistory: number[] = [];
    private bandwidthHistory: number[] = [];
    private jitterHistory: number[] = [];
    private updateInterval: number = 0;

    constructor(peerConnection: RTCPeerConnection) {
        this.rtcPeerConnection = peerConnection;
        this.startMonitoring();
    }

    private startMonitoring(): void {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        
        this.updateInterval = window.setInterval(
            () => this.updateStats(),
            NetworkQuality.UPDATE_INTERVAL
        );
    }

    private async updateStats(): Promise<void> {
        try {
            const stats = await this.rtcPeerConnection.getStats();
            
            stats.forEach(stat => {
                const extendedStat = stat as ExtendedRTCStats;
                if (stat.type === 'candidate-pair' && 'currentRoundTripTime' in stat) {
                    this.updateLatency(extendedStat);
                    this.updatePacketLoss(extendedStat);
                    this.updateBandwidth(extendedStat);
                    this.updateJitter(extendedStat);
                }
                this.lastStats.set(stat.id, extendedStat);
            });

            if (DEBUG.network) {
                const currentStats = this.getStats();
                console.log('Network Quality Stats:', currentStats);
            }

        } catch (error) {
            console.error('Error collecting network stats:', error);
        }
    }

    private updateLatency(stat: ExtendedRTCStats): void {
        if (stat.currentRoundTripTime !== undefined) {
            const rtt = stat.currentRoundTripTime * 1000;
            this.latencyHistory.push(rtt);
            if (this.latencyHistory.length > NetworkQuality.HISTORY_SIZE) {
                this.latencyHistory.shift();
            }
        }
    }

    private updateJitter(stat: ExtendedRTCStats): void {
        if (stat.jitter !== undefined) {
            const jitterMs = stat.jitter * 1000;
            this.jitterHistory.push(jitterMs);
            if (this.jitterHistory.length > NetworkQuality.HISTORY_SIZE) {
                this.jitterHistory.shift();
            }
        } else {
            // Calculate jitter manually if not provided
            if (this.latencyHistory.length >= 2) {
                const latencyDiff = Math.abs(
                    this.latencyHistory[this.latencyHistory.length - 1] -
                    this.latencyHistory[this.latencyHistory.length - 2]
                );
                this.jitterHistory.push(latencyDiff);
                if (this.jitterHistory.length > NetworkQuality.HISTORY_SIZE) {
                    this.jitterHistory.shift();
                }
            }
        }
    }

    private updatePacketLoss(stat: ExtendedRTCStats): void {
        const totalSent = stat.packetsSent ?? 0;
        const totalLost = stat.packetsLost ?? 0;
        
        if (totalSent > 0) {
            const packetLoss = (totalLost / (totalSent + totalLost)) * 100;
            this.packetLossHistory.push(packetLoss);
            if (this.packetLossHistory.length > NetworkQuality.HISTORY_SIZE) {
                this.packetLossHistory.shift();
            }
        }
    }

    private updateBandwidth(stat: ExtendedRTCStats): void {
        if (stat.bytesReceived !== undefined && stat.timestamp) {
            const lastStat = this.lastStats.get(stat.id);
            
            if (lastStat?.bytesReceived !== undefined && lastStat.timestamp) {
                const timeDiff = stat.timestamp - lastStat.timestamp;
                const bytesDiff = stat.bytesReceived - lastStat.bytesReceived;
                const kbps = (bytesDiff * 8) / (timeDiff / 1000) / 1024;
                
                if (kbps >= 0) {  // Ensure we don't record negative bandwidth
                    this.bandwidthHistory.push(kbps);
                    if (this.bandwidthHistory.length > NetworkQuality.HISTORY_SIZE) {
                        this.bandwidthHistory.shift();
                    }
                }
            }
        }
    }

    private getAverageValue(values: number[]): number {
        if (values.length === 0) return 0;
        return values.reduce((a, b) => a + b, 0) / values.length;
    }

    private determineQuality(
        latency: number,
        packetLoss: number,
        bandwidth: number,
        jitter: number
    ): ConnectionStats['quality'] {
        // Thresholds for quality determination
        const LATENCY_THRESHOLDS = { excellent: 50, good: 100, fair: 200 };
        const PACKET_LOSS_THRESHOLDS = { excellent: 0.5, good: 2, fair: 5 };
        const BANDWIDTH_THRESHOLDS = { excellent: 1000, good: 500, fair: 200 };
        const JITTER_THRESHOLDS = { excellent: 10, good: 30, fair: 50 };

        // Score each metric (3 = excellent, 2 = good, 1 = fair, 0 = poor)
        const scores = [
            latency <= LATENCY_THRESHOLDS.excellent ? 3 :
            latency <= LATENCY_THRESHOLDS.good ? 2 :
            latency <= LATENCY_THRESHOLDS.fair ? 1 : 0,

            packetLoss <= PACKET_LOSS_THRESHOLDS.excellent ? 3 :
            packetLoss <= PACKET_LOSS_THRESHOLDS.good ? 2 :
            packetLoss <= PACKET_LOSS_THRESHOLDS.fair ? 1 : 0,

            bandwidth >= BANDWIDTH_THRESHOLDS.excellent ? 3 :
            bandwidth >= BANDWIDTH_THRESHOLDS.good ? 2 :
            bandwidth >= BANDWIDTH_THRESHOLDS.fair ? 1 : 0,

            jitter <= JITTER_THRESHOLDS.excellent ? 3 :
            jitter <= JITTER_THRESHOLDS.good ? 2 :
            jitter <= JITTER_THRESHOLDS.fair ? 1 : 0
        ];

        // Calculate weighted average score (jitter and latency weighted more heavily)
        const weights = [1.5, 1, 1, 1.5]; // Weights for latency, packet loss, bandwidth, jitter
        const weightedSum = scores.reduce((sum, score, i) => sum + score * weights[i], 0);
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        const avgScore = weightedSum / totalWeight;

        // Map average score to quality level
        if (avgScore >= 2.5) return 'excellent';
        if (avgScore >= 1.5) return 'good';
        if (avgScore >= 0.5) return 'fair';
        return 'poor';
    }

    public getStats(): ConnectionStats {
        const latency = this.getAverageValue(this.latencyHistory);
        const packetLoss = this.getAverageValue(this.packetLossHistory);
        const bandwidth = this.getAverageValue(this.bandwidthHistory);
        const jitter = this.getAverageValue(this.jitterHistory);
        const quality = this.determineQuality(latency, packetLoss, bandwidth, jitter);

        return {
            latency,
            packetLoss,
            bandwidth,
            jitter,
            quality
        };
    }

    public stop(): void {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
    }
}
