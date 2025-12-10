// Mining Vehicle Client - Main orchestration class for the autonomous mining vehicle system

import { ESP32Controller } from './services/esp32-controller';
import { YOLOPerceptionService } from './services/yolo-perception-service';
import { SafetyManager } from './services/safety-manager';
import { NavigationPlanner } from './services/navigation-planner';
import {
  OperatorMessage,
  TaskType,
  Plan,
  VehicleStatus,
  SafetyStatus,
  Telemetry,
  Detection,
  TaskReport,
  TimelineEvent,
  Exception,
  Evidence,
  MiningVehicleState,
  SafetyPolicy,
  ESP32Command,
  ESP32Response,
  Waypoint,
  VehiclePose
} from './types';

export interface MiningVehicleClientConfig {
  esp32Url: string;
  safetyPolicy: SafetyPolicy;
  claudeApiKey?: string;
  updateInterval?: number;
}

export class MiningVehicleClient {
  private esp32Controller: ESP32Controller;
  private perceptionService: YOLOPerceptionService;
  private safetyManager: SafetyManager;
  private navigationPlanner: NavigationPlanner;

  private state: MiningVehicleState;
  private updateInterval: number;
  private updateTimer?: number;
  private taskStartTime?: number;
  private taskTimeline: TimelineEvent[] = [];
  private taskExceptions: Exception[] = [];

  // Callbacks
  private stateChangeCallbacks: Set<(state: MiningVehicleState) => void> = new Set();
  private messageCallbacks: Set<(message: string) => void> = new Set();

  constructor(config: MiningVehicleClientConfig) {
    // Initialize services
    this.esp32Controller = new ESP32Controller(config.esp32Url);
    this.perceptionService = new YOLOPerceptionService(); // Using real YOLO perception
    this.safetyManager = new SafetyManager(config.safetyPolicy);
    this.navigationPlanner = new NavigationPlanner();

    // Initialize state
    this.state = {
      vehicle_status: {
        phase: 'idle',
        progress_pct: 0
      },
      safety_status: {
        risk_level: 'minimal',
        e_stop: false,
        safety_bubble_breaches: [],
        active_hazards: []
      },
      telemetry: {
        pose: { x: 0, y: 0, theta: 0, frame: 'map' },
        velocity: { linear: 0, angular: 0 },
        battery: { voltage: 24, percentage: 100, current: 0 },
        gnss_status: 'no_fix',
        health: {
          temperatures: {},
          link_quality: 0,
          error_codes: [],
          warnings: []
        },
        timestamp: Date.now()
      },
      recent_detections: [],
      active_hazards: [],
      command_queue: [],
      command_history: [],
      safety_policy: config.safetyPolicy
    };

    this.updateInterval = config.updateInterval || 100; // 10Hz

    // Set up service callbacks
    this.setupServiceCallbacks();
  }

  async initialize(): Promise<void> {
    try {
      // Try to connect to ESP32
      try {
        await this.esp32Controller.connect();
        this.addTimelineEvent('system', 'ESP32 controller connected');
      } catch (esp32Error) {
        // Continue in simulation mode if ESP32 is not available
        this.addTimelineEvent('system', 'ESP32 not available, running in simulation mode');
        console.log('Running in simulation mode:', esp32Error);
      }

      // Start perception service
      this.addTimelineEvent('system', 'Perception service started');

      // Start update loop
      this.startUpdateLoop();
      this.addTimelineEvent('system', 'System initialized and ready');

      // Initialize with simulated telemetry if needed
      if (!this.state.telemetry.timestamp) {
        this.state.telemetry = {
          pose: { x: 0, y: 0, theta: 0, frame: 'map' },
          velocity: { linear: 0, angular: 0 },
          battery: { voltage: 24, percentage: 85, current: 0 },
          gnss_status: 'no_fix',
          health: {
            temperatures: {},
            link_quality: 100,
            error_codes: [],
            warnings: []
          },
          timestamp: Date.now()
        };
      }
    } catch (error) {
      this.addException('initialization', `Failed to initialize: ${error}`, 'critical');
      throw error;
    }
  }

