import type { PluginNative } from "@utils/types";

const CORS_PROXIES = [
    "https://corsproxy.io/?url=",
];

const DISCORD_MEDIA_SUFFIXES = [
    "discordapp.com",
    "discordapp.net",
];

function withProxy(base: string, url: string) {
    return base + encodeURIComponent(url);
}

function normalizeBuffer(data: Uint8Array): ArrayBuffer {
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    return copy.buffer;
}

function normalizeUrl(url: string) {
    if (url.startsWith("//")) return `https:${url}`;
    return url;
}

function isDiscordMediaHost(host: string) {
    return DISCORD_MEDIA_SUFFIXES.some(suffix => host.endsWith(suffix));
}

async function tryFetch(url: string) {
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const buffer = await res.arrayBuffer();
        if (!buffer.byteLength) return null;
        return {
            buffer,
            contentType: res.headers.get("content-type") ?? ""
        };
    } catch {
        return null;
    }
}

function getNative(): PluginNative<typeof import("../native")> | null {
    if (IS_WEB || !VencordNative?.pluginHelpers) return null;
    const helpers = VencordNative.pluginHelpers;
    const direct = helpers.GifCaptioner as PluginNative<typeof import("../native")> | undefined;
    if (direct?.fetchMedia) return direct;

    return Object.values(helpers)
        .find(m => typeof (m as any)?.gifCaptionerUniqueIdThingyIdkMan === "function") as
        PluginNative<typeof import("../native")> | null;
}

async function fetchSingle(url: string) {
    const normalizedUrl = normalizeUrl(url);
    const native = getNative();
    if (native?.fetchMedia) {
        try {
            const res = await native.fetchMedia(normalizedUrl);
            if (res?.data && res.data.length) {
                return {
                    buffer: normalizeBuffer(res.data),
                    contentType: res.contentType ?? ""
                };
            }
        } catch {}
    }

    let host = "";
    try {
        host = new URL(normalizedUrl).host;
    } catch {}

    const shouldProxyFirst = host && !isDiscordMediaHost(host);

    const tryDirect = async () => {
        try {
            const direct = await tryFetch(normalizedUrl);
            if (direct) return direct;
        } catch {}
        return null;
    };

    const tryProxies = async () => {
        for (const proxy of CORS_PROXIES) {
            try {
                const proxied = await tryFetch(withProxy(proxy, normalizedUrl));
                if (proxied) return proxied;
            } catch {}
        }
        return null;
    };

    if (shouldProxyFirst) {
        const proxied = await tryProxies();
        if (proxied) return proxied;
    }

    const direct = await tryDirect();
    if (direct) return direct;

    return await tryProxies();
}

export async function fetchMedia(
    url: string | string[],
    validate?: (result: { buffer: ArrayBuffer; contentType: string }) => boolean
): Promise<{ buffer: ArrayBuffer; contentType: string } | null> {
    const urls = Array.isArray(url) ? url : [url];
    for (const entry of urls) {
        if (!entry) continue;
        const res = await fetchSingle(entry);
        if (!res) continue;
        if (validate && !validate(res)) continue;
        return res;
    }
    return null;
}
