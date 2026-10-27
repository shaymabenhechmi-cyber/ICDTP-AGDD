export interface DashboardKpis {
  piecesInspectedToday?: number;

  totalInspected?: number;
  total?: number;
  inspected?: number;
  piecesInspected?: number;

  healthy?: number;
  healthyCount?: number;

  defectsDetectedToday?: number;
  defective?: number;
  defects?: number;
  defect?: number;
  defectiveCount?: number;

  conformityRate?: number;
  qualityRate?: number;
  defectRate?: number;
}


export interface DashboardTrendItem {
  date?: string;
  label?: string;
  time?: string;

  inspected?: number;
  total?: number;
  count?: number;

  healthy?: number;
  healthyCount?: number;

  defects?: number;
  defective?: number;
  defect?: number;
  defectiveCount?: number;
}


export interface DashboardDefectType {
  type?: string;
  defectType?: string;
  defect_type?: string;

  count?: number;
  total?: number;
}


export interface DashboardActivity {

  /**
   * Professional inspection identifier
   * Example: INS-000001
   */
  inspectionId?: string | number;

  /**
   * Gear identifier
   * Example: GEAR-20260917-005320-0
   */
  pieceId?: string;

  /**
   * Inspection status
   * OK / DEFECT / UNCERTAIN
   */
  status?: string;

  /**
   * Detected defect type
   */
  defectType?: string | null;

  /**
   * Inspection date/time
   */
  inspectedAt?: string;

  /**
   * Gear measurements
   */
  outerDiameter?: number | null;
  innerDiameter?: number | null;
  teethCount?: number | null;
  heightMm?: number | null;
  helixDeg?: number | null;

  /**
   * Optional detailed inspection statuses
   */
  topStatus?: string | null;
  sideStatus?: string | null;

  /**
   * Compatibility fields
   */
  id?: number | string;
  piece_id?: string;
  defect_type?: string;
  time?: string;
  timestamp?: string;
}


export interface DashboardEquipment {
  name?: string;
  status?: string;
}


export interface DashboardAlert {
  message?: string;
  level?: string;
  time?: string;
}


export interface DashboardProduction {
  lineSpeedPiecesPerMinute?: number;
  targetPiecesPerMinute?: number;
}


export interface DashboardShift {
  shift?: string;
  conformityRate?: number;
  piecesInspected?: number;
}


export interface DashboardOverview {

  kpis: DashboardKpis;

  trend7d: DashboardTrendItem[];

  trend30d: DashboardTrendItem[];

  defectTypes: DashboardDefectType[];

  /**
   * Recent inspection records
   */
  activity: DashboardActivity[];

  equipment: DashboardEquipment[];

  alerts: DashboardAlert[];

  production: DashboardProduction;

  shifts: DashboardShift[];

  healthScore?: number;
}