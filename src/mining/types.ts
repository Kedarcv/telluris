// Core types for the Autonomous Mining Vehicle System

// Task and Navigation Types
export type TaskType = 'navigate' | 'patrol' | 'follow' | 'inspect' | 'standby' | 'stop';

export interface Waypoint {
  lat?: number;
  lon?: number;
  x?: number;
  y?: number;
  theta?: number;
  tolerance?: number;
  frame?: 'latlon' | 'map';
}

export interface OperatorMessage {
  message: string;
  task_type?: TaskType;
  waypoints?: Waypoint[];
  speed_limit_mps?: number;
  max_runtime_s?: number;
  keepout_zones?: Zone[];
  required_clearance_m?: number;
  confirm_before_execute?: boolean;
}

// Perception Types
export interface Detection {
  frame_id: string;
  ts: number;
  class: 'person' | 'truck' | 'rock' | 'berm' | 'void' | 'equipment' | 'unknown';
  bbox?: BoundingBox;
  segmentation?: number[][];
  position: Position3D;
  confidence: number;
  velocity?: Vector3D;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Position3D {
  x: number;
  y: number;
  z?: number;
  frame: 'map' | 'vehicle' | 'camera';
}

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface Hazard {
  type: 'obstacle' | 'person' | 'vehicle' | 'terrain' | 'environmental';
  position: Position3D;
  severity: 'low' | 'medium' | 'high' | 'critical';
  radius?: number;
  description?: string;
}

// Telemetry Types
export interface VehiclePose {
  x: number;
  y: number;
  theta: number; // heading in radians
  frame: 'map' | 'gnss' | 'odom';
}

export interface Telemetry {
  pose: VehiclePose;
  velocity: {
    linear: number;
    angular: number;
  };
  battery: {
    voltage: number;
    percentage: number;
    current: number;
  };
  imu?: {
    accel: Vector3D;
    gyro: Vector3D;
    orientation: Vector3D;
  };
  gnss_status: 'fix' | 'float' | 'dgps' | 'no_fix' | 'unavailable';
  health: VehicleHealth;
  timestamp: number;
}

export interface VehicleHealth {
  temperatures: {
    motor_left?: number;
    motor_right?: number;
    controller?: number;
    battery?: number;
  };
  link_quality: number; // 0-100
  error_codes: string[];
  warnings: string[];
}

// ESP32 Command Types
export type ESP32CommandType = 'drive' | 'waypoint' | 'stop' | 'io' | 'config' | 'query';

export interface ESP32BaseCommand {
  type: ESP32CommandType;
  id: string;
  timestamp?: number;
}

export interface ESP32DriveCommand extends ESP32BaseCommand {
  type: 'drive';
  linear_mps: number;
  angular_rps: number;
  duration_s?: number;
  speed?: number;
  constraints?: {
    v_max?: number;
    a_max?: number;
    curv_max?: number;
  };
}

export interface ESP32WaypointCommand extends ESP32BaseCommand {
  type: 'waypoint';
  frame: 'map' | 'odom';
  x: number;
  y: number;
  theta?: number;
  tolerance_m: number;
  v_max?: number;
}

export interface ESP32StopCommand extends ESP32BaseCommand {
  type: 'stop';
  reason: string;
  emergency?: boolean;
}

export interface ESP32IOCommand extends ESP32BaseCommand {
  type: 'io';
  pin: number;
  state: 'high' | 'low' | 'pwm';
  value?: number; // for PWM
}

export type ESP32Command = ESP32DriveCommand | ESP32WaypointCommand | ESP32StopCommand | ESP32IOCommand;

export interface ESP32Response {
  id: string;
  ok: boolean;
  error?: string;
  timestamp: number;
  data?: any;
}

// Planning and Safety Types
export interface Plan {
  id: string;
  task_type: TaskType;
  steps: PlanStep[];
  prerequisites: string[];
  safety_checks: SafetyCheck[];
  acceptance_criteria: AcceptanceCriterion[];
  estimated_duration_s: number;
  risk_level: RiskLevel;
}

export interface PlanStep {
  id: string;
  type: 'move' | 'wait' | 'check' | 'align' | 'approach';
  description: string;
  command?: ESP32Command;
  waypoint?: Waypoint;
  duration_s?: number;
  dependencies?: string[];
  safety_requirements?: SafetyRequirement[];
}

export interface SafetyCheck {
  type: 'clearance' | 'geofence' | 'speed' | 'sensor' | 'communication';
  description: string;
  threshold?: number;
  unit?: string;
}

export interface AcceptanceCriterion {
  type: 'position' | 'alignment' | 'detection' | 'time';
  description: string;
  tolerance?: number;
  value?: any;
}

export interface SafetyRequirement {
  type: 'min_clearance' | 'max_speed' | 'required_sensor' | 'visibility';
  value: number | string;
  unit?: string;
}

export type RiskLevel = 'minimal' | 'low' | 'medium' | 'high' | 'critical';

// Status and Reporting Types
export interface VehicleStatus {
  phase: 'idle' | 'planning' | 'executing' | 'paused' | 'emergency_stop' | 'error';
  progress_pct: number;
  current_goal?: string;
  eta_s?: number;
  active_plan_id?: string;
  current_step_id?: string;
}

export interface SafetyStatus {
  risk_level: RiskLevel;
  nearest_obstacle_m?: number;
  nearest_obstacle_class?: string;
  e_stop: boolean;
  safety_bubble_breaches: SafetyBreach[];
  active_hazards: Hazard[];
}

export interface SafetyBreach {
  timestamp: number;
  object_class: string;
  distance_m: number;
  position: Position3D;
}

export interface TaskReport {
  task_id: string;
  outcome: 'completed' | 'aborted' | 'failed' | 'timeout';
  start_time: number;
  end_time: number;
  exceptions: Exception[];
  evidence: Evidence[];
  timeline: TimelineEvent[];
  metrics?: TaskMetrics;
}

export interface Exception {
  timestamp: number;
  type: string;
  description: string;
  severity: 'warning' | 'error' | 'critical';
  resolution?: string;
}

export interface Evidence {
  type: 'frame' | 'telemetry' | 'detection' | 'command';
  frame_ids?: string[];
  data?: any;
  timestamp: number;
}

export interface TimelineEvent {
  timestamp: number;
  event_type: string;
  description: string;
  data?: any;
}

export interface TaskMetrics {
  distance_traveled_m: number;
  average_speed_mps: number;
  max_speed_mps: number;
  duration_s: number;
  energy_consumed_wh?: number;
  obstacles_avoided: number;
}

// Policy and Configuration Types
export interface SafetyPolicy {
  geofences: Geofence[];
  speed_limits: SpeedLimit[];
  clearance_requirements: ClearanceRequirement[];
  right_of_way_rules: RightOfWayRule[];
  e_stop_endpoints: string[];
  max_risk_level: RiskLevel;
}

export interface Geofence {
  id: string;
  name: string;
  type: 'inclusion' | 'exclusion';
  polygon: Position3D[];
  active: boolean;
}

export interface Zone {
  id: string;
  name: string;
  type: 'keepout' | 'slow' | 'caution' | 'operational';
  geometry: Position3D[];
  restrictions?: {
    max_speed_mps?: number;
    min_clearance_m?: number;
    requires_permission?: boolean;
  };
}

export interface SpeedLimit {
  condition: string;
  max_speed_mps: number;
  zone_id?: string;
}

export interface ClearanceRequirement {
  object_class: string;
  min_distance_m: number;
  action: 'stop' | 'slow' | 'avoid';
}

export interface RightOfWayRule {
  scenario: string;
  priority: number;
  action: string;
}

// System State
export interface MiningVehicleState {
  operator_message?: OperatorMessage;
  current_plan?: Plan;
  vehicle_status: VehicleStatus;
  safety_status: SafetyStatus;
  telemetry: Telemetry;
  recent_detections: Detection[];
  active_hazards: Hazard[];
  command_queue: ESP32Command[];
  command_history: Array<{
    command: ESP32Command;
    response: ESP32Response;
    timestamp: number;
  }>;
  safety_policy: SafetyPolicy;
}

// Tool/Function Contracts
export interface PerceptionAPI {
  getDetections(frame_window: number, classes: string[]): Promise<Detection[]>;
  getHazards(): Promise<Hazard[]>;
}

export interface TelemetryAPI {
  getTelemetry(): Promise<Telemetry>;
  getHealth(): Promise<VehicleHealth>;
}

export interface ControlAPI {
  sendESP32(command: ESP32Command): Promise<ESP32Response>;
  setGeofence(polygons: Position3D[]): Promise<{ ok: boolean }>;
  setSpeedLimit(v_max: number): Promise<{ ok: boolean }>;
  emergencyStop(reason: string): Promise<{ ok: boolean }>;
}

export interface NavigationAPI {
  planPath(start: Position3D, goal: Position3D, constraints?: any): Promise<Waypoint[]>;
  validatePath(waypoints: Waypoint[]): Promise<{ valid: boolean; issues?: string[] }>;
}