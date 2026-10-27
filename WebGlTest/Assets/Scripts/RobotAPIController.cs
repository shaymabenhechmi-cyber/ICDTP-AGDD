using UnityEngine;
using UnityEngine.UI;
using TMPro;
using System.Collections;
using System;
using System.Threading.Tasks;

public class RobotAPIController : MonoBehaviour
{
    [Header("Verbindungs-Modus")]
    [Tooltip("Wenn angehakt, werden Befehle nur simuliert (kein ROS nötig)")]
    public bool useMockData = false;

    [Header("Grip Attachment")]
    public GripAttachment gripAttachment;
    [Header("ROS Einstellungen")]
    public string topicName = "/robot_cmd";
    public string messageType = "my_robot_interfaces/msg/RobotCommand";

    [Header("Robot Kinematik")]
    public float stepsPerDegree = 88.888f;

    [Header("Gelenke (Drag & Drop aus Hierarchy)")]
    public Transform joint1;
    public Transform joint2;
    public Transform joint3;
    public Transform joint4;
    public Transform[] gripperFingers;

    [Header("UI Elements - Koordinaten")]
    public TMP_InputField inputX;
    public TMP_InputField inputY;
    public TMP_InputField inputZ;
    public Button buttonMoveToPosition;

    [Header("UI Elements - Steuerung")]
    public Button buttonGripperOpen;
    public Button buttonGripperClose;
    public Button buttonHome;
    public Button buttonReset;
    public Button buttonEmergencyStop;
    public Slider sliderSpeed;
    public TextMeshProUGUI textSpeedValue;

    [Header("Finger Kontakt-Sensoren")]
    public FingerContact[] fingerContactSensors;

    [Header("State Receiver Referenz")]
    public RobotStateReceiver stateReceiver;

    private Quaternion initialRot1, initialRot2, initialRot3, initialRot4;
    private Quaternion[] initialFingerRots;

    private bool isGripperOpen = true;
    private float currentSpeed = 100f;
    private bool _hasAdvertised = false;

    void Start()
    {
        if (joint1) initialRot1 = joint1.localRotation;
        if (joint2) initialRot2 = joint2.localRotation;
        if (joint3) initialRot3 = joint3.localRotation;
        if (joint4) initialRot4 = joint4.localRotation;

        if (gripperFingers != null)
        {
            initialFingerRots = new Quaternion[gripperFingers.Length];
            for (int i = 0; i < gripperFingers.Length; i++)
            {
                if (gripperFingers[i]) initialFingerRots[i] = gripperFingers[i].localRotation;
            }
        }

        if (buttonMoveToPosition) buttonMoveToPosition.onClick.AddListener(OnMoveToPositionClicked);
        if (buttonGripperOpen) buttonGripperOpen.onClick.AddListener(OnGripperOpenClicked);
        if (buttonGripperClose) buttonGripperClose.onClick.AddListener(OnGripperCloseClicked);
        if (buttonHome) buttonHome.onClick.AddListener(OnHomeClicked);
        if (buttonReset) buttonReset.onClick.AddListener(OnResetClicked);
        if (buttonEmergencyStop) buttonEmergencyStop.onClick.AddListener(OnEmergencyStopClicked);

        if (sliderSpeed)
        {
            sliderSpeed.onValueChanged.AddListener((val) => {
                currentSpeed = val;
                if (textSpeedValue) textSpeedValue.text = $"{val:F0} mm/s";
            });
        }

        StartCoroutine(AdvertiseOnConnect());
    }

    IEnumerator AdvertiseOnConnect()
    {
        while (RosConnector.Instance == null) yield return new WaitForSeconds(0.5f);
        while (!RosConnector.Instance.IsConnected) yield return new WaitForSeconds(0.5f);

        RosConnector.Instance.Advertise(topicName, messageType);
        _hasAdvertised = true;
        Debug.Log($"[RobotAPIController] Topic '{topicName}' advertised.");
    }

    public void OnMoveToPositionClicked()
    {
        float x = ParseFloat(inputX.text, 0);
        float y = ParseFloat(inputY.text, 200);
        float z = ParseFloat(inputZ.text, 100);

        SendRobotCommand(x, y, z, isGripperOpen);
    }

public void OnGripperCloseClicked()
{
    isGripperOpen = false;
    SendGripperCommand(false);

    if (stateReceiver != null)
        stateReceiver.ignoreLatches = false;

    // if (gripAttachment != null)
    //     gripAttachment.gripperIsClosing = true;
}

public void OnGripperOpenClicked()
{
    isGripperOpen = true;
    SendGripperCommand(true);

    if (stateReceiver != null)
        stateReceiver.ignoreLatches = true;

    // if (fingerContactSensors != null)
    // {
    //     for (int i = 0; i < fingerContactSensors.Length; i++)
    //     {
    //         if (fingerContactSensors[i] != null)
    //             fingerContactSensors[i].ResetLatch();
    //     }
    // }

    // Debug.Log($"[RobotAPIController] gripAttachment assigned={gripAttachment != null}, IsHolding={(gripAttachment != null ? gripAttachment.IsHolding : false)}");

    // if (gripAttachment != null)
    // {
    //     gripAttachment.gripperIsClosing = false;
    //     gripAttachment.Release();
    // }

    Debug.Log("[RobotAPIController] Gripper OPEN - released.");
}

