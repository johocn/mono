# 租户后台数据多语言打通（方案 A：先打通链路）

日期：2026-10-01
状态：设计已确认

## 背景

多租户商城的「后台数据多语言」目前是断的。实测三处断点：

1. **C 端 locale 未映射到 Vendure 语言码**。`nshop/layers/base/app/utils/schemes.ts` 的 `VENDURE_LOCALE_MAP` 只有 `zh-CN → zh_Hans`、`en-US → en`；`nshop/app/app.vue` 直接用 `locale.value` 拼 `?languageCode=de-DE`。Vendure 对该参数**只做格式校验、不做枚举校验**（`vendure/packages/core/src/service/helpers/request-context/request-context.service.ts`，正则 `^[a-zA-Z0-9_-]+$`），原样当语言码去查翻译行，查不到就回退 `channel.defaultLanguageCode`。结论：**即使录了德语译文，不改这里也照样显示中文。**
2. **线上 t2 渠道只启用一种语言**。实测 `GET https://www.youshop.cn/shop-api?languageCode=de`（`vendure-token: 66ruvnhh34svhckaa2i`）返回 `availableLanguageCodes: ["zh_Hans"]`、`defaultLanguageCode: zh_Hans`；换成 `de-DE` 或 `de`，分类名仍是中文。
3. **web-admin 端完全没接语言开关**。店铺信息页没有任何语言配置入口，商品表单只有写死的中/英两页签。

## 目标

按「先打通链路」的最小闭环，让德语能端到端跑通，并让其他语言只靠配置即可启用：

- web-admin 店铺信息页新增**语言选项**（默认语言 + 已开启语言）。
- **只有开启的语言才出现多语言输入项**；未开启多语言时只剩默认语言一个槽位（默认即「只输中文」）。
- 后台数据**默认中、英双语**，语言集合与字段结构对新增语言**零迁移**。
- 打通后：后台开 `de` → 商品录入德语文案 → C 端切德语看到**德文分类名/商品名/方案库文案**。

## 非目标

- 不改 vendure 后端 resolvers / service（既有能力已满足，见下）。
- 不改 `vendure/packages/dashboard` 的租户设置多语言页（那是另一个端）。
- 本次不做 `operationalCopy`（租户名/服务须知/发票抬头）的多语言录入 UI，字段在接口中预留。
- 不做「关闭某语言即删除其译文」的清理动作，译文保留。

## 关键既有能力（复用，不重写）

| 能力 | 位置 | 说明 |
| --- | --- | --- |
| `tenantSettings(channelId)` | `vendure/packages/cjk-plugin/src/admin/tenant-config-admin.resolver.ts` | 返回 `multiLanguage`（`defaultLanguageCode` / `availableLanguageCodes` / `translationWorkflowEnabled` / `operationalCopy`） |
| `updateTenantMultiLanguage(input:{channelId, patch})` | 同上 | 写入并**同步 Vendure 原生渠道语言字段** |
| `MultiLanguageConfigService.update` | `vendure/packages/cjk-plugin/src/tenant/multi-language-config.service.ts` | 写 `channel.customFields.multiLanguageConfig`，并同步 `availableLanguages` / `defaultLanguageCode`；这正是断点 ② 的解药 |
| `multiLanguageConfig` customField | `vendure/packages/cjk-plugin/src/tenant/tenant-channel-custom-fields.ts` | struct：`availableLanguageCodes: string[]`、`defaultLanguageCode: string`、`translationWorkflowEnabled: boolean`、`operationalCopyJson: text` |
| `upsertProductTranslation(id, lang, t)` | `vshop/web-admin/src/apis/product.ts` | **已是语言无关**的通用函数，直接消费任意 `languageCode` |
| Vendure `translations[]` | 商品 / 分类 / 变体 | 原生多语言数组，新增语言零迁移 |
| Vendure `LanguageCode` 枚举 | `vendure/packages/common/src/generated-types.ts` | 共 12 种：`bg de en es fa fr it ja ko pt ru zh_Hans` |

## 设计

### 1. 数据模型

**语言集合（唯一真相源）**：`Channel.customFields.multiLanguageConfig.availableLanguageCodes` + `defaultLanguageCode`，与 Vendure 原生 `availableLanguages` / `defaultLanguageCode` 由后端 service 保证一致。

**默认值**：`availableLanguageCodes = ['zh_Hans', 'en']`，`defaultLanguageCode = 'zh_Hans'`。`zh_Hans` 锁定必选（作为兜底语言，不可关闭）；默认语言只能从已开启语言中选。

