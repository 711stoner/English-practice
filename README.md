# Sentence Memo (React + Vite)

## 学习情况数据

- 学习统计会同步写入 `data/learning_stats.json`（纯文本，适合 GitHub 跟踪）。
- 启动 `npm run dev` 或 `npm run preview` 时，Vite 中间件会自动提供：
  - `GET /api/learning-stats`
  - `POST /api/learning-stats/upsert`
- 同一天会按 `date(YYMMDD)` upsert，不会重复新增多条同日期记录。
