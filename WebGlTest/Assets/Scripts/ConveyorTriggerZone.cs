using UnityEngine;

// Put this on the child "DetectionZone" object — the one with the BoxCollider (Is Trigger = true)
public class ConveyorTriggerZone : MonoBehaviour
{
    public ConveyorBelt belt;

    void OnTriggerEnter(Collider other)
    {
        Debug.Log($"[ZONE] OnTriggerEnter fired! other={other.name}, tag={other.tag}");
        if (belt == null)
        {
            Debug.LogWarning("[CONVEYOR] ConveyorTriggerZone has no Belt assigned!");
            return;
        }
        belt.HandleTriggerEnter(other);
    }

    void OnTriggerExit(Collider other)
    {
        if (belt == null) return;
        belt.HandleTriggerExit(other);
    }
}