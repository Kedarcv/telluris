// Navigation Planner - Plans paths, validates routes, and manages waypoint following

import {
  Waypoint,
  Position3D,
  VehiclePose,
  Plan,
  PlanStep,
  SafetyRequirement,
  Zone,
  Geofence,
  Detection,
  TaskType,
  RiskLevel
} from '../types';

export class NavigationPlanner {
  private currentPlan: Plan | null = null;
  private currentStepIndex = 0;
  private waypointReachedCallbacks: Set<(waypoint: Waypoint) => void> = new Set();
  private planCompleteCallbacks: Set<(plan: Plan) => void> = new Set();
  private obstacleMap: Map<string, Detection> = new Map();

  constructor(
    private readonly config: {
      waypointTolerance?: number;
      pathPlanningResolution?: number;
      maxPlanningTime?: number;
      defaultSpeed?: number;
      replanThreshold?: number;
    } = {}
  ) {
    this.config = {
      waypointTolerance: 1.0, // meters
      pathPlanningResolution: 0.5, // meters
      maxPlanningTime: 5000, // milliseconds
      defaultSpeed: 2.0, // m/s
      replanThreshold: 3.0, // meters deviation
      ...config
    };
  }

  // Create a navigation plan
  async createPlan(
    taskType: TaskType,
    start: VehiclePose,
    goals: Waypoint[],
    constraints?: {
      zones?: Zone[];
      maxSpeed?: number;
      clearanceRequirements?: SafetyRequirement[];
    }
  ): Promise<Plan> {
    const planId = `plan_${Date.now()}`;
    
    // Convert goals to plan steps
    const steps: PlanStep[] = [];
    let currentPos = start;
    let totalDuration = 0;
    
    for (let i = 0; i < goals.length; i++) {
      const goal = goals[i];
      const path = await this.planPath(currentPos, goal, constraints);
      
      // Create steps for path segments
      for (let j = 0; j < path.length; j++) {
        const waypoint = path[j];
        const distance = this.calculateDistance(
          { x: currentPos.x, y: currentPos.y, z: 0, frame: 'map' },
          { x: waypoint.x!, y: waypoint.y!, z: 0, frame: 'map' }
        );
        
        const speed = Math.min(
          constraints?.maxSpeed || this.config.defaultSpeed!,
          this.getSpeedForSegment(currentPos, waypoint)
        );
        
        const duration = distance / speed;
        totalDuration += duration;
        
        steps.push({
          id: `step_${i}_${j}`,
          type: j === path.length - 1 ? 'align' : 'move',
          description: `Navigate to waypoint ${i + 1}, segment ${j + 1}`,
          waypoint: waypoint,
          duration_s: duration,
          dependencies: j > 0 ? [`step_${i}_${j - 1}`] : (i > 0 ? [`step_${i - 1}_${path.length - 1}`] : []),
          safety_requirements: constraints?.clearanceRequirements
        });
        
        currentPos = {
          x: waypoint.x!,
          y: waypoint.y!,
          theta: waypoint.theta || 0,
          frame: 'map'
        };
      }
    }
    
    const plan: Plan = {
      id: planId,
      task_type: taskType,
      steps: steps,
      prerequisites: this.identifyPrerequisites(taskType),
      safety_checks: this.generateSafetyChecks(steps, constraints),
      acceptance_criteria: this.generateAcceptanceCriteria(taskType, goals),
      estimated_duration_s: totalDuration,
      risk_level: this.assessPlanRisk(steps, constraints)
    };
    
    this.currentPlan = plan;
    this.currentStepIndex = 0;
    
    return plan;
  }

