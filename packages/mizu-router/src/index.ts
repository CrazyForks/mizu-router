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
    route?: RouteNode<Env, Store>;
}

export class Router<Env = {}, Store = {}> {
    private trees: Record<string, TrieNode<Env, Store>> = {};
    private globalMiddlewares: Handler<Env, Store>[] = [];

    use(middleware: Handler<Env, Store>): void {
        this.globalMiddlewares.push(middleware);
    }

    route(prefix: string, subrouter: Router<Env, Store>) {
        this.use(async (ctx, next) => {
            const url = new URL(ctx.req.url);
            if (url.pathname.startsWith(prefix)) {
                const subPath = url.pathname.slice(prefix.length) || "/";
                const newUrl = new URL(ctx.req.url);
                newUrl.pathname = subPath;
                const newReq = new Request(newUrl.toString(), ctx.req);
                return subrouter.handle(newReq, ctx.env, ctx.store);
            }
            return next();
        });
    }

    get(path: string, handler: Handler<Env, Store>, middlewares: Handler<Env, Store>[] = []) {
        this.register("GET", path, handler, middlewares);
    }

    post(path: string, handler: Handler<Env, Store>, middlewares: Handler<Env, Store>[] = []) {
        this.register("POST", path, handler, middlewares);
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
            if (segment.startsWith(":")) {
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

        // Lock in the middlewares at registration time
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

        const node = this.trees[method];
        if (!node) return new Response("Not Found", { status: 404 });

        let current: TrieNode<Env, Store> | undefined = node;

        for (const segment of segments) {
            if (current?.children.has(segment)) {
                current = current.children.get(segment);
            } else if (current?.paramChild) {
                ctx.params[current.paramChild.paramName!] = segment;
                current = current.paramChild;
            } else {
                return new Response("Not Found", { status: 404 });
            }
        }

        if (!current?.route) {
            return new Response("Not Found", { status: 404 });
        }

        const { handler, middlewares } = current.route;
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
                
                const result = await fn(ctx, () => dispatch(i + 1));
                if (result instanceof Response) {
                    return result;
                }
            };
            return dispatch(0);
        };
    }
}
