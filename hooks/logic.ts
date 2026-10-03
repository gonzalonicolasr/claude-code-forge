export type Phase = 'clarify' | 'explore' | 'plan' | 'analyze' | 'build' | 'veredicto'
export type Verdict = 'pasa' | 'corregir' | 'replantear'
export type Decision = 'continue' | 'replan'
export type Mode = 'interactive' | 'automatic'
export type RunStatus = 'running' | 'pasa' | 'no-verificado' | 'bloqueado' | 'fallido' | 'parado' | 'cortado'
export type Route = { kind: 'cpam'; model: string } | { kind: 'claude'; alias?: string; model?: string }

export const PHASES: readonly Phase[] = ['clarify', 'explore', 'plan', 'analyze', 'build', 'veredicto']
export const OPTIONAL_PHASES: readonly Phase[] = ['clarify', 'analyze']
export const VERDICTS: readonly Verdict[] = ['pasa', 'corregir', 'replantear']
export const REPLAN_CAP = 2
export const CLAUDE_ALIASES = ['haiku', 'sonnet', 'opus', 'fable']

export const PHASE_TOOLS: Record<Phase, string[]> = {
  clarify: ['Read', 'Glob', 'Grep', 'Bash'],
  explore: ['Read', 'Glob', 'Grep', 'Bash'],
  analyze: ['Read', 'Glob', 'Grep', 'Bash'],
  plan: ['Read', 'Glob', 'Grep', 'Bash', 'Write', 'Edit'],
  build: ['Read', 'Glob', 'Grep', 'Bash', 'Write', 'Edit'],
  veredicto: ['Read', 'Glob', 'Grep', 'Bash'],
}

export const DEFAULT_PROFILES: Record<string, Record<Phase, string>> = {
  turbo: {
    clarify: 'ag3/gemini-3.5-flash-lite',
    explore: 'ag3/gemini-3.5-flash-lite',
    plan: 'prolite/gpt-6-luna',
    analyze: 'prolite/gpt-6-luna',
    build: 'ag3/gemini-3.5-flash-lite',
    veredicto: 'prolite/gpt-6-luna',
  },
  barato: {
    clarify: 'ag3/gemini-3.7-flash-high',
    explore: 'ag3/gemini-3.7-flash-high',
    plan: 'ag3/gemini-3.7-flash-high',
    analyze: 'prolite/gpt-6-luna',
    build: 'ag3/gemini-3.7-flash-high',
    veredicto: 'prolite/gpt-6.1-sol',
  },
  equilibrado: {
    clarify: 'ag3/gemini-3.7-flash-high',
    explore: 'ag3/gemini-3.7-flash-high',
    plan: 'prolite/gpt-6.1-sol',
    analyze: 'prolite/gpt-6-luna',
    build: 'prolite/gpt-6-luna',
    veredicto: 'sonnet',
  },
  calidad: {
    clarify: 'ag3/gemini-3.8-flash-high',
    explore: 'ag3/gemini-3.8-flash-high',
    plan: 'prolite/gpt-6.1-sol',
    analyze: 'prolite/gpt-6-astra',
    build: 'prolite/gpt-6.1-sol',
    veredicto: 'opus',
  },
  'open-source': {
    clarify: 'ds/deepseek-flash',
    explore: 'ds/deepseek-flash',
    plan: 'ds/deepseek-v4-pro',
    analyze: 'ds/deepseek-v4-pro',
    build: 'ds/deepseek-v4-pro',
    veredicto: 'ag3/gpt-oss-120b-medium',
  },
  gemini: {
    clarify: 'ag3/gemini-3.8-flash-high',
    explore: 'ag3/gemini-3.8-flash-high',
    plan: 'ag3/gemini-pro-agent',
    analyze: 'ag3/gemini-pro-agent',
    build: 'ag3/gemini-3.8-flash-high',
    veredicto: 'ag3/gemini-pro-agent',
  },
  openai: {
    clarify: 'prolite/gpt-6-luna',
    explore: 'prolite/gpt-6-luna',
    plan: 'prolite/gpt-6.1-sol',
    analyze: 'prolite/gpt-6.1-sol',
    build: 'prolite/gpt-6.1-sol',
    veredicto: 'prolite/gpt-6-astra',
  },
  'solo-claude': {
    clarify: 'haiku',
    explore: 'haiku',
    plan: 'opus',
    analyze: 'sonnet',
    build: 'sonnet',
    veredicto: 'opus',
  },
}

