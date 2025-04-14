import { Router } from "mizu-router";

// 1. Define Env interface for Cloudflare bindings
interface Env {
	SECRET: string;
}

// 2. Define Store interface for global state
interface Store {
	localSecret: string;
}

// Create router with Env and Store types
const router = new Router<Env, Store>();

// 3. Global middleware that initializes store
router.use(async (ctx, next) => {
	// Initialize store with request count
	ctx.store = { localSecret: "hello world - inital store" };
	return next();
});

router.get("/", async (ctx) => {
	// store will be initial value
	return new Response(JSON.stringify({
		secret: ctx.env.SECRET,
		store: ctx.store.localSecret,
	}));
});

// 4. Global middleware that increments request count
router.use(async (ctx, next) => {
	// updating global store
	ctx.store.localSecret = "updated store";
	return next();
});

router.get("/updated", async (ctx) => {
	// store will be updated value
	return new Response(JSON.stringify({
		secret: ctx.env.SECRET,
		store: ctx.store.localSecret,
	}));
});

// Create a subrouter
const userRouter = new Router<Env, Store>();

// 5. Route with dynamic parameter
userRouter.get("/:id", async (ctx) => {
	// Access dynamic parameter
	const userId = ctx.params.id;
	
	// Access query parameters
	const format = ctx.query.format || "json";
	
	return new Response(JSON.stringify({
		userId,
		secret: ctx.env.SECRET,
		localSecret: ctx.store.localSecret,
		format
	}));
});

// 6. Mount subrouter
router.route("/users", userRouter);

// 7. Add wildcard route
router.get("/wildcard/*", async (ctx) => {
	return new Response(JSON.stringify({
		message: "wildcard route",
		path: ctx.params
	}));
});

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		return router.handle(request, env, {} as Store);
	},
} satisfies ExportedHandler<Env>;
