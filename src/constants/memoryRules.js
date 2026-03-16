export const MEMORY_RULES_SECTIONS = [
  {
    title: "这是什么系统",
    summary: "这是英文整句默写背诵系统，目标是训练整句主动回忆与稳定输出。",
    points: [
      "核心任务是看中文提示，完整默写英文句子。",
      "它不是单词选择题系统，更关注整句表达能力。",
    ],
  },
  {
    title: "记忆算法与评分",
    summary: "长期间隔由 FSRS 决定，评分映射保持三档。",
    points: [
      "主算法：ts-fsrs（enable_fuzz=true，enable_short_term=false）。",
      "会（记住了）-> Good；模糊（有点难）-> Hard；不会（忘了）-> Again。",
    ],
  },
  {
    title: "拼写确认规则",
    summary: "系统按句子熟悉度分层确认，新句更严格，稳句更高效。",
    points: [
      "new/unfamiliar：保持双重确认（第一轮可模糊，第二轮需精确）。",
      "weak：精确一次可评分；若仅模糊通过，仍需再确认一次。",
      "stable：一次通过即可评分。",
    ],
  },
  {
    title: "模糊通过与内容判定",
    summary: "模糊通过按句长分层，系统重点判断内容回忆质量。",
    points: [
      "短句更严格，长句允许少量非核心误差，但核心结构错误不放行。",
      "标点和大小写问题只做轻提醒，不作为核心答错阻断。",
    ],
  },
  {
    title: "每日练习与队列",
    summary: "每日负荷受控，复习优先，新学动态补充。",
    points: [
      "Practice 主队列每日上限约 15 句。",
      "先安排待复习（含逾期），再按当天负荷补充新学。",
      "难句与新句会在同日会话中更容易被再次安排强化。",
    ],
  },
  {
    title: "不会这句怎么处理",
    summary: "不会不会被简单跳过，会在会话内更快回插强化。",
    points: [
      "第一次不会：回插到后面第 2~4 题。",
      "第二次不会：回插到后面第 1~3 题。",
      "同句同轮多次不会会触发更保守记录（最高按 Hard）。",
    ],
  },
  {
    title: "提示 / 朗读 / 跳过的评分上限",
    summary: "使用辅助后，本句评分会更保守，避免污染长期记忆信号。",
    points: [
      "本轮看过提示、用过朗读或点过“不会这句”，本句最高按 Hard 记录。",
      "只有独立完成回忆且未用辅助，才允许记为 Good。",
    ],
  },
  {
    title: "打卡规则",
    summary: "每轮按复习结果统计，达标后当天可打卡一次。",
    points: [
      "统计字段：reviewed_count / passed_count / fuzzy_count / failed_count。",
      "达标条件：reviewed_count>=8，pass_rate>=0.5，fail_rate<0.25。",
      "同一天只能打卡一次。",
    ],
  },
  {
    title: "已掌握（mastered）",
    summary: "满足长期稳定条件后会暂停进入普通复习队列。",
    points: [
      "reps>=8 且 intervalDays>=730，且本次评分 q>=3 时标记 mastered。",
      "已掌握句子默认不进入日常待复习列表。",
    ],
  },
  {
    title: "学习数据记录了什么",
    summary: "每日学习情况会长期保存为文本，便于 GitHub 跟踪。",
    points: [
      "数据写入 data/learning_stats.json（按日期 upsert，不重复追加）。",
      "核心字段包含：今日新学、今日已复习、通过/模糊/失败、打卡状态、study_seconds。",
    ],
  },
  {
    title: "今日有效学习时长口径",
    summary: "只统计真实学习动作，不按页面停留时间累计。",
    points: [
      "输入、提交、评分、下一句、提示等学习动作会触发累计。",
      "切后台或失焦会暂停，长时间无操作不累计。",
    ],
  },
];

export const MEMORY_RULES_FOOTNOTE =
  "规则会随系统优化逐步微调，请以当前应用内说明为准。";

