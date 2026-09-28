export const NAMESPACES = [
  'token', 'board.tile', 'board.inner', 'board.center',
  'building', 'prop', 'piece', 'dice', 'card', 'fx', 'ui',
] as const;

export type Namespace = (typeof NAMESPACES)[number];

// 段规则：小写字母开头，可含大小写字母/数字；段数 1–2（building 固定两段尾）
const SEG = '[a-z][a-zA-Z0-9]*';
// 单段命名空间允许 1–2 段尾；`building` 固定「<slot>.<part>」两段尾
const SINGLE = NAMESPACES.filter((n) => n !== 'building').join('|').replace(/\./g, '\\.');
export const ELEMENT_ID_RE = new RegExp(`^(?:(?:${SINGLE})(?:\\.${SEG}){1,2}|building(?:\\.${SEG}){2})$`);

export function isElementId(id: string): boolean {
  return ELEMENT_ID_RE.test(id);
}

export function namespaceOf(id: string): string {
  for (const ns of NAMESPACES) {
    if (id === ns || id.startsWith(ns + '.')) return ns;
  }
  return '';
}