import { describe, it, expect } from 'vitest';
import { labelPlacement, labelTextOf, labelSize, roofLabelY, clampLabelText } from '../../src/render/LabelView';
import {
  LABEL_ROOF, LABEL_CURRENT_SCALE, LABEL_STROKE_CUR, LABEL_TRI_W, LABEL_TRI_H, LABEL_RING,
} from '../../src/skin/layout';

const GEO = { hw: 21, hh: 10.5, ox: 195, oy: 96 };

describe('label 标签（v5 样张 line 312–314）', () => {
  it('标签 y = 格心 + hh×比例，压在格前沿（不会被前排楼盖住）', () => {
    const p = labelPlacement(100, 200, GEO, { dy: 0.46, fs: 6.2, padX: 5, padTop: 6.6, h: 9.4, rx: 3.2 });
    expect(p.cx).toBe(100);
    expect(p.cy).toBeCloseTo(204.83, 2);
    expect(p.h).toBe(9.4);
  });

  it('标签宽度 = 字数 × 字号 + 横向留白', () => {
    const p = labelPlacement(0, 0, GEO, { dy: 0.46, fs: 6.2, padX: 5, padTop: 6.6, h: 9.4, rx: 3.2 });
    expect(p.widthFor('太平温泉')).toBe(6.2 * 4 + 5);
    expect(p.widthFor('优美惠超市')).toBe(6.2 * 5 + 5);
  });

  it('labelTextOf 用短名', () => {
    expect(labelTextOf(4)).toBe('国信温泉');
    expect(labelTextOf(0)).toBe('鹿乡小镇');
  });
});

describe('名牌几何（spec §6.2）', () => {
  it('4 字 fs10、3 字 fs11、5 字自动降 fs8、>5 字截断', () => {
    expect(labelSize('长峰特产').fs).toBe(LABEL_ROOF.fs);        // 4 字
    expect(labelSize('金鹿源').fs).toBe(LABEL_ROOF.fsShort);     // 3 字
    expect(labelSize('鹿茸市场部').fs).toBe(LABEL_ROOF.fsNarrow);// 5 字
    expect(clampLabelText('一二三四五六')).toBe('一二三四…');
  });

  it('4 字胶囊宽 ≤ 相邻格横向间距 48', () => {
    expect(labelSize('长峰特产').w).toBeLessThanOrEqual(48);
  });

  it('当前格放大 1.25×', () => {
    expect(labelSize('长峰特产', true).fs).toBeCloseTo(LABEL_ROOF.fs * LABEL_CURRENT_SCALE, 1);
  });

  it('楼顶落位 = 格心 − 楼高 − lift − h/2', () => {
    expect(roofLabelY(200, 72)).toBe(200 - 72 - LABEL_ROOF.lift - LABEL_ROOF.h / 2);
  });

  it('名牌恒带描边（strokeW > 0），当前格描边更粗', () => {
    expect(LABEL_ROOF.strokeW).toBeGreaterThan(0);
    expect(LABEL_STROKE_CUR).toBeGreaterThan(LABEL_ROOF.strokeW);
  });

  it('当前格三重标记的几何件齐备：1.25× 放大 + 指示三角 + 金环', () => {
    expect(LABEL_CURRENT_SCALE).toBe(1.25);
    expect(labelSize('长峰特产', true).fs).toBe(LABEL_ROOF.fs * LABEL_CURRENT_SCALE);
    expect(LABEL_TRI_W).toBeGreaterThan(0);
    expect(LABEL_TRI_H).toBeGreaterThan(0);
    /* 金环外圈光晕必须比内圈实环大且带透明度，否则与地砖描边混成一圈 */
    expect(LABEL_RING.out).toBeGreaterThan(LABEL_RING.in);
    expect(LABEL_RING.outA).toBeGreaterThan(0);
    expect(LABEL_RING.outA).toBeLessThan(1);
  });

  it('有楼走楼顶分支（h = 胶囊 h），无楼仍走地面分支', () => {
    const p = labelPlacement(100, 200, GEO, { dy: 0.46, fs: 6.2, padX: 5, padTop: 6.6, h: 9.4, rx: 3.2 }, 72);
    expect(p.cy).toBeLessThan(200);
    expect(p.h).toBe(LABEL_ROOF.h);
    const g = labelPlacement(100, 200, GEO, { dy: 0.46, fs: 6.2, padX: 5, padTop: 6.6, h: 9.4, rx: 3.2 });
    expect(g.cy).toBeCloseTo(204.83, 2);
  });
});