using UnityEngine;
using System;
using System.Collections;

public class GripperStatusReceiver : MonoBehaviour
{
    [Header("Referenzen")]
    public GripAttachment gripAttachment;
    public RobotStateReceiver stateReceiver;
    public FingerContact[] fingerContactSensors;

    [Header("ROS Einstellungen")]
    public string topicName = "/gripper_status";
    public string messageType = "std_msgs/msg/String";

    private string _lastState = "unknown";

    void Start()
    {
        StartCoroutine(SubscribeGeneric());
    }

    IEnumerator SubscribeGeneric()
    {
        while (RosConnector.Instance == null) yield return new WaitForSeconds(0.5f);
        while (!RosConnector.Instance.IsConnected) yield return new WaitForSeconds(0.5f);

        Debug.Log($"<color=red>[GripperStatusReceiver] Subscribing to {topicName}</color>");
        RosConnector.Instance.Subscribe(topicName, messageType, HandleMessage);
    }

    void HandleMessage(string jsonString)
    {
        try
        {
            // std_msgs/String -> {"op":"publish","topic":"/gripper_status","msg":{"data":"open"}}
            StringMsgWrapper packet = JsonUtility.FromJson<StringMsgWrapper>(jsonString);
            string state = packet?.msg?.data;

            if (string.IsNullOrEmpty(state) || state == _lastState)
                return;

            _lastState = state;
            ApplyGripperState(state);
        }
        catch (Exception e)
        {
            Debug.LogError($"[GripperStatusReceiver] Parse error: {e}");
        }
    }

    void ApplyGripperState(string state)
    {
        Debug.Log($"[GripperStatusReceiver] Gripper status -> {state}");

        switch (state)
        {
            case "closed":
                // Fully closed: stop trying to grab further, keep whatever
                // was already attached during the "moving" phase.
                if (gripAttachment != null)
                    gripAttachment.gripperIsClosing = false;
                break;

            case "moving":
                // Only start attempting a grab while actively closing.
                // (send_gripper("grip_close") triggers this "moving" state
                // first, then "closed" once travel completes.)
                // We can't tell open->moving from closed->moving here, so
                // GripAttachment.TryGrab() being a no-op once already
                // holding something keeps this safe either direction.
                if (gripAttachment != null && !gripAttachment.IsHolding)
                    gripAttachment.gripperIsClosing = true;
                break;

            case "open":
                if (stateReceiver != null)
                    stateReceiver.ignoreLatches = true;

                if (fingerContactSensors != null)
                {
                    foreach (var sensor in fingerContactSensors)
                        if (sensor != null) sensor.ResetLatch();
                }

                if (gripAttachment != null)
                {
                    gripAttachment.gripperIsClosing = false;
                    gripAttachment.Release();
                }
                break;
        }
    }
}

[Serializable]
public class StringMsgWrapper
{
    public string op;
    public string topic;
    public StringDataMsg msg;
}

[Serializable]
public class StringDataMsg
{
    public string data;
}