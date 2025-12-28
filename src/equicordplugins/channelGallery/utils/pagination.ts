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
        throw new Error("AbortError");
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
            throw new Error("AbortError");
        }

        const body = res?.body;
        return Array.isArray(body) ? body : [];
    } catch (e: unknown) {
        clearTimeout(timeout);
        if (e instanceof Error && (e.name === "AbortError" || e.message === "AbortError")) throw e;
        if (args.signal?.aborted) throw new Error("AbortError");
        throw new Error("fetch_failed");
    }
}

