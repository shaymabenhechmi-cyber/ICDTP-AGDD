mergeInto(LibraryManager.library, {
    RosWebSocket_Connect: function(urlPtr, objectNamePtr) {
        var url = UTF8ToString(urlPtr);
        var objectName = UTF8ToString(objectNamePtr);

        try {
            if (window.agddRosSocket) {
                try {
                    window.agddRosSocket.close();
                } catch(e) {}
            }

            console.log("[RosWebSocket] Connecting to " + url);

            var socket = new WebSocket(url);
            window.agddRosSocket = socket;

            socket.onopen = function() {
                console.log("[RosWebSocket] Connected to " + url);
                SendMessage(objectName, "OnWebSocketOpen", "");
            };

            socket.onmessage = function(event) {
                if (typeof event.data === "string") {
                    SendMessage(objectName, "OnWebSocketMessage", event.data);
                }
            };

            socket.onerror = function(error) {
                console.error("[RosWebSocket] WebSocket error", error);
                SendMessage(objectName, "OnWebSocketError", "WebSocket error");
            };

            socket.onclose = function(event) {
                console.warn(
                    "[RosWebSocket] Closed. code=" +
                    event.code +
                    " reason=" +
                    event.reason
                );
                SendMessage(objectName, "OnWebSocketClose", "");
            };
        }
        catch(e) {
            console.error("[RosWebSocket] Connection exception:", e);
            SendMessage(objectName, "OnWebSocketError", String(e));
        }
    },

    RosWebSocket_Send: function(messagePtr) {
        var message = UTF8ToString(messagePtr);

        if (window.agddRosSocket &&
            window.agddRosSocket.readyState === WebSocket.OPEN) {
            window.agddRosSocket.send(message);
        } else {
            console.warn("[RosWebSocket] Send failed: socket not open");
        }
    },

    RosWebSocket_Close: function() {
        if (window.agddRosSocket) {
            try {
                window.agddRosSocket.close();
            } catch(e) {}

            window.agddRosSocket = null;
        }
    }
});
