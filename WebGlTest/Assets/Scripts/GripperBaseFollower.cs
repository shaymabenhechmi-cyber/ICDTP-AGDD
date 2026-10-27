using UnityEngine;
using System.Collections;
using System.Collections.Generic;

public class GripAttachment : MonoBehaviour
{
    [Tooltip("Wo das gegriffene Objekt hin-geparented wird (Mittelpunkt = Attach-Punkt)")]
    public Transform attachPoint;

    [Tooltip("Finger-Sensoren, die geprüft werden, ob sie etwas berühren")]
    public FingerContact[] fingerContactSensors;

    [HideInInspector] public bool gripperIsClosing = false;

    private Rigidbody _heldBody;
    private Transform _heldRoot;

    // Reused every frame instead of allocated — avoids per-frame GC garbage.
    private readonly Dictionary<Rigidbody, int> _grabCounts = new Dictionary<Rigidbody, int>();

    private bool _loggedTryingToGrab = false;

    void Update()
    {
        if (_heldBody == null && gripperIsClosing)
        {
            if (!_loggedTryingToGrab)
            {
                Debug.Log("[GripAttachment] Trying to grab...");
                _loggedTryingToGrab = true;   // only log once per attempt cycle, not every frame
            }
            TryGrab();
        }
        else
        {
            _loggedTryingToGrab = false;
        }
    }

    void TryGrab()
    {
        _grabCounts.Clear();   // reuse the same dictionary, no allocation

        foreach (var sensor in fingerContactSensors)
        {
            if (!sensor.isTouching || sensor.touchedObject == null)
                continue;

            Rigidbody rb = sensor.touchedObject;

            if (!_grabCounts.ContainsKey(rb))
                _grabCounts[rb] = 0;

            _grabCounts[rb]++;
        }

        foreach (var pair in _grabCounts)
        {
            if (pair.Value >= 2)     // require at least 2 fingers
            {
                GrabObject(pair.Key);
                break;
            }
        }
    }

    void GrabObject(Rigidbody rb)
    {
        if (_heldBody != null)
            return;

        _heldBody = rb;
        _heldRoot = rb.transform;

        // Disable physics FIRST (prevents jitter / falling / no grab)
        rb.isKinematic = true;
        rb.useGravity = false;

        // Parent to gripper
        _heldRoot.SetParent(attachPoint, true);

        // Snap position + rotation
        _heldRoot.position = attachPoint.position;
        _heldRoot.rotation = attachPoint.rotation;

        Debug.Log($"Grabbed {_heldRoot.name}");
    }

    public float dropDelay = 0.1f;

    public void Release()
    {
        if (_heldBody == null)
            return;

        StartCoroutine(ReleaseDelayed(_heldBody));

        _heldBody = null;
        _heldRoot = null;
    }

    private IEnumerator ReleaseDelayed(Rigidbody rb)
    {
        rb.linearVelocity = Vector3.zero;
        rb.angularVelocity = Vector3.zero;

        rb.isKinematic = true;

        rb.transform.SetParent(null, true);

        yield return new WaitForSeconds(dropDelay);

        rb.isKinematic = false;
        rb.useGravity = true;

        rb.linearVelocity = Vector3.zero;
        rb.angularVelocity = Vector3.zero;
    }

    public bool IsHolding => _heldBody != null;
}