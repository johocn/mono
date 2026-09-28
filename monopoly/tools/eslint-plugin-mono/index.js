const HEX = /^#[0-9a-fA-F]{3,8}$/;
const FUNCCOLOR = /\b(rgba?|hsla?)\(/;
const ALLOW = new Set([-1, 0, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 90, 180, 360]);
/* 说明：「裸几何常数」指带小数的量（0.62 / 10.5）或 ≥10 的整数（26 / 46 / 72 / 390）；上表为结构性小整数与直角/半值，直接放行 */
/* 取值器：唯一允许裸字面量的位置 = 兜底默认值（spec §3.6.4「内建兜底」） */
const GETTERS = new Set(['num', 'str', 'arr', 'n', 'c', 'fb']);

/**
 * 该字面量是否落在取值器调用的实参子树内（含对象/数组字面量内部），是则豁免。
 * 例：num(p,'k',13) ✓ · str(p,'fill','#fff') ✓ · fb({ a: 0.6, b: 26 }) ✓ · const h = 26 ✗
 */
function isFallback(node) {
  let cur = node.parent;
  while (cur) {
    if (cur.type === 'CallExpression' && cur.callee.type === 'Identifier' && GETTERS.has(cur.callee.name)) return true;
    if (cur.type === 'ArrowFunctionExpression' || cur.type === 'FunctionExpression' || cur.type === 'FunctionDeclaration') return false;
    if (cur.type === 'Program') return false;
    cur = cur.parent;
  }
  return false;
}

export const noHardcodedColor = {
  meta: { type: /** @type {'problem'} */ ('problem'), docs: { description: 'src/render 禁止裸色值' } },
  create(ctx) {
    return {
      Literal(node) {
        if (typeof node.value !== 'string') return;
        if (isFallback(node)) return;
        if (HEX.test(node.value) || FUNCCOLOR.test(node.value)) {
          ctx.report({ node, message: `裸色值「${node.value}」必须进 skin.json（spec §3.7.2）；仅兜底默认值（num/str/arr/n/c/fb 的实参）可裸写` });
        }
      },
      TemplateElement(node) {
        /* 参数化模板（含插值，如 `hsl(${hue},32%,20%)`）属"由参数组装的颜色"，不算写死 */
        const tpl = node.parent;
        if (tpl && Array.isArray(tpl.expressions) && tpl.expressions.length > 0) return;
        const raw = node.value.raw;
        if (HEX.test(raw.trim()) || FUNCCOLOR.test(raw)) {
          ctx.report({ node, message: `模板串含裸色值「${raw}」必须进 skin.json` });
        }
      },
    };
  },
};

export const noVisualNumber = {
  meta: { type: /** @type {'problem'} */ ('problem'), docs: { description: 'src/render 禁止裸几何/视觉常数' } },
  create(ctx) {
    return {
      Literal(node) {
        if (typeof node.value !== 'number') return;
        if (ALLOW.has(node.value)) return;
        if (isFallback(node)) return;
        ctx.report({ node, message: `裸视觉常数 ${node.value} 必须进 skin.json / 注册表（spec §3.7.2）；仅兜底默认值（num/str/arr/n/c/fb 的实参）可裸写` });
      },
    };
  },
};

export default { rules: { 'no-hardcoded-color': noHardcodedColor, 'no-visual-number': noVisualNumber } };