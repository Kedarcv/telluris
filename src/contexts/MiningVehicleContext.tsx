import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { MiningVehicleClient } from '../mining/mining-vehicle-client';
import { GeminiMiningController } from '../mining/services/gemini-mining-controller';
import { VisionIntegrationService } from '../mining/services/vision-integration-service';
import { useLiveAPIContext } from './LiveAPIContext';
import {
  MiningVehicleState,
  OperatorMessage,
  SafetyPolicy
} from '../mining/types';
import { FunctionDeclaration, Type, LiveServerToolCall } from '@google/genai';

interface MiningVehicleContextType {
  vehicleClient: MiningVehicleClient | null;
  geminiController: GeminiMiningController | null;
  visionService: VisionIntegrationService | null;
  vehicleState: MiningVehicleState | null;
  isInitialized: boolean;
  isSimulationMode: boolean;
  sendVoiceCommand: (command: string) => Promise<void>;
  setVideoStream: (stream: MediaStream | null) => void;
}

const MiningVehicleContext = createContext<MiningVehicleContextType | undefined>(undefined);

// Default safety policy
const DEFAULT_SAFETY_POLICY: SafetyPolicy = {
  geofences: [],
  speed_limits: [
    { condition: 'default', max_speed_mps: 5.0 },
    { condition: 'near_person', max_speed_mps: 1.0 },
    { condition: 'low_visibility', max_speed_mps: 2.0 }
  ],
  clearance_requirements: [
    { object_class: 'person', min_distance_m: 8.0, action: 'stop' },
    { object_class: 'truck', min_distance_m: 15.0, action: 'slow' },
    { object_class: 'equipment', min_distance_m: 10.0, action: 'slow' },
    { object_class: 'rock', min_distance_m: 3.0, action: 'avoid' }
  ],
  right_of_way_rules: [
    { scenario: 'loaded_truck', priority: 1, action: 'yield' },
    { scenario: 'person_crossing', priority: 0, action: 'stop' }
  ],
  e_stop_endpoints: ['dashboard', 'vehicle', 'remote'],
  max_risk_level: 'medium'
};

// Rover control function declaration for Gemini
const roverControlDeclaration: FunctionDeclaration = {
  name: "control_rover_movement",
  description: "Control the mining rover's movement. Use this to make the rover actually move, don't just narrate!",
  parameters: {
    type: Type.OBJECT,
    properties: {
      action: {
        type: Type.STRING,
        description: "Movement action to perform",
        enum: ["forward", "backward", "turn_left", "turn_right", "stop"]
      },
      speed: {
        type: Type.NUMBER,
        description: "Speed value 0-255, default 150 for moderate speed"
      },
      duration: {
        type: Type.NUMBER,
        description: "Duration in seconds to perform the action (optional)"
      }
    },
    required: ["action"]
  }
};

