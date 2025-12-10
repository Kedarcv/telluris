// React hook for mining vehicle control system integration

import { useState, useEffect, useCallback, useRef } from 'react';
import { MiningVehicleClient } from '../mining/mining-vehicle-client';
import { GeminiMiningController } from '../mining/services/gemini-mining-controller';
import { useLiveAPIContext } from '../contexts/LiveAPIContext';
import {
  MiningVehicleState,
  OperatorMessage,
  Plan,
  Detection,
  SafetyPolicy
} from '../mining/types';

export interface UseMiningVehicleOptions {
  esp32Url?: string;
  enableGeminiControl?: boolean;
}

export interface UseMiningVehicleReturn {
  // State
  vehicleState: MiningVehicleState | null;
  isConnected: boolean;
  isProcessing: boolean;
  currentPlan: Plan | null;
  messages: SystemMessage[];
  geminiConnected: boolean;
  
  // Actions
  initialize: () => Promise<void>;
  sendOperatorMessage: (message: OperatorMessage) => Promise<SendMessageResult>;
  sendVoiceCommand: (command: string) => Promise<void>;
  confirmPlan: (planId: string) => Promise<{ success: boolean; error?: string }>;
  emergencyStop: (reason?: string) => Promise<void>;
  clearEmergencyStop: (authorization: string) => Promise<boolean>;
  manualControl: (linear: number, angular: number) => Promise<void>;
  processVideoFrame: (frameId: string, imageData: ImageData) => Promise<Detection[]>;
  
  // Utilities
  clearMessages: () => void;
  disconnect: () => void;
}

interface SystemMessage {
  id: string;
  timestamp: number;
  type: 'info' | 'warning' | 'error' | 'success';
  content: string;
}

interface SendMessageResult {
  success: boolean;
  plan?: Plan;
  error?: string;
  requiresConfirmation?: boolean;
  confirmationMessage?: string;
}

// Default safety policy for mining environments
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

