import type { Context } from './index'

/**
 * Configuration options for CORS middleware
 * @interface CorsOptions
 */
export interface CorsOptions {
    /** 
     * Configures the Access-Control-Allow-Origin CORS header
     * @default '*'
     * - Boolean true to allow any origin
     * - Boolean false to disable CORS
     * - String for a single origin
     * - Array of strings for multiple origins
     */
    origin?: string | string[] | boolean

    /** 
     * Configures the Access-Control-Allow-Methods CORS header
     * @default ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE']
     */
    methods?: string[]

    /** 
     * Configures the Access-Control-Allow-Headers CORS header
     * @default ['Content-Type']
     */
    allowedHeaders?: string[]

    /** 
     * Configures the Access-Control-Expose-Headers CORS header
     * @default []
     */
    exposedHeaders?: string[]

    /** 
     * Configures the Access-Control-Allow-Credentials CORS header
     * @default false
     */
    credentials?: boolean

    /** 
     * Configures the Access-Control-Max-Age CORS header
     * @default 86400 (24 hours)
     */
    maxAge?: number

    /** 
     * Whether to pass OPTIONS requests to the next handler
     * @default false
     */
    preflightContinue?: boolean

    /** 
     * Success status for OPTIONS requests
     * @default 204
     */
    optionsSuccessStatus?: number
}

/** @internal */
const defaultOptions: CorsOptions = {
    origin: '*',
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type'],
    exposedHeaders: [],
    credentials: false,
    maxAge: 86400, // 24 hours
    preflightContinue: false,
    optionsSuccessStatus: 204
}

/**
 * Checks if a given origin is allowed based on the CORS configuration
 * @internal
 * @param origin - The origin to check
 * @param allowed - The allowed origin configuration
 * @returns Whether the origin is allowed
 */
function isOriginAllowed(origin: string, allowed: string | string[] | boolean): boolean {
    if (allowed === true) return true
    if (allowed === false) return false
    if (allowed === '*') return true
    if (Array.isArray(allowed)) return allowed.includes(origin)
    return origin === allowed
}

/**
 * Creates a CORS middleware for the Mizu router
 * 
 * @example
 * Basic usage:
 * ```typescript
 * import { Router } from "mizu-router";
 * import { cors } from "mizu-router/cors";
 * 
 * const router = new Router();
 * router.use(cors()); // Uses default options
 * ```
 * 
 * @example
 * With custom options:
 * ```typescript
 * router.use(cors({
 *     origin: ['https://example.com', 'https://api.example.com'],
 *     methods: ['GET', 'POST'],
 *     allowedHeaders: ['Content-Type', 'Authorization'],
 *     credentials: true,
 *     maxAge: 3600 // 1 hour
 * }));
 * ```
 * 
 * @template Env - Type for environment bindings
 * @template Store - Type for global state store
 * @param {CorsOptions} [options] - CORS configuration options
 * @returns A middleware function that handles CORS
 */
export function cors<Env = any, Store = any>(options: CorsOptions = {}) {
    const opts = { ...defaultOptions, ...options }

    return async (ctx: Context<Env, Store>, next: () => Promise<Response | void>) => {
        const origin = ctx.req.headers.get('origin')
        const method = ctx.req.method.toUpperCase()

        // Handle preflight requests
        if (method === 'OPTIONS') {
            if (!origin) {
                return next()
            }

            // Check if origin is allowed
            if (!isOriginAllowed(origin, opts.origin!)) {
                return next()
            }

            const headers = new Headers()

            // Basic CORS headers
            headers.set('Access-Control-Allow-Origin', 
                typeof opts.origin === 'boolean' ? '*' : origin)

            if (opts.credentials) {
                headers.set('Access-Control-Allow-Credentials', 'true')
            }

            if (opts.maxAge) {
                headers.set('Access-Control-Max-Age', opts.maxAge.toString())
            }

            // Handle preflight headers
            const requestMethod = ctx.req.headers.get('access-control-request-method')
            const requestHeaders = ctx.req.headers.get('access-control-request-headers')

            if (requestMethod && opts.methods!.includes(requestMethod.toUpperCase())) {
                headers.set('Access-Control-Allow-Methods', opts.methods!.join(', '))
            }

            if (requestHeaders) {
                headers.set('Access-Control-Allow-Headers', 
                    opts.allowedHeaders!.join(', '))
            }

            if (opts.exposedHeaders?.length) {
                headers.set('Access-Control-Expose-Headers', 
                    opts.exposedHeaders.join(', '))
            }

            if (!opts.preflightContinue) {
                return new Response(null, {
                    status: opts.optionsSuccessStatus,
                    headers
                })
            }

            const response = await next()
            if (response) {
                // Copy over existing headers
                for (const [key, value] of headers.entries()) {
                    response.headers.set(key, value)
                }
                return response
            }
            
            return new Response(null, {
                status: opts.optionsSuccessStatus,
                headers
            })
        }

        // Handle actual requests
        const response = await next()
        if (!response || !origin) return response

        const headers = new Headers(response.headers)

        // Set CORS headers
        headers.set('Access-Control-Allow-Origin', 
            typeof opts.origin === 'boolean' ? '*' : origin)

        if (opts.credentials) {
            headers.set('Access-Control-Allow-Credentials', 'true')
        }

        if (opts.exposedHeaders?.length) {
            headers.set('Access-Control-Expose-Headers', 
                opts.exposedHeaders.join(', '))
        }

        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers
        })
    }
} 