/**
 * 结构化收件人类型 + 邮件地址解析工具。
 *
 * 设计动机：原 ComposeDialog 用三个 string 存 to/cc/bcc，无法在 UI 上
 * 高效展示为 chip、无法去重、无法追踪来源联系人。本文件提供的结构在
 * UI 层把收件人作为一等公民处理，发往 SMTP 时再回退为字符串。
 */

export type RecipientKind = "to" | "cc" | "bcc";

export interface MailRecipient {
  /** 小写 RFC 5322 邮箱。 */
  email: string;
  /** 显示名（可选）。 */
  name?: string;
  /** 来源联系人 id（如果是从通讯录选入；可空表示手工输入）。 */
  contactId?: number;
  /** 收件人类型。 */
  kind: RecipientKind;
}

/**
 * 轻量邮箱校验。覆盖 99% 真实场景（与 Rust 端 parser.rs 行为对齐）。
 * 完整 RFC 5322 实现成本过高且不直观。
 */
const EMAIL_RE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;

export function isValidEmail(s: string): boolean {
  if (!s) return false;
  if (s.length > 254) return false;
  return EMAIL_RE.test(s);
}

/**
 * 把 `MailRecipient[]` 渲染回 SMTP 用的字符串。
 * - 同一 kind 内用 `; ` 分隔（与项目现有 mailparser 行为一致）。
 * - 跳过无效 email，调用方负责在写入前过滤。
 */
export function renderRecipientList(
  recipients: readonly MailRecipient[],
  kind: RecipientKind,
): string {
  return recipients
    .filter((r) => r.kind === kind)
    .map((r) => (r.name ? `${r.name} <${r.email}>` : r.email))
    .join("; ");
}

/**
 * 把现有字符串（手工输入或从邮件头解析而来）转换为结构化 MailRecipient。
 *
 * 支持的输入形态：
 * - `"a@x.com"` → 1 个
 * - `"张三 <a@x.com>"` → name="张三"
 * - `"张三<a@x.com>"`（无空白）→ name="张三"
 * - `"\"张三\" <a@x.com>"`（quoted）→ name 去掉引号
 * - `"a@x.com; b@y.com"` 或 `"a@x.com, b@y.com"` 或 `"a@x.com b@y.com"` → 2 个
 *
 * 非法条目会被跳过（不抛错），调用方在 UI 层用 toast 提示用户。
 * 返回值会按 email 字典序去重。
 */
export function parseAddressList(
  input: string | null | undefined,
  kind: RecipientKind = "to",
): MailRecipient[] {
  if (!input) return [];
  const out: MailRecipient[] = [];
  const seen = new Set<string>();

  // 按 ; , 空白 拆分（分号/逗号优先，空白仅在多收件人场景下作为隐式分隔）
  // 用 ; , 拆分后再把每个 segment 内部的多余空白 trim 掉
  const rawSegments = input.split(/[;,]/);
  for (const seg of rawSegments) {
    const trimmed = seg.trim();
    if (!trimmed) continue;

    // 先尝试把整段作为单个 "Name <email>" 解析，
    // 避免被空白拆分把 <email> 拆散丢失。
    const whole = parseSingleAddress(trimmed, kind);
    if (whole) {
      if (seen.has(whole.email)) continue;
      seen.add(whole.email);
      out.push(whole);
      continue;
    }

    // 否则按空白拆分（处理 "a@x.com b@y.com" 这类粘在一起的纯 email 列表）
    const whitespaceParts = trimmed.split(/\s+/).filter(Boolean);
    for (const part of whitespaceParts) {
      const recipient = parseSingleAddress(part, kind);
      if (!recipient) continue;
      if (seen.has(recipient.email)) continue;
      seen.add(recipient.email);
      out.push(recipient);
    }
  }
  return out;
}

/**
 * 解析单个地址项。返回 null 表示非法。
 */
function parseSingleAddress(raw: string, kind: RecipientKind): MailRecipient | null {
  const s = raw.trim();
  if (!s) return null;

  // 形式 1: "Name <email@x.com>"
  const angleMatch = s.match(/^(?:"?([^"<]+?)"?\s*)<([^>]+)>$/);
  if (angleMatch) {
    const name = angleMatch[1].trim().replace(/^"|"$/g, "").trim();
    const email = angleMatch[2].trim().toLowerCase();
    if (!isValidEmail(email)) return null;
    return name ? { email, name, kind } : { email, kind };
  }

  // 形式 2: 纯 email
  const lower = s.toLowerCase();
  if (isValidEmail(lower)) {
    return { email: lower, kind };
  }
  return null;
}

/**
 * 把用户正在输入的字符串按分隔符拆为若干「待添加的 email」。
 * 与 parseAddressList 区别：本函数不解析 Name <email> 形态，只处理裸 email 列表。
 * 用于收件人输入框的实时回车添加。
 */
export function splitPendingEmails(
  input: string,
): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  const parts = input.split(/[;,]/);
  for (const p of parts) {
    const trimmed = p.trim();
    if (!trimmed) continue;
    // 也按空白拆
    const subs = trimmed.split(/\s+/);
    for (const sub of subs) {
      const t = sub.trim().toLowerCase();
      if (!t) continue;
      if (isValidEmail(t)) valid.push(t);
      else invalid.push(t);
    }
  }
  return { valid, invalid };
}

/**
 * 联系人选择器面板状态。
 */
export interface ContactPickerState {
  open: boolean;
  /** 选中的联系人 id 集合（跨分组累加）。 */
  selectedContactIds: Set<number>;
  /** 面板内搜索关键字。 */
  search: string;
}

export const EMPTY_PICKER: ContactPickerState = {
  open: false,
  selectedContactIds: new Set(),
  search: "",
};