  // Plan a path between two points
  private async planPath(
    start: VehiclePose | Waypoint,
    goal: Waypoint,
    constraints?: any
  ): Promise<Waypoint[]> {
    // In production, this would use A*, RRT*, or other path planning algorithms
    // For now, we'll implement a simple straight-line planner with obstacle avoidance
    
    const startX = 'x' in start ? start.x! : start.x!;
    const startY = 'y' in start ? start.y! : start.y!;
    const goalX = goal.x!;
    const goalY = goal.y!;
    
    const path: Waypoint[] = [];
    const numSegments = Math.ceil(
      this.calculateDistance(
        { x: startX, y: startY, z: 0, frame: 'map' },
        { x: goalX, y: goalY, z: 0, frame: 'map' }
      ) / this.config.pathPlanningResolution!
    );
    
    // Check for obstacles along the path
    const obstacles = this.getObstaclesAlongPath(
      { x: startX, y: startY },
      { x: goalX, y: goalY }
    );
    
    if (obstacles.length === 0) {
      // Direct path is clear
      for (let i = 1; i <= numSegments; i++) {
        const t = i / numSegments;
        path.push({
          x: startX + (goalX - startX) * t,
          y: startY + (goalY - startY) * t,
          frame: 'map',
          tolerance: this.config.waypointTolerance
        });
      }
    } else {
      // Need to plan around obstacles
      // Simplified: Add intermediate waypoints to go around
      const avoidanceWaypoints = this.generateAvoidanceWaypoints(
        { x: startX, y: startY },
        { x: goalX, y: goalY },
        obstacles
      );
      
      path.push(...avoidanceWaypoints);
    }
    
    // Ensure goal is included
    path.push({
      ...goal,
      tolerance: goal.tolerance || this.config.waypointTolerance
    });
    
    return path;
  }

  private getObstaclesAlongPath(start: any, goal: any): Detection[] {
    const obstacles: Detection[] = [];
    
    this.obstacleMap.forEach((detection) => {
      if (this.isObstacleOnPath(start, goal, detection.position)) {
        obstacles.push(detection);
      }
    });
    
    return obstacles;
  }

  private isObstacleOnPath(start: any, goal: any, obstacle: Position3D): boolean {
    // Check if obstacle is near the line between start and goal
    const d = this.pointToLineDistance(
      obstacle,
      { x: start.x, y: start.y, z: 0, frame: 'map' },
      { x: goal.x, y: goal.y, z: 0, frame: 'map' }
    );
    
    return d < 5.0; // 5 meter buffer
  }

  private pointToLineDistance(point: Position3D, lineStart: Position3D, lineEnd: Position3D): number {
    const A = point.x - lineStart.x;
    const B = point.y - lineStart.y;
    const C = lineEnd.x - lineStart.x;
    const D = lineEnd.y - lineStart.y;
    
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    
    if (lenSq !== 0) {
      param = dot / lenSq;
    }
    
    let xx, yy;
    
    if (param < 0) {
      xx = lineStart.x;
      yy = lineStart.y;
    } else if (param > 1) {
      xx = lineEnd.x;
      yy = lineEnd.y;
    } else {
      xx = lineStart.x + param * C;
      yy = lineStart.y + param * D;
    }
    
    const dx = point.x - xx;
    const dy = point.y - yy;
    
    return Math.sqrt(dx * dx + dy * dy);
  }

  private generateAvoidanceWaypoints(
    start: any,
    goal: any,
    obstacles: Detection[]
  ): Waypoint[] {
    // Simple implementation: go around obstacles with a fixed offset
    const waypoints: Waypoint[] = [];
    
    for (const obstacle of obstacles) {
      // Calculate avoidance direction (perpendicular to path)
      const pathAngle = Math.atan2(goal.y - start.y, goal.x - start.x);
      const avoidAngle = pathAngle + Math.PI / 2; // 90 degrees to the right
      
      // Create waypoint to go around obstacle
      const avoidanceDistance = 10.0; // 10 meters clearance
      waypoints.push({
        x: obstacle.position.x + Math.cos(avoidAngle) * avoidanceDistance,
        y: obstacle.position.y + Math.sin(avoidAngle) * avoidanceDistance,
        frame: 'map',
        tolerance: this.config.waypointTolerance
      });
    }
    
    return waypoints;
  }