export const MiningVehicleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { client: geminiClient, connected: geminiConnected, setConfig } = useLiveAPIContext();
  const [vehicleClient, setVehicleClient] = useState<MiningVehicleClient | null>(null);
  const [geminiController, setGeminiController] = useState<GeminiMiningController | null>(null);
  const [visionService, setVisionService] = useState<VisionIntegrationService | null>(null);
  const [vehicleState, setVehicleState] = useState<MiningVehicleState | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSimulationMode, setIsSimulationMode] = useState(true); // Start in simulation mode
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);

  // Initialize mining vehicle client
  useEffect(() => {
    console.log('Initializing Mining Vehicle System...');

    const client = new MiningVehicleClient({
      esp32Url: process.env.REACT_APP_ESP32_WS_URL || 'ws://172.20.10.2:8080',
      safetyPolicy: DEFAULT_SAFETY_POLICY
    });

    // Set up state change listener
    client.onStateChange((state) => {
      setVehicleState(state);
    });

    // Try to initialize - if ESP32 fails, continue in simulation mode
    client.initialize().then(() => {
      console.log('Mining Vehicle System initialized successfully');
      setIsSimulationMode(false);
    }).catch((error) => {
      console.log('Mining Vehicle System running in simulation mode:', error.message);
      setIsSimulationMode(true);
    });

    setVehicleClient(client);
    setIsInitialized(true);

    return () => {
      client.destroy();
    };
  }, []);

  // Configure Gemini with rover control tools when client is available
  // Note: Configuration is now handled by the RoverControl component
  /*
  useEffect(() => {
    if (geminiClient && geminiConnected) {
      setConfig({
        tools: [
          { googleSearch: {} },
          { functionDeclarations: [roverControlDeclaration] }
        ]
      });
    }
  }, [geminiClient, geminiConnected, setConfig]);
  */

  // Initialize Gemini controller and vision service when clients are ready
  useEffect(() => {
    if (!vehicleClient || !geminiClient || !geminiConnected) {
      return;
    }

    console.log('Initializing Gemini Mining Controller...');
    const controller = new GeminiMiningController({
      vehicleClient,
      geminiClient
    });

    setGeminiController(controller);

    // Initialize vision service
    const vision = new VisionIntegrationService();
    setVisionService(vision);

    // Set up vision callbacks
    vision.onFrame((frame) => {
      // Process frame detections
      vehicleClient.processVideoFrame(frame.frameId, frame.imageData);
    });

    vision.onAvoidanceAction((action) => {
      // Handle autonomous obstacle avoidance
      handleObstacleAvoidance(vehicleClient, action);
    });

    // Add initial context to Gemini
    const miningContext = `
You are Telluris, an advanced AI mining vehicle interface.

You now have access to an autonomous mining vehicle control system. You can control the vehicle using natural language commands.

Available capabilities:
1. Navigation: "Go to [location]" or "Navigate to [coordinates] or move [direction]"
2. Patrol: "Patrol [area]"
3. Inspection: "Inspect [area]"
4. Status: "What's the vehicle status?"
5. Safety: "Emergency stop" or "Resume operation"

Known locations (Office Demo Mode):
- Kitchen (100, 50)
- Meeting Room (-50, 100)
- Reception (0, 0)
- Desk Area (200, -50)
- Hallway (150, 100)
- Server Room (-100, -50)

Current mode: ${isSimulationMode ? 'SIMULATION' : 'CONNECTED TO REAL VEHICLE'}

You can interact with both Altair and the mining vehicle. When the user asks about the mining vehicle or gives vehicle commands, use the mining vehicle system. For other queries, use Altair.

CRITICAL: You are in "Active Navigator" mode.
- RESPONSE STYLE: EXTREMELY CONCISE.
- NO NARRATION. NO SMALL TALK.
- Only confirm commands (e.g., "Moving to Sector 2") or state alerts (e.g., "Obstacle detected").
- Do not describe what you see unless asked.
- Actively look for obstacles and navigate around them.
- If told to go somewhere, start moving immediately.

IMPORTANT: To control the rover, you MUST use the control_rover_movement function. Do not just narrate actions!
`;

    geminiClient.send([{ text: miningContext }]);

    // Set up tool call handler for rover control
    const handleToolCall = (toolCall: LiveServerToolCall) => {
      if (!toolCall.functionCalls) return;

      const roverControl = toolCall.functionCalls.find(fc => fc.name === "control_rover_movement");
      if (roverControl) {
        const args = roverControl.args as any;
        const { action, speed = 150, duration } = args;

        console.log(`[Rover Control] ${action} speed=${speed} duration=${duration || 'continuous'}`);

        // Convert action to motor commands
        let linear_mps = 0;
        let angular_rps = 0;

        switch (action) {
          case 'forward':
            linear_mps = 0.5;
            break;
          case 'backward':
            linear_mps = -0.5;
            break;
          case 'turn_left':
            angular_rps = 0.5;
            break;
          case 'turn_right':
            angular_rps = -0.5;
            break;
          case 'stop':
            linear_mps = 0;
            angular_rps = 0;
            break;
        }

        // Send command to vehicle with speed parameter
        vehicleClient.manualControl(linear_mps, angular_rps, speed);

        // If duration specified, stop after that time
        if (duration && duration > 0) {
          setTimeout(() => {
            vehicleClient.manualControl(0, 0, 0);
          }, duration * 1000);
        }
      }

      // Send success response
      if (toolCall.functionCalls.length) {
        setTimeout(() => {
          geminiClient.sendToolResponse({
            functionResponses: toolCall.functionCalls?.map(fc => ({
              response: { output: { success: true, message: `Executed ${fc.name}` } },
              id: fc.id,
              name: fc.name
            }))
          });
        }, 100);
      }
    };

    geminiClient.on('toolcall', handleToolCall);

    return () => {
      geminiClient.off('toolcall', handleToolCall);
    };

  }, [vehicleClient, geminiClient, geminiConnected, isSimulationMode]);

  // Initialize vision with video stream
  useEffect(() => {
    if (!visionService || !videoStream || !geminiClient) return;

    console.log('Initializing vision service with video stream...');
    visionService.initialize(videoStream, geminiClient).then(() => {
      visionService.startProcessing();
    });

    return () => {
      visionService.stopProcessing();
    };
  }, [visionService, videoStream, geminiClient]);

  const sendVoiceCommand = async (command: string) => {
    if (!geminiController) {
      console.error('Gemini Mining Controller not initialized');
      return;
    }

    await geminiController.processUserCommand(command);
  };

  // Handle autonomous obstacle avoidance
  const handleObstacleAvoidance = async (client: MiningVehicleClient, action: any) => {
    console.log('Obstacle avoidance:', action);

    switch (action.type) {
      case 'stop':
        await client.emergencyStop(action.reason);
        break;

      case 'turn_left':
      case 'turn_right':
        const angular = action.type === 'turn_left' ? 0.5 : -0.5;
        await client.manualControl(action.parameters?.speed || 0.5, angular, 255);
        break;

      case 'reverse':
        await client.manualControl(-0.5, 0, 255);
        break;

      case 'slow_down':
        await client.manualControl(action.parameters?.speed || 1.0, 0, 100);
        break;
    }
  };

  return (
    <MiningVehicleContext.Provider
      value={{
        vehicleClient,
        geminiController,
        visionService,
        vehicleState,
        isInitialized,
        isSimulationMode,
        sendVoiceCommand,
        setVideoStream
      }}
    >
      {children}
    </MiningVehicleContext.Provider>
  );
};

export const useMiningVehicleContext = () => {
  const context = useContext(MiningVehicleContext);
  if (!context) {
    throw new Error('useMiningVehicleContext must be used within MiningVehicleProvider');
  }
  return context;
};