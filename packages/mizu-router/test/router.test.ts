import { describe, it, expect, beforeEach } from 'vitest';
import { Router } from '../src/index';

describe('Router', () => {
    let router: Router;

    beforeEach(() => {
        router = new Router();
    });

    describe('Basic HTTP Methods', () => {
        it('should handle GET requests', async () => {
            router.get('/test', async (ctx) => {
                return new Response('GET test');
            });

            const req = new Request('http://localhost/test');
            const res = await router.handle(req, {});
            expect(await res.text()).toBe('GET test');
        });

        it('should handle POST requests', async () => {
            router.post('/test', async (ctx) => {
                return new Response('POST test');
            });

            const req = new Request('http://localhost/test', { method: 'POST' });
            const res = await router.handle(req, {});
            expect(await res.text()).toBe('POST test');
        });

        it('should handle PUT requests', async () => {
            router.put('/test', async (ctx) => {
                return new Response('PUT test');
            });

            const req = new Request('http://localhost/test', { method: 'PUT' });
            const res = await router.handle(req, {});
            expect(await res.text()).toBe('PUT test');
        });

        it('should handle DELETE requests', async () => {
            router.delete('/test', async (ctx) => {
                return new Response('DELETE test');
            });

            const req = new Request('http://localhost/test', { method: 'DELETE' });
            const res = await router.handle(req, {});
            expect(await res.text()).toBe('DELETE test');
        });

        it('should handle PATCH requests', async () => {
            router.patch('/test', async (ctx) => {
                return new Response('PATCH test');
            });

            const req = new Request('http://localhost/test', { method: 'PATCH' });
            const res = await router.handle(req, {});
            expect(await res.text()).toBe('PATCH test');
        });

        it('should handle HEAD requests', async () => {
            router.head('/test', async (ctx) => {
                return new Response('HEAD test');
            });

            const req = new Request('http://localhost/test', { method: 'HEAD' });
            const res = await router.handle(req, {});
            expect(res.status).toBe(200);
        });

        it('should handle OPTIONS requests', async () => {
            router.options('/test', async (ctx) => {
                return new Response('OPTIONS test');
            });

            const req = new Request('http://localhost/test', { method: 'OPTIONS' });
            const res = await router.handle(req, {});
            expect(await res.text()).toBe('OPTIONS test');
        });
    });

    describe('Path Parameters', () => {
        it('should parse path parameters', async () => {
            router.get('/users/:id', async (ctx) => {
                return new Response(`User ID: ${ctx.params.id}`);
            });

            const req = new Request('http://localhost/users/123');
            const res = await router.handle(req, {});
            expect(await res.text()).toBe('User ID: 123');
        });

        it('should handle multiple path parameters', async () => {
            router.get('/users/:userId/posts/:postId', async (ctx) => {
                return new Response(`User ${ctx.params.userId}, Post ${ctx.params.postId}`);
            });

            const req = new Request('http://localhost/users/123/posts/456');
            const res = await router.handle(req, {});
            expect(await res.text()).toBe('User 123, Post 456');
        });
    });

    describe('Query Parameters', () => {
        it('should parse query parameters', async () => {
            router.get('/search', async (ctx) => {
                return new Response(`Search for: ${ctx.query.q}`);
            });

            const req = new Request('http://localhost/search?q=test');
            const res = await router.handle(req, {});
            expect(await res.text()).toBe('Search for: test');
        });

        it('should handle multiple query parameters', async () => {
            router.get('/search', async (ctx) => {
                return new Response(`Search for: ${ctx.query.q}, sort: ${ctx.query.sort}`);
            });

            const req = new Request('http://localhost/search?q=test&sort=desc');
            const res = await router.handle(req, {});
            expect(await res.text()).toBe('Search for: test, sort: desc');
        });
    });

    describe('Wildcards', () => {
        it('should handle wildcard routes', async () => {
            router.get('/api/*', async (ctx) => {
                return new Response(`Wildcard path: ${ctx.params['*']}`);
            });

            const req = new Request('http://localhost/api/users/123/posts');
            const res = await router.handle(req, {});
            expect(await res.text()).toBe('Wildcard path: users/123/posts');
        });

        it('should handle nested wildcards', async () => {
            router.get('/api/*/posts/*', async (ctx) => {
                return new Response(`Resource: ${ctx.params['*']}`);
            });

            const req = new Request('http://localhost/api/users/123/posts/456');
            const res = await router.handle(req, {});
            expect(await res.text()).toBe('Resource: users/123/posts/456');
        });
    });

    describe('Subrouting', () => {
        it('should handle subrouters', async () => {
            const subRouter = new Router();
            subRouter.get('/users', async (ctx) => {
                return new Response('Subrouter users');
            });

            router.route('/api', subRouter);

            const req = new Request('http://localhost/api/users');
            const res = await router.handle(req, {});
            expect(await res.text()).toBe('Subrouter users');
        });

        it('should handle nested subrouters', async () => {
            const subRouter1 = new Router();
            const subRouter2 = new Router();
            
            subRouter2.get('/posts', async (ctx) => {
                return new Response('Nested subrouter posts');
            });

            subRouter1.route('/v1', subRouter2);
            router.route('/api', subRouter1);

            const req = new Request('http://localhost/api/v1/posts');
            const res = await router.handle(req, {});
            expect(await res.text()).toBe('Nested subrouter posts');
        });
    });

    describe('Middleware', () => {
        it('should execute global middleware', async () => {
            let middlewareExecuted = false;
            
            router.use(async (ctx, next) => {
                middlewareExecuted = true;
                return next();
            });

            router.get('/test', async (ctx) => {
                return new Response('Test');
            });

            const req = new Request('http://localhost/test');
            await router.handle(req, {});
            expect(middlewareExecuted).toBe(true);
        });

        it('should execute route-specific middleware', async () => {
            let middlewareExecuted = false;
            
            const middleware = async (ctx: any, next: any) => {
                middlewareExecuted = true;
                return next();
            };

            router.get('/test', async (ctx) => {
                return new Response('Test');
            }, [middleware]);

            const req = new Request('http://localhost/test');
            await router.handle(req, {});
            expect(middlewareExecuted).toBe(true);
        });

        it('should execute middleware in correct order', async () => {
            const executionOrder: string[] = [];

            router.use(async (ctx, next) => {
                executionOrder.push('global1');
                return next();
            });

            router.use(async (ctx, next) => {
                executionOrder.push('global2');
                return next();
            });

            const routeMiddleware = async (ctx: any, next: any) => {
                executionOrder.push('route');
                return next();
            };

            router.get('/test', async (ctx) => {
                executionOrder.push('handler');
                return new Response('Test');
            }, [routeMiddleware]);

            const req = new Request('http://localhost/test');
            await router.handle(req, {});
            expect(executionOrder).toEqual(['global1', 'global2', 'route', 'handler']);
        });
    });

    describe('Error Handling', () => {
        it('should return 404 for non-existent routes', async () => {
            const req = new Request('http://localhost/nonexistent');
            const res = await router.handle(req, {});
            expect(res.status).toBe(404);
        });

        it('should handle middleware errors', async () => {
            router.use(async (ctx, next) => {
                throw new Error('Middleware error');
            });

            router.get('/test', async (ctx) => {
                return new Response('Test');
            });

            const req = new Request('http://localhost/test');
            const res = await router.handle(req, {});
            expect(res.status).toBe(500);
        });
    });

    describe('Context', () => {
        it('should pass environment variables to handlers', async () => {
            const env = { API_KEY: 'secret' };


            const tempRouter = new Router<{ API_KEY: string }, {}>();
            
            tempRouter.get('/test', async (ctx) => {
                return new Response(`API Key: ${ctx.env.API_KEY}`);
            });
            const req = new Request('http://localhost/test');
            const res = await tempRouter.handle(req, env);
            expect(await res.text()).toBe('API Key: secret');
        });

        it('should pass store to handlers', async () => {
            const store = { user: { id: 123 } };
            
            const tempRouter = new Router<{}, { user: { id: number } }>();
            tempRouter.get('/test', async (ctx) => {
                return new Response(`User ID: ${ctx.store.user.id}`);
            });

            const req = new Request('http://localhost/test');
            const res = await tempRouter.handle(req, {}, store);
            expect(await res.text()).toBe('User ID: 123');
        });
    });
}); 