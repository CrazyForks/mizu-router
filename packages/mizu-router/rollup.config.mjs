import terser from '@rollup/plugin-terser'
import typescript from '@rollup/plugin-typescript'
import { globby } from 'globby'
import bundleSize from 'rollup-plugin-bundle-size'
import copy from 'rollup-plugin-copy'
import fs from 'fs-extra'

// scan files to build
const files = (await globby('./src/*.ts', {
  ignore: ['**/*.spec.ts', 'examples'],
})).map(path => ({
  path,
  shortPath: path.replace(/(\/src)|(\.ts)/g, '').replace('./index', '.'),
  esm: path.replace('/src/', '/dist/').replace('.ts', '.mjs'),
  cjs: path.replace('/src/', '/dist/').replace('.ts', '.js'),
  types: path.replace('/src/', '/dist/').replace('.ts', '.d.ts'),
})).sort((a, b) => a.shortPath.toLowerCase() < b.shortPath.toLowerCase() ? -1 : 1)

// read original package.json
const pkg = await fs.readJSON('./package.json')

// create updated exports list from build files
pkg.exports = files.reduce((acc, file) => {
  acc[file.shortPath] = {
    types: file.types,
    import: file.esm,
    require: file.cjs,
  }

  return acc
}, {})

// write updated package.json
await fs.writeJSON('./package.json', pkg, { spaces: 2 })

export default async () => {
  console.log(files.map(f => f.path))

  return files.map(file => ({
    input: file.path,
    output: [
      {
        format: 'esm',
        file: file.esm,
        sourcemap: true,
      },
      {
        format: 'cjs',
        file: file.cjs,
        sourcemap: true,
      },
    ],
    plugins: [
      typescript({ sourceMap: true }),
      terser(),
      bundleSize(),
      copy({
        targets: [
          {
            src: ['../../LICENSE'],
            dest: 'dist',
          },
          {
            src: ['../../README.md'],
            dest: '.',
          },
        ],
      }),
    ],
  }))
}