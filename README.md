# Sentence Memo (React + Vite)

## 学习情况数据

- 学习统计会同步写入 `data/learning_stats.json`（纯文本，适合 GitHub 跟踪）。
- 启动 `npm run dev` 或 `npm run preview` 时，Vite 中间件会自动提供：
  - `GET /api/learning-stats`
  - `POST /api/learning-stats/upsert`
- 同一天会按 `date(YYMMDD)` upsert，不会重复新增多条同日期记录。

## 当前科学记忆方法和背诵规则

本项目是“英文整句默写背诵”，不是单词选择题。系统核心目标是：先保证复习，再控制每日负荷，并在同一天对难句做短程加固。

### 1) 主记忆算法（长期调度）

- 使用 `ts-fsrs` 作为主记忆算法（不是固定天数表）。
- 当前参数：
  - `enable_fuzz: true`
  - `enable_short_term: false`
- 含义：
  - 长期间隔由 FSRS 负责；
  - 本项目不直接启用 FSRS 内建短期步进，而是在会话层做“同日短程强化”。

### 2) 评分映射（3档）

- `会（记住了）` -> `Rating.Good`
- `模糊（有点难）` -> `Rating.Hard`
- `不会（忘了）` -> `Rating.Again`

系统在你点评分后才更新 FSRS 卡片、间隔和下次复习时间。

### 3) 双重拼写确认（整句默写）

每句不是“一次拼对就结束”，而是两步确认：

1. 第一次输入正确后，提示“请再默写一次确认”；
2. 第二次必须精确拼写正确，才进入评分按钮。

第一轮支持“模糊通过”，用于减少轻微输入误差造成的挫败：

- 归一化后编辑距离 `<= 1`
- token 数一致
- token 错位最多 1 处

### 4) 今日练习队列（会话层策略）

- 每日练习主队列上限：`15` 句。
- 队列由两部分组成：
  - 今日待复习（含逾期，优先）
  - 今日允许引入的新学（动态配额）
- 新学配额会根据复习负担和学习状态自动收缩/放宽。
- 难句和不熟句会被优先排序。
- 新学或困难句在同一会话内可能被“3~5题后再次出现”做短程强化。

> 说明：Dashboard 显示的是“总待复习量”；Practice 才执行“每日15句上限”。

### 5) “不会这句”处理

- 不会后不会直接改长期 FSRS（避免误伤长期调度）；
- 该句会在本轮中更靠前地再次出现（不是无限后拖）；
- 同句多次不会时，会提高本轮再出现优先级。

### 6) 打卡规则

每轮结束后统计：

- `reviewed_count`
- `passed_count`
- `fuzzy_count`
- `failed_count`

通过条件（全部满足）：

- `reviewed_count >= 8`
- `passed_count / reviewed_count >= 0.5`
- `failed_count / reviewed_count < 0.25`

按钮状态：

- 达标且当天未打卡：`今日打卡`
- 当天已打卡：`今日已打卡`
- 未达标：`未达到打卡标准`

同一天只能打卡一次。

### 7) mastered（长期掌握）规则

当句子满足以下条件，会标记为已掌握并暂停进入日常复习队列：

- `reps >= 8`
- `intervalDays >= 730`
- 且本次评分为 `模糊` 或 `会`（对应质量 `q >= 3`）

### 8) 学习情况数据落盘（GitHub 友好）

每日学习数据会 upsert 到 `data/learning_stats.json`，核心字段包括：

- `date`（YYMMDD）
- `checked_in` / `checkin_status`
- `new_count`（当天真正进入 Practice 新学并开始练习的句子数）
- `review_count`
- `pass_count` / `fuzzy_count` / `fail_count`
- `pass_rate`
- `study_seconds`（动作驱动的有效学习时长）
- `created_at` / `updated_at`

### 9) 今日有效学习时长口径

只按“真实学习动作”累计，不按页面打开时长累计：

- 触发动作示例：输入、提交、评分、下一句、查看提示等学习行为
- 采用“相邻动作间隔累计 + 单次最多30秒”规则
- 页面失焦/切后台会暂停
- 因此不会把挂机时长误算成学习时长
