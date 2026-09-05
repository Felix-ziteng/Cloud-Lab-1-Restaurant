import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  // @restaurant/shared-types 是 workspace 内的符号链接包，编译产物是给 Nest 后端用的 CommonJS
  // （tsc module: Node16，package.json 没有 type:module）。Vite 默认只把它当"源码"通过 /@fs/
  // 原样转发给浏览器当 ESM 解析，不会做 CJS→ESM 的互操作转换，导致只有类型导入能用、一旦从这个
  // 包导入运行时值（比如 ALLERGEN_OPTIONS）就会报 "does not provide an export"。显式加进
  // optimizeDeps 让 esbuild 预打包时按依赖处理，正确转换成浏览器可用的 ESM。
  optimizeDeps: {
    include: ['@restaurant/shared-types'],
  },
})
