// Gemini AI Controller - Integrates Gemini LLM with the mining vehicle system

import { GenAILiveClient } from '../../lib/genai-live-client';
import { MiningVehicleClient } from '../mining-vehicle-client';
import {
  OperatorMessage,
  Waypoint,
  Detection,
  MiningVehicleState,
  TaskReport
} from '../types';

// System prompts for Gemini
const SYSTEM_CONTEXT = `You are an AI assistant controlling an autonomous mining vehicle. You have access to the following capabilities:

1. Navigation: Move the vehicle to specific locations or waypoints
2. Perception: Analyze camera feeds using YOLO object detection
3. Safety: Monitor hazards and ensure safe operations
4. Task Execution: Perform mining tasks like patrol, inspection, or navigation


Safety Rules:
- Always maintain 5m clearance from people
- Maximum speed: 10 m/s in open areas, 2 m/s near equipment
- Stop immediately if person detected within 10m
- Request confirmation for high-risk operations

When given a command, analyze it and execute the appropriate vehicle action. Provide clear status updates and safety warnings.`;

export interface GeminiMiningControllerConfig {
  vehicleClient: MiningVehicleClient;
  geminiClient: GenAILiveClient;
}

export class GeminiMiningController {
  private vehicleClient: MiningVehicleClient;
  private geminiClient: GenAILiveClient;
  private isProcessing = false;
  private currentContext: string = SYSTEM_CONTEXT;
  private recentDetections: Detection[] = [];
  private taskHistory: TaskReport[] = [];

  constructor(config: GeminiMiningControllerConfig) {
    this.vehicleClient = config.vehicleClient;
    this.geminiClient = config.geminiClient;

    // Subscribe to vehicle state updates
    this.vehicleClient.onStateChange(this.handleStateChange.bind(this));
    this.vehicleClient.onMessage(this.handleVehicleMessage.bind(this));

    // Set up Gemini event handlers
    this.setupGeminiHandlers();
  }

  private setupGeminiHandlers() {
    // Handle content responses from Gemini
    this.geminiClient.on('content', async (content) => {
      // Extract text from content
      if ('modelTurn' in content && content.modelTurn?.parts) {
        for (const part of content.modelTurn.parts) {
          if ('text' in part && part.text) {
            console.log('Gemini response:', part.text);
            // Parse and execute commands from Gemini's response
            await this.parseAndExecuteGeminiResponse(part.text);

            // Check for vision-based navigation commands
            if (this.isVisionBasedCommand(part.text)) {
              await this.handleVisionBasedNavigation(part.text);
            }
          }
        }
      }
    });

    // Handle tool calls from Gemini
    this.geminiClient.on('toolcall', async (toolCall) => {
      console.log('Gemini tool call:', toolCall);
      // Handle tool calls if we implement them
    });
  }

  // Process user command through Gemini
  async processUserCommand(command: string): Promise<void> {
    if (this.isProcessing) {
      console.log('Already processing a command');
      return;
    }

    this.isProcessing = true;

    try {
      // Build context with current vehicle state
      const context = this.buildContextForGemini();

      // Send to Gemini with context
      const prompt = `${context}\n\nUser Command: ${command}\n\nAnalyze this command and determine the appropriate vehicle action. Consider safety, current conditions, and provide a clear response.`;

      await this.geminiClient.send([{ text: prompt }]);

    } catch (error) {
      console.error('Error processing command:', error);
      this.isProcessing = false;
    }
  }

  // Build context information for Gemini
  private buildContextForGemini(): string {
    const state = this.vehicleClient.getState();

    const context = [
      this.currentContext,
      '',
      'Current Vehicle Status:',
      `- Position: (${state.telemetry.pose.x.toFixed(1)}, ${state.telemetry.pose.y.toFixed(1)})`,
      `- Speed: ${state.telemetry.velocity.linear.toFixed(1)} m/s`,
      `- Battery: ${state.telemetry.battery.percentage}%`,
      `- Status: ${state.vehicle_status.phase}`,
      `- Safety: ${state.safety_status.risk_level} risk`
    ];

    // Add recent detections
    if (this.recentDetections.length > 0) {
      context.push('', 'Recent Detections:');
      this.recentDetections.slice(0, 5).forEach(det => {
        context.push(`- ${det.class} at (${det.position.x.toFixed(1)}, ${det.position.y.toFixed(1)}) - ${(det.confidence * 100).toFixed(0)}% confidence`);
      });
    }

    // Add active hazards
    if (state.active_hazards.length > 0) {
      context.push('', 'Active Hazards:');
      state.active_hazards.forEach(hazard => {
        context.push(`- ${hazard.type}: ${hazard.description || hazard.severity}`);
      });
    }

    return context.join('\n');
  }

