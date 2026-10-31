/**
 * Laya 桩：在 Node 中加载游戏源码所需的全局 Laya 命名空间。
 * 只实现被游戏用到的表面行为（绘制 no-op、树操作可用），供冒烟测试驱动真实源码。
 */
"use strict";

/** Laya 3 Graphics 真实 API 白名单：调用即 no-op，未知名直接抛错（防 Node/浏览器 API 漂移） */
const GFX_METHODS = new Set([
  "drawPoly", "drawRect", "drawCircle", "drawEllipse", "drawTriangle",
  "drawRoundRect", "drawLine", "drawLines", "drawPath", "drawCurves",
  "drawTexture", "drawTextures", "clear", "fillText", "fillBorderText",
]);

function makeGraphics() {
  const target = {};
  for (const m of GFX_METHODS) target[m] = () => undefined;
  return new Proxy(target, {
    get(t, k) {
      if (typeof k !== "string") return undefined;
      if (k in t) return t[k];
      throw new Error(`Graphics.${k} 不是 Laya 3 API（拼写或签名错误，浏览器会同样失败）`);
    },
  });
}

class Node {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.scaleX = 1;
    this.scaleY = 1;
    this.rotation = 0;
    this.alpha = 1;
    this.visible = true;
    this.width = 0;
    this.height = 0;
    this.zOrder = 0;
    this._children = [];
    this._parent = null;
    this._handlers = {};
  }
  get graphics() {
    if (!this._graphics) this._graphics = makeGraphics();
    return this._graphics;
  }
  pos(x, y) {
    this.x = x;
    this.y = y;
    return this;
  }
  size(w, h) {
    this.width = w;
    this.height = h;
    return this;
  }
  scale(x, y) {
    this.scaleX = x;
    this.scaleY = y === undefined ? x : y;
    return this;
  }
  pivot(x, y) {
    this.pivotX = x;
    this.pivotY = y;
    return this;
  }
  addChild(c) {
    c._parent = this;
    this._children.push(c);
    return c;
  }
  removeChild(c) {
    const i = this._children.indexOf(c);
    if (i >= 0) this._children.splice(i, 1);
    c._parent = null;
    return c;
  }
  removeChildren() {
    for (const c of this._children) c._parent = null;
    this._children = [];
  }
  getChildAt(i) {
    return this._children[i];
  }
  getChildIndex(c) {
    return this._children.indexOf(c);
  }
  setChildIndex(c, i) {
    const cur = this._children.indexOf(c);
    if (cur >= 0) this._children.splice(cur, 1);
    this._children.splice(i, 0, c);
  }
  sortChildren() {
    this._children.sort((a, b) => a.zOrder - b.zOrder);
  }
  on(type, caller, fn) {
    (this._handlers[type] = this._handlers[type] || []).push({ caller, fn });
  }
  off() {}
  destroy() {
    if (this._parent) this._parent.removeChild(this);
  }
}

class Sprite extends Node {}

class Text extends Node {
  constructor() {
    super();
    this.text = "";
    this.color = "#fff";
    this.fontSize = 12;
    this.bold = false;
    this.align = "left";
    this.valign = "top";
    this.leading = 0;
    this.wordWrap = false;
    this.stroke = 0;
    this.strokeColor = "#000";
  }
}

class TextInput extends Text {
  constructor() {
    super();
    this.bgColor = "#000";
    this.borderColor = "#000";
  }
}

class Stage extends Sprite {
  constructor() {
    super();
    this.width = 1280;
    this.height = 720;
  }
}

class Rectangle {
  constructor(x, y, w, h) {
    this.x = x;
    this.y = y;
    this.width = w;
    this.height = h;
  }
}

function installLaya() {
  const Laya = {
    Sprite,
    Text,
    TextInput,
    Stage,
    Rectangle,
    Event: { CLICK: "click", RESIZE: "resize", MOUSE_DOWN: "mousedown", MOUSE_MOVE: "mousemove" },
    timer: {
      frameLoop: () => {},
      clearAll: () => {},
      delta: 16,
    },
    init: async () => {},
    MouseManager: { disableDragDetection: () => {} },
  };
  Laya.stage = new Stage();
  Laya.Stage = {
    ALIGN_CENTER: "center",
    ALIGN_MIDDLE: "middle",
    SCALE_SHOWALL: "showall",
    SCALE_FIXED_AUTO: "fixedauto",
    SCREEN_HORIZONTAL: "horizontal",
    SCREEN_VERTICAL: "vertical",
  };
  global.Laya = Laya;
  return Laya;
}

/** Node 侧浏览器全局的最小桩 */
function installBrowserStubs() {
  if (typeof global.window === "undefined") {
    global.window = {
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  }
  const store = new Map();
  if (typeof global.localStorage === "undefined") {
    global.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    };
  }
  if (typeof global.navigator === "undefined") {
    global.navigator = { maxTouchPoints: 0 };
  }
}

module.exports = { installLaya, installBrowserStubs, Node, Sprite, Text };
