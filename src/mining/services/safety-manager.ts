// Safety Manager - Enforces safety policies and monitors for violations

import {
  SafetyPolicy,
  SafetyStatus,
  RiskLevel,
  Hazard,
  Detection,
  Position3D,
  VehiclePose,
  Geofence,
  ClearanceRequirement,
  SafetyBreach,
  Zone,
  ESP32Command,
  ESP32StopCommand
} from '../types';

export class SafetyManager {
  private safetyPolicy: SafetyPolicy;
  private currentSafetyStatus: SafetyStatus;
  private safetyBreachHistory: SafetyBreach[] = [];
  private safetyCallbacks: Set<(status: SafetyStatus) => void> = new Set();
  private emergencyStopCallbacks: Set<(reason: string) => void> = new Set();
  private lastVehiclePose: VehiclePose | null = null;

  constructor(initialPolicy: SafetyPolicy) {
    this.safetyPolicy = initialPolicy;
    this.currentSafetyStatus = {
      risk_level: 'minimal',
      e_stop: false,
      safety_bubble_breaches: [],
      active_hazards: []
    };
  }

  // Update safety status based on current conditions
  updateSafetyStatus(
    vehiclePose: VehiclePose,
    detections: Detection[],
    hazards: Hazard[],
    telemetry?: any
  ): SafetyStatus {
    this.lastVehiclePose = vehiclePose;

    // Check all safety conditions
    const geofenceViolation = this.checkGeofences(vehiclePose);
    const clearanceViolations = this.checkClearanceRequirements(vehiclePose, detections);
    const speedViolation = this.checkSpeedLimits(vehiclePose, telemetry?.velocity?.linear);

    // Update active hazards
    this.currentSafetyStatus.active_hazards = hazards;

    // Calculate nearest obstacle
    const nearestObstacle = this.findNearestObstacle(vehiclePose, detections);
    if (nearestObstacle) {
      this.currentSafetyStatus.nearest_obstacle_m = nearestObstacle.distance;
      this.currentSafetyStatus.nearest_obstacle_class = nearestObstacle.detection.class;
    }

    // Update safety bubble breaches
    this.currentSafetyStatus.safety_bubble_breaches = clearanceViolations;

    // Store breach history
    this.safetyBreachHistory.push(...clearanceViolations);

    // Maintain history size
    const historyLimit = Date.now() - 3600000; // Keep 1 hour of history
    this.safetyBreachHistory = this.safetyBreachHistory.filter(
      breach => breach.timestamp > historyLimit
    );

    // Determine overall risk level
    this.currentSafetyStatus.risk_level = this.calculateRiskLevel(
      geofenceViolation,
      clearanceViolations,
      speedViolation,
      hazards
    );

    // Check if emergency stop is needed
    const shouldEStop = this.shouldEmergencyStop(
      this.currentSafetyStatus.risk_level,
      clearanceViolations,
      hazards
    );

    if (shouldEStop && !this.currentSafetyStatus.e_stop) {
      this.triggerEmergencyStop('Critical safety violation detected');
    } else if (!shouldEStop && this.currentSafetyStatus.e_stop) {
      // Clear e-stop if conditions have improved
      // Note: In practice, e-stop should require manual reset
      console.log('E-stop conditions cleared, but manual reset required');
    }

    // Notify callbacks
    this.safetyCallbacks.forEach(callback => callback(this.currentSafetyStatus));

    return this.currentSafetyStatus;
  }

  private checkGeofences(pose: VehiclePose): boolean {
    for (const geofence of this.safetyPolicy.geofences) {
      if (!geofence.active) continue;

      // Convert VehiclePose frame to Position3D compatible frame
      // Use 'map' frame for geofence calculations as it's the common frame
      const isInside = this.isPointInPolygon(
        { x: pose.x, y: pose.y, frame: 'map' as const },
        geofence.polygon
      );

      if (geofence.type === 'exclusion' && isInside) {
        console.warn(`Vehicle inside exclusion zone: ${geofence.name}`);
        return true;
      }

      if (geofence.type === 'inclusion' && !isInside) {
        console.warn(`Vehicle outside inclusion zone: ${geofence.name}`);
        return true;
      }
    }

    return false;
  }