export const BUILTIN_PROFILES = Object.keys(DEFAULT_PROFILES)

export const EFFORTS = ['auto', 'off', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const
export type Effort = (typeof EFFORTS)[number]
export const AUTO_EFFORTS: Record<Phase, Effort> = { clarify: 'auto', explore: 'auto', plan: 'auto', analyze: 'auto', build: 'auto', veredicto: 'auto' }

export const DEFAULT_EFFORTS: Record<string, Record<Phase, Effort>> = {
  turbo: { clarify: 'minimal', explore: 'minimal', plan: 'low', analyze: 'low', build: 'low', veredicto: 'low' },
  barato: { clarify: 'low', explore: 'low', plan: 'medium', analyze: 'medium', build: 'medium', veredicto: 'high' },
  equilibrado: { clarify: 'low', explore: 'medium', plan: 'high', analyze: 'high', build: 'medium', veredicto: 'high' },
  calidad: { clarify: 'medium', explore: 'high', plan: 'xhigh', analyze: 'high', build: 'high', veredicto: 'xhigh' },
  'open-source': { clarify: 'medium', explore: 'medium', plan: 'high', analyze: 'high', build: 'high', veredicto: 'high' },
  gemini: { clarify: 'low', explore: 'medium', plan: 'high', analyze: 'high', build: 'high', veredicto: 'high' },
  openai: { clarify: 'low', explore: 'medium', plan: 'xhigh', analyze: 'high', build: 'high', veredicto: 'xhigh' },
  'solo-claude': { clarify: 'medium', explore: 'medium', plan: 'high', analyze: 'high', build: 'high', veredicto: 'xhigh' },
}

export function isEffort(v: unknown): v is Effort {
  return EFFORTS.includes(v as Effort)
}

export function cpamModel(model: string, effort: Effort | undefined): string {
  if (!effort || effort === 'auto' || /\)$/.test(model)) return model
  return `${model}(${effort === 'off' ? 'none' : effort})`
}

export function effortBlocked(model: string): string {
  const m = String(model || '')
  if (/gpt-oss/.test(m)) return 'gpt-oss ignora el effort (medido: mismo razonamiento con none y xhigh)'
  if (/deepseek-flash/.test(m)) return 'deepseek-flash ignora el effort (medido: mismo razonamiento con none y xhigh)'
  if (m.startsWith('oc/')) return 'OpenCode no responde por el CPAM (falta x-opencode-session): sin verificar'
  if (/^glm-/.test(m)) return 'GLM directo sin saldo (429): sin verificar'
  return ''
}

export function claudeEffort(effort: Effort | undefined): 'low' | 'medium' | 'high' | 'xhigh' | undefined {
  if (!effort || effort === 'auto') return undefined
  return effort === 'off' || effort === 'minimal' ? 'low' : effort
}

export function phaseOfAgentType(type: string | undefined): Phase | undefined {
  const m = /^forge:(clarify|explore|plan|analyze|build|veredicto)$/.exec(String(type || ''))
  return m ? (m[1] as Phase) : undefined
}

export function routeFor(model: string): Route {
  const m = String(model || '').trim()
  if (CLAUDE_ALIASES.includes(m)) return { kind: 'claude', alias: m }
  if (/^claude-/.test(m)) return { kind: 'claude', model: m }
  return { kind: 'cpam', model: m }
}