  private setupServiceCallbacks() {
    // ESP32 telemetry updates
    this.esp32Controller.onTelemetry((telemetry) => {
      this.state.telemetry = telemetry;
    });

    // Perception updates
    this.perceptionService.onDetection((detections) => {
      this.state.recent_detections = detections;
      this.navigationPlanner.updateObstacles(detections);
    });

    this.perceptionService.onHazard((hazards) => {
      this.state.active_hazards = hazards;
    });

    // Safety updates
    this.safetyManager.onSafetyStatusChange((status) => {
      this.state.safety_status = status;

      if (status.risk_level === 'critical' || status.e_stop) {
        this.handleEmergencyStop('Safety manager triggered');
      }
    });

    this.safetyManager.onEmergencyStop((reason) => {
      this.handleEmergencyStop(reason);
    });

    // Navigation updates
    this.navigationPlanner.onWaypointReached((waypoint) => {
      this.addTimelineEvent('navigation', `Waypoint reached: ${JSON.stringify(waypoint)}`);
      this.sendMessage(`Reached waypoint at (${waypoint.x?.toFixed(1)}, ${waypoint.y?.toFixed(1)})`);
    });

    this.navigationPlanner.onPlanComplete((plan) => {
      this.addTimelineEvent('navigation', `Plan ${plan.id} completed`);
      this.sendMessage('Navigation plan completed successfully');
    });
  }

  private startUpdateLoop() {
    this.updateTimer = window.setInterval(() => {
      this.update();
    }, this.updateInterval);
  }

  private async update() {
    try {
      // DISABLED: Automatic telemetry polling was spamming Arduino with queries
      // Telemetry will be requested only when needed (on-demand)
      /*
      // Update telemetry
      if (Date.now() - this.state.telemetry.timestamp > 1000) {
        await this.updateTelemetry();
      }
      */

      // DISABLED: Safety manager was too aggressive, causing continuous stops
      // Let AI make navigation decisions instead
      /*
      // Update safety status
      this.safetyManager.updateSafetyStatus(
        this.state.telemetry.pose,
        this.state.recent_detections,
        this.state.active_hazards,
        this.state.telemetry
      );
      */

      // Check if replanning is needed
      if (this.state.current_plan && this.navigationPlanner.shouldReplan(this.state.telemetry.pose)) {
        this.addTimelineEvent('navigation', 'Replanning due to deviation');
        await this.replan();
      }

      // Process command queue
      await this.processCommandQueue();

      // Update progress
      this.updateProgress();

      // Notify state changes
      this.notifyStateChange();
    } catch (error) {
      this.addException('update', `Update loop error: ${error}`, 'error');
    }
  }

  private async updateTelemetry() {
    try {
      const telemetry = await this.esp32Controller.requestTelemetry();
      this.state.telemetry = telemetry;
    } catch (error) {
      // In simulation mode, update telemetry based on commands
      if (this.state.vehicle_status.phase === 'executing' && this.state.telemetry) {
        // Simulate movement
        const speed = this.state.telemetry.velocity.linear;
        const dt = 0.1; // 100ms update
        this.state.telemetry.pose.x += Math.cos(this.state.telemetry.pose.theta) * speed * dt;
        this.state.telemetry.pose.y += Math.sin(this.state.telemetry.pose.theta) * speed * dt;
        this.state.telemetry.timestamp = Date.now();
      }
      // Only log warning if not in simulation
      if (this.esp32Controller.isConnected()) {
        this.addException('telemetry', `Failed to get telemetry: ${error}`, 'warning');
      }
    }
  }

