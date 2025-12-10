// Perception Service - Handles object detection, tracking, and hazard identification

import { Detection, Hazard, Position3D, Vector3D } from '../types';

export class PerceptionService {
  private detectionHistory: Map<string, Detection[]> = new Map();
  private worldModel: Map<string, TrackedObject> = new Map();
  private frameBuffer: FrameData[] = [];
  private maxFrameBufferSize = 100;
  private detectionCallbacks: Set<(detections: Detection[]) => void> = new Set();
  private hazardCallbacks: Set<(hazards: Hazard[]) => void> = new Set();

  constructor(
    private readonly config: {
      confidenceThreshold?: number;
      trackingMaxAge?: number;
      hazardProximityThresholds?: { [key: string]: number };
      updateInterval?: number;
    } = {}
  ) {
    this.config = {
      confidenceThreshold: 0.5,
      trackingMaxAge: 5000, // 5 seconds
      hazardProximityThresholds: {
        person: 8.0,
        truck: 15.0,
        equipment: 10.0,
        rock: 3.0,
        void: 5.0
      },
      updateInterval: 100, // 10 Hz
      ...config
    };

    // Start the perception update loop
    this.startUpdateLoop();
  }

  private startUpdateLoop() {
    setInterval(() => {
      this.updateWorldModel();
      this.identifyHazards();
    }, this.config.updateInterval!);
  }

  // Process new frame with detections
  async processFrame(frameId: string, timestamp: number, imageData?: ImageData): Promise<Detection[]> {
    // In production, this would call an actual ML model
    // For now, we'll simulate detection processing
    const detections = await this.runDetectionModel(frameId, imageData);

    // Store frame data
    this.frameBuffer.push({
      frameId,
      timestamp,
      detections,
      imageData
    });

    // Maintain buffer size
    if (this.frameBuffer.length > this.maxFrameBufferSize) {
      this.frameBuffer.shift();
    }

    // Update detection history
    detections.forEach(detection => {
      const trackId = this.getOrCreateTrackId(detection);
      if (!this.detectionHistory.has(trackId)) {
        this.detectionHistory.set(trackId, []);
      }
      this.detectionHistory.get(trackId)!.push(detection);
    });

    // Notify callbacks
    this.detectionCallbacks.forEach(callback => callback(detections));

    return detections;
  }

  private async runDetectionModel(frameId: string, imageData?: ImageData): Promise<Detection[]> {
    // DISABLED: Mock detections were generating fake persons and trucks
    // The AI (Gemini) analyzes the camera feed directly
    // No need for simulated/mock detections

    console.log('[Perception] Mock detection disabled - using AI vision analysis only');
    return [];

    /* ORIGINAL MOCK CODE - DISABLED
    // Simulate ML model inference
    // In production, this would:
    // 1. Preprocess the image
    // 2. Run inference on a model (YOLOv8, Detectron2, etc.)
    // 3. Post-process results
    // 4. Transform to world coordinates

    // Mock implementation for development
    const mockDetections: Detection[] = [];
    
    // Simulate random detections for testing
    if (Math.random() > 0.3) {
      mockDetections.push({
        frame_id: frameId,
        ts: Date.now(),
        class: 'person',
        bbox: { x: 100, y: 100, width: 50, height: 100 },
        position: { x: 10.5, y: 5.2, z: 0, frame: 'map' },
        confidence: 0.85
      });
    }

    if (Math.random() > 0.5) {
      mockDetections.push({
        frame_id: frameId,
        ts: Date.now(),
        class: 'truck',
        bbox: { x: 300, y: 200, width: 200, height: 150 },
        position: { x: 25.0, y: 12.0, z: 0, frame: 'map' },
        confidence: 0.92,
        velocity: { x: 2.5, y: 0.0, z: 0.0 }
      });
    }

    return mockDetections;
    */
  }

  private updateWorldModel() {
    const now = Date.now();
    const maxAge = this.config.trackingMaxAge!;

    // Update tracked objects
    this.worldModel.forEach((trackedObject, trackId) => {
      const lastDetection = trackedObject.lastDetection;
      const age = now - lastDetection.ts;

      if (age > maxAge) {
        // Remove stale tracks
        this.worldModel.delete(trackId);
        this.detectionHistory.delete(trackId);
      } else {
        // Update position based on velocity if available
        if (lastDetection.velocity && age < 1000) {
          const dt = age / 1000; // Convert to seconds
          trackedObject.predictedPosition = {
            x: lastDetection.position.x + lastDetection.velocity.x * dt,
            y: lastDetection.position.y + lastDetection.velocity.y * dt,
            z: lastDetection.position.z || 0,
            frame: lastDetection.position.frame
          };
        }
      }
    });
  }

