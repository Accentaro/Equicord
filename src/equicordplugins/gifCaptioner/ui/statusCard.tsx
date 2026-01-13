import { React, createRoot } from "@webpack/common";

type StatusType = "loading" | "success" | "error";

interface StatusState {
    type: StatusType;
    title: string;
    message?: string;
}

let root: ReturnType<typeof createRoot> | null = null;
let container: HTMLDivElement | null = null;
let setState: ((state: StatusState | null) => void) | null = null;
let closeTimer: ReturnType<typeof setTimeout> | null = null;
let failTimer: ReturnType<typeof setTimeout> | null = null;

function ensureRoot() {
    if (root && container) return;
    container = document.createElement("div");
    container.className = "gc-status-host";
    document.body.appendChild(container);
    root = createRoot(container);
    root.render(<StatusHost />);
}

function clearTimer() {
    if (!closeTimer) return;
    clearTimeout(closeTimer);
    closeTimer = null;
}

function clearFailTimer() {
    if (!failTimer) return;
    clearTimeout(failTimer);
    failTimer = null;
}

function scheduleClose(ms: number) {
    clearTimer();
    closeTimer = setTimeout(() => {
        setState?.(null);
        clearTimer();
    }, ms);
}

function StatusHost() {
    const [state, setLocalState] = React.useState<StatusState | null>(null);
    React.useEffect(() => {
        setState = setLocalState;
        return () => {
            setState = null;
        };
    }, []);

    if (!state) return null;

    return (
        <div className="gc-status-root">
            <div className={`gc-status-card gc-status-${state.type}`}>
                <div className="gc-status-icon">
                    {state.type === "loading" && (
                        <svg viewBox="0 0 24 24" className="gc-status-icon-svg">
                            <path d="M12 2a10 10 0 1 0 10 10h-2a8 8 0 1 1-8-8V2z" />
                        </svg>
                    )}
                    {state.type === "success" && (
                        <svg viewBox="0 0 24 24" className="gc-status-icon-svg">
                            <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm-1.2 13.2-3.3-3.3 1.4-1.4 1.9 1.9 4.6-4.6 1.4 1.4z" />
                        </svg>
                    )}
                    {state.type === "error" && (
                        <svg viewBox="0 0 24 24" className="gc-status-icon-svg">
                            <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm4.2 13.8-1.4 1.4-2.8-2.8-2.8 2.8-1.4-1.4 2.8-2.8-2.8-2.8 1.4-1.4 2.8 2.8 2.8-2.8 1.4 1.4-2.8 2.8z" />
                        </svg>
                    )}
                </div>
                <div className="gc-status-content">
                    <div className="gc-status-title">{state.title}</div>
                    {state.message ? <div className="gc-status-message">{state.message}</div> : null}
                </div>
            </div>
        </div>
    );
}

function showStatus(state: StatusState, autoCloseMs?: number) {
    ensureRoot();
    setState?.(state);
    if (autoCloseMs) scheduleClose(autoCloseMs);
    else clearTimer();
}

function scheduleFailure(ms: number) {
    clearFailTimer();
    failTimer = setTimeout(() => {
        showStatus({ type: "error", title: "GIF Failed" }, 4000);
        clearFailTimer();
    }, ms);
}

export function showCreating() {
    showStatus({ type: "loading", title: "Creating GIF" });
    scheduleFailure(10000);
}

export function showUploading() {
    showStatus({ type: "loading", title: "Uploading GIF" });
    scheduleFailure(10000);
}

export function showSent() {
    clearFailTimer();
    showStatus({ type: "success", title: "GIF Sent" }, 2500);
}

export function showError(message: string) {
    clearFailTimer();
    showStatus({ type: "error", title: "GIF Failed", message }, 4000);
}

export function clearStatus() {
    clearTimer();
    clearFailTimer();
    setState?.(null);
}
