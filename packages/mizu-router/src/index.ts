/**
 * Request context containing environment, store, and request information
 * @template Env - Type for environment bindings (e.g., KV, D1, R2)
 * @template Store - Type for global state store
 */
export type Context<Env = any, Store = any> = {
    /** Original request object */
    req: Request
    /** URL parameters extracted from route patterns */
    params: Record<string, string>
    /** Query parameters from URL */
    query: Record<string, string>
    /** Environment bindings */
    env: Env
    /** Global state store */
    store: Store
}

/**
 * Handler function type for route handlers and middleware
 * @template Env - Type for environment bindings
 * @template Store - Type for global state store
 */
type Handler<Env, Store> = (
    ctx: Context<Env, Store>,
    next: () => Promise<Response | void>
) => Promise<Response | void>

/**
 * Internal type representing a route with its handler and middleware stack
 * @internal
 */
type Route<Env, Store> = {
    handler: Handler<Env, Store>
    middlewares: Handler<Env, Store>[]
}

/**
 * Internal type representing a node in the routing trie
 * @internal
 */
type Node<Env, Store> = {
    /** Static route segments */
    children: Map<string, Node<Env, Store>>
    /** Dynamic parameter node (e.g., :id) */
    param?: Node<Env, Store>
    /** Name of the parameter if this is a param node */
    paramName?: string
    /** Wildcard node (*) */
    wildcard?: Node<Env, Store>
    /** Route handler if this node is a route endpoint */
    route?: Route<Env, Store>
}

/**
 * Mizu Router - A fast, minimal and feature-rich router for Cloudflare Workers
 * 
 * @example
 * Basic usage:
 * ```typescript
 * const router = new Router<Env, Store>();
 * 
 * router.get("/", async (ctx) => {
 *     return new Response("Hello World!");
 * });
 * 
 * // Handle request
 * export default {
 *     fetch(request: Request, env: Env, ctx: ExecutionContext) {
 *         return router.handle(request, env);
 *     }
 * };
 * ```
 * 
 * @example
 * With middleware and parameters:
 * ```typescript
 * // Add middleware
 * router.use(async (ctx, next) => {
 *     console.log("Request:", ctx.req.url);
 *     return next();
 * });
 * 
 * // Route with parameters
 * router.get("/users/:id", async (ctx) => {
 *     const userId = ctx.params.id;
 *     return new Response(`User: ${userId}`);
 * });
 * ```
 * 
 * @template Env - Type for environment bindings
 * @template Store - Type for global state store
 */
export class Router<Env = {}, Store = {}> {
    private trees = new Map<string, Node<Env, Store>>()
    private middlewares: Handler<Env, Store>[] = []

    /**
     * Adds a global middleware to the router
     * @param middleware - Middleware function to add
     */
    use(middleware: Handler<Env, Store>) {
        this.middlewares.push(middleware)
    }

    /**
     * Mounts a subrouter at the specified prefix
     * @param prefix - URL prefix to mount the subrouter at
     * @param router - Subrouter to mount
     * 
     * @example
     * ```typescript
     * const userRouter = new Router<Env, Store>();
     * userRouter.get("/:id", async (ctx) => {
     *     return new Response(`User: ${ctx.params.id}`);
     * });
     * 
     * // Mount at /users
     * mainRouter.route("/users", userRouter);
     * ```
     */
    route(prefix: string, router: Router<Env, Store>) {
        this.register("*",
            prefix.endsWith("/") ? `${prefix}*` : `${prefix}/*`,
            async (ctx, _) => {
                const url = new URL(ctx.req.url)
                const path = url.pathname.startsWith(prefix)
                    ? url.pathname.slice(prefix.length) || "/"
                    : "/"
                const newUrl = new URL(ctx.req.url)
                newUrl.pathname = path
                return router.handle(new Request(newUrl.toString(), ctx.req), ctx.env, ctx.store)
            },
            []
        )
    }

