// _meili_smoke.mjs —— MeiliSearch 知识库线上冒烟（Task 6）
// 断言 1：admin GraphQL meiliIndexStats 返回 kb-zh/kb-en 且 healthy:true
// 断言 2：增量链路 —— admin 改一个商品 zh 名称 → Meili kb-zh 能搜到新标题；还原后能搜回原标题
//
// 用法（脚本不含任何明文密钥/admin 密码，均走 env）：
//   ADMIN_P=<admin密码> node _meili_smoke.mjs
// 可选 env：ADMIN_URL（默认 https://e.joho.cn/admin-api）、ADMIN_U（默认 superadmin）、
//           VENDURE_DIR（服务器 vendure cwd，默认 /www/apps/vendure/packages/dev-server）、
//           SSH_HOST（默认 joho）
import { execFileSync } from 'node:child_process';

const ADMIN_URL = process.env.ADMIN_URL || 'https://e.joho.cn/admin-api';
const ADMIN_U = process.env.ADMIN_U || 'superadmin';
const ADMIN_P = process.env.ADMIN_P;
const VENDURE_DIR = process.env.VENDURE_DIR || '/www/apps/vendure/packages/dev-server';
const SSH_HOST = process.env.SSH_HOST || 'joho';
const POLL_MS = 3000;
const POLL_MAX = 30000;

if (!ADMIN_P) {
    console.error('缺少 ADMIN_P 环境变量（admin 密码走 env，不落脚本）。用法：ADMIN_P=xxx node _meili_smoke.mjs');
    process.exit(2);
}

let failures = 0;
const check = (name, ok, detail = '') => {
    console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' → ' + detail : ''}`);
    if (!ok) failures++;
};

const gql = async (query, variables, token) => {
    const res = await fetch(ADMIN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        body: JSON.stringify({ query, variables: variables || {} }),
    });
    const json = await res.json();
    if (json.errors?.length) throw new Error('GraphQL error: ' + json.errors[0].message);
    return json.data;
};

/** 服务器本机 curl Meili（master key 在服务器 .env 内读取，不回传本地） */
const meiliSearch = (indexUid, q) => {
    const remote =
        `cd ${VENDURE_DIR} && KEY=$(grep '^MEILI_ADMIN_KEY=' .env | cut -d= -f2- | tr -d '"') && ` +
        `curl -s 'http://127.0.0.1:7700/indexes/${indexUid}/search' ` +
        `-H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' ` +
        `--data '${JSON.stringify({ q, limit: 50 })}'`;
    const out = execFileSync('ssh', [SSH_HOST, remote], { encoding: 'utf8', timeout: 30000 });
    return JSON.parse(out);
};

const pollMeiliHit = async (indexUid, q, productId) => {
    const deadline = Date.now() + POLL_MAX;
    while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, POLL_MS));
        try {
            const hits = meiliSearch(indexUid, q).hits || [];
            if (hits.some(h => h.id === `product-${productId}`)) return true;
        } catch { /* 传输抖动继续轮询 */ }
    }
    return false;
};

(async () => {
    // ── 登录（照 _verify_a1_deploy.mjs 惯例：vendure-auth-token 响应头取 token）
    const loginRes = await fetch(ADMIN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            query: 'mutation($u:String!,$p:String!){ login(username:$u,password:$p,rememberMe:true){ __typename ...on CurrentUser{ id identifier } ...on ErrorResult{ errorCode message } } }',
            variables: { u: ADMIN_U, p: ADMIN_P },
        }),
    });
    const loginJson = await loginRes.json();
    const login = loginJson.data?.login;
    if (login?.__typename !== 'CurrentUser') throw new Error('admin 登录失败: ' + JSON.stringify(loginJson.data?.login || loginJson.errors));
    const token = loginRes.headers.get('vendure-auth-token');
    console.log(`[login] ${ADMIN_U} @ ${ADMIN_URL} ok`);

    // ── 断言 1：索引统计
    const stats = await gql(`query { meiliIndexStats { index documents healthy } }`, {}, token);
    console.log('[stats]', JSON.stringify(stats.meiliIndexStats));
    const byIndex = new Map(stats.meiliIndexStats.map(s => [s.index, s]));
    check('kb-zh 存在且 healthy', byIndex.get('kb-zh')?.healthy === true);
    check('kb-en 存在且 healthy', byIndex.get('kb-en')?.healthy === true);

    // ── 断言 2：增量链路（选一个有 zh_Hans 翻译的商品改名 → 搜到 → 还原 → 搜回）
    const products = await gql(
        `query { products(options: { take: 100, sort: { id: DESC } }) { items { id name translations { languageCode name } } } }`,
        {}, token,
    );
    const candidate = products.products.items.find(p => p.translations?.some(t => t.languageCode === 'zh_Hans'));
    if (!candidate) throw new Error('未找到含 zh_Hans 翻译的商品');
    const productId = candidate.id;
    const origName = candidate.translations.find(t => t.languageCode === 'zh_Hans').name;
    const smokeTag = `MeiliSmoke${Date.now() % 1000000}`;
    const smokeName = `${smokeTag}-${origName}`.slice(0, 200);
    console.log(`[incremental] product ${productId}「${origName}」→「${smokeName}」`);

    await gql(`mutation($i: UpdateProductInput!) { updateProduct(input: $i) { __typename } }`,
        { i: { id: productId, translations: [{ languageCode: 'zh_Hans', name: smokeName }] } }, token);
    const hitNew = await pollMeiliHit('kb-zh', smokeTag, productId);
    check('Meili kb-zh 搜到新标题（增量同步生效）', hitNew);

    // 还原商品名
    await gql(`mutation($i: UpdateProductInput!) { updateProduct(input: $i) { __typename } }`,
        { i: { id: productId, translations: [{ languageCode: 'zh_Hans', name: origName }] } }, token);
    const hitRestore = await pollMeiliHit('kb-zh', origName, productId);
    check('Meili kb-zh 搜回原标题（商品已还原）', hitRestore);

    const stats2 = await gql(`query { meiliIndexStats { index documents healthy } }`, {}, token);
    console.log('[stats after]', JSON.stringify(stats2.meiliIndexStats));

    if (failures) { console.error(`\nSMOKE FAILED: ${failures} 项未通过`); process.exit(1); }
    console.log('\nSMOKE PASS: 索引统计 + 增量链路全部通过');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
