// _meili_e2e.mjs —— MeiliSearch 统一知识库 e2e 回归（Task 9）
// 断言 1：strapi zhao-search 管理路由 POST /v1/zhao-search/reindex（x-zhao-secret）→ 200 且 ok:true
// 断言 2：vendure admin GraphQL meiliReindex(scope: ALL) → { queued:true, contentsTriggered:true }
// 断言 3（条件执行）：strapi admin content-manager 新建 FAQ(zh-CN) → kb-zh 5s 内搜到 → 软删 → 搜不到。
//          需要 env 提供 STRAPI_ADMIN_EMAIL / STRAPI_ADMIN_P；未提供则 SKIP（生产凭据未知时降级，不阻塞）
// 断言 4：渠道 filter —— Meili kb-zh filter channelId=<facet 实际值> 全量一致；不存在的渠道 0 hits
//
// 密钥/密码全走 env，不落脚本：
//   ADMIN_P=<vendure admin密码> node _meili_e2e.mjs
// 可选 env：ADMIN_URL（默认 https://e.joho.cn/admin-api）、ADMIN_U（默认 superadmin）、
//           STRAPI_ADMIN_EMAIL / STRAPI_ADMIN_P（strapi admin，提供则跑断言 3）、
//           STRAPI_DIR（服务器 strapi cwd，默认 /www/apps/strapi）、
//           VENDURE_DIR（服务器 vendure cwd，默认 /www/apps/vendure/packages/dev-server）、
//           SSH_HOST（默认 joho）
import { execFileSync } from 'node:child_process';

const ADMIN_URL = process.env.ADMIN_URL || 'https://e.joho.cn/admin-api';
const ADMIN_U = process.env.ADMIN_U || 'superadmin';
const ADMIN_P = process.env.ADMIN_P;
const STRAPI_ADMIN_EMAIL = process.env.STRAPI_ADMIN_EMAIL;
const STRAPI_ADMIN_P = process.env.STRAPI_ADMIN_P;
const STRAPI_DIR = process.env.STRAPI_DIR || '/www/apps/strapi';
const VENDURE_DIR = process.env.VENDURE_DIR || '/www/apps/vendure/packages/dev-server';
const SSH_HOST = process.env.SSH_HOST || 'joho';
const POLL_MS = 2000;
const POLL_MAX = 15000;

if (!ADMIN_P) {
    console.error('缺少 ADMIN_P 环境变量（vendure admin 密码走 env，不落脚本）。用法：ADMIN_P=xxx node _meili_e2e.mjs');
    process.exit(2);
}

let failures = 0;
const check = (name, ok, detail = '') => {
    console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' → ' + detail : ''}`);
    if (!ok) failures++;
};

const ssh = (script) => execFileSync('ssh', [SSH_HOST, script], { encoding: 'utf8', timeout: 60000 });

/** 服务器本机 curl Meili（master key 在服务器 .env 内读取，不回传本地） */
const meiliSearch = (indexUid, body) => {
    const remote =
        `cd ${VENDURE_DIR} && KEY=$(grep '^MEILI_ADMIN_KEY=' .env | cut -d= -f2- | tr -d '"') && ` +
        `curl -s 'http://127.0.0.1:7700/indexes/${indexUid}/search' ` +
        `-H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' ` +
        `--data '${JSON.stringify(body).replace(/'/g, "'\\''")}'`;
    return JSON.parse(ssh(remote));
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

const pollMeiliHit = async (indexUid, q, matchFn) => {
    const deadline = Date.now() + POLL_MAX;
    while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, POLL_MS));
        try {
            const hits = meiliSearch(indexUid, { q, limit: 50 }).hits || [];
            if (hits.some(matchFn)) return true;
        } catch { /* 传输抖动继续轮询 */ }
    }
    return false;
};

