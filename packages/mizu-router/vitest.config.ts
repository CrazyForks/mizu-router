import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'edge-runtime',
        globals: true,
        reporters: ["verbose"],
        include: ['test/**/*.test.ts'],
    },
}); 