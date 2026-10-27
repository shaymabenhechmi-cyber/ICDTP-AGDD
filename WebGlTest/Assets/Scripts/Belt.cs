using System.Collections.Generic;
using System.Net;
using System.Net.Sockets;
using System.Text;
using UnityEngine;

public class ConveyorBelt : MonoBehaviour
{
    [Header("Visual (optional, texture scroll)")]
    public Renderer beltRenderer;
    public float textureScrollSpeed = 0.5f;

    [Header("Continuous Movement")]
    public float runSpeed = 0.05f;          // m/s while belt is running continuously
    public Vector3 moveDirection = Vector3.forward;

    [Header("Piece Detection")]
    public string pieceTag = "Piece";

    [Header("Encoder Broadcast")]
    public string pythonIp = "127.0.0.1";
    public int pythonPort = 9998;            // matches PYTHON_LISTEN_PORT in robot_controller.py
    public float encoderSendIntervalSec = 0.02f; // ~50Hz

    private UdpClient _encoderSocket;
    private float _encoderSendTimer = 0f;

    // Cumulative distance the belt has physically moved since scene start.
    // This is the "virtual encoder" reading � monotonically increasing,
    // never reset, so Python can diff two readings to get real distance
    // traveled between any two points in time, with zero drift.
    private float totalDistanceTraveled = 0f;

    private HashSet<Transform> piecesOnBelt = new HashSet<Transform>();

    private bool isRunning = false;
    private bool stopRequested = false;
    private float stopDistanceRemaining = 0f;
    private System.Action onStoppedCallback;

    public bool IsRunning => isRunning;
    public float TotalDistanceTraveled => totalDistanceTraveled;

    void Awake()
    {
        _encoderSocket = new UdpClient();
        _encoderSocket.Connect(pythonIp, pythonPort);
    }
    
    void OnDestroy()
    {
        _encoderSocket?.Close();
    }

    void Update()
    {
        if (beltRenderer != null)
        {
            float offset = Time.time * textureScrollSpeed;
            beltRenderer.material.mainTextureOffset = new Vector2(0, offset);
        }

        if (isRunning)
        {
            float step = runSpeed * Time.deltaTime;

            // Never overshoot a requested stop distance within a single frame.
            if (stopRequested && step > stopDistanceRemaining)
                step = stopDistanceRemaining;

            if (step > 0f)
            {
                Vector3 delta = moveDirection.normalized * step;
                piecesOnBelt.RemoveWhere(t => t == null); // drop destroyed pieces
                foreach (var piece in piecesOnBelt)
                    piece.position += delta;

                totalDistanceTraveled += step;
            }

            if (stopRequested)
            {
                stopDistanceRemaining -= step;
                if (stopDistanceRemaining <= 0.0001f)
                {
                    isRunning = false;
                    stopRequested = false;
                    stopDistanceRemaining = 0f;
                    Debug.Log("[CONVEYOR] Stop-after distance reached, belt halted.");
                    var cb = onStoppedCallback;
                    onStoppedCallback = null;
                    cb?.Invoke();
                }
            }
        }

        // Broadcast the encoder reading on its own cadence, independent of
        // running/stopped state, so Python always has a fresh position even
        // while the belt is halted (delta will just read as ~0 in that case).
        _encoderSendTimer += Time.deltaTime;
        if (_encoderSendTimer >= encoderSendIntervalSec)
        {
            _encoderSendTimer = 0f;
            SendEncoderReading();
        }
    }

    private void SendEncoderReading()
    {
        try
        {
            string msg = $"ENCODER:{totalDistanceTraveled.ToString("F5", System.Globalization.CultureInfo.InvariantCulture)}";
            byte[] data = Encoding.UTF8.GetBytes(msg);
            _encoderSocket.Send(data, data.Length);
        }
        catch (System.Exception e)
        {
            Debug.LogWarning($"[CONVEYOR] Failed to send encoder reading: {e.Message}");
        }
    }

    public void HandleTriggerEnter(Collider other)
    {
        if (other.CompareTag(pieceTag))
        {
            piecesOnBelt.Add(other.transform);
            Debug.Log($"[CONVEYOR] Piece entered belt zone: {other.name}. Total on belt: {piecesOnBelt.Count}");
        }
    }

    public void HandleTriggerExit(Collider other)
    {
        if (other.CompareTag(pieceTag))
        {
            piecesOnBelt.Remove(other.transform);
            Debug.Log($"[CONVEYOR] Piece left belt zone: {other.name}. Total on belt: {piecesOnBelt.Count}");
        }
    }

    public void Run()
    {
        stopRequested = false;
        stopDistanceRemaining = 0f;
        isRunning = true;
        Debug.Log("[CONVEYOR] Running continuously.");
    }

    public void Stop()
    {
        isRunning = false;
        stopRequested = false;
        stopDistanceRemaining = 0f;
    }

    public void RunThenStopAfter(float distanceMeters, System.Action onStopped)
    {
        stopDistanceRemaining = Mathf.Max(0f, distanceMeters);
        stopRequested = true;
        onStoppedCallback = onStopped;
        isRunning = true;
        Debug.Log($"[CONVEYOR] Will run {distanceMeters:F3} m then stop.");
    }
}