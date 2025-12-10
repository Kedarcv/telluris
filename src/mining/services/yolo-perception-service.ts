// YOLO-based Perception Service for real-time object detection
// Uses COCO-SSD for reliable local detection in browser

import { Detection, Hazard, Position3D, BoundingBox } from '../types';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl'; // Register WebGL backend
import * as cocoSsd from '@tensorflow-models/coco-ssd';

// Mining hazard classification
const HAZARD_CLASSES: { [key: string]: { type: Hazard['type']; severity: Hazard['severity'] } } = {
  'person': { type: 'person', severity: 'critical' },
  'truck': { type: 'vehicle', severity: 'high' },
  'vehicle': { type: 'vehicle', severity: 'high' },
  'equipment': { type: 'obstacle', severity: 'medium' },
  'obstacle': { type: 'obstacle', severity: 'medium' },
  'rock': { type: 'terrain', severity: 'low' },
  'berm': { type: 'terrain', severity: 'medium' },
  'void': { type: 'terrain', severity: 'critical' }
};

// Map COCO classes to mining classes
const CLASS_MAPPING: { [key: string]: string } = {
  'person': 'person',
  'car': 'vehicle',
  'truck': 'truck',
  'bus': 'vehicle',
  'chair': 'obstacle',
  'couch': 'obstacle',
  'potted plant': 'obstacle',
  'bed': 'obstacle',
  'dining table': 'obstacle',
  'tv': 'equipment',
  'laptop': 'equipment',
  'mouse': 'equipment',
  'keyboard': 'equipment',
  'cell phone': 'equipment'
};

export class YOLOPerceptionService {
  private model: cocoSsd.ObjectDetection | null = null;
  private isModelLoading = false;
  private detectionCallbacks: Set<(detections: Detection[]) => void> = new Set();
  private hazardCallbacks: Set<(hazards: Hazard[]) => void> = new Set();
  private frameCount = 0;
  private lastProcessTime = 0;
  private processInterval = 100; // Process every 100ms (10 FPS)

  constructor() {
    this.loadModel();
  }

  private async loadModel() {
    if (this.isModelLoading || this.model) return;

    this.isModelLoading = true;
    try {
      console.log('Initializing TensorFlow.js backend...');
      await tf.ready(); // Wait for backend to initialize
      console.log('TensorFlow.js backend ready:', tf.getBackend());

      console.log('Loading COCO-SSD model...');
      this.model = await cocoSsd.load();
      console.log('COCO-SSD model loaded successfully');
    } catch (error) {
      console.error('Failed to load COCO-SSD model:', error);
      this.model = null;
    } finally {
      this.isModelLoading = false;
    }
  }

  async processFrame(frameId: string, timestamp: number, imageData: ImageData): Promise<Detection[]> {
    // Rate limiting
    const now = Date.now();
    if (now - this.lastProcessTime < this.processInterval) {
      return [];
    }
    this.lastProcessTime = now;

    this.frameCount++;

    try {
      let detections: Detection[] = [];

      if (this.model) {
        // Use COCO-SSD model for detection
        detections = await this.detectWithCOCO(frameId, timestamp, imageData);
      } else {
        // Fallback or empty if model not loaded
        // console.log('[Perception] Model not loaded yet');
      }

      // Convert detections to hazards
      const hazards = this.detectionsToHazards(detections);

      // Notify callbacks
      this.notifyDetectionCallbacks(detections);
      this.notifyHazardCallbacks(hazards);

      return detections;
    } catch (error) {
      console.error('Error processing frame:', error);
      return [];
    }
  }

  private async detectWithCOCO(frameId: string, timestamp: number, imageData: ImageData): Promise<Detection[]> {
    if (!this.model) return [];

    try {
      // COCO-SSD takes ImageData directly
      const predictions = await this.model.detect(imageData);
      const detections: Detection[] = [];

      predictions.forEach(pred => {
        // Map class name
        const miningClass = CLASS_MAPPING[pred.class] || 'unknown';

        // Filter out unknown classes to reduce noise, unless high confidence
        if (miningClass === 'unknown' && pred.score < 0.6) return;

        const bbox = {
          x: pred.bbox[0],
          y: pred.bbox[1],
          width: pred.bbox[2],
          height: pred.bbox[3]
        };

        detections.push({
          frame_id: frameId,
          ts: timestamp,
          class: miningClass as any,
          bbox: bbox,
          position: this.pixelToWorld(bbox, imageData.width, imageData.height),
          confidence: pred.score
        });
      });

      return detections;
    } catch (error) {
      console.error('COCO inference error:', error);
      return [];
    }
  }

  private pixelToWorld(bbox: BoundingBox, imageWidth: number, imageHeight: number): Position3D {
    // Convert pixel coordinates to world coordinates
    // This is a simplified version - in production, use proper camera calibration

    // Assume camera has 90 degree FOV and is 2m high, looking forward
    const fov = Math.PI / 2;
    const cameraHeight = 2.0;
    const maxRange = 50.0; // meters

    // Center of bounding box in normalized coordinates (-1 to 1)
    const centerX = (bbox.x + bbox.width / 2) / imageWidth * 2 - 1;
    const centerY = (bbox.y + bbox.height / 2) / imageHeight * 2 - 1;

    // Estimate distance based on object size (larger = closer)
    const objectSize = Math.sqrt(bbox.width * bbox.height) / Math.sqrt(imageWidth * imageHeight);
    const distance = maxRange * (1 - objectSize);

    // Convert to world coordinates (camera frame)
    const horizontalAngle = centerX * fov / 2;
    const x = distance * Math.sin(horizontalAngle);
    const y = distance * Math.cos(horizontalAngle);
    const z = cameraHeight * (1 - centerY); // Height estimate

    return {
      x: y, // Forward is Y in vehicle frame
      y: -x, // Left is X in vehicle frame
      z: z,
      frame: 'vehicle'
    };
  }

  private detectionsToHazards(detections: Detection[]): Hazard[] {
    const hazards: Hazard[] = [];

    for (const detection of detections) {
      const hazardInfo = HAZARD_CLASSES[detection.class];
      if (hazardInfo) {
        hazards.push({
          type: hazardInfo.type,
          severity: hazardInfo.severity,
          position: detection.position,
          radius: this.estimateObjectRadius(detection),
          description: `${detection.class} detected with ${(detection.confidence * 100).toFixed(0)}% confidence`
        });
      }
    }

    return hazards;
  }

  private estimateObjectRadius(detection: Detection): number {
    // Estimate object size based on class
    const typicalSizes: { [key: string]: number } = {
      'person': 1.0,
      'truck': 5.0,
      'vehicle': 4.0,
      'equipment': 3.0,
      'obstacle': 1.0,
      'rock': 2.0,
      'unknown': 2.0
    };

    return typicalSizes[detection.class] || 2.0;
  }

  // Event subscription methods
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

  private notifyDetectionCallbacks(detections: Detection[]) {
    this.detectionCallbacks.forEach(callback => callback(detections));
  }

  private notifyHazardCallbacks(hazards: Hazard[]) {
    this.hazardCallbacks.forEach(callback => callback(hazards));
  }

  clear() {
    this.detectionCallbacks.clear();
    this.hazardCallbacks.clear();
    this.model = null;
  }

  getStats() {
    return {
      framesProcessed: this.frameCount,
      modelLoaded: this.model !== null,
      fps: this.frameCount > 0 ? 1000 / this.processInterval : 0
    };
  }
}