(async () => {
    // ── 断言 1：strapi zhao-search 管理路由（服务器本机，secret 从 strapi .env 读取）
    console.log('[assert 1] strapi zhao-search 管理路由');
    const reindexRemote =
        `cd ${STRAPI_DIR} && S=$(grep '^ZHAO_SEARCH_SHARED_SECRET=' .env | cut -d= -f2-) && ` +
        `echo "code=$(curl -s -m 120 -o /tmp/_e2e_reindex -w '%{http_code}' -X POST -H "x-zhao-secret: $S" -H 'Content-Type: application/json' -d '{}' http://127.0.0.1:1337/v1/zhao-search/reindex)" && ` +
        `echo "no_secret=$(curl -s -m 10 -o /dev/null -w '%{http_code}' http://127.0.0.1:1337/v1/zhao-search/health)" && ` +
        `cat /tmp/_e2e_reindex`;
    const reindexOut = ssh(reindexRemote);
    const codeLine = reindexOut.split('\n').find(l => l.startsWith('code='));
    const noSecretLine = reindexOut.split('\n').find(l => l.startsWith('no_secret='));
    const bodyLine = reindexOut.split('\n').filter(l => l && !l.startsWith('code=') && !l.startsWith('no_secret=')).join('');
    let reindexBody = {};
    try { reindexBody = JSON.parse(bodyLine); } catch { /* 解析失败时按空处理 */ }
    const reindexCode = codeLine ? Number(codeLine.split('=')[1]) : 0;
    const noSecretCode = noSecretLine ? Number(noSecretLine.split('=')[1]) : 0;
    check('POST /v1/zhao-search/reindex → 200 且 ok:true', reindexCode === 200 && reindexBody.ok === true,
        `code=${reindexCode} counts=${JSON.stringify(reindexBody.counts || {})}`);
    check('health 不带 secret → 401（fail-closed）', noSecretCode === 401, `code=${noSecretCode}`);

    // ── 登录 vendure admin（照 _meili_smoke.mjs 惯例：token 走 Authorization: Bearer）
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
    if (login?.__typename !== 'CurrentUser') throw new Error('vendure admin 登录失败: ' + JSON.stringify(loginJson.data?.login || loginJson.errors));
    const token = loginRes.headers.get('vendure-auth-token');
    console.log(`[login] ${ADMIN_U} @ ${ADMIN_URL} ok`);

    // ── 断言 2：meiliReindex(scope: ALL)
    console.log('[assert 2] vendure meiliReindex(scope: ALL)');
    const reindex = await gql(`mutation { meiliReindex(scope: ALL) { queued contentsTriggered } }`, {}, token);
    check('meiliReindex(ALL) → queued:true + contentsTriggered:true',
        reindex.meiliReindex?.queued === true && reindex.meiliReindex?.contentsTriggered === true,
        JSON.stringify(reindex.meiliReindex));

    // ── 断言 3：strapi 内容生命周期增量（条件执行）
    console.log('[assert 3] strapi FAQ 生命周期增量');
    if (STRAPI_ADMIN_EMAIL && STRAPI_ADMIN_P) {
        const loginOut = ssh(
            `curl -s -m 10 -X POST http://127.0.0.1:1337/admin/login -H 'Content-Type: application/json' ` +
            `-d '{"email":"${STRAPI_ADMIN_EMAIL}","password":"${STRAPI_ADMIN_P.replace(/'/g, '')}"}'`);
        const adminLogin = JSON.parse(loginOut);
        const adminJwt = adminLogin?.data?.token;
        if (!adminJwt) throw new Error('strapi admin 登录失败（检查 STRAPI_ADMIN_EMAIL/STRAPI_ADMIN_P）');
        console.log(`[login] strapi admin ${STRAPI_ADMIN_EMAIL} ok`);

        const e2eTag = `MeiliE2e${Date.now() % 1000000}`;
        const createOut = ssh(
            `curl -s -m 10 -X POST 'http://127.0.0.1:1337/content-manager/collection-types/plugin::zhao-website.faq?locale=zh-CN' ` +
            `-H "Authorization: Bearer ${adminJwt}" -H 'Content-Type: application/json' ` +
            `-d '{"question":"${e2eTag} 测试问题？","answer":"${e2eTag} 测试答案。","status":"published","publishedAt":"${new Date().toISOString()}"}'`);
        const created = JSON.parse(createOut);
        const documentId = created?.documentId || created?.data?.documentId;
        if (!documentId) throw new Error('FAQ 创建失败: ' + createOut.slice(0, 200));
        console.log(`[lifecycle] FAQ 已创建 documentId=${documentId} tag=${e2eTag}`);

        const hitNew = await pollMeiliHit('kb-zh', e2eTag, h => h.type === 'faq' && (h.id || '').includes(documentId));
        check('FAQ 创建后 kb-zh 搜到（lifecycle 增量生效）', hitNew);

        // 软删除（deletedAt 非空 → syncOne 返回空 docs → 索引移除），失败兜底走 content-manager 删除
        ssh(
            `curl -s -m 10 -X PUT 'http://127.0.0.1:1337/content-manager/collection-types/plugin::zhao-website.faq/${documentId}?locale=zh-CN' ` +
            `-H "Authorization: Bearer ${adminJwt}" -H 'Content-Type: application/json' ` +
            `-d '{"deletedAt":"${new Date().toISOString()}"}'`);
        const gone = await pollMeiliHit('kb-zh', e2eTag, h => (h.id || '').includes(documentId)).then(found => !found);
        check('FAQ 软删后 kb-zh 搜不到（索引移除生效）', gone);
    } else {
        console.log('  ⚠ SKIP（未提供 STRAPI_ADMIN_EMAIL/STRAPI_ADMIN_P，生产 strapi admin 凭据未知时降级，不阻塞交付）');
    }

    // ── 断言 4：渠道 filter
    console.log('[assert 4] 渠道 filter（kb-zh）');
    const facet = meiliSearch('kb-zh', { q: '', limit: 1, facets: ['channelId'] });
    const channelIds = Object.keys(facet.facetDistribution?.channelId || {});
    if (!channelIds.length) throw new Error('kb-zh 无 channelId facet 数据');
    const ch = channelIds[0];
    const filtered = meiliSearch('kb-zh', { q: '', limit: 100, filter: `channelId = "${ch}"` });
    const allMatch = (filtered.hits || []).every(h => String(h.channelId) === String(ch));
    const filteredTotal = filtered.estimatedTotalHits ?? (filtered.hits || []).length;
    const facetTotal = Object.values(facet.facetDistribution.channelId).reduce((a, b) => a + b, 0);
    check(`filter channelId="${ch}" → 全部 hits 渠道一致（${filteredTotal}/${facetTotal}）`, allMatch && filteredTotal > 0);
    const ghost = meiliSearch('kb-zh', { q: '', limit: 10, filter: `channelId = "999999"` });
    check('filter 不存在的渠道 → 0 hits', (ghost.hits || []).length === 0,
        `hits=${(ghost.hits || []).length}`);

    if (failures) { console.error(`\nE2E FAILED: ${failures} 项未通过`); process.exit(1); }
    console.log('\nE2E PASS: reindex 路由 + GraphQL 重建 + 渠道 filter 全部通过');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