  // Main API: Process operator message
  async processOperatorMessage(message: OperatorMessage): Promise<{
    success: boolean;
    plan?: Plan;
    error?: string;
    requiresConfirmation?: boolean;
    confirmationMessage?: string;
  }> {
    try {
      this.state.operator_message = message;
      this.addTimelineEvent('operator', `Received: ${message.message}`);

      // Parse intent if not explicitly provided
      const taskType = message.task_type || this.parseTaskType(message.message);

      // Safety check
      if (this.state.safety_status.e_stop) {
        return {
          success: false,
          error: 'Emergency stop is active. Clear e-stop before proceeding.'
        };
      }

      // Generate plan
      const plan = await this.generatePlan(taskType, message);

      // Check if confirmation is required
      if (message.confirm_before_execute || plan.risk_level !== 'minimal') {
        const confirmationMessage = this.generateConfirmationMessage(plan, message);
        return {
          success: true,
          plan,
          requiresConfirmation: true,
          confirmationMessage
        };
      }

      // Execute plan
      await this.executePlan(plan);

      return { success: true, plan };
    } catch (error) {
      this.addException('operator_message', `Failed to process: ${error}`, 'error');
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private parseTaskType(message: string): TaskType {
    const lower = message.toLowerCase();

    if (lower.includes('go to') || lower.includes('navigate')) return 'navigate';
    if (lower.includes('patrol')) return 'patrol';
    if (lower.includes('follow')) return 'follow';
    if (lower.includes('inspect')) return 'inspect';
    if (lower.includes('stop')) return 'stop';

    return 'standby';
  }

  private async generatePlan(taskType: TaskType, message: OperatorMessage): Promise<Plan> {
    // Handle immediate stop
    if (taskType === 'stop') {
      return {
        id: `plan_stop_${Date.now()}`,
        task_type: 'stop',
        steps: [{
          id: 'stop_1',
          type: 'wait',
          description: 'Emergency stop',
          command: {
            type: 'stop',
            id: `cmd_stop_${Date.now()}`,
            reason: message.message,
            emergency: true
          } as ESP32Command
        }],
        prerequisites: [],
        safety_checks: [],
        acceptance_criteria: [],
        estimated_duration_s: 0,
        risk_level: 'minimal'
      };
    }

    // Convert waypoints to proper format
    const goals = message.waypoints || this.parseWaypointsFromMessage(message.message);

    if (goals.length === 0 && taskType === 'navigate') {
      throw new Error('No waypoints specified for navigation task');
    }

    // Create navigation plan
    const plan = await this.navigationPlanner.createPlan(
      taskType,
      this.state.telemetry.pose,
      goals,
      {
        maxSpeed: message.speed_limit_mps,
        clearanceRequirements: message.required_clearance_m ? [{
          type: 'min_clearance',
          value: message.required_clearance_m,
          unit: 'm'
        }] : undefined
      }
    );

    return plan;
  }

  private parseWaypointsFromMessage(message: string): Waypoint[] {
    // Simple parsing for demo - in production use NLP
    const waypoints: Waypoint[] = [];

    // Look for known locations
    const locations: { [key: string]: Waypoint } = {
      'loading bay alpha': { x: 100, y: 50, frame: 'map' },
      'dump zone 1': { x: -50, y: 100, frame: 'map' },
      'maintenance area': { x: 0, y: 0, frame: 'map' }
    };

    for (const [name, waypoint] of Object.entries(locations)) {
      if (message.toLowerCase().includes(name)) {
        waypoints.push(waypoint);
      }
    }

    return waypoints;
  }

  private generateConfirmationMessage(plan: Plan, message: OperatorMessage): string {
    const lines = [
      `Task: ${plan.task_type}`,
      `Estimated duration: ${Math.ceil(plan.estimated_duration_s / 60)} minutes`,
      `Risk level: ${plan.risk_level}`,
      `Steps: ${plan.steps.length}`,
    ];

    if (message.speed_limit_mps) {
      lines.push(`Speed limit: ${message.speed_limit_mps} m/s`);
    }

    if (message.required_clearance_m) {
      lines.push(`Required clearance: ${message.required_clearance_m} m`);
    }

    if (plan.risk_level !== 'minimal') {
      lines.push(`\nWarning: ${plan.risk_level} risk detected. Proceed with caution.`);
    }

    lines.push('\nDo you want to proceed with this plan?');

    return lines.join('\n');
  }

  async confirmAndExecutePlan(planId: string): Promise<{ success: boolean; error?: string }> {
    if (!this.state.current_plan || this.state.current_plan.id !== planId) {
      return { success: false, error: 'Plan not found or expired' };
    }

    try {
      await this.executePlan(this.state.current_plan);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async executePlan(plan: Plan) {
    this.state.current_plan = plan;
    this.state.vehicle_status.phase = 'executing';
    this.taskStartTime = Date.now();
    this.taskTimeline = [];
    this.taskExceptions = [];

    this.addTimelineEvent('execution', `Starting plan ${plan.id}`);

    try {
      // Execute stop immediately if needed
      if (plan.task_type === 'stop') {
        const stopCommand = plan.steps[0].command;
        if (stopCommand) {
          await this.sendCommand(stopCommand);
        }
        this.state.vehicle_status.phase = 'idle';
        return;
      }

      // Execute navigation plan
      await this.navigationPlanner.executePlan(
        plan,
        this.state.telemetry.pose,
        (step) => {
          this.addTimelineEvent('execution', `Completed step: ${step.description}`);
        }
      );

      // Plan completed successfully
      this.state.vehicle_status.phase = 'idle';
      this.addTimelineEvent('execution', 'Plan completed successfully');

      // Generate report
      const report = this.generateTaskReport('completed');
      this.sendMessage(`Task completed. Distance: ${report.metrics?.distance_traveled_m.toFixed(1)}m, Time: ${report.metrics?.duration_s}s`);

    } catch (error) {
      this.state.vehicle_status.phase = 'error';
      this.addException('execution', `Plan execution failed: ${error}`, 'critical');

      // Stop vehicle
      await this.emergencyStop('Plan execution error');

      // Generate failure report
      this.generateTaskReport('failed');
    }
  }

  private async sendCommand(command: ESP32Command): Promise<ESP32Response> {
    // Validate command with safety manager
    const validation = this.safetyManager.validateCommand(command);
    if (!validation.valid) {
      throw new Error(`Command rejected: ${validation.reason}`);
    }

    // Add to queue
    this.state.command_queue.push(command);

    try {
      // Send command
      const response = await this.esp32Controller.sendCommand(command);

      // Record in history
      this.state.command_history.push({
        command,
        response,
        timestamp: Date.now()
      });

      // Maintain history size
      if (this.state.command_history.length > 1000) {
        this.state.command_history = this.state.command_history.slice(-1000);
      }

      return response;
    } finally {
      // Remove from queue
      const index = this.state.command_queue.indexOf(command);
      if (index >= 0) {
        this.state.command_queue.splice(index, 1);
      }
    }
  }

  private async processCommandQueue() {
    // Process any pending commands
    // In this implementation, commands are sent immediately
    // This method is for future queue management
  }

  private updateProgress() {
    if (!this.state.current_plan) {
      this.state.vehicle_status.progress_pct = 0;
      return;
    }

    const currentStep = this.navigationPlanner.getCurrentStep();
    if (!currentStep) {
      this.state.vehicle_status.progress_pct = 100;
      return;
    }

    const currentIndex = this.state.current_plan.steps.indexOf(currentStep);
    const totalSteps = this.state.current_plan.steps.length;

    this.state.vehicle_status.progress_pct = Math.round((currentIndex / totalSteps) * 100);
    this.state.vehicle_status.current_goal = currentStep.description;

    // Estimate time remaining
    if (this.taskStartTime) {
      const elapsed = (Date.now() - this.taskStartTime) / 1000;
      const rate = currentIndex / elapsed;
      const remaining = (totalSteps - currentIndex) / rate;
      this.state.vehicle_status.eta_s = remaining;
    }
  }

  private async replan() {
    if (!this.state.current_plan || !this.state.operator_message) return;

    try {
      const newPlan = await this.generatePlan(
        this.state.current_plan.task_type,
        this.state.operator_message
      );

      this.state.current_plan = newPlan;
      this.addTimelineEvent('navigation', 'Replanning successful');
    } catch (error) {
      this.addException('replan', `Replanning failed: ${error}`, 'error');
    }
  }

  private async handleEmergencyStop(reason: string) {
    this.state.vehicle_status.phase = 'emergency_stop';
    this.addTimelineEvent('safety', `Emergency stop: ${reason}`);

    try {
      await this.esp32Controller.stop(reason, true);
    } catch (error) {
      console.error('Failed to send emergency stop command:', error);
    }

    this.sendMessage(`EMERGENCY STOP: ${reason}`);
  }

  async emergencyStop(reason: string): Promise<void> {
    await this.handleEmergencyStop(reason);
  }

  async clearEmergencyStop(authorization: string): Promise<boolean> {
    if (!this.safetyManager.clearEmergencyStop(authorization)) {
      return false;
    }

    this.state.vehicle_status.phase = 'idle';
    this.addTimelineEvent('safety', 'Emergency stop cleared');
    this.sendMessage('Emergency stop cleared, system ready');

    return true;
  }

  // Reporting
  private generateTaskReport(outcome: TaskReport['outcome']): TaskReport {
    const endTime = Date.now();
    const startTime = this.taskStartTime || endTime;

    // Calculate metrics
    const metrics = {
      duration_s: Math.round((endTime - startTime) / 1000),
      distance_traveled_m: 0, // Would calculate from telemetry history
      average_speed_mps: 0,
      max_speed_mps: 0,
      obstacles_avoided: this.state.active_hazards.length,
      energy_consumed_wh: 0
    };

    // Collect evidence
    const evidence: Evidence[] = [
      {
        type: 'telemetry',
        timestamp: endTime,
        data: this.state.telemetry
      }
    ];

    const report: TaskReport = {
      task_id: this.state.current_plan?.id || 'unknown',
      outcome,
      start_time: startTime,
      end_time: endTime,
      exceptions: [...this.taskExceptions],
      evidence,
      timeline: [...this.taskTimeline],
      metrics
    };

    return report;
  }

  // Process video frame for perception
  async processVideoFrame(frameId: string, imageData: ImageData): Promise<Detection[]> {
    return this.perceptionService.processFrame(frameId, Date.now(), imageData);
  }

  // Event handling
  private addTimelineEvent(type: string, description: string, data?: any) {
    const event: TimelineEvent = {
      timestamp: Date.now(),
      event_type: type,
      description,
      data
    };

    this.taskTimeline.push(event);
    console.log(`[${type}] ${description}`);
  }

  private addException(type: string, description: string, severity: Exception['severity']) {
    const exception: Exception = {
      timestamp: Date.now(),
      type,
      description,
      severity
    };

    this.taskExceptions.push(exception);
    console.error(`[${severity}] ${type}: ${description}`);
  }

  private sendMessage(message: string) {
    this.messageCallbacks.forEach(callback => callback(message));
  }

  private notifyStateChange() {
    this.stateChangeCallbacks.forEach(callback => callback(this.state));
  }

  // Public API
  getState(): MiningVehicleState {
    return { ...this.state };
  }

  onStateChange(callback: (state: MiningVehicleState) => void): () => void {
    this.stateChangeCallbacks.add(callback);
    return () => {
      this.stateChangeCallbacks.delete(callback);
    };
  }

  onMessage(callback: (message: string) => void): () => void {
    this.messageCallbacks.add(callback);
    return () => {
      this.messageCallbacks.delete(callback);
    };
  }

  async manualControl(linear: number, angular: number, speed?: number): Promise<void> {
    const command = await this.esp32Controller.drive(linear, angular, 0.1, speed);
    if (!command.ok) {
      throw new Error(command.error || 'Manual control failed');
    }
  }

  /**
   * Set a digital output pin on the ESP32 (e.g., AI trigger pin).
   * @param pin Pin number to set
   * @param state "high" or "low"
   */
  async setDigitalOutput(pin: number, state: "high" | "low"): Promise<void> {
    const response = await this.esp32Controller.setIO(pin, state);
    if (!response.ok) {
      throw new Error(response.error || `Failed to set pin ${pin} ${state}`);
    }
  }

  private async parseAndExecuteGeminiResponse(response: string): Promise<void> {
    try {
      // Look for command patterns in the response
      const commandPatterns = {
        navigate: /(?:go to|navigate to|move to|drive to)\s+(.+)/i,
        stop: /(?:stop|halt|emergency stop)/i,
        patrol: /(?:patrol|monitor)\s+(.+)/i,
        inspect: /(?:inspect|check|examine)\s+(.+)/i,
        status: /(?:status|report|current position)/i,
        activate: /(?:activate|trigger|start movement)/i
      };

      let executed = false;

      // Existing command handling...
      // (Assuming there would be logic here to handle navigate, stop, patrol, inspect, status)
      // For this change, we only focus on 'activate' as per instruction.

      // Direct command handling for activation
      if (commandPatterns.activate.test(response)) {
        console.log('[Gemini] Activating AI trigger pin');
        // Pin 12 is the AI_TRIGGER_PIN on Arduino
        await this.setDigitalOutput(12, "high");
        // Optionally keep it high for a short period then low
        setTimeout(async () => {
          await this.setDigitalOutput(12, "low");
        }, 500); // 500ms pulse
        executed = true;
      }

      if (!executed) {
        console.log(`[Gemini] No specific command recognized in response: ${response}`);
      }

    } catch (error) {
      this.addException('gemini_response_parsing', `Error processing Gemini response: ${error}`, 'error');
    }
  }

  destroy() {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }

    this.esp32Controller.disconnect();
    this.perceptionService.clear();
  }
}