# 参与贡献

## 开发环境

- macOS（Apple Silicon 用于打包验证）、Node.js 22.18+
- `npm install`
- `npm run dev` 启动网页调试界面；`npm run desktop:start` 编译并以桌面应用启动
- `npm test` 运行全部本地测试；`npm run build` 做类型检查与生产构建

## 提交前

1. 运行 `npm test`，全部通过。
2. 运行 `npm run build`，确认 TypeScript 与 Vite 构建通过。
3. 不新增任何写操作接口；如确需扩展只读接口，请在 `API-RESEARCH.md` 中补充可复核的证据。
4. 不提交真实账户数据、Cookie、令牌、设备序列号或带真实数据的截图。

## 代码约定

- 保持 `src/` 中的组件、样式命名与现有结构一致。
- 接口参数校验放在 `electron/api.cjs`，并同步补测试。
- 数据缺失时留空并给出说明，不用示例值填充真实账户视图。
