/**
 * vcf.ts smoke test — 6 parse case + 1 serialize round-trip.
 *
 * 运行方式（项目无 Vitest，参照 parseAddressList 模式）：
 *   1. tsc 把本文件编到 dist-test/vcf.test.js
 *      tsc src/lib/vcf.test.ts --target es2020 --module commonjs --outDir dist-test \
 *          --moduleResolution node --esModuleInterop --skipLibCheck
 *   2. node dist-test/lib/vcf.test.js
 *
 * 6 parse case 覆盖：
 *   1. 基础单张 vCard（FN / EMAIL / TEL）
 *   2. 多张 vCard 串（连续 BEGIN/END）
 *   3. FN 缺失，回退到 N 拼装
 *   4. TYPE 参数（TYPE=WORK,HOME）
 *   5. 行折叠（CRLF + 空格续行）
 *   6. 中文 / 多字节 UTF-8
 */

import { parseVcf, serializeVcf, type VcfContact } from "./vcf"

let passed = 0
let failed = 0
const failures: string[] = []

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++
  } else {
    failed++
    failures.push(msg)
  }
}

function eq<T>(actual: T, expected: T, msg: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) {
    failed++
    failures.push(`${msg}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`)
  } else {
    passed++
  }
}

// ─── 1. 基础单张 vCard ───
{
  const input = `BEGIN:VCARD
VERSION:3.0
FN:Alice Smith
EMAIL;TYPE=WORK:alice@x.com
TEL:+1234567890
END:VCARD`
  const cards = parseVcf(input)
  assert(cards.length === 1, "case 1: should parse 1 card")
  if (cards[0]) {
    eq(cards[0].fullName, "Alice Smith", "case 1: FN")
    eq(cards[0].emails.length, 1, "case 1: email count")
    eq(cards[0].emails[0]?.value, "alice@x.com", "case 1: email value")
    eq(cards[0].emails[0]?.types, ["WORK"], "case 1: email type")
    eq(cards[0].phones[0]?.value, "+1234567890", "case 1: phone")
  }
}

// ─── 2. 多张 vCard 串 ───
{
  const input = `BEGIN:VCARD
VERSION:3.0
FN:Alice
EMAIL:a@x.com
END:VCARD
BEGIN:VCARD
VERSION:3.0
FN:Bob
EMAIL:b@x.com
END:VCARD`
  const cards = parseVcf(input)
  assert(cards.length === 2, "case 2: should parse 2 cards")
  eq(cards[0]?.fullName, "Alice", "case 2: card 0 name")
  eq(cards[1]?.fullName, "Bob", "case 2: card 1 name")
  eq(cards[1]?.emails[0]?.value, "b@x.com", "case 2: card 1 email")
}

// ─── 3. FN 缺失，回退到 N ───
{
  const input = `BEGIN:VCARD
VERSION:3.0
N:Smith;Alice;M.;Dr.;PhD
EMAIL:a@x.com
END:VCARD`
  const cards = parseVcf(input)
  assert(cards.length === 1, "case 3: should parse 1 card")
  if (cards[0]) {
    // 预期 FN 拼接顺序：prefix given middle family suffix
    eq(cards[0].fullName, "Dr. Alice M. Smith PhD", "case 3: FN fallback from N")
    eq(cards[0].structuredName?.family, "Smith", "case 3: N.family")
    eq(cards[0].structuredName?.given, "Alice", "case 3: N.given")
    eq(cards[0].structuredName?.middle, "M.", "case 3: N.middle")
    eq(cards[0].structuredName?.prefix, "Dr.", "case 3: N.prefix")
    eq(cards[0].structuredName?.suffix, "PhD", "case 3: N.suffix")
  }
}

// ─── 4. TYPE 多值参数（HOME,WORK）───
{
  const input = `BEGIN:VCARD
VERSION:3.0
FN:Alice
EMAIL;TYPE=HOME,WORK:alice@x.com
END:VCARD`
  const cards = parseVcf(input)
  assert(cards.length === 1, "case 4: should parse 1 card")
  if (cards[0]) {
    eq(cards[0].emails[0]?.types, ["HOME", "WORK"], "case 4: multi TYPE")
  }
}

