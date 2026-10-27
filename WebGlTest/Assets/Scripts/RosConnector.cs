using UnityEngine;
using System;
using System.Collections;
using System.Collections.Concurrent;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.IO;
using UnityEngine.Networking;

#if !UNITY_WEBGL || UNITY_EDITOR
using System.Net.WebSockets;
#endif

#if UNITY_WEBGL && !UNITY_EDITOR
using System.Runtime.InteropServices;
#endif

public class RosConnector : MonoBehaviour
{
    public static RosConnector Instance { get; private set; }

    [Header("ROS Connection Settings")]
    public string rosIP = "192.168.100.161";
    public string rosPort = "9090";

    [Header("Debug")]
    public int maxRawLogs = 5;

    [Header("High-Frequency Topics")]
    public string[] latestOnlyTopics = new string[] { "/joint_states" };

    [Header("Reconnect")]
    public float reconnectInterval = 5f;
    [Header("Backend (database settings)")]
    public string backendUrl = "http://127.0.0.1:8080";   // your Spring address
    public string robotSettingsPath = "/api/settings/robot";
    [Header("Backend Auth (use a low-privilege VISITOR account)")]
    public string loginPath = "/api/auth/login";
    public string backendUser = "unity-client";
    public string backendPassword = "";

    [Serializable] private class LoginRequest { public string username; public string password; }

    // Covers the common field names; the one your backend uses will be filled in
    [Serializable] private class LoginResponse { public string token; public string accessToken; public string jwt; }

    private string _authToken;
    [Serializable]
    private class RobotSettingsValues
    {
        public string robotHost;
        public int tcpPort;
        public string mode;
        public string simulationRosHost;
        public int simulationRosPort;
        public string realRosHost;
        public int realRosPort;
    }

    [Serializable]
    private class RobotSettingsResponse
    {
        public string category;
        public RobotSettingsValues values;
    }
#if !UNITY_WEBGL || UNITY_EDITOR
    private ClientWebSocket _socket = new ClientWebSocket();
    private CancellationTokenSource _cts = new CancellationTokenSource();
#endif

#if UNITY_WEBGL && !UNITY_EDITOR
    [DllImport("__Internal")]
    private static extern void RosWebSocket_Connect(string url, string objectName);

    [DllImport("__Internal")]
    private static extern void RosWebSocket_Send(string message);

    [DllImport("__Internal")]
    private static extern void RosWebSocket_Close();

    private bool _webglConnected = false;
#endif

    private Dictionary<string, Action<string>> _subscribers =
        new Dictionary<string, Action<string>>();

    private HashSet<string> _advertisedTopics =
        new HashSet<string>();

    private List<string> _pendingMessages =
        new List<string>();

    private ConcurrentQueue<Action> _mainThreadQueue =
        new ConcurrentQueue<Action>();

    private ConcurrentDictionary<string, string> _latestPerTopic =
        new ConcurrentDictionary<string, string>();

    private HashSet<string> _latestOnlySet;

    private Dictionary<string, string> _subscriberTypes =
        new Dictionary<string, string>();

    private bool _reconnecting = false;
    private bool _hasConnectedBefore = false;
    private int _rawLogCount = 0;

