import { describe, it, expect } from 'vitest';
import { RuleTester } from 'eslint';
import { noHardcodedColor, noVisualNumber } from '../../tools/eslint-plugin-mono/index.js';

const tester = new RuleTester({ languageOptions: { ecmaVersion: 2022, sourceType: 'module' } });

describe('mono/no-hardcoded-color', () => {
  it('拦截 hex / rgb / rgba / hsl 字面量', () => {
    expect(() => tester.run('no-hardcoded-color', noHardcodedColor, {
      valid: ['const a = 1;'],
      invalid: [
        { code: "const a = '#f5c451';", errors: 1 },
        { code: "const a = 'rgba(0,0,0,.5)';", errors: 1 },
        { code: "const a = 'hsl(45,72%,60%)';", errors: 1 },
      ],
    })).not.toThrow();
  });
});

describe('mono/no-visual-number', () => {
  it('白名单之外的数字一律报错（26/46/72/0.62 都被拦）', () => {
    expect(() => tester.run('no-visual-number', noVisualNumber, {
      valid: ['const a = 1; const b = 0.5; const c = -1; const d = Math.PI * 180 / 90;'],
      invalid: [
        { code: 'const h = 26;', errors: 1 },
        { code: 'const k = 0.62;', errors: 1 },
        { code: 'const g = 10.5;', errors: 1 },
      ],
    })).not.toThrow();
  });
});

describe('取值器兜底默认值豁免（spec §3.6.4：内建兜底是全工程唯一允许裸字面量的位置）', () => {
  it('色值：str/c 的实参放行、参数化模板放行；裸色值与无插值模板报错', () => {
    expect(() => tester.run('no-hardcoded-color', noHardcodedColor, {
      valid: [
        "const a = str(p, 'fill', '#ffffff');",
        "const b = c('edge', '#6b7f76');",
        'const d = hsl(hue, sat, light);',
        'const e = `hsl(${hue},32%,20%)`;',
      ],
      invalid: [
        { code: "const a = '#ffffff';", errors: 1 },
        { code: 'const a = `rgba(0,0,0,.5)`;', errors: 1 },
      ],
    })).not.toThrow();
  });

  it('数字：num/n 的实参与 fb 默认值容器放行，裸 13 报错', () => {
    expect(() => tester.run('no-visual-number', noVisualNumber, {
      valid: [
        'const a = num(p, "k", 13);',
        'const b = n("h", 26);',
        'const D = fb({ shadowFy: 0.6, wallH: 26, level3: 72 });',
      ],
      invalid: [{ code: 'const b = 13;', errors: 1 }],
    })).not.toThrow();
  });
});