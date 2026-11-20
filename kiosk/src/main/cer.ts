/**
 * src/main/cer.ts — 글자 단위 CER (Character Error Rate)
 *
 * P-05 다시 말하기 판단에만 쓴다: 인식률 = 1 − CER, 50% 미만이면 1회 다시 말하기 (SPEC §2).
 * ⚠️ 점수로 남기거나 화면 · 서버로 내보내지 않는다 (CLAUDE.md 금지사항 7 · 9).
 *
 * 계산 방식은 아웃싸운드 프로젝트 `scoringEngine.ts`의 `calculateCER`를 따랐다
 * (문장부호 · 띄어쓰기 제거 후 Levenshtein / max(목표 길이, 인식 길이)).
 * 받아쓰기 프로그램(파이썬) 쪽에서 계산하게 되면 그쪽으로 옮긴다 (V2_PLAN §5).
 */

/** 문장부호 · 특수문자 · 공백을 뺀 글자열 */
export function normalizeForCer(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[.,!?;:'"`~@#$%^&*()[\]{}<>/\\|_+=\-—–…·•°“”‘’]+/g, '')
    .replace(/\s+/g, '')
}

function levenshtein(a: string[], b: string[]): number {
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      row[j] = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + cost)
    }
    prev = row
  }
  return prev[b.length]!
}

/**
 * @param reference 목표 글자
 * @param hypothesis 받아쓰기 결과
 * @returns 0(완전히 같음) ~ 1(전혀 다름)
 */
export function calculateCer(reference: string, hypothesis: string): number {
  // 한글은 음절 하나가 글자 하나다 — 코드 포인트 단위로 센다
  const ref = Array.from(normalizeForCer(reference))
  const hyp = Array.from(normalizeForCer(hypothesis))

  if (ref.length === 0) return 0
  if (hyp.length === 0) return 1

  return levenshtein(hyp, ref) / Math.max(ref.length, hyp.length)
}
