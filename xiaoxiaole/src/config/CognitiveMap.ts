/**
 * 认知域映射表 — spec v1.1 第 7.1 节
 * 三大模式训练目标映射到标准化认知构念与参考测评
 */

export interface CognitiveDomainMap {
  mode: string;
  modeName: string;
  constructs: string[];        // 训练认知构念
  referenceTests: string[];    // 参考标准化测评
  proxyMetrics: string[];      // 游戏内代理指标
}

export const COGNITIVE_MAP: CognitiveDomainMap[] = [
  {
    mode: "match3",
    modeName: "时光整理师",
    constructs: ["加工速度", "执行功能（视觉搜索/抑制）", "手眼协调"],
    referenceTests: ["连线测验 TMT-A/B", "符号数字模式测验 SDMT"],
    proxyMetrics: ["反应时", "连击率", "误触率"],
  },
  {
    mode: "audio",
    modeName: "听音辨位",
    constructs: ["听觉语义加工", "听觉工作记忆容量", "序列记忆", "分配性注意"],
    referenceTests: ["环境音识别测验", "数字广度", "n-back", "双重任务范式"],
    proxyMetrics: ["选择准确率", "反应时与方差", "最大序列长度", "干扰下正确率", "重听率"],
  },
  {
    mode: "poetry",
    modeName: "诗词连连看",
    constructs: ["语言流畅度", "语义联想", "线索回忆", "情景记忆"],
    referenceTests: ["语义流畅性（动物/字头）", "Boston 命名", "Cued Recall"],
    proxyMetrics: ["配对准确率", "误配次数", "提示等级达成率"],
  },
  {
    mode: "corsi",
    modeName: "空间记忆",
    constructs: ["空间工作记忆", "空间注意", "视听联合编码"],
    referenceTests: ["Corsi Block-Tapping", "空间广度测验"],
    proxyMetrics: ["正确轮数", "序列长度", "平均反应时"],
  },
  {
    mode: "face",
    modeName: "面孔-名字联想",
    constructs: ["联想记忆", "情景记忆", "面孔-名字绑定"],
    referenceTests: ["Face-Name Associative Memory", "Benton 面孔再认"],
    proxyMetrics: ["正确回忆数", "延迟保持率", "干扰抗力"],
  },
  {
    mode: "memory",
    modeName: "记忆翻翻乐",
    constructs: ["视觉再认记忆", "空间位置记忆", "联想编码"],
    referenceTests: ["Concentration", "视觉配对再认测验"],
    proxyMetrics: ["配对成功率", "翻牌步数效率", "重复翻看次数"],
  },
  {
    mode: "stroop",
    modeName: "色词干扰",
    constructs: ["抑制控制", "干扰抑制", "认知灵活性"],
    referenceTests: ["Stroop 色词测验", "Go/No-Go"],
    proxyMetrics: ["冲突条件正确率", "平均反应时", "Stroop 效应量"],
  },
  {
    mode: "money",
    modeName: "日常钱币计算",
    constructs: ["数感", "心算能力", "工作记忆", "日常财务能力"],
    referenceTests: ["数字运算测验", "IADL 财务管理条目"],
    proxyMetrics: ["计算正确率", "平均反应时", "大额题正确率"],
  },
  {
    mode: "pm",
    modeName: "前瞻记忆",
    constructs: ["前瞻记忆", "意图维持", "注意分配", "反应抑制"],
    referenceTests: ["事件型前瞻记忆范式", "Rivermead 行为记忆测验"],
    proxyMetrics: ["按铃命中率", "误报次数", "进行中任务正确率"],
  },
  {
    mode: "clock",
    modeName: "时间定向",
    constructs: ["时间定向", "视觉空间转换", "日常实用能力"],
    referenceTests: ["画钟测验 CDT", "时间定向条目"],
    proxyMetrics: ["认时正确率", "拨钟正确率", "平均反应时"],
  },
  {
    mode: "nostalgia",
    modeName: "怀旧金曲",
    constructs: ["语义记忆", "情景记忆", "联想记忆", "语言流畅度"],
    referenceTests: ["语义流畅性（歌曲/事件）", "自传体记忆访谈", "Cued Recall"],
    proxyMetrics: ["歌名回忆正确率", "歌词联想正确率", "平均反应时"],
  },
];

// 雷达图维度（用于结果展示）
export const RADAR_AXES = [
  { key: "processing_speed", label: "加工速度", mode: "match3" },
  { key: "executive_function", label: "执行功能", mode: "match3" },
  { key: "working_memory", label: "工作记忆", mode: "audio" },
  { key: "divided_attention", label: "分配性注意", mode: "audio" },
  { key: "language_fluency", label: "语言流畅度", mode: "poetry" },
  { key: "semantic_memory", label: "语义记忆", mode: "poetry" },
  { key: "spatial_working_memory", label: "空间记忆", mode: "corsi" },
  { key: "associative_memory", label: "联想记忆", mode: "face" },
  { key: "visual_recognition_memory", label: "视觉再认", mode: "memory" },
  { key: "inhibitory_control", label: "抑制控制", mode: "stroop" },
  { key: "numeracy", label: "数感计算", mode: "money" },
  { key: "prospective_memory", label: "前瞻记忆", mode: "pm" },
  { key: "temporal_orientation", label: "时间定向", mode: "clock" },
  { key: "reminiscence", label: "怀旧记忆", mode: "nostalgia" },
];