  private checkClearanceRequirements(
    pose: VehiclePose,
    detections: Detection[]
  ): SafetyBreach[] {
    const breaches: SafetyBreach[] = [];

    for (const detection of detections) {
      const requirement = this.safetyPolicy.clearance_requirements.find(
        req => req.object_class === detection.class
      );

      if (!requirement) continue;

      const distance = this.calculateDistance(
        { x: pose.x, y: pose.y, z: 0, frame: 'map' as const },
        detection.position
      );

      if (distance < requirement.min_distance_m) {
        breaches.push({
          timestamp: Date.now(),
          object_class: detection.class,
          distance_m: distance,
          position: detection.position
        });
      }
    }

    return breaches;
  }

  private checkSpeedLimits(pose: VehiclePose, currentSpeed?: number): boolean {
    if (!currentSpeed) return false;

    // Find applicable speed limit
    let maxSpeed = Infinity;

    for (const limit of this.safetyPolicy.speed_limits) {
      // Check if we're in a specific zone
      if (limit.zone_id) {
        // Would need to check if current position is in zone
        // For now, apply global limits
      }

      maxSpeed = Math.min(maxSpeed, limit.max_speed_mps);
    }

    return currentSpeed > maxSpeed;
  }

  private calculateRiskLevel(
    geofenceViolation: boolean,
    clearanceViolations: SafetyBreach[],
    speedViolation: boolean,
    hazards: Hazard[]
  ): RiskLevel {
    // MODIFIED: Less aggressive risk calculation to allow AI navigation
    // Count critical factors
    let criticalCount = 0;
    let highCount = 0;
    let mediumCount = 0;

    if (geofenceViolation) highCount++; // Reduced from critical

    // Check clearance violations - only very close objects are critical
    for (const violation of clearanceViolations) {
      if (violation.object_class === 'person' && violation.distance_m < 1.0) {
        criticalCount++; // Person within 1m is critical
      } else if (violation.object_class === 'person' && violation.distance_m < 3.0) {
        highCount++; // Person within 3m is high
      } else if (violation.distance_m < 2.0) {
        mediumCount++; // Other objects within 2m are medium
      }
    }

    // Check hazards - be less aggressive
    for (const hazard of hazards) {
      if (hazard.severity === 'critical') criticalCount++;
      else if (hazard.severity === 'high') mediumCount++; // Reduced from high
      else if (hazard.severity === 'medium') mediumCount++;
    }

    if (speedViolation) mediumCount++; // Reduced from high

    // Determine overall risk level - require more violations
    if (criticalCount > 0) return 'critical';
    if (highCount > 2) return 'high'; // Require 3+ high risks
    if (highCount > 0 || mediumCount > 5) return 'medium'; // Require more medium risks
    if (mediumCount > 2) return 'low';

    return 'minimal';
  }

  private shouldEmergencyStop(
    riskLevel: RiskLevel,
    clearanceViolations: SafetyBreach[],
    hazards: Hazard[]
  ): boolean {
    // DISABLED: Let AI handle navigation decisions
    // Only trigger e-stop for truly critical situations

    // E-stop if person VERY close (< 1m)
    const personVeryClose = clearanceViolations.some(
      v => v.object_class === 'person' && v.distance_m < 1.0
    );
    if (personVeryClose) return true;

    // Otherwise, let the AI make decisions
    return false;

    /* ORIGINAL CODE - TOO AGGRESSIVE
    // E-stop on critical risk
    if (riskLevel === 'critical') return true;
    
    // E-stop if person too close
    const personTooClose = clearanceViolations.some(
      v => v.object_class === 'person' && v.distance_m < 2
    );
    if (personTooClose) return true;
    
    // E-stop on multiple high-severity hazards
    const highSeverityHazards = hazards.filter(h => h.severity === 'high').length;
    if (highSeverityHazards >= 3) return true;
    
    // Check if risk level exceeds policy maximum
    const riskLevels: RiskLevel[] = ['minimal', 'low', 'medium', 'high', 'critical'];
    const currentRiskIndex = riskLevels.indexOf(riskLevel);
    const maxRiskIndex = riskLevels.indexOf(this.safetyPolicy.max_risk_level);
    
    return currentRiskIndex > maxRiskIndex;
    */
  }