**字段结构（全部天然多语言，无写死两列）**：

- 商品名 / slug / 描述 / 卖点 → Vendure 原生 `translations[]`（改走通用 `upsertProductTranslation`）。
- 分类名 → Vendure 原生 `Collection.translations[]`（本次不改读写逻辑，仅靠语言码打通即可生效）。
- 方案库（`channel.customFields.promoSchemes` / `serviceSchemes`）→ `[{ code, text: { [languageCode]: string } }]`。**该结构现在就已经是 map**，只是 UI 写死了 `zh_Hans` / `en` 两列，老数据无需迁移。

**语言清单常量**：web-admin 新增 `src/constants/languages.ts`，按 Vendure 枚举列出 12 种 `{ code, label }`（如 `{ code: 'zh_Hans', label: '简体中文' }`、`{ code: 'de', label: 'Deutsch' }`），UI 与提交共用同一份，禁止各处再写死字符串。

### 2. web-admin 改动

#### 2.1 新增租户设置 API：`src/apis/tenant-settings.ts`

- `fetchTenantMultiLanguage(channelId)` → 调 `tenantSettings(channelId)`，取 `multiLanguage`。
- `updateTenantMultiLanguage(channelId, patch)` → 调同名 mutation，`patch = { availableLanguageCodes, defaultLanguageCode }`。
- 通道选择：**优先走 `updateTenantMultiLanguage`**（后端会同步 Vendure 原生语言字段，且是更窄的授权面）。若线上租户 token 无该权限，回退 `myUpdateChannelCustomFields`（`src/apis/channel.ts` 已存在，泛型透传）。

#### 2.2 店铺信息页新增「多语言」卡片：`src/pages/decorate/shop-info/index.vue`

- `onMounted` 追加 `fetchTenantMultiLanguage`，回填已开启语言与默认语言。
- 卡片结构：
  - **默认语言**：只列已开启语言，单选。
  - **已开启语言**：12 种语言逐行「语言名 + 开/关」，`zh_Hans` 行显示「锁定」且不可关。
- `save()` 时附带提交语言配置（与既有 `myUpdateChannelCustomFields` 负载分离，两个调用互不影响）。
- 方案库明细行（促销 / 服务）从「code + 中文 + English」三个固定输入框，改为「code + 按已开启语言动态出列」：每个已开启语言一个输入框，占位符为语言名。内置模板区仍只展示中英两行（模板库只维护中英），其他语言留空由运营填写。
- 方案库序列化：`loadSchemeList` 直接返回 `{ code, text }`（不再拆 zh/en）；`toSchemePayload` 序列化 `{ code, text }` 并过滤空值与空 code。

#### 2.3 商品表单泛化：`src/components/ProductForm.vue`

- 删除写死的中/英双页签与 `nameEn` / `slugEn` / `descriptionEn` 三个双槽位。
- **基准槽位 = 默认语言**（`defaultLanguageCode`），对应现有的 `d.name` / `d.slug` / `d.description`；其余已开启语言走新增的 `d.i18n: Record<languageCode, { name, slug, description }>`。
- 页签栏：`availableLanguageCodes.length > 1` 时才渲染，页签 = 已开启语言（显示语言名）；**长度为 1 时整条页签栏不渲染，只输默认语言**。
- `d.i18n` 的读写改为按当前页签语言键取/存，替换现在的 `lang === 'zh' ? ... : ...` 三元逻辑。
- `onMounted` 的语言来源从 `customFields.multilingualEnabled` 改为语言配置（见下）。

#### 2.4 废弃 `multilingualEnabled` 布尔开关

`Channel.customFields.multilingualEnabled` 与语言配置是两个真相源，会互相打架。统一以 `availableLanguageCodes.length > 1` 判定「是否多语言」，`multilingualEnabled` 不再读写（schema 字段保留不删，避免影响既有数据）。

#### 2.5 保存与回填：`src/apis/product.ts`、`src/pages/product/edit/index.vue`

- `ProductSaveInput` 去掉 `nameEn` / `slugEn` / `descriptionEn` / `sellingPointEn`，新增 `i18n?: Record<languageCode, { name, slug, description, sellingPoint? }>`。
- `createProductFull` / `updateProductFull`：遍历 `i18n`，逐个调 `upsertProductTranslation(pid, code, {...})`（函数已语言无关，签名不变）。基准语言仍走原有的 `updateProduct` / 创建入参路径。
- `fetchProductFull`：从 `translations[]` 组装 `i18n` map（不再派生 `nameEn` / `slugEn` / `descriptionEn`）。
- 编辑页 `initial` 改为传 `i18n`，删除 `nameEn` / `slugEn` / `descriptionEn` 回填。

