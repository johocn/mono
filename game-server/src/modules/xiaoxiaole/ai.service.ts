import { Injectable } from '@nestjs/common';

/**
 * AI 提示词服务 —— **平台不出图**。
 *
 * 定位：为玩家提供「拿去外部 AI 工具（即梦 / 豆包 / Midjourney 等）自行做图」的
 * 标准提示词与规格说明。玩家制作完成后，按规格通过 /skins/upload 上传、
 * /skins/publish 发布，经平台审核通过后上架模板中心交易。
 *
 * 密钥与外部 AI API 均不经过本服务端。
 */
@Injectable()
export class AiService {
  /** 上传规格（与 storage.service 的校验一致，前端展示用） */
  static readonly SPEC = {
    width: 512,
    height: 512,
    formats: ['png', 'jpg', 'webp'],
    maxBytes: 2 * 1024 * 1024,
    specText: '512×512px，png/jpg/webp，≤2MB；背景与棋子对比度需满足 WCAG AA（4.5:1）',
  };

  /** 内置提示词模板（适老化：柔和、高对比、无闪烁元素），复制时自动追加规格后缀 */
  static readonly PROMPT_TEMPLATES: { key: string; label: string; prompt: string }[] = [
    {
      key: 'garden',
      label: '花园夜色',
      prompt: '柔和的夜色花园背景，深蓝紫渐变，淡粉与青绿柔光斑，无文字，高对比，适合老年人观看，扁平插画风格',
    },
    {
      key: 'morning',
      label: '清晨暖阳',
      prompt: '清晨暖阳花园，暖黄与青绿渐变，柔和光晕，无文字，高对比，扁平插画风格，适老化设计',
    },
    {
      key: 'fruit',
      label: '果蔬棋子',
      prompt: '简洁的果蔬图标，圆角方形棋子，纯色背景，粗轮廓，高对比，无文字，适老化扁平风格',
    },
    {
      key: 'flower',
      label: '花卉棋子',
      prompt: '简洁的花卉叶片图标，圆角方形棋子，纯色背景，粗轮廓，高对比，无文字，适老化扁平风格',
    },
  ];

  /** 规格后缀：拼在模板提示词尾部，保证外部工具一次出图即符合上传要求 */
  static readonly PROMPT_SUFFIX =
    '，正方形构图，512×512 分辨率，画面主体居中，四周留出安全边距，纯色或柔和渐变背景，无任何文字与水印';

  /** 复制用完整提示词 = 模板提示词 + 规格后缀 */
  static fullPrompt(prompt: string): string {
    return prompt + AiService.PROMPT_SUFFIX;
  }

  templates() {
    return {
      items: AiService.PROMPT_TEMPLATES.map((t) => ({
        ...t,
        fullPrompt: AiService.fullPrompt(t.prompt),
      })),
      spec: AiService.SPEC,
    };
  }
}
