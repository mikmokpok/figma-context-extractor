import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
    resolve: {
        alias: {
            '~': resolve(__dirname, 'src')
        }
    },
    build: {
        lib: {
            entry: resolve(__dirname, 'src/index.ts'),
            name: 'FigmaMetadataExtractor',
            fileName: 'index',
            formats: ['es', 'cjs']
        },
        rollupOptions: {
            external: [
                '@figma/rest-api-spec',
                'js-yaml',
                'remeda',
                'sharp',
                'zod',
                'fs',
                'path',
                'child_process',
                'util'
            ]
        },
        target: 'node18',
        minify: false
    }
})