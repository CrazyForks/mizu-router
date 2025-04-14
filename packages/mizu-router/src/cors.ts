import type { Context } from './index'

export interface CorsOptions {
    origin?: string | string[] | boolean
    methods?: string[]
    allowedHeaders?: string[]
    exposedHeaders?: string[]
    credentials?: boolean
    maxAge?: number
    preflightContinue?: boolean
    optionsSuccessStatus?: number
}

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

function isOriginAllowed(origin: string, allowed: string | string[] | boolean): boolean {
    if (allowed === true) return true
    if (allowed === false) return false
    if (allowed === '*') return true
    if (Array.isArray(allowed)) return allowed.includes(origin)
    return origin === allowed
}

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