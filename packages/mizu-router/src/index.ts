// Router.ts
export interface Context<Env = unknown, Store = unknown> {
    req: Request;
    params: Record<string, string>;
    query: Record<string, string>;
    env: Env;
    store: Store;
}

type Handler<Env, Store> = (
    ctx: Context<Env, Store>,
    next: () => Promise<Response | void>
) => Promise<Response | void>;

interface RouteNode<Env, Store> {
    handler: Handler<Env, Store>;
    middlewares: Handler<Env, Store>[];
}

interface TrieNode<Env, Store> {
    children: Map<string, TrieNode<Env, Store>>;
    paramChild?: TrieNode<Env, Store>;
    paramName?: string;
    wildcardChild?: TrieNode<Env, Store>;
    route?: RouteNode<Env, Store>;
}

export class Router<Env = {}, Store = {}> {
    private trees: Record<string, TrieNode<Env, Store>> = {};
    private globalMiddlewares: Handler<Env, Store>[] = [];

    use(middleware: Handler<Env, Store>): void {
        this.globalMiddlewares.push(middleware);
    }

    route(prefix: string, subrouter: Router<Env, Store>) {
        const handler = async (ctx: Context<Env, Store>, _next: () => Promise<Response | void>) => {
            const url = new URL(ctx.req.url);
            const subPath = url.pathname.startsWith(prefix)
                ? url.pathname.slice(prefix.length) || "/"
                : "/";
            const newUrl = new URL(ctx.req.url);
            newUrl.pathname = subPath;
            const newReq = new Request(newUrl.toString(), ctx.req);
            return subrouter.handle(newReq, ctx.env, ctx.store);
        };

        this.register("*", prefix.endsWith("/") ? `${prefix}*` : `${prefix}/*`, handler, []);
    }

    get(path: string, handler: Handler<Env, Store>, middlewares: Handler<Env, Store>[] = []) {
        this.register("GET", path, handler, middlewares);
    }

    post(path: string, handler: Handler<Env, Store>, middlewares: Handler<Env, Store>[] = []) {
        this.register("POST", path, handler, middlewares);
    }

    delete(path: string, handler: Handler<Env, Store>, middlewares: Handler<Env, Store>[] = []) {
        this.register("DELETE", path, handler, middlewares);
    }

    put(path: string, handler: Handler<Env, Store>, middlewares: Handler<Env, Store>[] = []) {
        this.register("PUT", path, handler, middlewares);
    }

    patch(path: string, handler: Handler<Env, Store>, middlewares: Handler<Env, Store>[] = []) {
        this.register("PATCH", path, handler, middlewares);
    }

    head(path: string, handler: Handler<Env, Store>, middlewares: Handler<Env, Store>[] = []) {
        this.register("HEAD", path, handler, middlewares);
    }

    options(path: string, handler: Handler<Env, Store>, middlewares: Handler<Env, Store>[] = []) {
        this.register("OPTIONS", path, handler, middlewares);
    }

    private register(
        method: string,
        path: string,
        handler: Handler<Env, Store>,
        middlewares: Handler<Env, Store>[]
    ) {
        const segments = this.splitPath(path);
        if (!this.trees[method]) this.trees[method] = this.createNode();
        let node = this.trees[method];

        for (const segment of segments) {
            if (segment === "*") {
                if (!node.wildcardChild) {
                    node.wildcardChild = this.createNode();
                }
                node = node.wildcardChild;
                break; // Wildcard consumes rest
            } else if (segment.startsWith(":")) {
                const param = segment.slice(1);
                if (!node.paramChild) {
                    node.paramChild = this.createNode();
                    node.paramChild.paramName = param;
                }
                node = node.paramChild;
            } else {
                if (!node.children.has(segment)) {
                    node.children.set(segment, this.createNode());
                }
                node = node.children.get(segment)!;
            }
        }

        node.route = {
            handler,
            middlewares: [...this.globalMiddlewares, ...middlewares],
        };
    }

    private splitPath(path: string): string[] {
        return path.replace(/^\//, "").split("/").filter(Boolean);
    }

    private createNode(): TrieNode<Env, Store> {
        return {
            children: new Map(),
        };
    }

    async handle(req: Request, env: Env, store?: Store): Promise<Response> {
        const url = new URL(req.url);
        const method = req.method;
        const segments = this.splitPath(url.pathname);
        const query = Object.fromEntries(url.searchParams);
        const ctx: Context<Env, Store> = {
            req,
            env,
            store: store as Store,
            params: {},
            query,
        };

        const tryMatch = (node?: TrieNode<Env, Store>) => {
            if (!node) return undefined;

            let current: TrieNode<Env, Store> = node;
            const params: Record<string, string> = {};

            for (let i = 0; i < segments.length; i++) {
                const segment = segments[i];

                if (current.children.has(segment)) {
                    current = current.children.get(segment)!;
                } else if (current.paramChild) {
                    params[current.paramChild.paramName!] = segment;
                    current = current.paramChild;
                } else if (current.wildcardChild) {
                    params["*"] = segments.slice(i).join("/");
                    current = current.wildcardChild;
                    break;
                } else {
                    return undefined;
                }
            }

            if (current?.route) {
                ctx.params = params;
                return current.route;
            }

            return undefined;
        };

        let route = tryMatch(this.trees[method]);

        if (!route) {
            route = tryMatch(this.trees["*"]);
        }

        if (!route) {
            return new Response("Not Found", { status: 404 });
        }

        const { handler, middlewares } = route;
        const composed = this.compose([...middlewares, handler]);
        const result = await composed(ctx);

        if (result instanceof Response) {
            return result;
        }

        return new Response("OK");
    }

    private compose(mws: Handler<Env, Store>[]): (ctx: Context<Env, Store>) => Promise<Response | void> {
        return async (ctx: Context<Env, Store>) => {
            let index = -1;
            const dispatch = async (i: number): Promise<Response | void> => {
                if (i <= index) throw new Error("next() called multiple times");
                index = i;
                const fn = mws[i];
                if (!fn) return;
                try {
                    const result = await fn(ctx, () => dispatch(i + 1));
                    if (result instanceof Response) {
                        return result;
                    }
                } catch (error) {
                    console.error("[ERROR]: Middleware error", error);
                    return new Response("Internal Server Error", { status: 500 });
                }
            };
            return dispatch(0);
        };
    }
}