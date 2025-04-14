import { Router } from "mizu-router";

interface Env {
}

const router = new Router<Env, {}>();

router.use(async (ctx, next) => {
	console.log("middleware 1");
	return next();
});

router.get("/", async (ctx) => {
	console.log("Hello World!");
	return new Response("Hello World!");
});

router.use(async (ctx, next) => {
	console.log("middleware 2");
	return next();
});

router.get("/test", async (ctx) => {
	console.log("test");
	return new Response("test");
});


export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		return router.handle(request, env, {});
	},
} satisfies ExportedHandler<Env>;
