// 酒店订单行 e2e：加购 N 晚 → 断言数量/单价/行小计/逐晚明细
// 入离日期可用环境变量 CHECK_IN / CHECK_OUT 覆盖，默认沿用旧回归口径 2026-02-14/16。
// 断言均由入离日期推导，换日期无需改脚本；并打印逐晚明细表便于人工核对。
const API = process.env.SHOP_API || 'http://localhost:3020/shop-api';
const TOKEN = process.env.CHANNEL_TOKEN || '66ruvnhh34svhckaa2i'; // t2
const VARIANT_ID = process.env.HOTEL_VARIANT_ID;

if (!VARIANT_ID) {
  console.error('缺少 HOTEL_VARIANT_ID 环境变量');
  process.exit(1);
}

const CHECK_IN = process.env.CHECK_IN || '2026-02-14';
const CHECK_OUT = process.env.CHECK_OUT || '2026-02-16';
const DAY = 86400000;
const nights = Math.round((new Date(`${CHECK_OUT}T00:00:00Z`).getTime() - new Date(`${CHECK_IN}T00:00:00Z`).getTime()) / DAY);
if (!(nights > 0)) {
  console.error(`CHECK_IN/CHECK_OUT 非法：${CHECK_IN} → ${CHECK_OUT}`);
  process.exit(1);
}
// 从 checkIn 起逐日连续的第 i 晚（UTC 计算，避免本地时区偏移）
const nthDate = (i) => new Date(new Date(`${CHECK_IN}T00:00:00Z`).getTime() + i * DAY).toISOString().slice(0, 10);
const expectedDates = Array.from({ length: nights }, (_, i) => nthDate(i));
const yuan = (cent) => `¥${(cent / 100).toFixed(2)}`;

// 维持同一匿名会话（Vendure Shop API 用 cookie 关联活动订单），否则 orderBoxes 查不到刚加购的行
let cookieJar = '';
async function gql(query, variables) {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'vendure-token': TOKEN,
      ...(cookieJar ? { cookie: cookieJar } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  if (setCookies.length) {
    cookieJar = setCookies.map(c => c.split(';')[0]).join('; ');
  }
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

console.log(`场景：${CHECK_IN} → ${CHECK_OUT}（${nights} 晚）`);

const add = await gql(
  `mutation($v: ID!, $q: Int!, $cf: OrderLineCustomFieldsInput) {
     addItemToOrder(productVariantId: $v, quantity: $q, customFields: $cf) {
       __typename
       ... on Order { lines { id quantity unitPriceWithTax linePriceWithTax customFields { hotelCheckIn hotelCheckOut hotelNights } } }
       ... on ErrorResult { errorCode message }
     }
   }`,
  { v: VARIANT_ID, q: nights, cf: { hotelCheckIn: CHECK_IN, hotelCheckOut: CHECK_OUT, hotelNights: nights } },
);

const line = add.addItemToOrder.lines.find(l => l.customFields?.hotelCheckIn === CHECK_IN);

const boxes = await gql(`query { orderBoxes { lines { orderLineId isHotel hotelCheckIn hotelCheckOut hotelNights productSlug hotelNightly { date priceCent type } } } }`);
const boxLine = boxes.orderBoxes.flatMap(b => b.lines).find(l => l.hotelCheckIn === CHECK_IN);

// 逐晚明细表 + 推导合计
const nightly = boxLine?.hotelNightly ?? [];
console.log('\n逐晚明细：');
for (const n of nightly) {
  console.log(`  ${n.date}  ${String(n.type).padEnd(8)} ${yuan(n.priceCent)}`);
}
const stayTotal = nightly.reduce((s, n) => s + n.priceCent, 0);
console.log(`推导合计：${yuan(stayTotal)}（${stayTotal} 分 / ${nights} 晚，日均 ${yuan(Math.round(stayTotal / nights))}）\n`);

const assertions = [
  [`数量=${nights}（=晚数）`, line?.quantity === nights],
  [`unitPriceWithTax=${Math.round(stayTotal / nights)}（=逐晚合计/晚数）`, line?.unitPriceWithTax === Math.round(stayTotal / nights)],
  [`linePriceWithTax=${stayTotal}（=逐晚价之和）`, line?.linePriceWithTax === stayTotal],
  ['orderBoxes.isHotel=true', boxLine?.isHotel === true],
  [`orderBoxes.hotelNights=${nights}`, boxLine?.hotelNights === nights],
  [`逐晚条数=${nights}`, nightly.length === nights],
  ['逐晚日期自 checkIn 起逐日连续', nightly.length === nights && nightly.every((n, i) => n.date === expectedDates[i])],
  ['productSlug 非空（供修改日期跳回）', !!boxLine?.productSlug],
];

let failed = 0;
for (const [name, ok] of assertions) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failed++;
}
process.exit(failed ? 1 : 0);