  private getSpeedForSegment(start: VehiclePose | Waypoint, end: Waypoint): number {
    // Adjust speed based on path characteristics
    // In production, consider curvature, terrain, visibility, etc.
    
    const distance = this.calculateDistance(
      { x: 'x' in start ? start.x! : start.x!, y: 'y' in start ? start.y! : start.y!, z: 0, frame: 'map' },
      { x: end.x!, y: end.y!, z: 0, frame: 'map' }
    );
    
    // Slow down for short segments (likely turns)
    if (distance < 5.0) {
      return Math.min(1.0, this.config.defaultSpeed!);
    }
    
    return this.config.defaultSpeed!;
  }

  private identifyPrerequisites(taskType: TaskType): string[] {
    const prerequisites: string[] = [];
    
    switch (taskType) {
      case 'navigate':
        prerequisites.push('Valid GNSS or localization');
        prerequisites.push('Clear communication link');
        break;
      case 'patrol':
        prerequisites.push('Patrol route defined');
        prerequisites.push('Area survey completed');
        break;
      case 'inspect':
        prerequisites.push('Inspection sensors operational');
        prerequisites.push('Data storage available');
        break;
    }
    
    prerequisites.push('Safety systems operational');
    prerequisites.push('E-stop system armed');
    
    return prerequisites;
  }

  private generateSafetyChecks(steps: PlanStep[], constraints?: any): any[] {
    const checks = [
      {
        type: 'communication',
        description: 'Verify communication link quality',
        threshold: 50,
        unit: '%'
      },
      {
        type: 'sensor',
        description: 'Verify perception sensors operational',
        threshold: 90,
        unit: '%'
      }
    ];
    
    if (constraints?.clearanceRequirements) {
      checks.push({
        type: 'clearance',
        description: 'Maintain minimum clearance from obstacles',
        threshold: constraints.clearanceRequirements[0]?.value || 5,
        unit: 'm'
      });
    }
    
    return checks;
  }

  private generateAcceptanceCriteria(taskType: TaskType, goals: Waypoint[]): any[] {
    const criteria = [];
    
    for (let i = 0; i < goals.length; i++) {
      criteria.push({
        type: 'position',
        description: `Reach waypoint ${i + 1}`,
        tolerance: goals[i].tolerance || this.config.waypointTolerance,
        value: goals[i]
      });
    }
    
    if (taskType === 'inspect') {
      criteria.push({
        type: 'detection',
        description: 'Complete inspection data collection',
        value: 'all_points_scanned'
      });
    }
    
    criteria.push({
      type: 'time',
      description: 'Complete within time limit',
      tolerance: 1.2, // 20% margin
      value: 'estimated_duration'
    });
    
    return criteria;
  }

  private assessPlanRisk(steps: PlanStep[], constraints?: any): RiskLevel {
    // Assess overall risk of the plan
    let riskFactors = 0;
    
    // Long plans are riskier
    if (steps.length > 20) riskFactors++;
    if (steps.length > 50) riskFactors++;
    
    // Check if plan goes through high-risk areas
    // (Would need zone information)
    
    // Tight constraints increase risk
    if (constraints?.maxSpeed && constraints.maxSpeed < 1.0) riskFactors++;
    
    if (riskFactors >= 3) return 'high';
    if (riskFactors >= 2) return 'medium';
    if (riskFactors >= 1) return 'low';
    return 'minimal';
  }