    /**
     * Internal method to register routes
     * @internal
     */
    private register(method: string, path: string, handler: Handler<Env, Store>, middlewares: Handler<Env, Store>[] = []) {
        const segments = path.replace(/^\//, "").split("/").filter(Boolean)

        if (!this.trees.has(method)) {
            this.trees.set(method, { children: new Map() })
        }

        let node = this.trees.get(method)!

        for (const segment of segments) {
            // handle wildcard
            if (segment === "*") {
                node.wildcard = node.wildcard || { children: new Map() }
                node = node.wildcard
                break
            }

            // handle param
            if (segment.startsWith(":")) {
                const paramName = segment.slice(1)
                if (!node.param) {
                    node.param = { children: new Map(), paramName }
                }
                node = node.param
            } else {
                // handle static
                if (!node.children.has(segment)) {
                    node.children.set(segment, { children: new Map() })
                }
                node = node.children.get(segment)!
            }
        }

        node.route = {
            handler,
            middlewares: [...this.middlewares, ...middlewares]
        }
    }

    /**
     * Registers a GET route
     * @param path - URL pattern to match
     * @param handler - Route handler function
     * @param middlewares - Optional route-specific middleware
     */
    get = this.register.bind(this, "GET")

    /**
     * Registers a POST route
     * @param path - URL pattern to match
     * @param handler - Route handler function
     * @param middlewares - Optional route-specific middleware
     */
    post = this.register.bind(this, "POST")

    /**
     * Registers a PUT route
     * @param path - URL pattern to match
     * @param handler - Route handler function
     * @param middlewares - Optional route-specific middleware
     */
    put = this.register.bind(this, "PUT")

    /**
     * Registers a PATCH route
     * @param path - URL pattern to match
     * @param handler - Route handler function
     * @param middlewares - Optional route-specific middleware
     */
    patch = this.register.bind(this, "PATCH")

    /**
     * Registers a DELETE route
     * @param path - URL pattern to match
     * @param handler - Route handler function
     * @param middlewares - Optional route-specific middleware
     */
    delete = this.register.bind(this, "DELETE")

    /**
     * Registers a HEAD route
     * @param path - URL pattern to match
     * @param handler - Route handler function
     * @param middlewares - Optional route-specific middleware
     */
    head = this.register.bind(this, "HEAD")

    /**
     * Registers an OPTIONS route
     * @param path - URL pattern to match
     * @param handler - Route handler function
     * @param middlewares - Optional route-specific middleware
     */
    options = this.register.bind(this, "OPTIONS")

    /**
     * Handles an incoming request
     * @param req - Request object
     * @param env - Environment bindings
     * @param store - Optional global state store
     * @returns Promise resolving to a Response
     */
    async handle(req: Request, env: Env, store?: Store): Promise<Response> {
        const url = new URL(req.url)
        const method = req.method
        const segments = url.pathname.replace(/^\//, "").split("/").filter(Boolean)
        const query = Object.fromEntries(url.searchParams)

        const ctx: Context<Env, Store> = {
            req,
            env,
            store: store as Store,
            params: {},
            query
        }

        const matchRoute = (node?: Node<Env, Store>) => {
            if (!node) return

            let current = node
            const params: Record<string, string> = {}

            for (let i = 0; i < segments.length; i++) {
                const segment = segments[i]

                if (current.children.has(segment)) {
                    current = current.children.get(segment)!
                } else if (current.param) {
                    // handle param
                    params[current.param.paramName!] = segment
                    current = current.param
                } else if (current.wildcard) {
                    // handle wildcard
                    params["*"] = segments.slice(i).join("/")
                    current = current.wildcard
                    break
                } else {
                    return
                }
            }

            if (current?.route) {
                ctx.params = params
                return current.route
            }
        }

        const route = matchRoute(this.trees.get(method)) || matchRoute(this.trees.get("*"))
        if (!route) return new Response("Not Found", { status: 404 })

        let index = -1
        // dispatch middleware(s)
        const dispatch = async (i: number): Promise<Response | void> => {
            if (i <= index) throw new Error("next() called multiple times")
            index = i

            const middleware = route.middlewares[i]
            if (!middleware) return route.handler(ctx, () => Promise.resolve())

            try {
                return await middleware(ctx, () => dispatch(i + 1))
            } catch (err) {
                console.error("[ERROR]: Middleware error", err)
                return new Response("Internal Server Error", { status: 500 })
            }
        }

        return (await dispatch(0)) || new Response("OK")
    }
}