    public bool IsConnected
    {
        get
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            return _webglConnected;
#else
            return _socket != null &&
                   _socket.State == WebSocketState.Open;
#endif
        }
    }

    void Awake()
    {
        if (Instance == null)
        {
            Instance = this;
        }
        else
        {
            Destroy(gameObject);
            return;
        }

        DontDestroyOnLoad(gameObject);

        _latestOnlySet = new HashSet<string>(latestOnlyTopics);
    }

    async void Start()
    {
        bool fromDb = await FetchRosAddressFromDatabase();

        if (!fromDb)
        {
            float timeout = 3f;
            float waited = 0f;

            while (!AppConfig.IsLoaded && waited < timeout)
            {
                await Task.Yield();
                waited += Time.unscaledDeltaTime;
            }

            if (AppConfig.IsLoaded)
            {
                rosIP = AppConfig.RosIp;
                rosPort = AppConfig.RosPort;

                Debug.Log($"[RosConnector] AppConfig fallback: {rosIP}:{rosPort}");
            }
            else
            {
                Debug.LogWarning($"[RosConnector] Using Inspector values: {rosIP}:{rosPort}");
            }
        }

        await ConnectToRos();

        StartCoroutine(ReconnectLoop());
    }
    private async Task<bool> FetchRosAddressFromDatabase()
    {
        string url = backendUrl.TrimEnd('/') + robotSettingsPath;

        // up to 2 attempts: the second one runs after a fresh login if the token was rejected
        for (int attempt = 0; attempt < 2; attempt++)
        {
            if (string.IsNullOrEmpty(_authToken))
            {
                if (!await LoginToBackend())
                    return false;
            }

            try
            {
                using (var req = UnityWebRequest.Get(url))
                {
                    req.timeout = 5;
                    req.SetRequestHeader("Authorization", "Bearer " + _authToken);

                    var op = req.SendWebRequest();
                    while (!op.isDone)
                        await Task.Yield();

                    if (req.responseCode == 401)
                    {
                        _authToken = null;   // expired or changed: log in again
                        continue;
                    }

                    if (req.result != UnityWebRequest.Result.Success)
                    {
                        Debug.LogWarning($"[RosConnector] Settings fetch failed: {req.responseCode} {req.error} | {req.downloadHandler?.text}");
                        return false;
                    }

                    var parsed = JsonUtility.FromJson<RobotSettingsResponse>(req.downloadHandler.text);

                    var settings = parsed.values;
                    string mode = (settings.mode ?? "simulation").Trim().ToLowerInvariant();

                    string selectedHost = mode == "real"
                        ? settings.realRosHost
                        : settings.simulationRosHost;

                    int selectedPort = mode == "real"
                        ? settings.realRosPort
                        : settings.simulationRosPort;

                    if (string.IsNullOrWhiteSpace(selectedHost) || selectedPort <= 0)
                    {
                        selectedHost = settings.robotHost;
                        selectedPort = settings.tcpPort;
                    }

                    if (string.IsNullOrWhiteSpace(selectedHost) || selectedPort <= 0)
                    {
                        Debug.LogWarning($"[RosConnector] No valid ROS address for mode '{mode}'.");
                        return false;
                    }

                    rosIP = selectedHost;
                    rosPort = selectedPort.ToString();

                    Debug.Log($"[RosConnector] ROS config ({mode}): {rosIP}:{rosPort}");

                    return true;
                }
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[RosConnector] Settings fetch error: {e.Message}");
                return false;
            }
        }

        return false;
    }
    private async Task<bool> LoginToBackend()
    {
        string url = backendUrl.TrimEnd('/') + loginPath;
        string body = JsonUtility.ToJson(new LoginRequest
        {
            username = backendUser,
            password = backendPassword
        });

        try
        {
            using (var req = new UnityWebRequest(url, "POST"))
            {
                req.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(body));
                req.downloadHandler = new DownloadHandlerBuffer();
                req.SetRequestHeader("Content-Type", "application/json");
                req.timeout = 5;

                var op = req.SendWebRequest();
                while (!op.isDone)
                    await Task.Yield();

                if (req.result != UnityWebRequest.Result.Success)
                {
                    Debug.LogWarning($"[RosConnector] Login failed: {req.responseCode} {req.error} | {req.downloadHandler.text}");
                    return false;
                }

                var parsed = JsonUtility.FromJson<LoginResponse>(req.downloadHandler.text);
                _authToken = !string.IsNullOrEmpty(parsed?.token) ? parsed.token
                           : !string.IsNullOrEmpty(parsed?.accessToken) ? parsed.accessToken
                           : parsed?.jwt;

                if (string.IsNullOrEmpty(_authToken))
                {
                    Debug.LogWarning($"[RosConnector] Login OK but no token field found: {req.downloadHandler.text}");
                    return false;
                }

                Debug.Log("[RosConnector] Backend login successful.");
                return true;
            }
        }
        catch (Exception e)
        {
            Debug.LogWarning($"[RosConnector] Login error: {e.Message}");
            return false;
        }
    }
    void Update()
    {
        while (_mainThreadQueue.TryDequeue(out var action))
        {
            action?.Invoke();
        }

        if (_latestPerTopic.Count > 0)
        {
            foreach (var topic in _latestOnlySet)
            {
                if (_latestPerTopic.TryRemove(topic, out string json))
                {
                    ProcessIncomingMessage(json);
                }
            }
        }
    }

    public async Task ConnectToRos()
    {
        string scheme = "ws";
#if UNITY_WEBGL && !UNITY_EDITOR
        if (Application.absoluteURL.StartsWith("https"))
            scheme = "wss";
#endif
        string url = $"{scheme}://{rosIP}:{rosPort}";

        Debug.Log(
            $"[RosConnector] Versuche Verbindung zu {url} ..."
        );

#if UNITY_WEBGL && !UNITY_EDITOR

        try
        {
            _webglConnected = false;

            RosWebSocket_Connect(
                url,
                gameObject.name
            );

            Debug.Log(
                "[RosConnector] WebGL WebSocket gestartet."
            );
        }
        catch (Exception e)
        {
            Debug.LogError(
                $"[RosConnector] WebGL Verbindungsfehler: {e}"
            );
        }

#else

        try
        {
            if (_socket.State == WebSocketState.Aborted ||
                _socket.State == WebSocketState.Closed)
            {
                _socket.Dispose();
                _socket = new ClientWebSocket();

                _cts.Cancel();
                _cts.Dispose();
                _cts = new CancellationTokenSource();
            }

            await _socket.ConnectAsync(
                new Uri(url),
                _cts.Token
            );

            Debug.Log(
                "<color=green>[RosConnector] Verbunden mit ROS!</color>"
            );

            _ = ReceiveLoop();

            foreach (var msg in _pendingMessages)
            {
                await SendWebSocketMessageRaw(msg);
            }

            _pendingMessages.Clear();
        }
        catch (Exception e)
        {
            Debug.LogError(
                $"[RosConnector] Verbindungsfehler: {e.Message}"
            );
        }

#endif
    }

