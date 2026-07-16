(function () {
    'use strict';

    const browserGlobal = globalThis;
    const documentLike = browserGlobal.document;
    const actionSelect = documentLike?.getElementById("action-id");
    const connectionStatus = documentLike?.getElementById("connection-status");
    let streamDeckSocket;
    let actionContext = "";
    function isJsonObject(value) {
        return typeof value === "object" && value !== null;
    }
    function parseJsonObject(value) {
        try {
            const parsed = JSON.parse(value);
            return isJsonObject(parsed) ? parsed : {};
        }
        catch {
            return {};
        }
    }
    function setStatus(message) {
        if (connectionStatus) {
            connectionStatus.textContent = message;
        }
    }
    function actionIdFromSettings(value) {
        if (!isJsonObject(value)) {
            return "";
        }
        const settings = "settings" in value ? value.settings : value;
        if (!isJsonObject(settings) || typeof settings.actionId !== "string") {
            return "";
        }
        return settings.actionId;
    }
    function renderActionId(actionId) {
        if (!actionSelect || !documentLike) {
            return;
        }
        const emptyOption = documentLike.createElement("option");
        emptyOption.value = "";
        emptyOption.textContent = "No action selected";
        const options = [emptyOption];
        const normalizedActionId = actionId.trim();
        if (normalizedActionId) {
            const actionOption = documentLike.createElement("option");
            actionOption.value = normalizedActionId;
            actionOption.textContent = normalizedActionId;
            options.push(actionOption);
        }
        actionSelect.replaceChildren(...options);
        actionSelect.value = normalizedActionId;
    }
    function saveActionId() {
        if (!actionSelect) {
            return;
        }
        if (!streamDeckSocket || !actionContext) {
            setStatus("Not connected to Stream Deck");
            return;
        }
        const actionId = actionSelect.value;
        streamDeckSocket.send(JSON.stringify({
            event: "setSettings",
            context: actionContext,
            payload: { actionId },
        }));
        setStatus("Settings saved");
    }
    function handleStreamDeckMessage(message) {
        if (typeof message.data !== "string") {
            return;
        }
        const parsedMessage = parseJsonObject(message.data);
        if (parsedMessage.event !== "didReceiveSettings") {
            return;
        }
        renderActionId(actionIdFromSettings(parsedMessage.payload));
        setStatus("Connected to Stream Deck");
    }
    function connectElgatoStreamDeckSocket(port, uuid, registerEvent, _info, actionInfo) {
        const parsedActionInfo = parseJsonObject(actionInfo);
        actionContext =
            typeof parsedActionInfo.context === "string" ? parsedActionInfo.context : uuid;
        renderActionId(actionIdFromSettings(parsedActionInfo.settings));
        const Socket = browserGlobal.WebSocket;
        if (!Socket) {
            setStatus("Stream Deck websocket is unavailable");
            return;
        }
        const socket = new Socket(`ws://127.0.0.1:${port}`);
        streamDeckSocket = socket;
        socket.onopen = () => {
            socket.send(JSON.stringify({ event: registerEvent, uuid }));
            setStatus("Connected to Stream Deck");
        };
        socket.onmessage = handleStreamDeckMessage;
        socket.onerror = () => setStatus("Stream Deck connection error");
        socket.onclose = () => {
            if (streamDeckSocket === socket) {
                streamDeckSocket = undefined;
            }
            setStatus("Disconnected from Stream Deck");
        };
    }
    if (actionSelect) {
        actionSelect.addEventListener("change", saveActionId);
    }
    browserGlobal.connectElgatoStreamDeckSocket = connectElgatoStreamDeckSocket;

})();
//# sourceMappingURL=property-inspector.js.map
