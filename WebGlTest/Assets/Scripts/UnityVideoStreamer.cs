using System;
using System.Net;
using System.Net.Sockets;
using System.Threading;
using System.Text;
using UnityEngine;

/// <summary>
/// Streams frames from a Unity Camera as MJPEG over HTTP on the given port.
/// Python (OpenCV cv2.VideoCapture) can then read:
///   http://<WINDOWS_IP>:55000/
///
/// Attach this script to the Camera GameObject you want to stream
/// (e.g. the same camera used for TOP / SIDE views).
/// Does NOT modify OrbitCamera.cs — this is fully independent.
/// </summary>
public class UnityVideoStreamer : MonoBehaviour
{
    [Header("Stream Settings")]
    public int port = 55000;
    public int captureWidth = 640;
    public int captureHeight = 480;
    [Range(1, 30)] public int targetFps = 15;
    [Range(1, 100)] public int jpegQuality = 75;

    private Camera cam;
    private RenderTexture renderTexture;
    private Texture2D texture2D;
    private HttpListener listener;
    private Thread listenerThread;
    private byte[] latestJpeg;
    private readonly object jpegLock = new object();
    private bool running = false;

    void Start()
    {
        cam = GetComponent<Camera>();
        if (cam == null)
        {
            Debug.LogError("[UnityVideoStreamer] No Camera component found on this GameObject.");
            enabled = false;
            return;
        }

        renderTexture = new RenderTexture(captureWidth, captureHeight, 24);
        texture2D = new Texture2D(captureWidth, captureHeight, TextureFormat.RGB24, false);

        StartHttpServer();
        InvokeRepeating(nameof(CaptureFrame), 0f, 1f / targetFps);
    }

    void CaptureFrame()
    {
        RenderTexture prevActive = RenderTexture.active;
        RenderTexture prevTarget = cam.targetTexture;

        cam.targetTexture = renderTexture;
        cam.Render();

        RenderTexture.active = renderTexture;
        texture2D.ReadPixels(new Rect(0, 0, captureWidth, captureHeight), 0, 0);
        texture2D.Apply();

        cam.targetTexture = prevTarget;
        RenderTexture.active = prevActive;

        byte[] jpg = texture2D.EncodeToJPG(jpegQuality);
        lock (jpegLock)
        {
            latestJpeg = jpg;
        }
    }

    void StartHttpServer()
    {
        try
        {
            listener = new HttpListener();
            listener.Prefixes.Add($"http://*:{port}/");
            listener.Start();
            running = true;

            listenerThread = new Thread(HandleRequests);
            listenerThread.IsBackground = true;
            listenerThread.Start();

            Debug.Log($"[UnityVideoStreamer] MJPEG stream started on port {port}");
        }
        catch (Exception e)
        {
            Debug.LogError($"[UnityVideoStreamer] Failed to start HTTP listener: {e.Message}. " +
                            "Try running Unity as Administrator, or check that the port isn't already in use.");
        }
    }

    void HandleRequests()
    {
        while (running && listener.IsListening)
        {
            try
            {
                HttpListenerContext context = listener.GetContext();
                ThreadPool.QueueUserWorkItem(_ => ServeMjpeg(context));
            }
            catch (Exception)
            {
                // Listener stopped or errored; exit loop quietly.
                break;
            }
        }
    }

    void ServeMjpeg(HttpListenerContext context)
    {
        HttpListenerResponse response = context.Response;
        string boundary = "unityframe";
        response.ContentType = $"multipart/x-mixed-replace; boundary={boundary}";
        response.SendChunked = true;
        response.StatusCode = 200;

        try
        {
            while (running)
            {
                byte[] jpg;
                lock (jpegLock)
                {
                    jpg = latestJpeg;
                }

                if (jpg == null)
                {
                    Thread.Sleep(30);
                    continue;
                }

                string header = $"--{boundary}\r\nContent-Type: image/jpeg\r\nContent-Length: {jpg.Length}\r\n\r\n";
                byte[] headerBytes = Encoding.ASCII.GetBytes(header);
                byte[] footerBytes = Encoding.ASCII.GetBytes("\r\n");

                response.OutputStream.Write(headerBytes, 0, headerBytes.Length);
                response.OutputStream.Write(jpg, 0, jpg.Length);
                response.OutputStream.Write(footerBytes, 0, footerBytes.Length);
                response.OutputStream.Flush();

                Thread.Sleep(1000 / targetFps);
            }
        }
        catch (Exception)
        {
            // Client disconnected — normal when Python closes the stream.
        }
        finally
        {
            try { response.OutputStream.Close(); } catch { }
        }
    }

    void OnDestroy()
    {
        running = false;
        try { listener?.Stop(); listener?.Close(); } catch { }
        try { listenerThread?.Abort(); } catch { }
        if (renderTexture != null) renderTexture.Release();
    }

    void OnApplicationQuit()
    {
        OnDestroy();
    }
}