#### 2.6 分类名多语言化：`src/pages/product/categories/index.vue`、`src/apis/collection.ts`

现状：`collection.ts` 里 `LAN` 写死 `zh_Hans`，`createTenantCollection` / `renameCollection` 只写一行中文 translation；分类页用 `uni.showModal({ editable: true })` 的单输入框取名。不改造则 C 端永远拿不到德文分类名。

- `collection.ts`：`LAN` 由写死常量改为传入的「默认语言」；`createTenantCollection` / `renameCollection` 改为接收按语言分的名称映射，一次性写入多条 `translations`（每个已开启语言一行，未填则回退默认语言文案）。
- `categories/index.vue`：`promptName` 的 `uni.showModal` 单输入改为自研弹窗——已开启语言只有 1 种时仍是单输入框（行为不变），多于 1 种时按语言逐行出输入框，默认语言行必填。
- 分类树只展示默认语言名（列表不因语言而变），译文仅用于 C 端展示与提交。

#### 2.7 i18n 词条

新增的语言卡片、页签、方案库动态列、分类多语言弹窗等文案，同步补 `src/locale/zh-Hans.json` 与 `src/locale/en.json`，禁止单语言写死。

### 3. C 端改动（nshop）

- `nshop/layers/base/app/utils/schemes.ts`：`VENDURE_LOCALE_MAP` 由 2 条补到 12 条（`de-DE → de`、`ja-JP → ja`、`ko-KR → ko`、`pt-BR → pt`、`bg-BG → bg`、`ru-RU → ru`、`fa-IR → fa`、`es-ES → es`、`fr-FR → fr`、`it-IT → it`，外加既有 `zh-CN → zh_Hans`、`en-US → en`）。同一文件导出纯函数 `toVendureLanguageCode(locale, fallback = 'zh_Hans')`，映射缺失时回退默认语言码而不是原样透传。
- `nshop/app/app.vue`：`useGqlHost(...)` 的 `?languageCode=` 改用 `toVendureLanguageCode(locale.value)`。
- 方案库文案读取复用既有 `localizeSchemeText`，补齐映射后自动支持；回退链保持「当前语言 → 默认语言 → 首个值」。

### 4. 验收与回归

链路验收（德语为样例）：

1. web-admin 店铺信息页开启 `de`、保存 → 回读 `tenantSettings` 确认 `availableLanguageCodes` 含 `de`。
2. `shop-api?languageCode=de` 返回 `availableLanguageCodes` 含 `de`（断点 ② 消除）。
3. 商品表单出现德文页签 → 录入德语名称并保存 → admin-api 查该商品 `translations` 含 `de`。
4. 分类页新建/重命名分类时出现德文输入行 → 录入后 admin-api 查该 Collection `translations` 含 `de`。
5. 店铺信息页方案库按已开启语言出列 → 填德语后 `customFields.promoSchemes` 的 `text` 含 `de` 键。
6. C 端切德语（`?languageCode=de`）→ 商品名、分类名、方案库文案为德文，未录译文的字段回退中文（断点 ① 消除）。

回归与交付物：

- 语言开关关闭时，商品表单不出现页签栏，只能输中文（原行为保留）。
- 手机视口截图 390×844（dpr = 2）：店铺信息语言卡片、商品表单德文页签、C 端德文商品页。
- 操作手册补「多语言配置」章节 + 上述截图。
- web-admin 与 nshop 的 e2e/回归按既有脚本跑通。

## 风险与边界

- **权限**：`updateTenantMultiLanguage` 要求 `Authenticated` 且限本渠道。若线上租户 token 报权限错误，回退 `myUpdateChannelCustomFields` 写 `multiLanguageConfig`（但该路径不会同步 Vendure 原生语言字段，需在实施时验证并明确取舍）。
- **缓存**：`?languageCode=` 变化可能影响 SSR 缓存键，实施时验证多语言页面不被错误缓存为单语言。
- **译文保留**：关闭某语言不删除其译文，重新开启即可恢复，避免误删。
- **语言名展示**：UI 语言名用各语言的本族名（Deutsch / 日本語 / Français），不随界面语言翻译。
