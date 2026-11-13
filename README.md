# 社媒评论AI智能营销助手 · 官方网站

正式域名：https://mememeeme.mom/

## 当前设计
采用原来的紫色订阅式网站作为基线。早前尝试的杂志/编辑式页面不再使用。新版本的设计规则见 DESIGN.md。

三张真实插件截图分别为 media/style.png、media/search.png、media/draft.png。原生 1280×800 图片必须完整显示、可点开原图，不能裁切。两张订阅卡片保留，¥39/月仅为尚未启用的测试计划价。

## 发布
- 域名对应原 Cloudflare Pages 项目，发布仓库为 711stoner/English-practice。
- 当前官网的单一开发来源是 Mac 桌面 AI社媒评论助手-V0.1/site。
- node build.mjs 构建到 dist/，Cloudflare Pages 同样构建并部署 dist/。
- 网站没有真实的 Chrome / Edge 商店链接和正式收费功能，因此不能虚构下载或付款入口。
- 只更改网站，绝不影响 extension/ 和 server/。

## 测试
开发完成必须检查 390 / 768 / 1440px 视口、三张截图的完整显示、两个方案卡片、法律页面与实际线上 URL。
