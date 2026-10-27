using System;
using System.Net;
using System.Net.Sockets;
using System.Threading;
using System.Text;
using System.Collections.Generic;
using UnityEngine;

public class MJPEGServer : MonoBehaviour
{
    [Header("Camera & Stream Settings")]
    public Camera streamCamera;
    public int port = 55000;
    public int width = 1280;
    public int height = 720;
    [Range(1, 100)] public int quality = 75;
    [Header("Streaming Rate")]
    [Tooltip("MJPEG target FPS — doesn't need to match render framerate")]
    public int targetFps = 15;
    private float _captureInterval;
    private float _timeSinceLastCapture;
    private TcpListener server;
    private readonly Dictionary<NetworkStream, Queue<byte[]>> clientQueues = new Dictionary<NetworkStream, Queue<byte[]>>();
    private readonly object clientLock = new object();
    private RenderTexture rt;
    private Texture2D tex;
    private bool running = false;

    void Start()
    {
        if (streamCamera == null)
        {
            streamCamera = GetComponent<Camera>();
            if (streamCamera == null)
            {
                Debug.LogError("[MJPEG] Critical Error: No Camera assigned to the MJPEGServer script!");
                return;
            }
        }

        rt = new RenderTexture(width, height, 24);
        tex = new Texture2D(width, height, TextureFormat.RGB24, false);
        //streamCamera.targetTexture = rt;

        running = true;

        try
        {
            server = new TcpListener(IPAddress.Any, port);
            server.Start();

            Thread t = new Thread(AcceptLoop) { IsBackground = true };
            t.Start();

            Debug.Log($"[MJPEG] Server successfully started! Stream at http://localhost:{port}/");
        }
        catch (Exception e)
        {
            Debug.LogError($"[MJPEG] Failed to start server: {e.Message}");
        }
        _captureInterval = 1f / Mathf.Max(1, targetFps);
    }

    void AcceptLoop()
    {
        while (running)
        {
            try
            {
                TcpClient client = server.AcceptTcpClient();
                Thread ct = new Thread(() => HandleClient(client)) { IsBackground = true };
                ct.Start();
            }
            catch { }
        }
    }

    void HandleClient(TcpClient client)
    {
        NetworkStream stream = null;
        try
        {
            stream = client.GetStream();

            // Drain the incoming HTTP request headers
            byte[] buf = new byte[4096];
            int read = stream.Read(buf, 0, buf.Length);

            string header =
                "HTTP/1.1 200 OK\r\n" +
                "Content-Type: multipart/x-mixed-replace; boundary=--frame\r\n" +
                "Cache-Control: no-cache\r\n" +
                "Connection: keep-alive\r\n" +
                "\r\n";

            byte[] headerBytes = Encoding.ASCII.GetBytes(header);
            stream.Write(headerBytes, 0, headerBytes.Length);
            stream.Flush();

            var queue = new Queue<byte[]>();
            lock (clientLock) clientQueues[stream] = queue;

            // Each client gets its own dedicated writer thread —
            // a slow/stalled client can only block itself, never the main thread.
            ClientWriterLoop(stream, queue);
        }
        catch (Exception e)
        {
            Debug.LogWarning($"[MJPEG] Client handshake error: {e.Message}");
            if (stream != null)
                lock (clientLock) clientQueues.Remove(stream);
        }
    }

    void LateUpdate()
    {
        if (!running || streamCamera == null) return;

        bool hasClients;
        lock (clientLock) hasClients = clientQueues.Count > 0;

        if (!hasClients)
        {
            // No one is watching — fully stop the camera from rendering.
            if (streamCamera.enabled)
            {
                streamCamera.enabled = false;
                streamCamera.targetTexture = null;
            }
            return;
        }
        else if (!streamCamera.enabled)
        {
            // A client just connected — resume rendering only now.
            streamCamera.targetTexture = rt;
            streamCamera.enabled = true;
        }

        _timeSinceLastCapture += Time.deltaTime;
        if (_timeSinceLastCapture < _captureInterval) return;
        _timeSinceLastCapture = 0f;

        RenderTexture.active = rt;
        tex.ReadPixels(new Rect(0, 0, width, height), 0, 0);
        tex.Apply();
        RenderTexture.active = null;

        byte[] jpeg = tex.EncodeToJPG(quality);

        lock (clientLock)
        {
            foreach (var kvp in clientQueues)
            {
                var queue = kvp.Value;
                lock (queue)
                {
                    queue.Enqueue(jpeg);
                    while (queue.Count > 2) queue.Dequeue();
                }
            }
        }
    }

    void ClientWriterLoop(NetworkStream stream, Queue<byte[]> queue)
    {
        stream.WriteTimeout = 500; // ms — don't hang forever on a dead/slow client

        while (running)
        {
            byte[] jpeg = null;
            lock (queue)
            {
                if (queue.Count > 0) jpeg = queue.Dequeue();
            }

            if (jpeg == null)
            {
                Thread.Sleep(5);
                continue;
            }

            try
            {
                string frameHeader = "--frame\r\nContent-Type: image/jpeg\r\n" +
                                     $"Content-Length: {jpeg.Length}\r\n\r\n";

                stream.Write(Encoding.ASCII.GetBytes(frameHeader));
                stream.Write(jpeg, 0, jpeg.Length);
                stream.Write(Encoding.ASCII.GetBytes("\r\n"));
                stream.Flush();
            }
            catch
            {
                break; // drop this client, don't affect others or the main thread
            }
        }

        lock (clientLock) clientQueues.Remove(stream);
        try { stream.Close(); } catch { }
    }

    void OnDestroy()
    {
        running = false;
        server?.Stop();

        if (rt != null)
        {
            rt.Release();
        }
    }
}