#if UNITY_WEBGL && !UNITY_EDITOR

    public void OnWebSocketOpen()
    {
        _webglConnected = true;

        Debug.Log(
            "<color=green>[RosConnector] WEBGL: Verbunden mit ROS!</color>"
        );

        foreach (var msg in _pendingMessages)
        {
            RosWebSocket_Send(msg);
        }

        _pendingMessages.Clear();
                if (_hasConnectedBefore)
        {
            foreach (var kvp in _subscriberTypes)
            {
                RosWebSocket_Send(
                    "{\"op\":\"subscribe\",\"topic\":\"" + kvp.Key +
                    "\",\"type\":\"" + kvp.Value + "\"}"
                );
            }
        }

        _hasConnectedBefore = true;
    }

    public void OnWebSocketMessage(string json)
    {
        if (string.IsNullOrEmpty(json))
            return;

        if (_rawLogCount < maxRawLogs)
        {
            _rawLogCount++;

            string debugJson =
                json.Length > 300
                ? json.Substring(0, 300) + "..."
                : json;

            Debug.Log(
                $"[RosConnector RAW] Laenge: {json.Length} | Inhalt: {debugJson}"
            );
        }

        string topic = ExtractTopicFromJson(json);

        if (topic != null &&
            _latestOnlySet.Contains(topic))
        {
            _latestPerTopic[topic] = json;
        }
        else
        {
            _mainThreadQueue.Enqueue(
                () => ProcessIncomingMessage(json)
            );
        }
    }

    public void OnWebSocketError(string message)
    {
        Debug.LogError(
            $"[RosConnector] WEBGL WebSocket error: {message}"
        );
    }

    public void OnWebSocketClose()
    {
        _webglConnected = false;

        Debug.LogWarning(
            "[RosConnector] WEBGL WebSocket geschlossen."
        );
    }

