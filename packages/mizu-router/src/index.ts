// Router.ts
export type Context<Env = any, Store = any> = {
    req: Request
    params: Record<string, string>
    query: Record<string, string>
    env: Env
    store: Store
}

type Handler<Env, Store> = (
    ctx: Context<Env, Store>,
    next: () => Promise<Response | void>
) => Promise<Response | void>

type Route<Env, Store> = {
    handler: Handler<Env, Store>
    middlewares: Handler<Env, Store>[]
}

type Node<Env, Store> = {
    children: Map<string, Node<Env, Store>>
    param?: Node<Env, Store>
    paramName?: string
    wildcard?: Node<Env, Store>
    route?: Route<Env, Store>
}

export class Router<Env = {}, Store = {}> {
    private trees = new Map<string, Node<Env, Store>>()
    private middlewares: Handler<Env, Store>[] = []

    use(middleware: Handler<Env, Store>) {
        this.middlewares.push(middleware)
    }

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

    get = this.register.bind(this, "GET")
    post = this.register.bind(this, "POST")
    put = this.register.bind(this, "PUT")
    patch = this.register.bind(this, "PATCH")
    delete = this.register.bind(this, "DELETE")
    head = this.register.bind(this, "HEAD")
    options = this.register.bind(this, "OPTIONS")

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