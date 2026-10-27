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
}


export interface RobotSettings {

  armSpeed: number;
  gripForce: number;
  safetyZoneRadius: number;

  sortingMode:
    | 'defectType'
    | 'size';

  autoReturnHome: boolean;
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