#endif

    public async void Advertise(
        string topic,
        string type)
    {
        if (_advertisedTopics.Contains(topic))
            return;

        string advMsg =
            "{\"op\":\"advertise\",\"topic\":\"" +
            topic +
            "\",\"type\":\"" +
            type +
            "\"}";

        await SendWebSocketMessage(advMsg);

        _advertisedTopics.Add(topic);

        Debug.Log(
            $"[RosConnector] Advertised: {topic} ({type})"
        );
    }

    public async void Publish(
        string topic,
        string type,
        string jsonMessage)
    {
        string rosPacket =
            "{\"op\":\"publish\",\"topic\":\"" +
            topic +
            "\",\"type\":\"" +
            type +
            "\",\"msg\":" +
            jsonMessage +
            "}";

        await SendWebSocketMessage(rosPacket);
    }

    public void PublishRaw(
        string topic,
        string type,
        string jsonMessage)
    {
        Publish(topic, type, jsonMessage);
    }

    public async void Subscribe(
        string topic,
        string type,
        Action<string> callback)
    {
        Debug.Log(
            $"[RosConnector] Registriere Subscriber für: {topic} ({type})"
        );

        if (!_subscribers.ContainsKey(topic))
            _subscribers.Add(topic, callback);
        else
            _subscribers[topic] += callback;

        _subscriberTypes[topic] = type;

        string subMsg =
            "{\"op\":\"subscribe\",\"topic\":\"" +
            topic +
            "\",\"type\":\"" +
            type +
            "\"}";

        await SendWebSocketMessage(subMsg);
    }

#if !UNITY_WEBGL || UNITY_EDITOR

    private async Task ReceiveLoop()
    {
        var buffer = new byte[81920];

        while (IsConnected && !_cts.IsCancellationRequested)
        {
            try
            {
                WebSocketReceiveResult result;

                using (var ms = new MemoryStream())
                {
                    do
                    {
                        result = await _socket.ReceiveAsync(
                            new ArraySegment<byte>(buffer),
                            _cts.Token
                        );

                        if (result.MessageType ==
                            WebSocketMessageType.Close)
                        {
                            await _socket.CloseAsync(
                                WebSocketCloseStatus.NormalClosure,
                                string.Empty,
                                CancellationToken.None
                            );

                            return;
                        }

                        ms.Write(
                            buffer,
                            0,
                            result.Count
                        );

                    }
                    while (!result.EndOfMessage);

                    if (result.MessageType ==
                        WebSocketMessageType.Text)
                    {
                        string json =
                            Encoding.UTF8.GetString(
                                ms.ToArray()
                            );

                        if (_rawLogCount < maxRawLogs)
                        {
                            _rawLogCount++;

                            string debugJson =
                                json.Length > 300
                                ? json.Substring(0, 300) + "..."
                                : json;

                            Debug.Log(
                                $"[RosConnector RAW] Laenge: {json.Length} | Inhalt: {debugJson}"
                            );
                        }

                        string topic =
                            ExtractTopicFromJson(json);

                        if (topic != null &&
                            _latestOnlySet.Contains(topic))
                        {
                            _latestPerTopic[topic] = json;
                        }
                        else
                        {
                            _mainThreadQueue.Enqueue(
                                () => ProcessIncomingMessage(json)
                            );
                        }
                    }
                }
            }
            catch (Exception e)
            {
                Debug.LogWarning(
                    $"[RosConnector] ReceiveLoop beendet: {e.Message}"
                );

                break;
            }
        }
    }

