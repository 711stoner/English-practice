# 社媒评论AI智能营销助手 · 官方网站

正式域名：https://mememeeme.mom/

## 视觉设计与参考（2026-11-13）

这次从 SaaS 模板改为独立刊物 / editorial utility 版式，设计系统写在 [DESIGN.md](DESIGN.md)。

参考的两个开源项目：

- [Impeccable](https://github.com/pbakaus/impeccable)：视觉设计流程、批评与质量审查。
- [Anti Slop](https://github.com/miqdadbadjuber/anti-slop)：去掉同质化 AI 网页默认模式，重点检查配色、卡片、排版和泛化文案。

不复制第三方成品设计；新网站采用自己品牌的真实插件素材。
分享封面的编辑源文件为 `og-preview.html`，截图成 `media/social-preview.png`，PNG 为线上实际素材。

## 发布

- 原 Cloudflare Pages 项目与域名绑定不变，现用 GitHub 仓库 `711stoner/English-practice` 自动部署。
- 本目录是单一可维护源码；`npm run build` 生成静态 `dist/` 目录，Pages 构建命令一致。
- 网站资产只有 `index.html`、法律页面、站点地图、favicon、`media/` 的真实截图和 `site.css`，不依赖 UI 框架和外部脚本。
- 不含扩展密钥、会员后端或实际付款代码；真实商店安装链接尚未核实，所以不提供假下载按钮。
- 修改内容后检查文字事实、隐私、使用条款、退款说明、手机视口与 SEO。

## 改版确认

- 视觉检查宽度：390 / 500 / 768 / 1440px，无横向溢出。
- 交互：FAQ 使用原生 details，主要导航跳转页面内实际 section，邮件按钮使用 mailto。
- 网站功能与插件功能独立：只调整官网，不碰 `extension/`、`server/`。
