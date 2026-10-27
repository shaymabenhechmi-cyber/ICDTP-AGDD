using UnityEngine;

public class FingerContact : MonoBehaviour
{
    public bool isTouching;
    public bool hasLatched;
    public Rigidbody touchedObject; // NEW: the piece we made contact with

    private int contactCount;

   private void OnCollisionEnter(Collision col)
    {
        contactCount++;
        isTouching = contactCount > 0;
        if (isTouching)
        {
            hasLatched = true;
            var rb = col.rigidbody;
            if (rb != null) touchedObject = rb;
            // Debug.Log removed — was firing every physics step per contact, worsening the backlog
        }
    }

    private void OnCollisionExit(Collision col)
    {
        contactCount = Mathf.Max(0, contactCount - 1);
        isTouching = contactCount > 0;
    }

    public void ResetLatch()
    {
        hasLatched = false;
        isTouching = false;
        contactCount = 0;
        touchedObject = null;
        Debug.Log($"[FingerContact] ResetLatch called on {gameObject.name}");
    }
}