  // Parse Gemini's response and execute vehicle commands
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

      // Check for navigation commands
      const navMatch = response.match(commandPatterns.navigate);
      if (navMatch) {
        const destination = navMatch[1];
        await this.executeNavigationCommand(destination);
        executed = true;
      }

      // Check for direct navigation commands (FORWARD, LEFT, RIGHT, REVERSE)
      const directCommands = {
        forward: /(?:forward|move forward|go forward)/i,
        left: /(?:left|turn left|go left)/i,
        right: /(?:right|turn right|go right)/i,
        reverse: /(?:reverse|back up|go back)/i
      };

      if (directCommands.forward.test(response)) {
        console.log('[Gemini] Executing FORWARD command');
        await this.vehicleClient.manualControl(0.5, 0); // Move forward at 0.5 m/s
        executed = true;
      } else if (directCommands.left.test(response)) {
        console.log('[Gemini] Executing LEFT command');
        await this.vehicleClient.manualControl(0.3, 0.5); // Turn left
        executed = true;
      } else if (directCommands.right.test(response)) {
        console.log('[Gemini] Executing RIGHT command');
        await this.vehicleClient.manualControl(0.3, -0.5); // Turn right
        executed = true;
      } else if (directCommands.reverse.test(response)) {
        console.log('[Gemini] Executing REVERSE command');
        await this.vehicleClient.manualControl(-0.3, 0); // Reverse
        executed = true;
      }

      // Check for stop commands
      if (commandPatterns.stop.test(response)) {
        await this.executeStopCommand('Gemini requested stop');
        executed = true;
      }

      // Check for patrol commands
      const patrolMatch = response.match(commandPatterns.patrol);
      if (patrolMatch) {
        const area = patrolMatch[1];
        await this.executePatrolCommand(area);
        executed = true;
      }

      // Direct activation command for AI trigger pin
      if (commandPatterns.activate.test(response)) {
        console.log('[Gemini] Activating AI trigger pin');
        // Pin 12 is the AI_TRIGGER_PIN defined in Arduino sketch
        await this.vehicleClient.setDigitalOutput(12, "high");
        setTimeout(async () => {
          await this.vehicleClient.setDigitalOutput(12, "low");
        }, 500); // 500ms pulse
        executed = true;
      }

      // If no specific command was found, try to extract waypoints
      if (!executed) {
        const waypoints = this.extractWaypointsFromText(response);
        if (waypoints.length > 0) {
          await this.executeWaypointNavigation(waypoints);
          executed = true;
        }
      }

