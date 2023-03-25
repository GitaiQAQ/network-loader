import { request, Agent } from 'https';
import {
    Buffer
} from 'buffer';

import { getLogger } from "./logger";

const fetchLogger = getLogger("[fetch]");

const agent = new Agent({ keepAlive: true, timeout: 5e3 });

/**
 * https://github.com/nodejs/node/blob/main/lib/internal/modules/esm/fetch_module.js#L92
 * Redirection status code as per section 6.4 of RFC 7231:
 * https://datatracker.ietf.org/doc/html/rfc7231#section-6.4
 * and RFC 7238:
 * https://datatracker.ietf.org/doc/html/rfc7238
 * @param {number} statusCode
 * @returns {boolean}
 */
function isRedirect(statusCode: number) {
    switch (statusCode) {
        case 300: // Multiple Choices
        case 301: // Moved Permanently
        case 302: // Found
        case 303: // See Other
        case 307: // Temporary Redirect
        case 308: // Permanent Redirect
            return true;
        default:
            return false;
    }
}

class ERR_NETWORK_IMPORT_DISALLOWED extends Error {
    code = 'ERR_NETWORK_IMPORT_DISALLOWED';
    
    constructor(url: URL, extra?: Record<string, any>) {
        super(url.toString());
        extra && Object.assign(this, extra)
    }
}

interface FetchStatue {
    redirected?: boolean;
}

type RequestInit = any;
type Response = any;

export const fetch = (url: URL, init?: RequestInit & FetchStatue): Promise<Response> => {

    return new Promise((resolve, reject) => {
        const req = request(url, {
            method: init?.method || 'get',
            agent,
            headers: {
                'accept-type': 'application/javascript'
            }
        }, res => {
            if (!res || !res.statusCode) {
                return reject(new ERR_NETWORK_IMPORT_DISALLOWED(url));
            }

            const { statusCode, headers } = res;

            if ((isRedirect(statusCode) && headers.location) && (!init?.redirect || init?.redirect === 'follow')) {
                return resolve(fetch(new URL(headers.location, url), { ...init, redirected: true }));
            }

            if (statusCode < 200 || statusCode >= 300) {
                return reject(new ERR_NETWORK_IMPORT_DISALLOWED(url, { statusCode }));
            }

            const { headers: { 'content-type': contentType } } = res;
            if (!contentType) {
                return reject(new ERR_NETWORK_IMPORT_DISALLOWED(url));
            }
            // text/plain https://unpkg.com/fetch-blob@3.2.0/streams.cjs
            if (!['application/javascript', 'text/javascript', 'text/plain'].some(mimeType => contentType.includes(mimeType))) {
                return reject(new ERR_NETWORK_IMPORT_DISALLOWED(url, { contentType }));
            }


            resolve({
                url: res.url || url.href,
                headers: new Map(Object.entries(headers) as never) as never,
                ok: res.statusCode === 200,
                redirected: !!(init?.redirect),
                status: res.statusCode,
                statusText: res.statusMessage || "",
                type: 'default',
                // @ts-ignore
                arrayBuffer: async () => Buffer.concat(await res.toArray()),
                text: async () => {
                    res.setEncoding('utf-8');
                    // @ts-ignore
                    return Array.from(await res.toArray()).join('');
                },
                json: async () => {
                    res.setEncoding('utf-8');
                    // @ts-ignore
                    return JSON.parse(Array.from(await res.toArray()).join(''));
                },
            } as any)
        });
        req.on('error', function (e: Error) {
            reject(e);
        });
        req.on('timeout', (e: Error) => { req.destroy(e); reject(e); });
        req.on('uncaughtException', (e: Error) => { req.destroy(e); reject(e); });
        req.end();
    })
}
