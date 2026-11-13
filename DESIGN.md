# DESIGN.md — mememeeme.mom

## 设计命题
「一本独立创作者的印刷式工作手册」，不是 SaaS 营销模板。
产品名字是「社媒评论AI智能营销助手」，受众是内容创作者、独立开发者、希望参与社交讨论而非群发广告的人。

## 参考
- 设计审查：pbakaus/impeccable — https://github.com/pbakaus/impeccable
- 去 AI 模板检查：miqdadbadjuber/anti-slop — https://github.com/miqdadbadjuber/anti-slop
- 编辑式网页检索：Siteinspire / editorial — https://www.siteinspire.com/websites/category/editorial
只借鉴设计过程和叙事节奏，不直接复制第三方页面或组件。

## 视觉路线
- Editorial utility / independent publishing: 报纸排版、目录编号、强对比标题、真实截图和具体文案。
- 画面背景：冷淡灰白纸感 #f3f2ef；字色 #1b1b1c；信号色 #e94b35；局部品牌紫 #7048c8 仅用于现有 Logo 和必要链接。
- 不使用：紫色渐变、浮光、磨砂导航、星星/emoji 图标墙、三张等尺寸功能卡片、数字造假、评论墙造假、无意义动画、两个并排 CTA。
- 节奏：黑色排版式主视觉→白底真实操作界面→黑底真实状态→简短问答→署名页脚。围绕用户独立控制工具的概念，不围绕营销漏斗。
- 主 CTA 不是未证实的商店下载：链接到真实插件界面；二级采用邮件联系。
- 真实产品素材：本项目 media/{overview,style,search,draft}.png。
- 先移动端可读性，再大屏体验；键盘 focus、details 可操作、reduced motion 尊重。

## 页面结构
1. 大字开场：「评论，别长得都一样。」 真实截图与品牌名
2. 卖点并非“提升效率”，而是「你写过什么／你想参与哪一段讨论／你决定是否发出」
3. 整页 3 个完整步骤，每个配实际插件截图
4. 当前已完成与尚未开放清晰分开，不编造商店地址
5. FAQ 和法律链接

## 品牌事实
- 正式名称：社媒评论AI智能营销助手；当前插件版本 0.3.5。
- 本地原创语料、产品资料、评论草稿；可生成 X 搜索入口；人工选帖及发布；本地 AI 根据硬件，第三方模型 Key 由用户选择。
- X 官方自动推荐/云端托管 AI 尚未开放；专业订阅 ¥39/月仅规划测试价；不是真实收费。
- Chrome / Edge 商店真实地址未确认，暂不冒充已上架。
- 不修改 extension/、server/ 目录，不放任何 Key 到网站。
