// 酒店订单行 e2e：加购 2 晚 → 断言数量/单价/行小计/逐晚明细
const API = process.env.SHOP_API || 'http://localhost:3020/shop-api';
const TOKEN = process.env.CHANNEL_TOKEN || '66ruvnhh34svhckaa2i'; // t2
const VARIANT_ID = process.env.HOTEL_VARIANT_ID;

if (!VARIANT_ID) {
  console.error('缺少 HOTEL_VARIANT_ID 环境变量');
  process.exit(1);
}

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

const CHECK_IN = '2026-02-14';
const CHECK_OUT = '2026-02-16';

const add = await gql(
  `mutation($v: ID!, $q: Int!, $cf: OrderLineCustomFieldsInput) {
     addItemToOrder(productVariantId: $v, quantity: $q, customFields: $cf) {
       __typename
       ... on Order { lines { id quantity unitPriceWithTax linePriceWithTax customFields { hotelCheckIn hotelCheckOut hotelNights } } }
       ... on ErrorResult { errorCode message }
     }
   }`,
  { v: VARIANT_ID, q: 2, cf: { hotelCheckIn: CHECK_IN, hotelCheckOut: CHECK_OUT, hotelNights: 2 } },
);

const line = add.addItemToOrder.lines.find(l => l.customFields?.hotelCheckIn === CHECK_IN);
const assertions = [
  ['数量=2', line?.quantity === 2],
  ['单价=94000', line?.unitPriceWithTax === 94000],
  ['行小计=188000', line?.linePriceWithTax === 188000],
];

const boxes = await gql(`query { orderBoxes { lines { orderLineId isHotel hotelCheckIn hotelCheckOut hotelNights productSlug hotelNightly { date priceCent type } } } }`);
const boxLine = boxes.orderBoxes.flatMap(b => b.lines).find(l => l.hotelCheckIn === CHECK_IN);
assertions.push(['orderBoxes.isHotel=true', boxLine?.isHotel === true]);
// 真实数据：02-14（周六，非节假日）取 basePriceCent 88000；02-15 命中春节 holiday 段 = 100000
assertions.push(['逐晚 02-14=88000/weekend', boxLine?.hotelNightly?.[0]?.priceCent === 88000 && boxLine.hotelNightly[0].type === 'weekend']);
assertions.push(['逐晚 02-15=100000/holiday', boxLine?.hotelNightly?.[1]?.priceCent === 100000 && boxLine.hotelNightly[1].type === 'holiday']);
assertions.push(['productSlug 非空（供修改日期跳回）', !!boxLine?.productSlug]);

let failed = 0;
for (const [name, ok] of assertions) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failed++;
}
process.exit(failed ? 1 : 0);
