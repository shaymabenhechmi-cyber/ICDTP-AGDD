export const environment = {
  production: false,

  apiUrl: 'http://localhost:8080/api',

  // Robot Control / ROS2 pipeline
  robotControlUrl: 'http://127.0.0.1:8081/api/robot',

  // ============================================================
  // LEGACY CAMERA CONFIG
  // Kept for compatibility with existing components/services
  // ============================================================

  cameraHost: 'http://192.168.100.11',
  rtspGatewayUrl: 'http://UBUNTU_IP:1984',
  topCameraPort: 55000,

  sideCameraPort: 55002,

  // ============================================================
  // SIMULATION CAMERAS
  // Unity simulation streams
  // ============================================================

  simulationTopCameraUrl: 'http://192.168.100.11:55000/',

  simulationSideCameraUrl: 'http://192.168.100.11:55002/',

  // ============================================================
  // REAL ROBOT CAMERAS
  // Future physical camera URLs
  // ============================================================

  realTopCameraUrl: '',

  realSideCameraUrl: ''
};