  private identifyHazards() {
    const hazards: Hazard[] = [];
    const vehiclePosition = this.getVehiclePosition(); // Assume this gets current vehicle position

    this.worldModel.forEach((trackedObject) => {
      const detection = trackedObject.lastDetection;
      const position = trackedObject.predictedPosition || detection.position;

      // Calculate distance to vehicle
      const distance = this.calculateDistance(vehiclePosition, position);

      // Check proximity thresholds
      const threshold = this.config.hazardProximityThresholds![detection.class] || 10.0;

      if (distance < threshold) {
        const severity = this.calculateSeverity(distance, threshold, detection.class);

        hazards.push({
          type: this.mapDetectionToHazardType(detection.class),
          position: position,
          severity: severity,
          radius: threshold,
          description: `${detection.class} detected at ${distance.toFixed(1)}m`
        });
      }
    });

    // Notify callbacks
    this.hazardCallbacks.forEach(callback => callback(hazards));
  }

  private calculateDistance(pos1: Position3D, pos2: Position3D): number {
    // Convert to same frame if needed
    if (pos1.frame !== pos2.frame) {
      console.warn('Position frames do not match, distance may be inaccurate');
    }

    const dx = pos2.x - pos1.x;
    const dy = pos2.y - pos1.y;
    const dz = (pos2.z || 0) - (pos1.z || 0);

    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  private calculateSeverity(distance: number, threshold: number, objectClass: string): Hazard['severity'] {
    const ratio = distance / threshold;

    if (objectClass === 'person') {
      // Higher severity for people
      if (ratio < 0.3) return 'critical';
      if (ratio < 0.5) return 'high';
      if (ratio < 0.7) return 'medium';
      return 'low';
    } else {
      if (ratio < 0.2) return 'critical';
      if (ratio < 0.4) return 'high';
      if (ratio < 0.6) return 'medium';
      return 'low';
    }
  }

  private mapDetectionToHazardType(detectionClass: string): Hazard['type'] {
    switch (detectionClass) {
      case 'person':
        return 'person';
      case 'truck':
      case 'equipment':
        return 'vehicle';
      case 'rock':
      case 'berm':
        return 'obstacle';
      case 'void':
        return 'terrain';
      default:
        return 'obstacle';
    }
  }

  private getOrCreateTrackId(detection: Detection): string {
    // Simple tracking based on position and class
    // In production, use more sophisticated tracking (Kalman filter, etc.)
    return `${detection.class}_${Math.floor(detection.position.x)}_${Math.floor(detection.position.y)}`;
  }

  private getVehiclePosition(): Position3D {
    // This should be obtained from telemetry
    // Mock for now
    return { x: 0, y: 0, z: 0, frame: 'map' };
  }

  // Public API
  async getDetections(frameWindow: number, classes?: string[]): Promise<Detection[]> {
    const cutoffTime = Date.now() - frameWindow;
    const detections: Detection[] = [];

    this.detectionHistory.forEach((history) => {
      const recentDetections = history.filter(d =>
        d.ts >= cutoffTime &&
        d.confidence >= this.config.confidenceThreshold! &&
        (!classes || classes.includes(d.class))
      );
      detections.push(...recentDetections);
    });

    return detections;
  }

  getHazards(): Hazard[] {
    const hazards: Hazard[] = [];
    this.worldModel.forEach((trackedObject) => {
      const detection = trackedObject.lastDetection;
      const position = trackedObject.predictedPosition || detection.position;

      // Re-calculate current hazards
      const vehiclePosition = this.getVehiclePosition();
      const distance = this.calculateDistance(vehiclePosition, position);
      const threshold = this.config.hazardProximityThresholds![detection.class] || 10.0;

      if (distance < threshold * 1.5) { // Include slightly outside threshold
        const severity = this.calculateSeverity(distance, threshold, detection.class);

        hazards.push({
          type: this.mapDetectionToHazardType(detection.class),
          position: position,
          severity: severity,
          radius: threshold,
          description: `${detection.class} at ${distance.toFixed(1)}m`
        });
      }
    });

    return hazards;
  }

  getWorldModel(): Map<string, TrackedObject> {
    return new Map(this.worldModel);
  }

  onDetection(callback: (detections: Detection[]) => void): () => void {
    this.detectionCallbacks.add(callback);
    return () => {
      this.detectionCallbacks.delete(callback);
    };
  }

  onHazard(callback: (hazards: Hazard[]) => void): () => void {
    this.hazardCallbacks.add(callback);
    return () => {
      this.hazardCallbacks.delete(callback);
    };
  }

  getFrameById(frameId: string): FrameData | undefined {
    return this.frameBuffer.find(f => f.frameId === frameId);
  }

  clear() {
    this.detectionHistory.clear();
    this.worldModel.clear();
    this.frameBuffer = [];
  }
}

interface TrackedObject {
  trackId: string;
  firstSeen: number;
  lastSeen: number;
  lastDetection: Detection;
  predictedPosition?: Position3D;
  history: Detection[];
}

interface FrameData {
  frameId: string;
  timestamp: number;
  detections: Detection[];
  imageData?: ImageData;
}