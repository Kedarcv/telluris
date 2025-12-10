// Vision Integration Service - Combines camera feed, YOLO detection, and Gemini AI vision

import { GenAILiveClient } from '../../lib/genai-live-client';
import { YOLOPerceptionService } from './yolo-perception-service';
import { Detection, Position3D, Hazard } from '../types';

export interface UltrasonicReading {
  sensor_id: string;
  distance_cm: number;
  angle: number; // Relative to vehicle front
  timestamp: number;
}

export interface VisionFrame {
  frameId: string;
  timestamp: number;
  imageData: ImageData;
  detections: Detection[];
  ultrasonicReadings: UltrasonicReading[];
  hazards: Hazard[];
}

export interface ObstacleAvoidanceAction {
  type: 'stop' | 'turn_left' | 'turn_right' | 'reverse' | 'slow_down' | 'continue';
  urgency: 'immediate' | 'normal' | 'precautionary';
  reason: string;
  parameters?: {
    angle?: number;
    speed?: number;
    distance?: number;
  };
}

export class VisionIntegrationService {
  private yoloService: YOLOPerceptionService;
  private geminiClient: GenAILiveClient | null = null;
  private isProcessingFrame = false;
  private lastFrameTime = 0;
  private frameInterval = 100; // Local safety check every 100ms (10 FPS)
  private geminiInterval = 1000; // Gemini strategy every 1s (1 FPS)
  private lastGeminiTime = 0;
  private ultrasonicReadings: Map<string, UltrasonicReading> = new Map();
  private videoStream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  // Callbacks
  private frameCallbacks: Set<(frame: VisionFrame) => void> = new Set();
  private avoidanceCallbacks: Set<(action: ObstacleAvoidanceAction) => void> = new Set();

  constructor() {
    this.yoloService = new YOLOPerceptionService();

    // Create canvas for frame processing
    this.canvas = document.createElement('canvas');
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get canvas context');
    this.ctx = ctx;
  }

  // Initialize with video stream and Gemini client
  async initialize(videoStream: MediaStream, geminiClient: GenAILiveClient) {
    this.videoStream = videoStream;
    this.geminiClient = geminiClient;

    // Create video element
    this.videoElement = document.createElement('video');
    this.videoElement.srcObject = videoStream;
    this.videoElement.play();

    // Wait for video to be ready
    await new Promise((resolve) => {
      this.videoElement!.onloadedmetadata = resolve;
    });

    console.log('Vision Integration Service initialized');
  }

  // Process video frame with YOLO and send to Gemini
  async processFrame(): Promise<VisionFrame | null> {
    if (!this.videoElement || !this.geminiClient || this.isProcessingFrame) {
      return null;
    }

    const now = Date.now();
    if (now - this.lastFrameTime < this.frameInterval) {
      return null;
    }

    this.isProcessingFrame = true;
    this.lastFrameTime = now;

    try {
      // Capture frame
      const width = this.videoElement.videoWidth;
      const height = this.videoElement.videoHeight;

      if (width === 0 || height === 0) {
        return null;
      }

      this.canvas.width = width;
      this.canvas.height = height;
      this.ctx.drawImage(this.videoElement, 0, 0);

      const imageData = this.ctx.getImageData(0, 0, width, height);
      const frameId = `frame_${now}`;

      // Run YOLO detection
      const detections = await this.yoloService.processFrame(frameId, now, imageData);

      // Get latest ultrasonic readings
      const ultrasonicReadings = Array.from(this.ultrasonicReadings.values());

      // Combine detections with ultrasonic data
      const enhancedDetections = this.enhanceDetectionsWithUltrasonic(detections, ultrasonicReadings);

      // Identify hazards
      const hazards = this.identifyHazards(enhancedDetections, ultrasonicReadings);

      // Create vision frame
      const visionFrame: VisionFrame = {
        frameId,
        timestamp: now,
        imageData,
        detections: enhancedDetections,
        ultrasonicReadings,
        hazards
      };

      // IMMEDIATE SAFETY CHECK (Local) - DISABLED for Telluris Passive Mode
      /*
      if (this.needsImmediateAvoidance(visionFrame)) {
        console.log('[Safety] Immediate hazard detected! Triggering local avoidance.');
        const avoidanceAction = this.calculateAvoidanceManeuver(visionFrame);
        this.avoidanceCallbacks.forEach(cb => cb(avoidanceAction));
      }
      */

      // Send to Gemini for analysis (Throttled)
      if (now - this.lastGeminiTime > this.geminiInterval) {
        this.lastGeminiTime = now;
        // Don't await this, let it run in background
        this.sendFrameToGemini(visionFrame).catch(err => console.error('Gemini send error:', err));
      }

      // Notify callbacks
      this.frameCallbacks.forEach(cb => cb(visionFrame));

      return visionFrame;

    } catch (error) {
      console.error('Error processing vision frame:', error);
      return null;
    } finally {
      this.isProcessingFrame = false;
    }
  }

