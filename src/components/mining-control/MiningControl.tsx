import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useMiningVehicleContext } from '../../contexts/MiningVehicleContext';
import { useLiveAPIContext } from '../../contexts/LiveAPIContext';
import { OperatorMessage, TaskType, Detection } from '../../mining/types';
import './mining-control.scss';

interface MiningControlProps {
  videoStream: MediaStream | null;
  esp32Url?: string;
  onDetectionsChange?: (detections: Detection[]) => void;
}

interface SystemMessage {
  id: string;
  timestamp: number;
  type: 'info' | 'warning' | 'error' | 'success';
  content: string;
}

export const MiningControl: React.FC<MiningControlProps> = ({ videoStream, onDetectionsChange }) => {
  const {
    vehicleClient,
    vehicleState,
    isInitialized,
    isSimulationMode,
    sendVoiceCommand
  } = useMiningVehicleContext();

  const { connected: geminiConnected } = useLiveAPIContext();

  // Local state
  const [commandText, setCommandText] = useState('');
  const [selectedTaskType, setSelectedTaskType] = useState<TaskType>('navigate');
  const [speedLimit, setSpeedLimit] = useState(2.0);
  const [clearanceDistance, setClearanceDistance] = useState(8.0);
  const [confirmBeforeExecute, setConfirmBeforeExecute] = useState(true);
  const [pendingPlan, setPendingPlan] = useState<{ id: string; message: string } | null>(null);
  const [authCode, setAuthCode] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [messages, setMessages] = useState<SystemMessage[]>([]);
  const [detections, setDetections] = useState<Detection[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageIdCounter = useRef(0);
  const videoProcessingInterval = useRef<number | null>(null);

  // Helper to add system message
  const addMessage = useCallback((type: SystemMessage['type'], content: string) => {
    const message: SystemMessage = {
      id: `msg_${++messageIdCounter.current}`,
      timestamp: Date.now(),
      type,
      content
    };
    setMessages(prev => [...prev, message]);
  }, []);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Subscribe to vehicle messages
  useEffect(() => {
    if (!vehicleClient) return;

    const unsubscribe = vehicleClient.onMessage((message) => {
      // Determine message type based on content
      let type: SystemMessage['type'] = 'info';
      if (message.includes('ERROR') || message.includes('EMERGENCY')) {
        type = 'error';
      } else if (message.includes('WARNING') || message.includes('risk')) {
        type = 'warning';
      } else if (message.includes('success') || message.includes('complete')) {
        type = 'success';
      }
      addMessage(type, message);
    });

    return unsubscribe;
  }, [vehicleClient, addMessage]);

  // Process video frames when stream is available
  useEffect(() => {
    if (!videoStream || !vehicleClient || !isInitialized) {
      if (videoProcessingInterval.current) {
        window.clearInterval(videoProcessingInterval.current);
        videoProcessingInterval.current = null;
      }
      return;
    }

    // Create video element to capture frames
    const video = document.createElement('video');
    video.srcObject = videoStream;
    video.play();

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // Process frames at 5 FPS
    videoProcessingInterval.current = window.setInterval(() => {
      if (video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const frameId = `frame_${Date.now()}`;

        vehicleClient.processVideoFrame(frameId, imageData).then(dets => {
          setDetections(dets);
        }).catch(console.error);
      }
    }, 200);

    return () => {
      if (videoProcessingInterval.current) {
        window.clearInterval(videoProcessingInterval.current);
      }
      video.srcObject = null;
    };
  }, [videoStream, vehicleClient, isInitialized]);

  // Notify parent of detection changes
  useEffect(() => {
    if (onDetectionsChange) {
      onDetectionsChange(detections);
    }
  }, [detections, onDetectionsChange]);

  // Send command
  const handleSendCommand = useCallback(async () => {
    if (!commandText.trim() || !vehicleClient) return;

    const message: OperatorMessage = {
      message: commandText,
      task_type: selectedTaskType,
      speed_limit_mps: speedLimit,
      required_clearance_m: clearanceDistance,
      confirm_before_execute: confirmBeforeExecute
    };

    setIsProcessing(true);
    try {
      const result = await vehicleClient.processOperatorMessage(message);

      if (result.requiresConfirmation && result.plan) {
        setPendingPlan({
          id: result.plan.id,
          message: result.confirmationMessage || 'Confirm plan execution?'
        });
      } else if (!result.success) {
        addMessage('error', result.error || 'Command failed');
      }
    } catch (error) {
      addMessage('error', `Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsProcessing(false);
    }

    setCommandText('');
  }, [commandText, selectedTaskType, speedLimit, clearanceDistance, confirmBeforeExecute, vehicleClient, addMessage]);

  // Handle plan confirmation
  const handleConfirmPlan = useCallback(async () => {
    if (!pendingPlan || !vehicleClient) return;

    setIsProcessing(true);
    try {
      await vehicleClient.confirmAndExecutePlan(pendingPlan.id);
      setPendingPlan(null);
    } catch (error) {
      addMessage('error', `Failed to execute plan: ${error}`);
    } finally {
      setIsProcessing(false);
    }
  }, [pendingPlan, vehicleClient, addMessage]);

  // Handle emergency stop
  const handleEmergencyStop = useCallback(async () => {
    if (!vehicleClient) return;

    try {
      await vehicleClient.emergencyStop('Operator initiated');
    } catch (error) {
      addMessage('error', `Failed to emergency stop: ${error}`);
    }
  }, [vehicleClient, addMessage]);

  // Clear emergency stop
  const handleClearEStop = useCallback(async () => {
    if (!authCode || !vehicleClient) {
      alert('Please enter authorization code');
      return;
    }

    try {
      const success = await vehicleClient.clearEmergencyStop(authCode);
      if (success) {
        setAuthCode('');
        addMessage('success', 'Emergency stop cleared');
      } else {
        addMessage('error', 'Failed to clear emergency stop');
      }
    } catch (error) {
      addMessage('error', `Error clearing e-stop: ${error}`);
    }
  }, [authCode, vehicleClient, addMessage]);

  // Manual control
  const handleManualControl = useCallback(async (linear: number, angular: number) => {
    if (!vehicleClient) return;

    try {
      await vehicleClient.manualControl(linear, angular);
    } catch (error) {
      console.error('Manual control error:', error);
    }
  }, [vehicleClient]);

  // Clear messages
  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  // Quick commands
  const quickCommands = [
    { text: 'Go to loading bay alpha', type: 'navigate' as TaskType },
    { text: 'Patrol south berm loop', type: 'patrol' as TaskType },
    { text: 'Stop and standby', type: 'stop' as TaskType },
    { text: 'Inspect area ahead', type: 'inspect' as TaskType }
  ];

  const currentPlan = vehicleState?.current_plan || null;

  return (
    <div className="mining-control">
      {/* Connection Status */}
      <div className="status-bar">
        <div className={`connection-status ${isInitialized ? 'connected' : 'disconnected'}`}>
          <span className="status-dot"></span>
          {isInitialized ? (isSimulationMode ? 'Simulation Mode' : 'Connected') : 'Disconnected'}
        </div>

        {geminiConnected && (
          <div className="ai-status">
            <span className="ai-indicator">🤖</span>
            Gemini AI Active
          </div>
        )}

        {vehicleState && (
          <>
            <div className="vehicle-phase">
              Phase: {vehicleState.vehicle_status.phase}
            </div>
            <div className="risk-level">
              Risk: <span className={`risk-${vehicleState.safety_status.risk_level}`}>
                {vehicleState.safety_status.risk_level}
              </span>
            </div>
            {vehicleState.safety_status.e_stop && (
              <div className="e-stop-indicator">E-STOP ACTIVE</div>
            )}
          </>
        )}
      </div>

      {/* Main Control Panel */}
      <div className="control-panel">
        <div className="left-panel">
          {/* Command Input */}
          <div className="command-section">
            <h3>Operator Commands</h3>

            <div className="command-input">
              <select
                value={selectedTaskType}
                onChange={(e) => setSelectedTaskType(e.target.value as TaskType)}
                disabled={isProcessing}
              >
                <option value="navigate">Navigate</option>
                <option value="patrol">Patrol</option>
                <option value="follow">Follow</option>
                <option value="inspect">Inspect</option>
                <option value="standby">Standby</option>
                <option value="stop">Stop</option>
              </select>

              <input
                type="text"
                value={commandText}
                onChange={(e) => setCommandText(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendCommand()}
                placeholder="Enter command..."
                disabled={isProcessing}
              />

              <button
                onClick={handleSendCommand}
                disabled={isProcessing || !commandText.trim() || !isInitialized}
              >
                Send
              </button>
            </div>

            {/* Quick Commands */}
            <div className="quick-commands">
              {quickCommands.map((cmd, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setCommandText(cmd.text);
                    setSelectedTaskType(cmd.type);
                  }}
                  disabled={isProcessing || !isInitialized}
                >
                  {cmd.text}
                </button>
              ))}
            </div>

            {/* Voice Command Integration */}
            {geminiConnected && (
              <div className="voice-commands">
                <p className="voice-hint">
                  🎤 Speak naturally to control the vehicle. Try: "Go to loading bay" or "What do you see?"
                </p>
                <button
                  className="voice-command-btn"
                  onClick={async () => {
                    // Example of programmatically sending a voice command
                    const voiceCmd = prompt('Enter voice command:');
                    if (voiceCmd) {
                      await sendVoiceCommand(voiceCmd);
                    }
                  }}
                  disabled={isProcessing}
                >
                  Test Voice Command
                </button>
              </div>
            )}

            {/* Parameters */}
            <div className="parameters">
              <div className="parameter">
                <label>
                  Speed Limit (m/s):
                  <input
                    type="number"
                    value={speedLimit}
                    onChange={(e) => setSpeedLimit(Number(e.target.value))}
                    min={0.1}
                    max={10}
                    step={0.1}
                  />
                </label>
              </div>

              <div className="parameter">
                <label>
                  Safety Clearance (m):
                  <input
                    type="number"
                    value={clearanceDistance}
                    onChange={(e) => setClearanceDistance(Number(e.target.value))}
                    min={1}
                    max={20}
                    step={0.5}
                  />
                </label>
              </div>

              <div className="parameter">
                <label>
                  <input
                    type="checkbox"
                    checked={confirmBeforeExecute}
                    onChange={(e) => setConfirmBeforeExecute(e.target.checked)}
                  />
                  Confirm before execute
                </label>
              </div>
            </div>
          </div>

          {/* Manual Control */}
          <div className="manual-control">
            <h3>Manual Control</h3>
            <div className="control-pad">
              <button
                className="control-btn up"
                onMouseDown={() => handleManualControl(1, 0)}
                onMouseUp={() => handleManualControl(0, 0)}
                disabled={!isInitialized}
              >
                ↑
              </button>
              <div className="control-row">
                <button
                  className="control-btn left"
                  onMouseDown={() => handleManualControl(0, 1)}
                  onMouseUp={() => handleManualControl(0, 0)}
                  disabled={!isInitialized}
                >
                  ←
                </button>
                <button
                  className="control-btn stop"
                  onClick={() => handleManualControl(0, 0)}
                  disabled={!isInitialized}
                >
                  STOP
                </button>
                <button
                  className="control-btn right"
                  onMouseDown={() => handleManualControl(0, -1)}
                  onMouseUp={() => handleManualControl(0, 0)}
                  disabled={!isInitialized}
                >
                  →
                </button>
              </div>
              <button
                className="control-btn down"
                onMouseDown={() => handleManualControl(-1, 0)}
                onMouseUp={() => handleManualControl(0, 0)}
                disabled={!isInitialized}
              >
                ↓
              </button>
            </div>
          </div>

          {/* Emergency Controls */}
          <div className="emergency-controls">
            <button
              className="e-stop-btn"
              onClick={handleEmergencyStop}
              disabled={!isInitialized}
            >
              EMERGENCY STOP
            </button>

            {vehicleState?.safety_status.e_stop && (
              <div className="e-stop-clear">
                <input
                  type="text"
                  placeholder="Authorization code"
                  value={authCode}
                  onChange={(e) => setAuthCode(e.target.value)}
                />
                <button onClick={handleClearEStop}>Clear E-Stop</button>
              </div>
            )}
          </div>
        </div>

        <div className="right-panel">
          {/* Vehicle Status */}
          {vehicleState && (
            <div className="vehicle-status">
              <h3>Vehicle Status</h3>

              <div className="status-grid">
                <div className="status-item">
                  <label>Position:</label>
                  <span>
                    ({vehicleState.telemetry.pose.x.toFixed(1)},
                    {vehicleState.telemetry.pose.y.toFixed(1)})
                  </span>
                </div>

                <div className="status-item">
                  <label>Speed:</label>
                  <span>{vehicleState.telemetry.velocity.linear.toFixed(1)} m/s</span>
                </div>

                <div className="status-item">
                  <label>Battery:</label>
                  <span>{vehicleState.telemetry.battery.percentage}%</span>
                </div>

                <div className="status-item">
                  <label>GNSS:</label>
                  <span>{vehicleState.telemetry.gnss_status}</span>
                </div>

                <div className="status-item">
                  <label>Link Quality:</label>
                  <span>{vehicleState.telemetry.health.link_quality}%</span>
                </div>

                {vehicleState.safety_status.nearest_obstacle_m && (
                  <div className="status-item">
                    <label>Nearest Obstacle:</label>
                    <span>
                      {vehicleState.safety_status.nearest_obstacle_class} at{' '}
                      {vehicleState.safety_status.nearest_obstacle_m.toFixed(1)}m
                    </span>
                  </div>
                )}
              </div>

              {/* Progress */}
              {currentPlan && (
                <div className="progress-section">
                  <label>Task Progress:</label>
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${vehicleState.vehicle_status.progress_pct}%` }}
                    />
                  </div>
                  <span>{vehicleState.vehicle_status.progress_pct}%</span>
                </div>
              )}

              {/* Active Hazards */}
              {vehicleState.active_hazards.length > 0 && (
                <div className="hazards">
                  <h4>Active Hazards</h4>
                  <ul>
                    {vehicleState.active_hazards.map((hazard, idx) => (
                      <li key={idx} className={`hazard-${hazard.severity}`}>
                        {hazard.description}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Recent Detections */}
              {detections.length > 0 && (
                <div className="detections">
                  <h4>Recent Detections</h4>
                  <ul>
                    {detections.slice(0, 5).map((det, idx) => (
                      <li key={idx}>
                        {det.class} - {(det.confidence * 100).toFixed(0)}% confidence
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* System Messages */}
          <div className="messages">
            <div className="messages-header">
              <h3>System Messages</h3>
              <button onClick={clearMessages}>Clear</button>
            </div>
            <div className="messages-list">
              {messages.map((msg) => (
                <div key={msg.id} className={`message message-${msg.type}`}>
                  <span className="timestamp">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="content">{msg.content}</span>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>
        </div>
      </div>

      {/* Plan Confirmation Modal */}
      {pendingPlan && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Confirm Plan Execution</h3>
            <p>{pendingPlan.message}</p>
            <div className="modal-actions">
              <button onClick={handleConfirmPlan}>Confirm</button>
              <button onClick={() => setPendingPlan(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};