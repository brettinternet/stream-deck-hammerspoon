(function () {
    'use strict';

    function isJsonObject$1(value) {
        return typeof value === "object" && value !== null && !Array.isArray(value);
    }
    function parseInitialActionInfo(actionInfo) {
        try {
            const parsed = JSON.parse(actionInfo);
            if (!isJsonObject$1(parsed) || !isJsonObject$1(parsed.payload)) {
                return "";
            }
            const settings = parsed.payload.settings;
            if (!isJsonObject$1(settings) || typeof settings.actionId !== "string") {
                return "";
            }
            return settings.actionId.trim().length > 0 ? settings.actionId : "";
        }
        catch {
            return "";
        }
    }

    const browserGlobal = globalThis;
    const documentLike = browserGlobal.document;
    const actionSelect = documentLike?.getElementById("action-id");
    const connectionStatus = documentLike?.getElementById("connection-status");
    const settingsPanel = documentLike?.getElementById("action-settings");
    const settingsStatus = documentLike?.getElementById("settings-status");
    let streamDeckSocket;
    let actionContext = "";
    let savedActionId = "";
    let savedSettings = {};
    let bridgeStatus = "connecting";
    let bridgeActions = [];
    function isJsonObject(value) {
        return typeof value === "object" && value !== null && !Array.isArray(value);
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
    function settingsFromValue(value) {
        if (!isJsonObject(value)) {
            return {};
        }
        const settings = "settings" in value ? value.settings : value;
        return isJsonObject(settings) ? { ...settings } : {};
    }
    function setStatus(message) {
        if (connectionStatus) {
            connectionStatus.textContent = message;
        }
    }
    function setSettingsStatus(message) {
        if (settingsStatus) {
            settingsStatus.textContent = message;
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
        const settings = settingsFromValue(value);
        return typeof settings.actionId === "string" ? settings.actionId : "";
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
            renderSettings();
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
        renderSettings();
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
    function sendSettings(settings) {
        if (!streamDeckSocket || !actionContext) {
            return;
        }
        streamDeckSocket.send(JSON.stringify({
            event: "setSettings",
            context: actionContext,
            payload: settings,
        }));
        sendRequestState();
    }
    function hasSetting(settings, key) {
        return Object.prototype.hasOwnProperty.call(settings, key);
    }
    function isFiniteNumber(value) {
        return typeof value === "number" && Number.isFinite(value);
    }
    function parseSettingsField(value) {
        if (!isJsonObject(value) || typeof value.key !== "string" || value.key.length === 0) {
            return undefined;
        }
        const base = {
            key: value.key,
            ...(typeof value.label === "string" ? { label: value.label } : {}),
            ...(typeof value.required === "boolean" ? { required: value.required } : {}),
        };
        if (value.type === "text") {
            if (("default" in value && typeof value.default !== "string") ||
                ("minLength" in value && (!Number.isInteger(value.minLength) || value.minLength < 0)) ||
                ("maxLength" in value && (!Number.isInteger(value.maxLength) || value.maxLength < 0))) {
                return undefined;
            }
            return {
                ...base,
                type: "text",
                ...(typeof value.default === "string" ? { default: value.default } : {}),
                ...(typeof value.minLength === "number" ? { minLength: value.minLength } : {}),
                ...(typeof value.maxLength === "number" ? { maxLength: value.maxLength } : {}),
            };
        }
        if (value.type === "number") {
            if (("default" in value && !isFiniteNumber(value.default)) ||
                ("min" in value && !isFiniteNumber(value.min)) ||
                ("max" in value && !isFiniteNumber(value.max)) ||
                ("step" in value && (!isFiniteNumber(value.step) || value.step <= 0))) {
                return undefined;
            }
            return {
                ...base,
                type: "number",
                ...(isFiniteNumber(value.default) ? { default: value.default } : {}),
                ...(isFiniteNumber(value.min) ? { min: value.min } : {}),
                ...(isFiniteNumber(value.max) ? { max: value.max } : {}),
                ...(isFiniteNumber(value.step) ? { step: value.step } : {}),
            };
        }
        if (value.type === "boolean") {
            if ("default" in value && typeof value.default !== "boolean") {
                return undefined;
            }
            return {
                ...base,
                type: "boolean",
                ...(typeof value.default === "boolean" ? { default: value.default } : {}),
            };
        }
        if (value.type === "select" && Array.isArray(value.options)) {
            const options = [];
            for (const option of value.options) {
                if (!isJsonObject(option) || typeof option.value !== "string" || typeof option.label !== "string") {
                    return undefined;
                }
                options.push({ value: option.value, label: option.label });
            }
            if (options.length === 0 ||
                ("default" in value && typeof value.default !== "string") ||
                (typeof value.default === "string" && !options.some((option) => option.value === value.default))) {
                return undefined;
            }
            return {
                ...base,
                type: "select",
                options,
                ...(typeof value.default === "string" ? { default: value.default } : {}),
            };
        }
        return undefined;
    }
    function fieldsForAction(action) {
        if (action.settingsSchemaVersion === undefined && action.settingsSchema === undefined) {
            return { fields: [] };
        }
        if (action.settingsSchemaVersion !== 1) {
            return { fields: [], unsupported: "This settings schema version is not editable." };
        }
        if (!Array.isArray(action.settingsSchema)) {
            return { fields: [], unsupported: "This action has an invalid settings schema." };
        }
        const fields = [];
        const keys = new Set();
        for (let index = 0; index < action.settingsSchema.length; index += 1) {
            const field = parseSettingsField(action.settingsSchema[index]);
            if (!field) {
                return { fields: [], unsupported: `Unsupported settings field at position ${index + 1}.` };
            }
            if (keys.has(field.key)) {
                return { fields: [], unsupported: `Duplicate settings field "${field.key}" cannot be edited.` };
            }
            keys.add(field.key);
            fields.push(field);
        }
        return { fields };
    }
    function numberIsValid(field, value) {
        if (!isFiniteNumber(value)) {
            return false;
        }
        if (field.min !== undefined && value < field.min) {
            return false;
        }
        if (field.max !== undefined && value > field.max) {
            return false;
        }
        if (field.step !== undefined) {
            const base = field.min ?? 0;
            const steps = (value - base) / field.step;
            if (Math.abs(steps - Math.round(steps)) > 1e-9) {
                return false;
            }
        }
        return true;
    }
    function stringLength(value) {
        let length = 0;
        for (const _character of value) {
            length += 1;
        }
        return length;
    }
    function fieldValueIsValid(field, value) {
        if (field.type === "text") {
            return (typeof value === "string" &&
                (field.minLength === undefined || stringLength(value) >= field.minLength) &&
                (field.maxLength === undefined || stringLength(value) <= field.maxLength));
        }
        if (field.type === "number") {
            return numberIsValid(field, value);
        }
        if (field.type === "boolean") {
            return typeof value === "boolean";
        }
        return typeof value === "string" && field.options.some((option) => option.value === value);
    }
    function defaultFieldValue(field) {
        if (field.default !== undefined) {
            return field.default;
        }
        if (field.type === "number") {
            return field.min ?? "";
        }
        if (field.type === "select") {
            return field.options[0]?.value ?? "";
        }
        return field.type === "boolean" ? false : "";
    }
    function validateSettings(fields, candidate) {
        const normalized = { ...candidate };
        const errors = [];
        for (const field of fields) {
            if (!hasSetting(candidate, field.key)) {
                if (field.default !== undefined) {
                    normalized[field.key] = field.default;
                }
                else if (field.required) {
                    errors.push(`${field.label ?? field.key} is required.`);
                }
                continue;
            }
            const value = candidate[field.key];
            if (!fieldValueIsValid(field, value)) {
                errors.push(`${field.label ?? field.key} has an invalid value.`);
            }
            else {
                normalized[field.key] = value;
            }
        }
        return errors.length > 0 ? { errors } : { settings: normalized, errors: [] };
    }
    function renderSettings() {
        if (!settingsPanel || !documentLike) {
            return;
        }
        settingsPanel.replaceChildren();
        if (!savedActionId) {
            setSettingsStatus("Select an action to edit its settings.");
            return;
        }
        if (bridgeStatus !== "connected") {
            setSettingsStatus("Settings are unavailable while disconnected.");
            return;
        }
        const action = bridgeActions.find((candidate) => candidate.actionId === savedActionId);
        if (!action) {
            setSettingsStatus(`Action unavailable: ${savedActionId}`);
            return;
        }
        if (action.settingsSchemaVersion === undefined && action.settingsSchema !== undefined) {
            setSettingsStatus("Legacy settings schemas are opaque and cannot be edited.");
            return;
        }
        const schema = fieldsForAction(action);
        if (schema.unsupported) {
            const message = documentLike.createElement("p");
            message.textContent = schema.unsupported;
            message.disabled = true;
            settingsPanel.appendChild(message);
            setSettingsStatus(schema.unsupported);
            return;
        }
        if (schema.fields.length === 0) {
            setSettingsStatus("No additional settings.");
            return;
        }
        const errors = [];
        for (const field of schema.fields) {
            const wrapper = documentLike.createElement("label");
            wrapper.textContent = field.label ?? field.key;
            const control = documentLike.createElement(field.type === "select" ? "select" : "input");
            control.type =
                field.type === "select" ? "select-one" : field.type === "boolean" ? "checkbox" : field.type;
            const currentValue = hasSetting(savedSettings, field.key) ? savedSettings[field.key] : defaultFieldValue(field);
            const displayValue = fieldValueIsValid(field, currentValue) ? currentValue : defaultFieldValue(field);
            if (hasSetting(savedSettings, field.key) && !fieldValueIsValid(field, currentValue)) {
                errors.push(`${field.label ?? field.key} has an invalid saved value.`);
            }
            if (field.type === "boolean") {
                control.checked = displayValue === true;
                control.value = control.checked ? "true" : "false";
            }
            else {
                control.value = String(displayValue);
            }
            if (field.type === "text") {
                if (field.minLength !== undefined)
                    control.minLength = field.minLength;
                if (field.maxLength !== undefined)
                    control.maxLength = field.maxLength;
            }
            else if (field.type === "number") {
                if (field.min !== undefined)
                    control.min = String(field.min);
                if (field.max !== undefined)
                    control.max = String(field.max);
                if (field.step !== undefined)
                    control.step = String(field.step);
            }
            else if (field.type === "select") {
                control.replaceChildren(...field.options.map((option) => createOption(option.value, option.label)));
                control.value = String(displayValue);
            }
            control.addEventListener("change", () => saveSettings(schema.fields));
            wrapper.appendChild(control);
            settingsPanel.appendChild(wrapper);
        }
        setSettingsStatus(errors.length > 0 ? errors.join(" ") : "Settings are ready.");
    }
    function saveSettings(fields) {
        if (!streamDeckSocket || !actionContext || bridgeStatus !== "connected") {
            return;
        }
        const candidate = { ...savedSettings };
        if (!actionSelect) {
            return;
        }
        candidate.actionId = actionSelect.value;
        if (settingsPanel) {
            const controls = settingsPanel.children ?? [];
            fields.forEach((field, index) => {
                const wrapper = controls[index];
                const control = wrapper?.children?.[0];
                if (!control)
                    return;
                if (field.type === "boolean") {
                    candidate[field.key] = control.checked === true;
                }
                else if (field.type === "number") {
                    if (control.value.trim() === "") {
                        delete candidate[field.key];
                    }
                    else {
                        candidate[field.key] = Number(control.value);
                    }
                }
                else {
                    candidate[field.key] = control.value;
                }
            });
        }
        const result = validateSettings(fields, candidate);
        if (!result.settings) {
            setSettingsStatus(result.errors.join(" "));
            return;
        }
        savedSettings = result.settings;
        savedActionId = actionSelect.value;
        sendSettings(savedSettings);
        setSettingsStatus("Settings saved.");
    }
    function saveActionId() {
        if (!actionSelect || !streamDeckSocket || !actionContext || bridgeStatus !== "connected") {
            return;
        }
        const selectedActionId = actionSelect.value;
        const action = bridgeActions.find((candidate) => candidate.actionId === selectedActionId);
        const fields = action ? fieldsForAction(action).fields : [];
        const candidate = { ...savedSettings, actionId: selectedActionId };
        const result = action && !fieldsForAction(action).unsupported ? validateSettings(fields, candidate) : { settings: candidate, errors: [] };
        if (!result.settings) {
            actionSelect.value = savedActionId;
            setSettingsStatus(result.errors.join(" "));
            renderSettings();
            return;
        }
        savedActionId = selectedActionId;
        savedSettings = result.settings;
        renderSettings();
        sendSettings(savedSettings);
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
                ("settingsSchema" in item && !Array.isArray(item.settingsSchema)) ||
                ("settingsSchemaVersion" in item &&
                    (typeof item.settingsSchemaVersion !== "number" ||
                        !Number.isInteger(item.settingsSchemaVersion) ||
                        item.settingsSchemaVersion < 1 ||
                        item.settingsSchemaVersion > 16))) {
                return undefined;
            }
            if (item.settingsSchemaVersion !== undefined && item.settingsSchemaVersion !== 1) {
                continue;
            }
            if (actionIds.has(item.actionId)) {
                return undefined;
            }
            actionIds.add(item.actionId);
            actions.push({
                actionId: item.actionId,
                name: item.name,
                ...(Array.isArray(item.settingsSchema) ? { settingsSchema: item.settingsSchema } : {}),
                ...(typeof item.settingsSchemaVersion === "number"
                    ? { settingsSchemaVersion: item.settingsSchemaVersion }
                    : {}),
            });
        }
        return { status, actions };
    }
    function handleStreamDeckMessage(message) {
        if (typeof message.data !== "string") {
            return;
        }
        const parsedMessage = parseJsonObject(message.data);
        if (parsedMessage.event === "didReceiveSettings") {
            savedSettings = settingsFromValue(parsedMessage.payload);
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
        savedSettings = settingsFromValue(parsedActionInfo.payload);
        savedActionId = parseInitialActionInfo(actionInfo) || actionIdFromSettings(parsedActionInfo.payload);
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