  // Send frame to Gemini for scene understanding
  private async sendFrameToGemini(frame: VisionFrame) {
    if (!this.geminiClient) return;

    // Convert frame to base64 JPEG for Gemini
    const jpegBlob = await new Promise<Blob>((resolve) => {
      this.canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.8);
    });

    const reader = new FileReader();
    const base64Promise = new Promise<string>((resolve) => {
      reader.onloadend = () => {
        const base64 = reader.result as string;
        resolve(base64.split(',')[1]); // Remove data:image/jpeg;base64, prefix
      };
    });
    reader.readAsDataURL(jpegBlob);
    const base64 = await base64Promise;

    // console.log(`[Vision] Prepared frame: ${base64.length} chars`);
    if (base64.length < 1000) {
      console.warn('[Vision] Warning: Frame data seems too small');
    }

    // Build scene description
    const sceneDescription = this.buildSceneDescription(frame);

    // Send image and description to Gemini
    await this.geminiClient.sendRealtimeInput([
      {
        mimeType: 'image/jpeg',
        data: base64
      }
    ]);

    console.log('[Vision] Sent frame to Gemini for analysis');

    // Send analysis request - DISABLED for Telluris Passive Mode
    // We only send the image frame (sendRealtimeInput) so Gemini can see.
    // The autonomous navigation prompt is disabled to allow user-driven interaction.
    /*
    const prompt = `You are driving a rover in an indoor environment (office/building).
${sceneDescription}

Your Goal: Navigate safely and avoid obstacles.
CRITICAL: OUTPUT COMMANDS ONLY. NO NARRATION.
Do not describe the scene. Just say the action.

Instructions:
1. CONTINUOUS SAFETY CHECK:
   - If person is VERY CLOSE (< 1m): "STOP" (Emergency)
   - If person is CLOSE (1-3m): "LEFT" or "RIGHT" or "REVERSE" to move away/avoid.
   - If person is visible but safe: Keep distance.

2. NAVIGATION (if path clear of people):
   - Check for obstacles (chairs, tables).
   - "FORWARD" if clear.
   - "LEFT" or "RIGHT" to go around obstacles.

3. Output the command clearly.
CRITICAL: Do not just stop and wait. If a person is close, MANEUVER AWAY from them.`;

    await this.geminiClient.send([{ text: prompt }]);
    */
  }

  // Enhance YOLO detections with ultrasonic distance data
  private enhanceDetectionsWithUltrasonic(
    detections: Detection[],
    ultrasonicReadings: UltrasonicReading[]
  ): Detection[] {
    return detections.map(detection => {
      // Find the ultrasonic sensor closest to the detection angle
      const detectionAngle = Math.atan2(detection.position.y, detection.position.x);

      let closestReading: UltrasonicReading | null = null;
      let minAngleDiff = Math.PI;

      for (const reading of ultrasonicReadings) {
        const angleDiff = Math.abs(reading.angle - detectionAngle);
        if (angleDiff < minAngleDiff) {
          minAngleDiff = angleDiff;
          closestReading = reading;
        }
      }

      // If ultrasonic shows closer obstacle than YOLO, update distance
      if (closestReading) {
        const ultrasonicDistance = closestReading.distance_cm / 100; // Convert to meters
        const yoloDistance = Math.sqrt(
          detection.position.x * detection.position.x +
          detection.position.y * detection.position.y
        );

        if (ultrasonicDistance < yoloDistance) {
          // Update position based on ultrasonic reading
          const scale = ultrasonicDistance / yoloDistance;
          detection.position.x *= scale;
          detection.position.y *= scale;
        }
      }

      return detection;
    });
  }

  // Identify hazards from detections and sensors
  private identifyHazards(detections: Detection[], ultrasonicReadings: UltrasonicReading[]): Hazard[] {
    const hazards: Hazard[] = [];

    // Check for close obstacles from YOLO
    for (const detection of detections) {
      const distance = Math.sqrt(
        detection.position.x * detection.position.x +
        detection.position.y * detection.position.y
      );

      let severity: Hazard['severity'] = 'low';
      if (distance < 2) severity = 'critical';
      else if (distance < 5) severity = 'high';
      else if (distance < 10) severity = 'medium';

      if (severity !== 'low') {
        hazards.push({
          type: detection.class === 'person' ? 'person' : 'obstacle',
          position: detection.position,
          severity,
          radius: this.estimateObjectRadius(detection.class),
          description: `${detection.class} detected ${distance.toFixed(1)}m ahead`
        });
      }
    }

    // Check for ultrasonic warnings (obstacles YOLO might have missed)
    for (const reading of ultrasonicReadings) {
      if (reading.distance_cm < 200) { // Less than 2 meters
        const severity: Hazard['severity'] =
          reading.distance_cm < 50 ? 'critical' :
            reading.distance_cm < 100 ? 'high' : 'medium';

        // Convert ultrasonic reading to position
        const distance = reading.distance_cm / 100;
        const position: Position3D = {
          x: Math.cos(reading.angle) * distance,
          y: Math.sin(reading.angle) * distance,
          z: 0,
          frame: 'vehicle'
        };

        hazards.push({
          type: 'obstacle',
          position,
          severity,
          radius: 0.5,
          description: `Ultrasonic: obstacle ${reading.distance_cm}cm at ${Math.round(reading.angle * 180 / Math.PI)}°`
        });
      }
    }

    return hazards;
  }

  // Build text description of the scene
  private buildSceneDescription(frame: VisionFrame): string {
    const lines = [`Timestamp: ${new Date(frame.timestamp).toISOString()}`];

    // Group detections by class
    const detectionGroups: { [key: string]: number } = {};
    frame.detections.forEach(d => {
      detectionGroups[d.class] = (detectionGroups[d.class] || 0) + 1;
    });

    lines.push('\nDetected Objects:');
    if (Object.keys(detectionGroups).length === 0) {
      lines.push('(None detected by local system - rely on your visual analysis)');
    } else {
      Object.entries(detectionGroups).forEach(([cls, count]) => {
        lines.push(`- ${count} ${cls}${count > 1 ? 's' : ''}`);
      });
    }

    // Add closest obstacles
    const sortedDetections = [...frame.detections].sort((a, b) => {
      const distA = Math.sqrt(a.position.x * a.position.x + a.position.y * a.position.y);
      const distB = Math.sqrt(b.position.x * b.position.x + b.position.y * b.position.y);
      return distA - distB;
    });

    if (sortedDetections.length > 0) {
      lines.push('\nClosest Obstacles:');
      sortedDetections.slice(0, 3).forEach(d => {
        const dist = Math.sqrt(d.position.x * d.position.x + d.position.y * d.position.y);
        const angle = Math.atan2(d.position.y, d.position.x) * 180 / Math.PI;
        lines.push(`- ${d.class}: ${dist.toFixed(1)}m at ${angle.toFixed(0)}°`);
      });
    }

    // Add ultrasonic readings
    if (frame.ultrasonicReadings.length > 0) {
      lines.push('\nUltrasonic Sensors:');
      frame.ultrasonicReadings.forEach(r => {
        lines.push(`- Sensor ${r.sensor_id}: ${r.distance_cm}cm at ${(r.angle * 180 / Math.PI).toFixed(0)}°`);
      });
    }

    // Add hazard summary
    if (frame.hazards.length > 0) {
      lines.push('\nHazards:');
      frame.hazards.forEach(h => {
        lines.push(`- ${h.severity.toUpperCase()}: ${h.description}`);
      });
    }

    return lines.join('\n');
  }

  // Check if immediate avoidance is needed
  private needsImmediateAvoidance(frame: VisionFrame): boolean {
    // Check for critical hazards
    const criticalHazards = frame.hazards.filter(h => h.severity === 'critical');
    if (criticalHazards.length > 0) return true;

    // Check for very close ultrasonic readings
    const closeUltrasonic = frame.ultrasonicReadings.some(r => r.distance_cm < 50);
    if (closeUltrasonic) return true;

    // Check for person within safety distance
    const personNearby = frame.detections.some(d => {
      if (d.class !== 'person') return false;
      const dist = Math.sqrt(d.position.x * d.position.x + d.position.y * d.position.y);
      return dist < 3; // Reduced to 3m for office demo
    });

    return personNearby;
  }

  // Calculate obstacle avoidance maneuver
  private calculateAvoidanceManeuver(frame: VisionFrame): ObstacleAvoidanceAction {
    // Find the most critical hazard
    const criticalHazards = frame.hazards
      .filter(h => h.severity === 'critical' || h.severity === 'high')
      .sort((a, b) => {
        const distA = Math.sqrt(a.position.x * a.position.x + a.position.y * a.position.y);
        const distB = Math.sqrt(b.position.x * b.position.x + b.position.y * b.position.y);
        return distA - distB;
      });

    if (criticalHazards.length === 0) {
      return {
        type: 'slow_down',
        urgency: 'precautionary',
        reason: 'Obstacle detected ahead',
        parameters: { speed: 1.0 }
      };
    }

    const closestHazard = criticalHazards[0];
    const hazardAngle = Math.atan2(closestHazard.position.y, closestHazard.position.x);
    const hazardDistance = Math.sqrt(
      closestHazard.position.x * closestHazard.position.x +
      closestHazard.position.y * closestHazard.position.y
    );

    // If very close or person is within critical zone, stop immediately
    // For person: Stop if < 1.5m. If > 1.5m, try to avoid.
    const isPerson = closestHazard.type === 'person';
    const criticalDistance = isPerson ? 1.5 : 1.0;

    if (hazardDistance < criticalDistance) {
      return {
        type: 'stop',
        urgency: 'immediate',
        reason: `${closestHazard.type} detected ${hazardDistance.toFixed(1)}m ahead`
      };
    }

    // Calculate best avoidance direction
    const leftClear = this.isDirectionClear(frame, -Math.PI / 4); // 45 degrees left
    const rightClear = this.isDirectionClear(frame, Math.PI / 4); // 45 degrees right

    if (hazardAngle > 0 && leftClear) {
      // Hazard is on the right, turn left
      return {
        type: 'turn_left',
        urgency: hazardDistance < 2 ? 'immediate' : 'normal',
        reason: `Avoiding ${closestHazard.type} on right`,
        parameters: { angle: 30, speed: 0.5 }
      };
    } else if (hazardAngle <= 0 && rightClear) {
      // Hazard is on the left, turn right
      return {
        type: 'turn_right',
        urgency: hazardDistance < 2 ? 'immediate' : 'normal',
        reason: `Avoiding ${closestHazard.type} on left`,
        parameters: { angle: 30, speed: 0.5 }
      };
    } else if (!leftClear && !rightClear) {
      // Both sides blocked, reverse
      return {
        type: 'reverse',
        urgency: 'immediate',
        reason: 'Path blocked, reversing',
        parameters: { distance: 2, speed: 0.5 }
      };
    } else {
      // Choose the clearer side
      const leftObstacles = this.countObstaclesInDirection(frame, -Math.PI / 4);
      const rightObstacles = this.countObstaclesInDirection(frame, Math.PI / 4);

      return {
        type: leftObstacles < rightObstacles ? 'turn_left' : 'turn_right',
        urgency: 'normal',
        reason: `Choosing clearer path`,
        parameters: { angle: 45, speed: 0.5 }
      };
    }
  }

  // Check if a direction is clear
  private isDirectionClear(frame: VisionFrame, angleOffset: number): boolean {
    const checkDistance = 5.0; // Check 5 meters in the direction

    // Check detections
    for (const detection of frame.detections) {
      const objectAngle = Math.atan2(detection.position.y, detection.position.x);
      const angleDiff = Math.abs(objectAngle - angleOffset);

      if (angleDiff < Math.PI / 6) { // Within 30 degrees of check direction
        const distance = Math.sqrt(
          detection.position.x * detection.position.x +
          detection.position.y * detection.position.y
        );
        if (distance < checkDistance) return false;
      }
    }

    // Check ultrasonic in that direction
    for (const reading of frame.ultrasonicReadings) {
      const angleDiff = Math.abs(reading.angle - angleOffset);
      if (angleDiff < Math.PI / 6 && reading.distance_cm < checkDistance * 100) {
        return false;
      }
    }

    return true;
  }

  // Count obstacles in a direction
  private countObstaclesInDirection(frame: VisionFrame, angleOffset: number): number {
    let count = 0;

    for (const detection of frame.detections) {
      const objectAngle = Math.atan2(detection.position.y, detection.position.x);
      const angleDiff = Math.abs(objectAngle - angleOffset);

      if (angleDiff < Math.PI / 4) { // Within 45 degrees
        count++;
      }
    }

    return count;
  }

  private estimateObjectRadius(objectClass: string): number {
    const sizes: { [key: string]: number } = {
      'person': 1.0,
      'truck': 5.0,
      'equipment': 3.0,
      'rock': 2.0,
      'unknown': 2.0
    };
    return sizes[objectClass] || 2.0;
  }

  // Update ultrasonic readings
  updateUltrasonicReadings(readings: UltrasonicReading[]) {
    for (const reading of readings) {
      this.ultrasonicReadings.set(reading.sensor_id, reading);
    }
  }

  // Event subscriptions
  onFrame(callback: (frame: VisionFrame) => void): () => void {
    this.frameCallbacks.add(callback);
    return () => this.frameCallbacks.delete(callback);
  }

  onAvoidanceAction(callback: (action: ObstacleAvoidanceAction) => void): () => void {
    this.avoidanceCallbacks.add(callback);
    return () => this.avoidanceCallbacks.delete(callback);
  }

  // Start continuous processing
  startProcessing() {
    const process = async () => {
      await this.processFrame();
      if (this.videoStream) {
        requestAnimationFrame(process);
      }
    };
    process();
  }

  // Stop processing
  stopProcessing() {
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
    this.videoStream = null;
  }

  // Cleanup
  destroy() {
    this.stopProcessing();
    this.frameCallbacks.clear();
    this.avoidanceCallbacks.clear();
    this.yoloService.clear();
  }
}