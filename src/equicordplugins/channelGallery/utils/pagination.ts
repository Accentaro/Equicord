import { Constants, RestAPI } from "@webpack/common";

const FETCH_TIMEOUT_MS = 10_000;

export async function fetchMessagesChunk(args: {
    channelId: string;
    before: string | null;
    limit: number;
    signal?: AbortSignal;
}): Promise<any[]> {
    const timeout = setTimeout(() => {
        if (args.signal && !args.signal.aborted) {
            // Can't abort RestAPI.get directly, but we can check signal in catch
        }
    }, FETCH_TIMEOUT_MS);

    // Check if already aborted
    if (args.signal?.aborted) {
        clearTimeout(timeout);
        const err = new Error("AbortError");
        err.name = "AbortError";
        throw err;
    }

    try {
        const res = await RestAPI.get({
            url: Constants.Endpoints.MESSAGES(args.channelId),
            query: {
                limit: args.limit,
                ...(args.before ? { before: args.before } : {})
            },
            retries: 1
        });

        clearTimeout(timeout);
        
        // Check if aborted after request
        if (args.signal?.aborted) {
            const err = new Error("AbortError");
            err.name = "AbortError";
            throw err;
        }

        // RestAPI.get returns the response body directly or an object with body property
        const body = res?.body ?? res;
        if (!Array.isArray(body)) {
            console.warn("RestAPI.get returned non-array body:", body);
            return [];
        }
        return body;
    } catch (e: unknown) {
        clearTimeout(timeout);
        // Check for abort first
        if (args.signal?.aborted) {
            const err = new Error("AbortError");
            err.name = "AbortError";
            throw err;
        }
        if (e instanceof Error && (e.name === "AbortError" || e.message === "AbortError")) {
            const err = new Error("AbortError");
            err.name = "AbortError";
            throw err;
        }
        console.error("fetchMessagesChunk error:", e);
        throw new Error("fetch_failed");
    }
}