  // Execute and monitor plan
  async executePlan(
    plan: Plan,
    currentPose: VehiclePose,
    onStepComplete?: (step: PlanStep) => void
  ): Promise<void> {
    this.currentPlan = plan;
    this.currentStepIndex = 0;
    
    for (const step of plan.steps) {
      // Check if we should continue
      if (!this.currentPlan || this.currentPlan.id !== plan.id) {
        throw new Error('Plan cancelled');
      }
      
      // Wait for dependencies
      if (step.dependencies && step.dependencies.length > 0) {
        // In production, properly track step completion
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Execute step
      await this.executeStep(step, currentPose);
      
      if (onStepComplete) {
        onStepComplete(step);
      }
      
      this.currentStepIndex++;
    }
    
    // Plan complete
    this.planCompleteCallbacks.forEach(callback => callback(plan));
  }

  private async executeStep(step: PlanStep, currentPose: VehiclePose): Promise<void> {
    // This would interface with the actual control system
    console.log(`Executing step: ${step.description}`);
    
    if (step.waypoint) {
      // Monitor progress to waypoint
      const reached = await this.monitorWaypointProgress(step.waypoint, currentPose);
      if (reached) {
        this.waypointReachedCallbacks.forEach(callback => callback(step.waypoint!));
      }
    }
  }

  private async monitorWaypointProgress(
    waypoint: Waypoint,
    currentPose: VehiclePose
  ): Promise<boolean> {
    // Convert VehiclePose frame to Position3D compatible frame
    const poseFrame: 'map' | 'vehicle' | 'camera' = 'map'; // Always use 'map' frame for distance calculations
    
    const distance = this.calculateDistance(
      { x: currentPose.x, y: currentPose.y, z: 0, frame: poseFrame },
      { x: waypoint.x!, y: waypoint.y!, z: 0, frame: 'map' } // Waypoints are always in map frame for distance calc
    );
    
    return distance <= (waypoint.tolerance || this.config.waypointTolerance!);
  }

  // Update obstacle map
  updateObstacles(detections: Detection[]) {
    // Clear old obstacles
    const now = Date.now();
    this.obstacleMap.forEach((detection, id) => {
      if (now - detection.ts > 5000) { // 5 second timeout
        this.obstacleMap.delete(id);
      }
    });
    
    // Add new obstacles
    for (const detection of detections) {
      if (['rock', 'truck', 'equipment', 'person'].includes(detection.class)) {
        const id = `${detection.class}_${Math.floor(detection.position.x)}_${Math.floor(detection.position.y)}`;
        this.obstacleMap.set(id, detection);
      }
    }
  }

  // Check if replanning is needed
  shouldReplan(currentPose: VehiclePose): boolean {
    if (!this.currentPlan || this.currentStepIndex >= this.currentPlan.steps.length) {
      return false;
    }
    
    const currentStep = this.currentPlan.steps[this.currentStepIndex];
    if (!currentStep.waypoint) return false;
    
    // Check deviation from planned path
    const plannedPosition = currentStep.waypoint;
    // Convert frame for Position3D compatibility - use 'map' for all distance calculations
    const deviation = this.calculateDistance(
      { x: currentPose.x, y: currentPose.y, z: 0, frame: 'map' },
      { x: plannedPosition.x!, y: plannedPosition.y!, z: 0, frame: 'map' }
    );
    
    return deviation > this.config.replanThreshold!;
  }

  // Utility methods
  private calculateDistance(p1: Position3D, p2: Position3D): number {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dz = (p2.z || 0) - (p1.z || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  // Public API
  getCurrentPlan(): Plan | null {
    return this.currentPlan;
  }

  getCurrentStep(): PlanStep | null {
    if (!this.currentPlan || this.currentStepIndex >= this.currentPlan.steps.length) {
      return null;
    }
    return this.currentPlan.steps[this.currentStepIndex];
  }

  cancelPlan() {
    this.currentPlan = null;
    this.currentStepIndex = 0;
  }

  onWaypointReached(callback: (waypoint: Waypoint) => void): () => void {
    this.waypointReachedCallbacks.add(callback);
    return () => {
      this.waypointReachedCallbacks.delete(callback);
    };
  }

  onPlanComplete(callback: (plan: Plan) => void): () => void {
    this.planCompleteCallbacks.add(callback);
    return () => {
      this.planCompleteCallbacks.delete(callback);
    };
  }
}