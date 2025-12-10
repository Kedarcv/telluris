// ESP32 Controller Service - Handles communication with the ESP32 motor controller

import {
  ESP32Command,
  ESP32Response,
  ESP32DriveCommand,
  ESP32WaypointCommand,
  ESP32StopCommand,
  ESP32IOCommand,
  Telemetry,
  VehicleHealth
} from '../types';

export class ESP32Controller {
  private ws: WebSocket | null = null;
  private commandQueue: Map<string, (response: ESP32Response) => void> = new Map();
  private connectionPromise: Promise<void> | null = null;
  private reconnectTimeout: number | null = null;
  private readonly maxReconnectAttempts = 5;
  private reconnectAttempts = 0;
  private telemetryCallbacks: Set<(telemetry: Telemetry) => void> = new Set();

  constructor(
    private readonly wsUrl: string,
    private readonly options: {
      reconnectDelay?: number;
      commandTimeout?: number;
      heartbeatInterval?: number;
    } = {}
  ) {
    this.options = {
      reconnectDelay: 2000,
      commandTimeout: 10000,
      heartbeatInterval: 1000,
      ...options
    };
  }

  async connect(): Promise<void> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.wsUrl);

        this.ws.onopen = () => {
          console.log('ESP32 WebSocket connected');
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onerror = (error) => {
          console.error('ESP32 WebSocket error:', error);
        };

        this.ws.onclose = () => {
          console.log('ESP32 WebSocket closed');
          this.stopHeartbeat();
          this.attemptReconnect();
        };
      } catch (error) {
        reject(error);
      }
    });

    return this.connectionPromise;
  }

  private handleMessage(data: string) {
    try {
      console.log('ESP32 Message:', data); // Added logging
      const message = JSON.parse(data);

      // Handle command responses
      if (message.id && this.commandQueue.has(message.id)) {
        const callback = this.commandQueue.get(message.id)!;
        this.commandQueue.delete(message.id);
        callback(message as ESP32Response);
      }

      // Handle telemetry updates
      if (message.type === 'telemetry') {
        const telemetry = message.data as Telemetry;
        this.telemetryCallbacks.forEach(callback => callback(telemetry));
      }
    } catch (error) {
      console.error('Error parsing ESP32 message:', error);
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    this.connectionPromise = null;

    this.reconnectTimeout = window.setTimeout(() => {
      console.log(`Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
      this.connect();
    }, this.options.reconnectDelay! * this.reconnectAttempts);
  }

  private heartbeatInterval: number | null = null;

  private startHeartbeat() {
    this.heartbeatInterval = window.setInterval(() => {
      if (this.isConnected()) {
        this.ws!.send(JSON.stringify({ type: 'heartbeat', timestamp: Date.now() }));
      }
    }, this.options.heartbeatInterval!);
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  async sendCommand(command: ESP32Command): Promise<ESP32Response> {
    if (!this.isConnected()) {
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.commandQueue.delete(command.id);
        reject(new Error(`Command ${command.id} timed out`));
      }, this.options.commandTimeout!);

      this.commandQueue.set(command.id, (response) => {
        clearTimeout(timeout);
        resolve(response);
      });

      // Add timestamp if not present
      const commandWithTimestamp = {
        ...command,
        timestamp: command.timestamp || Date.now()
      };

      this.ws!.send(JSON.stringify(commandWithTimestamp));
    });
  }

  // High-level command methods
  async drive(linear_mps: number, angular_rps: number, duration_s?: number, speed?: number, constraints?: ESP32DriveCommand['constraints']): Promise<ESP32Response> {
    const command: ESP32DriveCommand = {
      type: 'drive',
      id: this.generateCommandId(),
      linear_mps,
      angular_rps,
      duration_s,
      speed,
      constraints
    };
    return this.sendCommand(command);
  }

  async navigateToWaypoint(waypoint: Omit<ESP32WaypointCommand, 'type' | 'id'>): Promise<ESP32Response> {
    const command: ESP32WaypointCommand = {
      type: 'waypoint',
      id: this.generateCommandId(),
      ...waypoint
    };
    return this.sendCommand(command);
  }

  async stop(reason: string, emergency = false): Promise<ESP32Response> {
    const command: ESP32StopCommand = {
      type: 'stop',
      id: this.generateCommandId(),
      reason,
      emergency
    };
    return this.sendCommand(command);
  }

  async setIO(pin: number, state: ESP32IOCommand['state'], value?: number): Promise<ESP32Response> {
    const command: ESP32IOCommand = {
      type: 'io',
      id: this.generateCommandId(),
      pin,
      state,
      value
    };
    return this.sendCommand(command);
  }

  // Telemetry subscription
  onTelemetry(callback: (telemetry: Telemetry) => void): () => void {
    this.telemetryCallbacks.add(callback);
    return () => {
      this.telemetryCallbacks.delete(callback);
    };
  }

  // Request immediate telemetry update
  async requestTelemetry(): Promise<Telemetry> {
    const response = await this.sendCommand({
      type: 'query',
      id: this.generateCommandId(),
      timestamp: Date.now()
    } as any);

    if (!response.ok) {
      throw new Error(response.error || 'Failed to get telemetry');
    }

    return response.data as Telemetry;
  }

  private generateCommandId(): string {
    return `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.connectionPromise = null;
    this.commandQueue.clear();
  }
}