      // Send confirmation back to user
      if (executed) {
        // Response already sent by Gemini
      } else {
        console.log('No executable command found in response');
      }

    } catch (error) {
      console.error('Error executing Gemini response:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  // Execute navigation command
  private async executeNavigationCommand(destination: string): Promise<void> {
    const waypoints = this.parseDestination(destination);

    if (waypoints.length === 0) {
      console.log('Could not parse destination:', destination);
      return;
    }

    const message: OperatorMessage = {
      message: `Navigate to ${destination}`,
      task_type: 'navigate',
      waypoints: waypoints,
      speed_limit_mps: 5.0, // Default safe speed
      required_clearance_m: 5.0
    };

    const result = await this.vehicleClient.processOperatorMessage(message);

    if (!result.success) {
      console.error('Navigation failed:', result.error);
    }
  }

  // Execute stop command
  private async executeStopCommand(reason: string): Promise<void> {
    await this.vehicleClient.emergencyStop(reason);
  }

  // Execute patrol command
  private async executePatrolCommand(area: string): Promise<void> {
    const waypoints = this.getPatrolWaypoints(area);

    const message: OperatorMessage = {
      message: `Patrol ${area}`,
      task_type: 'patrol',
      waypoints: waypoints,
      speed_limit_mps: 3.0, // Slower for patrol
      required_clearance_m: 10.0 // Extra clearance for patrol
    };

    const result = await this.vehicleClient.processOperatorMessage(message);

    if (!result.success) {
      console.error('Patrol setup failed:', result.error);
    }
  }

  // Execute waypoint navigation
  private async executeWaypointNavigation(waypoints: Waypoint[]): Promise<void> {
    const message: OperatorMessage = {
      message: 'Navigate through waypoints',
      task_type: 'navigate',
      waypoints: waypoints,
      speed_limit_mps: 5.0,
      required_clearance_m: 5.0
    };

    const result = await this.vehicleClient.processOperatorMessage(message);

    if (!result.success) {
      console.error('Waypoint navigation failed:', result.error);
    }
  }

  // Parse destination string to waypoints
  private parseDestination(destination: string): Waypoint[] {
    const lower = destination.toLowerCase();

    // Known locations
    const locations: { [key: string]: Waypoint } = {
      'loading bay': { x: 100, y: 50, frame: 'map' },
      'loading bay alpha': { x: 100, y: 50, frame: 'map' },
      'dump zone': { x: -50, y: 100, frame: 'map' },
      'dump zone 1': { x: -50, y: 100, frame: 'map' },
      'maintenance': { x: 0, y: 0, frame: 'map' },
      'maintenance area': { x: 0, y: 0, frame: 'map' },
      'crusher': { x: 200, y: -50, frame: 'map' },
      'crusher station': { x: 200, y: -50, frame: 'map' },
      'stockpile': { x: 150, y: 100, frame: 'map' },
      'stockpile a': { x: 150, y: 100, frame: 'map' },
      'water tank': { x: -100, y: -50, frame: 'map' }
    };

    // Check for known locations
    for (const [name, waypoint] of Object.entries(locations)) {
      if (lower.includes(name)) {
        return [waypoint];
      }
    }

    // Try to parse coordinates (e.g., "10, 20" or "x:10 y:20")
    const coordMatch = destination.match(/(?:x:|^)\s*(-?\d+)\s*(?:,|y:)\s*(-?\d+)/);
    if (coordMatch) {
      return [{
        x: parseFloat(coordMatch[1]),
        y: parseFloat(coordMatch[2]),
        frame: 'map'
      }];
    }

    return [];
  }

  // Extract waypoints from text
  private extractWaypointsFromText(text: string): Waypoint[] {
    const waypoints: Waypoint[] = [];

    // Look for coordinate patterns
    const coordRegex = /\((-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\)/g;
    let match;

    while ((match = coordRegex.exec(text)) !== null) {
      waypoints.push({
        x: parseFloat(match[1]),
        y: parseFloat(match[2]),
        frame: 'map'
      });
    }

    return waypoints;
  }

  // Get patrol waypoints for an area
  private getPatrolWaypoints(area: string): Waypoint[] {
    const lower = area.toLowerCase();

    // Predefined patrol routes
    if (lower.includes('loading bay')) {
      return [
        { x: 80, y: 30, frame: 'map' },
        { x: 120, y: 30, frame: 'map' },
        { x: 120, y: 70, frame: 'map' },
        { x: 80, y: 70, frame: 'map' },
        { x: 80, y: 30, frame: 'map' } // Loop back
      ];
    }

    if (lower.includes('perimeter')) {
      return [
        { x: -150, y: -150, frame: 'map' },
        { x: 250, y: -150, frame: 'map' },
        { x: 250, y: 150, frame: 'map' },
        { x: -150, y: 150, frame: 'map' },
        { x: -150, y: -150, frame: 'map' }
      ];
    }

    // Default small patrol pattern around current position
    const state = this.vehicleClient.getState();
    const pos = state.telemetry.pose;

    return [
      { x: pos.x - 20, y: pos.y - 20, frame: 'map' },
      { x: pos.x + 20, y: pos.y - 20, frame: 'map' },
      { x: pos.x + 20, y: pos.y + 20, frame: 'map' },
      { x: pos.x - 20, y: pos.y + 20, frame: 'map' },
      { x: pos.x - 20, y: pos.y - 20, frame: 'map' }
    ];
  }

  // Handle Gemini function calls (if using function calling API)
  private async handleGeminiFunctionCall(functionCall: any): Promise<void> {
    const { name, args } = functionCall;

    switch (name) {
      case 'navigate_to':
        await this.executeNavigationCommand(args.destination);
        break;

      case 'emergency_stop':
        await this.executeStopCommand(args.reason || 'Gemini triggered stop');
        break;

      case 'set_speed':
        // Update speed limit
        console.log('Setting speed limit:', args.speed);
        break;

      case 'get_status':
        // Return current status
        const state = this.vehicleClient.getState();
        const status = `Position: (${state.telemetry.pose.x}, ${state.telemetry.pose.y}), Status: ${state.vehicle_status.phase}`;
        await this.geminiClient.send([{ text: status }]);
        break;

      default:
        console.log('Unknown function call:', name);
    }
  }

  // Handle state changes from vehicle
  private handleStateChange(state: MiningVehicleState) {
    // Update recent detections
    if (state.recent_detections.length > 0) {
      this.recentDetections = state.recent_detections.slice(0, 10);
    }

    // Alert Gemini about critical events
    if (state.safety_status.risk_level === 'critical' || state.safety_status.e_stop) {
      const alert = `SAFETY ALERT: ${state.safety_status.e_stop ? 'Emergency stop activated' : 'Critical risk detected'}`;
      this.geminiClient.send([{ text: alert }]);
    }
  }

  // Handle messages from vehicle
  private handleVehicleMessage(message: string) {
    // Forward important messages to Gemini
    console.log('Vehicle message:', message);
  }

  // Analyze scene using YOLO detections and Gemini
  async analyzeScene(imageData: ImageData, detections: Detection[]): Promise<string> {
    // Build scene description
    const sceneDescription = this.buildSceneDescription(detections);

    // Ask Gemini to analyze the scene
    const prompt = `Analyze this mining site scene:
${sceneDescription}

Identify any safety concerns, operational insights, or recommendations.`;

    await this.geminiClient.send([{ text: prompt }]);

    return sceneDescription;
  }

  // Build scene description from detections
  private buildSceneDescription(detections: Detection[]): string {
    const grouped: { [key: string]: number } = {};

    detections.forEach(det => {
      grouped[det.class] = (grouped[det.class] || 0) + 1;
    });

    const items = Object.entries(grouped).map(([cls, count]) =>
      `${count} ${cls}${count > 1 ? 's' : ''}`
    );

    return `Detected: ${items.join(', ')}`;
  }

  // Check if command is vision-based
  private isVisionBasedCommand(text: string): boolean {
    const visionKeywords = [
      'see', 'look', 'avoid', 'obstacle', 'person', 'truck',
      'clear', 'path', 'ahead', 'left', 'right', 'turn',
      'safe', 'danger', 'hazard', 'collision'
    ];

    const lowerText = text.toLowerCase();
    return visionKeywords.some(keyword => lowerText.includes(keyword));
  }

  // Handle vision-based navigation from Gemini Live API
  private async handleVisionBasedNavigation(text: string) {
    const lowerText = text.toLowerCase();

    console.log('🎥 Vision-based navigation:', text);

    // Extract navigation intent and send appropriate commands
    if (lowerText.includes('obstacle') || lowerText.includes('stop') || lowerText.includes('danger')) {
      console.log('⚠️ Obstacle detected - stopping');
      await this.vehicleClient.emergencyStop('Vision: Obstacle detected');

    } else if (lowerText.includes('person') || lowerText.includes('human')) {
      console.log('🚨 Person detected - emergency stop');
      await this.vehicleClient.emergencyStop('Vision: Person detected');

    } else if (lowerText.includes('turn left') || lowerText.includes('avoid right') || lowerText.includes('go left')) {
      console.log('← Turning left');
      await this.vehicleClient.manualControl(0.3, 0.5); // Slow forward with left turn

    } else if (lowerText.includes('turn right') || lowerText.includes('avoid left') || lowerText.includes('go right')) {
      console.log('→ Turning right');
      await this.vehicleClient.manualControl(0.3, -0.5); // Slow forward with right turn

    } else if (lowerText.includes('slow') || lowerText.includes('caution')) {
      console.log('🐌 Slowing down');
      await this.vehicleClient.manualControl(0.5, 0); // Slow forward

    } else if (lowerText.includes('reverse') || lowerText.includes('back')) {
      console.log('⬅️ Reversing');
      await this.vehicleClient.manualControl(-0.5, 0); // Reverse

    } else if (lowerText.includes('clear') || lowerText.includes('continue') || lowerText.includes('forward')) {
      console.log('✅ Path clear - moving forward');
      await this.vehicleClient.manualControl(1.0, 0); // Normal forward speed
    }
  }

  // Get controller statistics
  getStats() {
    return {
      isProcessing: this.isProcessing,
      recentDetections: this.recentDetections.length,
      taskHistory: this.taskHistory.length
    };
  }
}