export function parseVerdict(text: string): Verdict | undefined {
  const s = String(text || '')
  const tagged = [...s.matchAll(/veredicto[\s*_]*[:=][\s*_`"']*(pasa|corregir|replantear)\b/gi)]
  if (tagged.length) return tagged[tagged.length - 1][1].toLowerCase() as Verdict
  const last = s.trim().split('\n').filter((l) => l.trim()).at(-1) || ''
  const bare = /^[\s*_`#>-]*(pasa|corregir|replantear)[\s*_`.!]*$/i.exec(last)
  return bare ? (bare[1].toLowerCase() as Verdict) : undefined
}

export function parseDecision(text: string): Decision | undefined {
  const all = [...String(text || '').matchAll(/decision[\s*_]*[:=][\s*_`"']*(continue|replan)\b/gi)]
  return all.length ? (all[all.length - 1]![1]!.toLowerCase() as Decision) : undefined
}

export function parseClarifyStatus(text: string): 'continue' | 'blocked' | undefined {
  const s = String(text || '')
  const m = /##\s*Status\b[^\n]*\n?[\s*_`>:-]*(continue|blocked)\b/i.exec(s) || /\bstatus[\s*_]*[:=][\s*_`"']*(continue|blocked)\b/i.exec(s)
  return m ? (m[1]!.toLowerCase() as 'continue' | 'blocked') : undefined
}

export function phaseAnswerOk(phase: Phase, text: string): boolean {
  const t = String(text || '').trim()
  if (phase === 'clarify') return t.length >= 40 && parseClarifyStatus(t) !== undefined
  if (phase === 'analyze') return parseDecision(t) !== undefined
  if (phase === 'veredicto') return parseVerdict(t) !== undefined
  return t.length >= 40
}

export function pickAnswer(phase: Phase, final: string, steps: readonly string[]): string {
  if (phaseAnswerOk(phase, final)) return final
  for (let i = steps.length - 1; i >= 0; i--) if (phaseAnswerOk(phase, steps[i]!)) return steps[i]!
  return final
}

export function section(text: string, title: string): string {
  const lines = String(text || '').split('\n')
  const start = lines.findIndex((l) => new RegExp(`^##\\s+${title}\\b`, 'i').test(l))
  if (start < 0) return ''
  const end = lines.findIndex((l, i) => i > start && /^##\s+/.test(l))
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim()
}

export function phaseOrder(skip: readonly Phase[] = []): Phase[] {
  return PHASES.filter((p) => !(OPTIONAL_PHASES.includes(p) && skip.includes(p)))
}

export type Step = { next?: Phase; status: RunStatus; retry?: boolean }
export type Outcome = 'ok' | 'fail' | Verdict | Decision

export function advance(phase: Phase, outcome: Outcome, ctx: { rounds: number; cap: number; retried: boolean; order?: readonly Phase[]; replans?: number }): Step {
  const order = ctx.order || PHASES
  if (phase === 'veredicto' && !VERDICTS.includes(outcome as Verdict)) outcome = 'fail'
  if (phase === 'analyze' && outcome !== 'continue' && outcome !== 'replan') outcome = 'fail'
  if (outcome === 'fail') return ctx.retried ? { status: 'fallido' } : { next: phase, status: 'running', retry: true }
  if (phase === 'analyze' && outcome === 'replan') return (ctx.replans || 0) >= REPLAN_CAP ? { status: 'bloqueado' } : { next: 'plan', status: 'running' }
  if (phase === 'veredicto') {
    if (outcome === 'pasa') return { status: 'pasa' }
    if (ctx.rounds >= ctx.cap) return { status: 'no-verificado' }
    return { next: outcome === 'corregir' ? 'build' : 'plan', status: 'running' }
  }
  const next = order[order.indexOf(phase) + 1]
  return next ? { next, status: 'running' } : { status: 'fallido' }
}

export type TaskItem = { id: string; done: boolean; files: number; depends: string[] | null; evidence: string; review: number | null; reviewRaw: string | null }

export function parseTasks(text: string): TaskItem[] {
  const tasks: TaskItem[] = []
  let cur: TaskItem | undefined
  let collecting = false
  for (const line of String(text || '').split(/\r?\n/)) {
    const head =
      /^\s*- \[([ xX])\]\s+\**(T\d{3,})\b/.exec(line) || /^#{2,3}\s+\[([ xX])\]\s+(T\d{3,})\b/.exec(line) || /^###\s+()(T\d{3,})\b/.exec(line)
    if (head) {
      cur = { id: head[2]!, done: /x/i.test(head[1] || ''), files: 0, depends: null, evidence: '', review: null, reviewRaw: null }
      tasks.push(cur)
      collecting = false
      continue
    }
    if (!cur) continue
    const field = /^\s*-\s+(files|depends|evidence|review):\s*(.*)$/.exec(line)
    if (!field) {
      if (collecting && /^\s*(-\s+)?`[^`]+`/.test(line)) cur.files += (line.match(/`[^`]+`/g) || []).length
      else if (collecting && line.trim()) collecting = false
      continue
    }
    collecting = field[1] === 'files'
    const value = (field[2] || '').trim()
    if (field[1] === 'files') cur.files = (value.match(/`[^`]+`/g) || []).length || (value ? 1 : 0)
    else if (field[1] === 'depends') cur.depends = /^(\[\s*\]|none|n\/a|-)?$/i.test(value) ? [] : [...new Set(value.match(/\bT\d+\b/g) || [])]
    else if (field[1] === 'evidence') cur.evidence = value
    else {
      cur.reviewRaw = value
      const m = /~?(\d+)\s*(?:changed\s+)?lines?/i.exec(value) || /~?(\d+)/.exec(value)
      cur.review = m ? Number(m[1]) : null
    }
  }
  return tasks
}

export function validateTasks(text: string): string[] {
  const tasks = parseTasks(text)
  if (!tasks.length) return ['tasks.md has no T### tasks']
  const order = new Map(tasks.map((t, i) => [t.id, i]))
  const out: string[] = []
  tasks.forEach((t, i) => {
    if (!t.files) out.push(`${t.id} is missing its files list`)
    if (t.depends === null) out.push(`${t.id} is missing its depends list`)
    else
      for (const d of t.depends) {
        const at = order.get(d)
        if (d === t.id) out.push(`${t.id} depends on itself`)
        else if (at === undefined) out.push(`${t.id} depends on unknown ${d}`)
        else if (at > i) out.push(`${t.id} depends on later task ${d}`)
      }
    if (!t.evidence) out.push(`${t.id} is missing evidence`)
    if (t.reviewRaw === null) out.push(`${t.id} is missing its review estimate`)
  })
  return out
}

export const BATCH_LINES = 800
export const BATCH_TASKS = 4

export function buildBatches(tasks: readonly TaskItem[]): string[][] {
  const out: string[][] = []
  let cur: string[] = []
  let lines = 0
  for (const t of tasks.filter((x) => !x.done)) {
    const est = t.review ?? 0
    if (cur.length && (cur.length >= BATCH_TASKS || lines + est > BATCH_LINES)) {
      out.push(cur)
      cur = []
      lines = 0
    }
    cur.push(t.id)
    lines += est
  }
  if (cur.length) out.push(cur)
  return out
}

export function slugify(text: string, taken: readonly string[] = []): string {
  const words = String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  let base = ''
  for (const w of words) {
    if ((base ? base.length + 1 : 0) + w.length > 40) break
    base = base ? `${base}-${w}` : w
  }
  base = base || 'run'
  let slug = base
  for (let i = 2; taken.includes(slug); i++) slug = `${base}-${i}`
  return slug
}

export type StartArgs = { request: string; mode?: Mode; cap?: number; profile?: string }

export function parseStart(args: string): StartArgs {
  const out: StartArgs = { request: '' }
  const rest: string[] = []
  const toks = String(args || '').trim().split(/\s+/).filter(Boolean)
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]
    if (t === '--auto' || t === '--automatic') out.mode = 'automatic'
    else if (t === '--interactive' || t === '--interactivo') out.mode = 'interactive'
    else if (t === '--cap' && /^\d+$/.test(toks[i + 1] || '')) out.cap = Math.max(1, Number(toks[++i]))
    else if (t === '--profile' && toks[i + 1]) out.profile = toks[++i]
    else rest.push(t)
  }
  out.request = rest.join(' ')
  return out
}

export type ModelGroup = { group: string; label?: string; options: { value: string; label: string }[] }

export function groupOf(model: string): string {
  const m = String(model || '')
  if (CLAUDE_ALIASES.includes(m) || /^claude-/.test(m)) return 'claude'
  return m.includes('/') ? m.split('/')[0] : 'cpam'
}

const VENDORS: [RegExp, string][] = [
  [/^claude|haiku|sonnet|opus|fable/, 'Claude'],
  [/^gpt-oss/, 'gpt-oss'],
  [/^(gpt|codex)/, 'GPT'],
  [/^gemini/, 'Gemini'],
  [/^deepseek/, 'DeepSeek'],
  [/^glm/, 'GLM'],
  [/^kimi/, 'Kimi'],
  [/^qwen/, 'Qwen'],
  [/^grok/, 'Grok'],
  [/^minimax/, 'MiniMax'],
  [/^mimo/, 'MiMo'],
]

export function vendorOf(id: string): string {
  const name = id.includes('/') ? id.slice(id.indexOf('/') + 1) : id
  return VENDORS.find(([re]) => re.test(name))?.[1] || 'otros'
}

export function groupLabel(group: string, ids: readonly string[]): string {
  if (group === 'claude') return 'Claude Code (tu plan)'
  const vendors = [...new Set(ids.map(vendorOf))]
  return `${group} · ${vendors.length > 3 ? `${vendors.slice(0, 3).join('/')}…` : vendors.join('/')}`
}

const GROUP_ORDER = ['claude', 'personal', 'priv8', 'prolite', 'plus', 'ag', 'ag2', 'ag3', 'ag4', 'ag5', 'ds', 'oc', 'cpam']

export function versionKey(name: string): { family: string; version: number[]; rest: string } {
  const m = /^(.*?)-?(\d{1,2}(?:[.-]\d{1,2})*)(?!\d)(.*)$/.exec(name)
  if (!m) return { family: name, version: [], rest: '' }
  return { family: m[1], version: m[2].split(/[.-]/).map(Number), rest: m[3] }
}

export function compareModels(a: string, b: string): number {
  const x = versionKey(a)
  const y = versionKey(b)
  if (x.family !== y.family) return x.family.localeCompare(y.family)
  for (let i = 0; i < Math.max(x.version.length, y.version.length); i++) {
    const d = (y.version[i] ?? -1) - (x.version[i] ?? -1)
    if (d) return d
  }
  return x.rest.localeCompare(y.rest)
}

export function compareGroups(a: string, b: string): number {
  const ra = GROUP_ORDER.indexOf(a)
  const rb = GROUP_ORDER.indexOf(b)
  if (ra !== rb) return (ra < 0 ? 99 : ra) - (rb < 0 ? 99 : rb)
  return a.localeCompare(b)
}

export const isExcluded = (id: string, exclude: readonly string[]) => exclude.some((x) => id.toLowerCase().startsWith(`${x.toLowerCase()}/`))

export function modelCatalog(ids: readonly string[], labels: Readonly<Record<string, string>> = {}): ModelGroup[] {
  const keep = [...new Set(ids)].filter((id) => !/image/i.test(id) && !/^claude-/.test(id))
  const byGroup = new Map<string, string[]>()
  for (const id of keep) byGroup.set(groupOf(id), [...(byGroup.get(groupOf(id)) || []), id])
  const name = (id: string) => (id.includes('/') ? id.slice(id.indexOf('/') + 1) : id)
  const groups: ModelGroup[] = [{ group: 'claude', label: groupLabel('claude', []), options: CLAUDE_ALIASES.map((a) => ({ value: a, label: `${a[0].toUpperCase()}${a.slice(1)} (tu plan)` })) }]
  for (const g of [...byGroup.keys()].sort(compareGroups))
    groups.push({
      group: g,
      label: groupLabel(g, byGroup.get(g)!),
      options: byGroup
        .get(g)!
        .sort((a, b) => compareModels(name(a), name(b)))
        .slice(0, 64)
        .map((id) => ({ value: id, label: labels[id] || labels[name(id)] || name(id) })),
    })
  return groups.slice(0, 64)
}

export function shortModel(model: string): string {
  return String(model || '').replace(/^[^/]+\//, '')
}

export function tokens(n: number): string {
  if (!n) return '0'
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n)
}

export function mmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`
}

const KEPT_REMINDERS = /^<system-reminder>\s*(# Environment|Today's date)/

export function privateReminder(block: any): boolean {
  return block?.type === 'text' && /^\s*<system-reminder>/.test(String(block.text || '')) && !KEPT_REMINDERS.test(String(block.text).trim())
}

export function cleanMessages(messages: readonly any[], thinking: ReadonlyMap<string, any[]>): any[] {
  return messages.map((m: any) => {
    if (!Array.isArray(m.content)) return { role: m.role, content: m.content }
    const blocks = m.content.filter((b: any) => b.type !== 'thinking' && b.type !== 'redacted_thinking')
    if (m.role !== 'assistant') {
      const kept = blocks.filter((b: any) => !privateReminder(b))
      return { role: m.role, content: kept.length ? kept : [{ type: 'text', text: '(context omitted)' }] }
    }
    const out: any[] = []
    for (const b of blocks) {
      if (b.type === 'tool_use' && thinking.has(b.id)) out.push(...(thinking.get(b.id) || []))
      out.push(b)
    }
    return { role: m.role, content: out }
  })
}

export function thinkingByTool(content: readonly any[]): Map<string, any[]> {
  const out = new Map<string, any[]>()
  let pending: any[] = []
  for (const b of content || []) {
    if (b.type === 'thinking' || b.type === 'redacted_thinking') pending.push(b)
    else if (b.type === 'tool_use') {
      if (pending.length) out.set(b.id, pending)
      pending = []
    }
  }
  return out
}


export type ExportStatus = 'running' | 'paused' | 'pasa' | 'no-verificado' | 'bloqueado' | 'falló' | 'parado'
export type PhaseStat = { status: 'pending' | 'running' | 'done' | 'error'; model: string; effort?: Effort; answeredBy: string; ms: number; startedAt: number; inTok: number; outTok: number; steps: number }
export type RunView = {
  status: RunStatus
  request: string
  slug: string
  round: number
  cap: number
  phase?: Phase
  order: readonly Phase[]
  startedAt: number
  endedAt?: number
  stats: Record<Phase, PhaseStat>
  verdicts: Verdict[]
  decisions?: Decision[]
  batch?: { index: number; total: number; tasks: string[] }
}
export type StateInput = {
  version: string
  profile: string
  profiles: Record<string, Record<Phase, string>>
  profileEfforts: Record<string, Record<Phase, Effort>>
  zeroProfiles?: readonly string[]
  models: Record<Phase, string>
  efforts: Record<Phase, Effort>
  skip?: readonly Phase[]
  mode: string
  cap: number
  modelIds: readonly string[]
  labels?: Readonly<Record<string, string>>
  run?: RunView
  asking: boolean
  now: number
}

export function exportStatus(status: RunStatus, asking: boolean): ExportStatus {
  if (status === 'running') return asking ? 'paused' : 'running'
  if (status === 'fallido') return 'falló'
  if (status === 'cortado') return 'parado'
  return status
}

export function stateSnapshot(i: StateInput) {
  const zero = i.zeroProfiles || []
  const profiles: Record<string, Record<Phase, string> & { effort: Record<Phase, Effort>; builtin: boolean; source: 'forge' | 'zero-pi' }> = {}
  for (const [name, p] of Object.entries(i.profiles))
    profiles[name] = { ...p, effort: { ...AUTO_EFFORTS, ...(i.profileEfforts[name] || {}) }, builtin: BUILTIN_PROFILES.includes(name) || zero.includes(name), source: zero.includes(name) ? 'zero-pi' : 'forge' }
  const catalog: Record<string, string[]> = {}
  const groupLabels: Record<string, string> = {}
  const labels: Record<string, string> = {}
  for (const g of modelCatalog(i.modelIds, i.labels)) {
    catalog[g.group] = g.options.map((o) => o.value)
    groupLabels[g.group] = g.label || g.group
    for (const o of g.options) labels[o.value] = o.label
  }
  const effortNotes = {} as Record<Phase, string>
  for (const p of PHASES) effortNotes[p] = routeFor(i.models[p]).kind === 'claude' ? '' : effortBlocked(i.models[p])
  const run = i.run
    ? {
        status: exportStatus(i.run.status, i.asking),
        request: i.run.request,
        slug: i.run.slug,
        round: i.run.round,
        cap: i.run.cap,
        phase: i.run.phase ?? null,
        phaseOrder: [...i.run.order],
        startedAt: i.run.startedAt,
        endedAt: i.run.endedAt ?? null,
        batch: i.run.batch ? { index: i.run.batch.index + 1, total: i.run.batch.total, tasks: [...i.run.batch.tasks] } : null,
        phases: i.run.order.map((name) => {
          const s = i.run!.stats[name]
          return {
            name,
            status: s.status === 'error' ? 'failed' : s.status,
            model: s.model,
            effort: s.effort || 'auto',
            responded: s.answeredBy,
            ms: s.status === 'running' ? i.now - s.startedAt : s.ms,
            startedAt: s.startedAt,
            tokensIn: s.inTok,
            tokensOut: s.outTok,
            steps: s.steps,
          }
        }),
        verdicts: [...i.run.verdicts],
        decisions: [...(i.run.decisions || [])],
      }
    : null
  return {
    version: i.version,
    profile: i.profile,
    profiles,
    phaseOrder: phaseOrder(i.skip),
    phases: [...PHASES],
    models: { ...i.models },
    efforts: { ...AUTO_EFFORTS, ...i.efforts },
    effortLevels: [...EFFORTS],
    mode: i.mode === 'preguntar' ? 'ask' : i.mode,
    cap: i.cap,
    catalog,
    groupLabels,
    labels,
    effortNotes,
    run,
    updatedAt: i.now,
  }
}

export function fillPhases<T extends string>(p: Partial<Record<Phase, T>>): Record<Phase, T> {
  return { ...p, clarify: p.clarify ?? p.explore, analyze: p.analyze ?? p.plan } as Record<Phase, T>
}

export function zeroProfiles(raw: unknown, exclude: readonly string[] = []): { profiles: Record<string, Record<Phase, string>>; efforts: Record<string, Record<Phase, Effort>> } {
  const out = { profiles: {} as Record<string, Record<Phase, string>>, efforts: {} as Record<string, Record<Phase, Effort>> }
  const all = (raw as any)?.profiles
  if (!all || typeof all !== 'object') return out
  const core: Phase[] = ['explore', 'plan', 'build', 'veredicto']
  for (const [name, p] of Object.entries<any>(all)) {
    const models = p?.models || {}
    if (exclude.some((x) => name.toLowerCase().includes(x.toLowerCase())) || core.some((ph) => typeof models[ph] !== 'string')) continue
    const picked: Partial<Record<Phase, string>> = {}
    for (const ph of PHASES) if (typeof models[ph] === 'string' && models[ph]) picked[ph] = models[ph]
    const full = fillPhases(picked)
    if (PHASES.some((ph) => isExcluded(full[ph], exclude))) continue
    const key = `zero:${name}`
    out.profiles[key] = full
    const th = p?.thinking || {}
    out.efforts[key] = { ...AUTO_EFFORTS }
    for (const ph of PHASES) if (isEffort(th[ph])) out.efforts[key][ph] = th[ph]
  }
  return out
}