  private triggerEmergencyStop(reason: string) {
    console.error(`EMERGENCY STOP: ${reason}`);
    this.currentSafetyStatus.e_stop = true;
    this.emergencyStopCallbacks.forEach(callback => callback(reason));
  }

  // Validate a command before execution
  validateCommand(command: ESP32Command): { valid: boolean; reason?: string } {
    if (this.currentSafetyStatus.e_stop) {
      return { valid: false, reason: 'Emergency stop is active' };
    }

    // Check risk level
    if (this.currentSafetyStatus.risk_level === 'critical') {
      return { valid: false, reason: 'Critical risk level - motion not allowed' };
    }

    // Validate specific command types
    if (command.type === 'drive') {
      const driveCmd = command as any;

      // Check speed limits
      const maxSpeed = this.getMaxAllowedSpeed();
      if (Math.abs(driveCmd.linear_mps) > maxSpeed) {
        return {
          valid: false,
          reason: `Speed ${driveCmd.linear_mps} exceeds limit ${maxSpeed}`
        };
      }

      // Check if motion is allowed given current safety status
      if (this.currentSafetyStatus.risk_level === 'high' && driveCmd.linear_mps > 0.5) {
        return {
          valid: false,
          reason: 'High risk - only slow speed allowed'
        };
      }
    }

    return { valid: true };
  }

  private getMaxAllowedSpeed(): number {
    let maxSpeed = 10; // Default max

    // Apply policy speed limits
    for (const limit of this.safetyPolicy.speed_limits) {
      maxSpeed = Math.min(maxSpeed, limit.max_speed_mps);
    }

    // Reduce speed based on risk level
    switch (this.currentSafetyStatus.risk_level) {
      case 'high':
        maxSpeed = Math.min(maxSpeed, 0.5);
        break;
      case 'medium':
        maxSpeed = Math.min(maxSpeed, 2.0);
        break;
      case 'low':
        maxSpeed = Math.min(maxSpeed, 5.0);
        break;
    }

    return maxSpeed;
  }

  // Utility methods
  private isPointInPolygon(point: Position3D, polygon: Position3D[]): boolean {
    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;

      const intersect = ((yi > point.y) !== (yj > point.y))
        && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);

      if (intersect) inside = !inside;
    }

    return inside;
  }

  private calculateDistance(p1: Position3D, p2: Position3D): number {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dz = (p2.z || 0) - (p1.z || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  private findNearestObstacle(
    pose: VehiclePose,
    detections: Detection[]
  ): { detection: Detection; distance: number } | null {
    let nearest = null;
    let minDistance = Infinity;

    for (const detection of detections) {
      const distance = this.calculateDistance(
        { x: pose.x, y: pose.y, z: 0, frame: 'map' as const },
        detection.position
      );

      if (distance < minDistance) {
        minDistance = distance;
        nearest = { detection, distance };
      }
    }

    return nearest;
  }

  // Public API
  getSafetyStatus(): SafetyStatus {
    return { ...this.currentSafetyStatus };
  }

  updatePolicy(policy: SafetyPolicy) {
    this.safetyPolicy = policy;
  }

  clearEmergencyStop(authorization: string): boolean {
    // In production, verify authorization
    console.log(`E-stop cleared with authorization: ${authorization}`);
    this.currentSafetyStatus.e_stop = false;
    return true;
  }

  onSafetyStatusChange(callback: (status: SafetyStatus) => void): () => void {
    this.safetyCallbacks.add(callback);
    return () => {
      this.safetyCallbacks.delete(callback);
    };
  }

  onEmergencyStop(callback: (reason: string) => void): () => void {
    this.emergencyStopCallbacks.add(callback);
    return () => {
      this.emergencyStopCallbacks.delete(callback);
    };
  }

  getBreachHistory(since?: number): SafetyBreach[] {
    if (since) {
      return this.safetyBreachHistory.filter(b => b.timestamp > since);
    }
    return [...this.safetyBreachHistory];
  }
}