#endif

    private void ProcessIncomingMessage(string json)
    {
        string parsedTopic =
            ExtractTopicFromJson(json);

        foreach (var kvp in _subscribers)
        {
            bool match = false;

            if (parsedTopic != null)
                match = parsedTopic == kvp.Key;
            else
                match = json.Contains(kvp.Key);

            if (match)
            {
                try
                {
                    kvp.Value?.Invoke(json);
                }
                catch (Exception e)
                {
                    Debug.LogError(
                        $"[RosConnector] Callback Error for {kvp.Key}: {e.Message}"
                    );
                }
            }
        }
    }

    private string ExtractTopicFromJson(string json)
    {
        int idx = json.IndexOf("\"topic\"");

        if (idx < 0)
            return null;

        int colonIdx =
            json.IndexOf(':', idx + 7);

        if (colonIdx < 0)
            return null;

        int quoteStart =
            json.IndexOf('"', colonIdx + 1);

        if (quoteStart < 0)
            return null;

        int quoteEnd =
            json.IndexOf('"', quoteStart + 1);

        if (quoteEnd < 0)
            return null;

        string topic =
            json.Substring(
                quoteStart + 1,
                quoteEnd - quoteStart - 1
            );

        return topic.Replace("\\/", "/");
    }

    private IEnumerator ReconnectLoop()
    {
        while (true)
        {
            yield return new WaitForSeconds(
                reconnectInterval
            );

            if (!IsConnected && !_reconnecting)
            {
                _reconnecting = true;
                var fetch = FetchRosAddressFromDatabase();
                while (!fetch.IsCompleted)
                    yield return null;
                Debug.Log(
                    "[RosConnector] Verbindung verloren. Versuche Reconnect..."
                );

                var task = ConnectToRos();

                while (!task.IsCompleted)
                    yield return null;

                if (IsConnected)
                {
                    Debug.Log(
                        "<color=green>[RosConnector] Reconnect erfolgreich!</color>"
                    );

                    foreach (var kvp in _subscriberTypes)
                    {
                        string subMsg =
                            "{\"op\":\"subscribe\",\"topic\":\"" +
                            kvp.Key +
                            "\",\"type\":\"" +
                            kvp.Value +
                            "\"}";

                        awaitSendFromCoroutine(subMsg);
                    }
                }
                else
                {
                    Debug.LogWarning(
                        "[RosConnector] Reconnect fehlgeschlagen."
                    );
                }

                _reconnecting = false;
            }
        }
    }

    private async void awaitSendFromCoroutine(
        string message)
    {
        await SendWebSocketMessageRaw(message);
    }

    private async Task SendWebSocketMessage(
        string message)
    {
        if (IsConnected)
        {
            await SendWebSocketMessageRaw(message);
        }
        else
        {
            Debug.Log(
                "[RosConnector] Noch nicht verbunden. Nachricht gepuffert."
            );

            _pendingMessages.Add(message);
        }
    }

    private Task SendWebSocketMessageRaw(
        string message)
    {
#if UNITY_WEBGL && !UNITY_EDITOR

        try
        {
            RosWebSocket_Send(message);
        }
        catch (Exception e)
        {
            Debug.LogError(
                $"[RosConnector] WebGL Send Fehler: {e.Message}"
            );
        }

        return Task.CompletedTask;

#else

        var bytes =
            Encoding.UTF8.GetBytes(message);

        return _socket.SendAsync(
            new ArraySegment<byte>(bytes),
            WebSocketMessageType.Text,
            true,
            _cts.Token
        );

#endif
    }

    private void OnDestroy()
    {
#if UNITY_WEBGL && !UNITY_EDITOR

        try
        {
            RosWebSocket_Close();
        }
        catch { }

        _webglConnected = false;

#else

        _cts.Cancel();
        _socket?.Dispose();

#endif
    }
}