export function useMiningVehicle(options: UseMiningVehicleOptions = {}): UseMiningVehicleReturn {
  const { enableGeminiControl = true } = options;
  
  // Get Gemini client from context
  const { connected: geminiConnected, client: geminiClient } = useLiveAPIContext();
  
  // State
  const [vehicleState, setVehicleState] = useState<MiningVehicleState | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [messages, setMessages] = useState<SystemMessage[]>([]);
  
  // Refs
  const clientRef = useRef<MiningVehicleClient | null>(null);
  const geminiControllerRef = useRef<GeminiMiningController | null>(null);
  const messageIdCounter = useRef(0);
  
  // Derived state
  const currentPlan = vehicleState?.current_plan || null;
  
  // Helper to add system message
  const addMessage = useCallback((type: SystemMessage['type'], content: string) => {
    const message: SystemMessage = {
      id: `msg_${++messageIdCounter.current}`,
      timestamp: Date.now(),
      type,
      content
    };
    setMessages(prev => [...prev.slice(-99), message]); // Keep last 100 messages
  }, []);
  
  // Initialize client
  const initialize = useCallback(async () => {
    if (clientRef.current) {
      addMessage('warning', 'Mining vehicle client already initialized');
      return;
    }
    
    try {
      setIsProcessing(true);
      addMessage('info', 'Initializing mining vehicle system...');
      
      const client = new MiningVehicleClient({
        esp32Url: options.esp32Url || 'ws://localhost:8080/esp32',
        safetyPolicy: DEFAULT_SAFETY_POLICY
      });
      
      // Set up event handlers
      client.onStateChange((state) => {
        setVehicleState(state);
      });
      
      client.onMessage((message) => {
        // Determine message type based on content
        let type: SystemMessage['type'] = 'info';
        if (message.includes('ERROR') || message.includes('EMERGENCY')) {
          type = 'error';
        } else if (message.includes('WARNING') || message.includes('risk')) {
          type = 'warning';
        } else if (message.includes('completed') || message.includes('success')) {
          type = 'success';
        }
        
        addMessage(type, message);
      });
      
      await client.initialize();
      clientRef.current = client;
      setIsConnected(true);
      
      // Initialize Gemini controller if enabled and connected
      if (enableGeminiControl && geminiConnected && geminiClient) {
        const geminiController = new GeminiMiningController({
          vehicleClient: client,
          geminiClient: geminiClient
        });
        geminiControllerRef.current = geminiController;
        addMessage('success', 'Mining vehicle system initialized with Gemini AI control');
      } else {
        addMessage('success', 'Mining vehicle system initialized');
      }
      
    } catch (error) {
      addMessage('error', `Failed to initialize: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    } finally {
      setIsProcessing(false);
    }
  }, [options.esp32Url, enableGeminiControl, geminiConnected, geminiClient, addMessage]);
  
  // Send operator message
  const sendOperatorMessage = useCallback(async (message: OperatorMessage): Promise<SendMessageResult> => {
    if (!clientRef.current) {
      const error = 'Mining vehicle client not initialized';
      addMessage('error', error);
      return { success: false, error };
    }
    
    try {
      setIsProcessing(true);
      addMessage('info', `Processing: ${message.message}`);
      
      const result = await clientRef.current.processOperatorMessage(message);
      
      if (result.success) {
        if (result.requiresConfirmation) {
          addMessage('warning', 'Plan requires confirmation');
        } else {
          addMessage('success', 'Command accepted and executing');
        }
      } else {
        addMessage('error', result.error || 'Failed to process message');
      }
      
      return result;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addMessage('error', `Error processing message: ${errorMessage}`);
      return { success: false, error: errorMessage };
    } finally {
      setIsProcessing(false);
    }
  }, [addMessage]);
  
  // Send voice command through Gemini
  const sendVoiceCommand = useCallback(async (command: string): Promise<void> => {
    if (!geminiControllerRef.current) {
      addMessage('error', 'Gemini controller not available');
      return;
    }
    
    try {
      setIsProcessing(true);
      addMessage('info', `Processing voice command: "${command}"`);
      
      await geminiControllerRef.current.processUserCommand(command);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addMessage('error', `Error processing voice command: ${errorMessage}`);
    } finally {
      setIsProcessing(false);
    }
  }, [addMessage]);
  
  // Confirm plan
  const confirmPlan = useCallback(async (planId: string): Promise<{ success: boolean; error?: string }> => {
    if (!clientRef.current) {
      return { success: false, error: 'Mining vehicle client not initialized' };
    }
    
    try {
      setIsProcessing(true);
      addMessage('info', 'Confirming plan execution...');
      
      const result = await clientRef.current.confirmAndExecutePlan(planId);
      
      if (result.success) {
        addMessage('success', 'Plan confirmed and executing');
      } else {
        addMessage('error', result.error || 'Failed to confirm plan');
      }
      
      return result;
      
    } finally {
      setIsProcessing(false);
    }
  }, [addMessage]);
  
  // Emergency stop
  const emergencyStop = useCallback(async (reason?: string) => {
    if (!clientRef.current) {
      addMessage('error', 'Cannot perform emergency stop - client not initialized');
      return;
    }
    
    try {
      await clientRef.current.emergencyStop(reason || 'User initiated');
      addMessage('error', 'EMERGENCY STOP ACTIVATED');
    } catch (error) {
      addMessage('error', `Emergency stop failed: ${error}`);
    }
  }, [addMessage]);
  
  // Clear emergency stop
  const clearEmergencyStop = useCallback(async (authorization: string): Promise<boolean> => {
    if (!clientRef.current) {
      addMessage('error', 'Client not initialized');
      return false;
    }
    
    try {
      const success = await clientRef.current.clearEmergencyStop(authorization);
      
      if (success) {
        addMessage('success', 'Emergency stop cleared');
      } else {
        addMessage('error', 'Failed to clear emergency stop');
      }
      
      return success;
    } catch (error) {
      addMessage('error', `Error clearing e-stop: ${error}`);
      return false;
    }
  }, [addMessage]);
  
  // Manual control
  const manualControl = useCallback(async (linear: number, angular: number) => {
    if (!clientRef.current) {
      throw new Error('Client not initialized');
    }
    
    await clientRef.current.manualControl(linear, angular);
  }, []);
  
  // Process video frame
  const processVideoFrame = useCallback(async (frameId: string, imageData: ImageData): Promise<Detection[]> => {
    if (!clientRef.current) {
      return [];
    }
    
    return clientRef.current.processVideoFrame(frameId, imageData);
  }, []);
  
  // Clear messages
  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);
  
  // Disconnect
  const disconnect = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.destroy();
      clientRef.current = null;
      setIsConnected(false);
      setVehicleState(null);
      addMessage('info', 'Disconnected from mining vehicle system');
    }
  }, [addMessage]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (clientRef.current) {
        clientRef.current.destroy();
      }
    };
  }, []);
  
  return {
    // State
    vehicleState,
    isConnected,
    isProcessing,
    currentPlan,
    messages,
    geminiConnected,
    
    // Actions
    initialize,
    sendOperatorMessage,
    sendVoiceCommand,
    confirmPlan,
    emergencyStop,
    clearEmergencyStop,
    manualControl,
    processVideoFrame,
    
    // Utilities
    clearMessages,
    disconnect
  };
}