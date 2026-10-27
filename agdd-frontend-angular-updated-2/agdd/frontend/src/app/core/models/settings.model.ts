export interface SettingsPayload<T = Record<string, any>> {
  category: string;
  values: T;
}


export interface CameraSettings {

  activeCamera: 'top' | 'side';

  topZoom: number;
  topFrameWidth: number;
  topFrameHeight: number;

  sideZoom: number;
  sideFrameWidth: number;
  sideFrameHeight: number;

  brightness: number;
  contrast: number;
  exposure: number;

  resolution: string;
  frameRate: number;
  autoWhiteBalance: boolean;

    // STREAM URLS
  topSimulationUrl?: string;
  topRealUrl?: string;
  sideSimulationUrl?: string;
  sideRealUrl?: string;
}


export interface RobotSettings {
  armSpeed: number;
  gripForce: number;
  safetyZoneRadius: number;
  sortingMode: string;          // keep your existing type here
  autoReturnHome: boolean;

  // Simulation robot (Unity / Windows)
  simulationUnityHost: string;
  simulationUnityPort: number;

  // Real robot
  realRobotHost: string;
  realRobotPort: number;

  // Treatment server (Ubuntu / ROS 2)
  treatmentHost: string;
  treatmentPort: number;

  // Active mode
  robotHost: string;
  tcpPort: number;
  mode: 'simulation' | 'real';  // keep your existing type here
}


export interface AiSettings {

  confidenceThreshold: number;
  model: string;
  autoRetrain: boolean;
  rejectRateAlertThreshold: number;
}


export interface SystemSettings {

 
  theme:
    | 'dark'
    | 'light'
    | 'system';

  sessionTimeoutMinutes: number;

  emailAlerts: boolean;

  pushAlerts: boolean;

  soundNotifications: boolean;

  dashboardAutoRefresh: boolean;

  dashboardRefreshInterval: number;

  confirmRobotActions: boolean;
}