// ─── 5. 行折叠（CRLF + 前导空格续行）───
{
  const input = "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Alice Smith the\r\n  Second\r\nEMAIL:a@x.com\r\nEND:VCARD"
  const cards = parseVcf(input)
  assert(cards.length === 1, "case 5: should parse 1 card")
  if (cards[0]) {
    // RFC 6350：CRLF + WSP → 去掉 CRLF，保留 WSP 作为内容。
    // "Alice Smith the\r\n  Second" → "Alice Smith the  Second"（保留两个空格）
    eq(cards[0].fullName, "Alice Smith the  Second", "case 5: folded FN")
  }
}

// ─── 6. 中文 / UTF-8（多字节）───
{
  const input = `BEGIN:VCARD
VERSION:3.0
FN:张三
N:张;三;;先生;
EMAIL;TYPE=WORK:zhangsan@x.com
ORG:Acme\;研发部
END:VCARD`
  const cards = parseVcf(input)
  assert(cards.length === 1, "case 6: should parse 1 card")
  if (cards[0]) {
    eq(cards[0].fullName, "张三", "case 6: FN Chinese")
    eq(cards[0].structuredName?.family, "张", "case 6: N.family Chinese")
    eq(cards[0].structuredName?.given, "三", "case 6: N.given Chinese")
    eq(cards[0].structuredName?.prefix, "先生", "case 6: N.prefix Chinese")
    // ORG 反义 \; → ;
    eq(cards[0].organization, "Acme;研发部", "case 6: ORG unescape")
  }
}

// ─── 7. serialize round-trip ───
{
  const original: VcfContact[] = [
    {
      fullName: "Alice Smith",
      structuredName: { family: "Smith", given: "Alice", middle: "M.", prefix: "Dr." },
      emails: [{ value: "alice@x.com", types: ["WORK"] }],
      phones: [{ value: "+1234567890", types: ["CELL"] }],
      organization: "Acme;研发部",
      note: "Line 1\nLine 2, with comma",
      categories: ["Work", "Important"],
      addresses: [
        { street: "123 Main St", city: "Beijing", region: "BJ", postalCode: "100000", country: "CN" },
      ],
      raw: {},
    },
    {
      fullName: "Bob",
      emails: [{ value: "bob@x.com", types: [] }],
      phones: [],
      categories: [],
      addresses: [],
      raw: {},
    },
  ]
  const serialized = serializeVcf(original)
  const reparsed = parseVcf(serialized)
  assert(reparsed.length === 2, "round-trip: should reparse 2 cards")
  if (reparsed[0]) {
    eq(reparsed[0].fullName, "Alice Smith", "round-trip: fullName")
    eq(reparsed[0].structuredName?.family, "Smith", "round-trip: N.family")
    eq(reparsed[0].structuredName?.prefix, "Dr.", "round-trip: N.prefix")
    eq(reparsed[0].emails[0]?.value, "alice@x.com", "round-trip: email value")
    eq(reparsed[0].emails[0]?.types, ["WORK"], "round-trip: email types")
    eq(reparsed[0].phones[0]?.value, "+1234567890", "round-trip: phone value")
    // ORG 已被 escape + unescape 来回
    eq(reparsed[0].organization, "Acme;研发部", "round-trip: organization")
    eq(reparsed[0].note, "Line 1\nLine 2, with comma", "round-trip: note escapes")
    eq(reparsed[0].categories, ["Work", "Important"], "round-trip: categories")
    eq(reparsed[0].addresses[0]?.city, "Beijing", "round-trip: address city")
  }
  if (reparsed[1]) {
    eq(reparsed[1].fullName, "Bob", "round-trip: card 2 name")
    eq(reparsed[1].emails[0]?.value, "bob@x.com", "round-trip: card 2 email")
  }
}

// ─── 报告 ───
console.log(`\n  passed: ${passed}`)
console.log(`  failed: ${failed}`)
if (failed > 0) {
  console.log("\n  failures:")
  for (const f of failures) console.log(`    - ${f}`)
  process.exit(1)
} else {
  console.log("  all vcf tests passed ✓")
}
