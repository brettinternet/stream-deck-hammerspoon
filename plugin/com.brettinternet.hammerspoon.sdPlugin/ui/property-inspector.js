(function () {
    'use strict';

    const browserGlobal = globalThis;
    const documentLike = browserGlobal.document;
    const actionSelect = documentLike?.getElementById("action-id");
    const connectionStatus = documentLike?.getElementById("connection-status");
    let streamDeckSocket;
    let actionContext = "";
    let savedActionId = "";
    let bridgeStatus = "connecting";
    let bridgeActions = [];
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
    function setBridgeStatus(status) {
        bridgeStatus = status;
        if (status === "connected") {
            setStatus("Connected");
        }
        else if (status === "connecting" || status === "authenticating") {
            setStatus("Connecting");
        }
        else {
            setStatus("Offline");
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
    function createOption(value, text, disabled = false) {
        if (!documentLike) {
            throw new Error("Property inspector document is unavailable");
        }
        const option = documentLike.createElement("option");
        option.value = value;
        option.textContent = text;
        option.disabled = disabled;
        return option;
    }
    function renderActionSelect() {
        if (!actionSelect || !documentLike) {
            return;
        }
        const unavailable = bridgeActions.length === 0 || bridgeStatus !== "connected";
        if (unavailable) {
            actionSelect.replaceChildren(createOption("", bridgeActions.length === 0 ? "No actions available" : "Offline"));
            actionSelect.value = "";
            actionSelect.disabled = true;
            return;
        }
        const options = [createOption("", "No action selected")];
        let savedActionAvailable = savedActionId.length === 0;
        for (const action of bridgeActions) {
            options.push(createOption(action.actionId, action.name));
            if (action.actionId === savedActionId) {
                savedActionAvailable = true;
            }
        }
        if (savedActionId && !savedActionAvailable) {
            options.push(createOption(savedActionId, `Unavailable: ${savedActionId}`, true));
        }
        actionSelect.replaceChildren(...options);
        actionSelect.value = savedActionId;
        actionSelect.disabled = false;
    }
    function sendRequestState() {
        if (!streamDeckSocket || !actionContext) {
            return;
        }
        streamDeckSocket.send(JSON.stringify({
            event: "sendToPlugin",
            context: actionContext,
            payload: { type: "requestState" },
        }));
    }
    function saveActionId() {
        if (!actionSelect) {
            return;
        }
        if (!streamDeckSocket || !actionContext || bridgeStatus !== "connected") {
            return;
        }
        savedActionId = actionSelect.value;
        streamDeckSocket.send(JSON.stringify({
            event: "setSettings",
            context: actionContext,
            payload: { actionId: savedActionId },
        }));
        sendRequestState();
    }
    function parseBridgeState(value) {
        if (!isJsonObject(value) || value.type !== "bridgeState") {
            return undefined;
        }
        const status = value.status;
        if (status !== "disconnected" &&
            status !== "connecting" &&
            status !== "authenticating" &&
            status !== "connected") {
            return undefined;
        }
        if (!Array.isArray(value.actions)) {
            return undefined;
        }
        const actionIds = new Set();
        const actions = [];
        for (const item of value.actions) {
            if (!isJsonObject(item) ||
                typeof item.actionId !== "string" ||
                item.actionId.trim().length === 0 ||
                typeof item.name !== "string" ||
                item.name.trim().length === 0 ||
                ("settingsSchema" in item && !Array.isArray(item.settingsSchema))) {
                return undefined;
            }
            if (actionIds.has(item.actionId)) {
                return undefined;
            }
            actionIds.add(item.actionId);
            actions.push({ actionId: item.actionId, name: item.name });
        }
        return { status, actions };
    }
    function handleStreamDeckMessage(message) {
        if (typeof message.data !== "string") {
            return;
        }
        const parsedMessage = parseJsonObject(message.data);
        if (parsedMessage.event === "didReceiveSettings") {
            savedActionId = actionIdFromSettings(parsedMessage.payload);
            renderActionSelect();
            return;
        }
        if (parsedMessage.event !== "sendToPropertyInspector") {
            return;
        }
        const bridgeState = parseBridgeState(parsedMessage.payload);
        if (!bridgeState) {
            return;
        }
        bridgeActions = bridgeState.actions;
        setBridgeStatus(bridgeState.status);
        renderActionSelect();
    }
    function connectElgatoStreamDeckSocket(port, uuid, registerEvent, _info, actionInfo) {
        const parsedActionInfo = parseJsonObject(actionInfo);
        actionContext =
            typeof parsedActionInfo.context === "string" ? parsedActionInfo.context : uuid;
        savedActionId = actionIdFromSettings(parsedActionInfo.settings);
        bridgeActions = [];
        setBridgeStatus("connecting");
        renderActionSelect();
        const Socket = browserGlobal.WebSocket;
        if (!Socket) {
            setBridgeStatus("disconnected");
            renderActionSelect();
            return;
        }
        const socket = new Socket(`ws://127.0.0.1:${port}`);
        streamDeckSocket = socket;
        socket.onopen = () => {
            setBridgeStatus("connecting");
            socket.send(JSON.stringify({ event: registerEvent, uuid }));
            sendRequestState();
        };
        socket.onmessage = handleStreamDeckMessage;
        socket.onerror = () => {
            if (streamDeckSocket === socket) {
                setBridgeStatus("disconnected");
                bridgeActions = [];
                renderActionSelect();
            }
        };
        socket.onclose = () => {
            if (streamDeckSocket === socket) {
                streamDeckSocket = undefined;
                setBridgeStatus("disconnected");
                bridgeActions = [];
                renderActionSelect();
            }
        };
    }
    if (actionSelect) {
        actionSelect.addEventListener("change", saveActionId);
    }
    browserGlobal.connectElgatoStreamDeckSocket = connectElgatoStreamDeckSocket;

})();
//# sourceMappingURL=property-inspector.js.map