    public void OnHomeClicked()
    {
        Debug.Log("[RobotAPIController] HOME gesendet.");
        SendSpecialCommand("HOME");
    }

    public void OnResetClicked()
    {
        Debug.Log("[RobotAPIController] RESET (StallGuard Homing) gesendet.");
        SendSpecialCommand("RESET");
    }

    public void OnEmergencyStopClicked()
    {
        Debug.LogWarning("NOT-AUS GESENDET!");
        SendSpecialCommand("ESTOP");
    }

    void SendRobotCommand(float x, float y, float z, bool gripperOpen)
    {
        if (useMockData)
        {
            Debug.Log($"[MOCK] Sende an ROS -> Pos: {x}/{y}/{z}, Greifer: {gripperOpen}");
            return;
        }

        RobotCommandMsg cmd = new RobotCommandMsg();
        cmd.base_id = "unity_web_client";
        cmd.gripper_state = gripperOpen;

        cmd.target_pose = new PoseMsg();
        cmd.target_pose.position = new PointMsg();

        cmd.target_pose.position.x = z / 1000f;
        cmd.target_pose.position.y = -x / 1000f;
        cmd.target_pose.position.z = y / 1000f;

        cmd.target_pose.orientation = new QuaternionMsg { x = 1.0f, y = 0.0f, z = 0.0f, w = 0.0f };

        string jsonMsg = JsonUtility.ToJson(cmd);

        if (!_hasAdvertised && RosConnector.Instance != null && RosConnector.Instance.IsConnected)
        {
            RosConnector.Instance.Advertise(topicName, messageType);
            _hasAdvertised = true;
        }

        if (RosConnector.Instance != null)
        {
            RosConnector.Instance.Publish(topicName, messageType, jsonMsg);
            Debug.Log($"[RobotAPIController] Gesendet: Pos({x},{y},{z}) -> ROS({cmd.target_pose.position.x:F3},{cmd.target_pose.position.y:F3},{cmd.target_pose.position.z:F3}) Greifer: {gripperOpen}");
        }
        else
        {
            Debug.LogWarning("[RobotAPIController] RosConnector nicht verfügbar!");
        }
    }

    void SendGripperCommand(bool open)
    {
        string command = open ? "GRIP_OPEN" : "GRIP_CLOSE";
        Debug.Log($"[RobotAPIController] Greifer: {command}");
        SendSpecialCommand(command);
    }

    void SendSpecialCommand(string command)
    {
        if (useMockData)
        {
            Debug.Log($"[MOCK] Spezieller Befehl: {command}");
            return;
        }

        RobotCommandMsg cmd = new RobotCommandMsg();
        cmd.base_id = command;
        cmd.gripper_state = isGripperOpen;
        cmd.target_pose = new PoseMsg
        {
            position = new PointMsg { x = 0, y = 0, z = 0 },
            orientation = new QuaternionMsg { x = 0, y = 0, z = 0, w = 1 }
        };

        string jsonMsg = JsonUtility.ToJson(cmd);
        if (RosConnector.Instance != null)
        {
            if (!_hasAdvertised && RosConnector.Instance.IsConnected)
            {
                RosConnector.Instance.Advertise(topicName, messageType);
                _hasAdvertised = true;
            }
            RosConnector.Instance.Publish(topicName, messageType, jsonMsg);
            Debug.Log($"[RobotAPIController] Spezialbefehl gesendet: {command}");
        }
    }

    float ParseFloat(string txt, float defaultVal = 0)
    {
        if (string.IsNullOrEmpty(txt)) return defaultVal;
        txt = txt.Replace(",", ".");
        if (float.TryParse(txt, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out float result))
            return result;
        return defaultVal;
    }
}

[Serializable]
public class RobotCommandMsg
{
    public string base_id;
    public PoseMsg target_pose;
    public bool gripper_state;
}

[Serializable]
public class PoseMsg
{
    public PointMsg position;
    public QuaternionMsg orientation;
}

[Serializable]
public class PointMsg
{
    public float x;
    public float y;
    public float z;
}

[Serializable]
public class QuaternionMsg
{
    public float x;
    public float y;
    public float z;
    public float w;
}

public class RobotStatus
{
    public int[] motor_positions;
}