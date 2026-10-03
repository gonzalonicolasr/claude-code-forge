import {
  PHASES,
  PHASE_TOOLS,
  DEFAULT_PROFILES,
  phaseOfAgentType,
  routeFor,
  parseVerdict,
  advance,
  slugify,
  parseStart,
  modelCatalog,
  groupOf,
  tokens,
  mmss,
  cleanMessages,
  thinkingByTool,
  stateSnapshot,
  BUILTIN_PROFILES,
  EFFORTS,
  DEFAULT_EFFORTS,
  AUTO_EFFORTS,
  isEffort,
  cpamModel,
  claudeEffort,
  effortBlocked,
  zeroProfiles,
  isExcluded,
  fillPhases,
  phaseOrder,
  OPTIONAL_PHASES,
  REPLAN_CAP,
  parseDecision,
  parseClarifyStatus,
  pickAnswer,
  modelUnavailable,
  DEFAULT_FALLBACK,
  forgeMayRun,
  section,
  parseTasks,
  validateTasks,
  buildBatches,
} from './logic.ts'
import type { Phase, Verdict, Mode, RunStatus, Effort, Decision, Outcome } from './logic.ts'
import { PHASE_PROMPTS, briefFor, startInstruction, nextInstruction, finalInstruction } from './prompts.ts'

const PANE = 'forge'
const VERSION = '0.3.0'
const CPAM = 'http://127.0.0.1:8317'
const C = {
  violet: '#8b5cf6',
  lime: '#a3e635',
  amber: '#f59e0b',
  red: '#ef4444',
  pink: '#ff4d6d',
  cyan: '#22d3ee',
  text: '#ece2fb',
  muted: '#8a73ad',
  ink: '#140c22',
}
const SPIN = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const AGENT_MODELS = ['haiku', 'sonnet', 'opus', 'fable']

const TOOLS: Record<string, { description: string; input_schema: any }> = {
  Bash: {
    description: 'Run a shell command (bash) and return stdout/stderr. Use absolute paths. Default timeout 120000 ms.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The command to run' },
        description: { type: 'string', description: 'What the command does, 5-10 words' },
        timeout: { type: 'number', description: 'Timeout in milliseconds (max 600000)' },
      },
      required: ['command'],
    },
  },
  Read: {
    description: 'Read a file from the local filesystem. file_path must be absolute. Returns lines numbered from 1.',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path of the file' },
        offset: { type: 'number', description: 'Line to start from' },
        limit: { type: 'number', description: 'How many lines to read' },
      },
      required: ['file_path'],
    },
  },
  Glob: {
    description: 'Find files by glob pattern (e.g. "**/*.ts"), sorted by modification time.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'The glob pattern' },
        path: { type: 'string', description: 'Absolute directory to search in' },
      },
      required: ['pattern'],
    },
  },
  Grep: {
    description: 'Search file contents with a regular expression (ripgrep).',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regular expression' },
        path: { type: 'string', description: 'Absolute file or directory to search in' },
        glob: { type: 'string', description: 'Glob to filter files, e.g. "*.js"' },
        output_mode: { type: 'string', enum: ['content', 'files_with_matches', 'count'], description: 'Default files_with_matches' },
        '-i': { type: 'boolean', description: 'Case insensitive' },
        '-n': { type: 'boolean', description: 'Show line numbers (content mode)' },
        type: { type: 'string', description: 'File type, e.g. js, py' },
        head_limit: { type: 'number', description: 'Limit the number of results' },
      },
      required: ['pattern'],
    },
  },
  Edit: {
    description: 'Replace an exact string in a file. Read the file first. old_string must match exactly and be unique unless replace_all is true.',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path of the file' },
        old_string: { type: 'string', description: 'Exact text to replace' },
        new_string: { type: 'string', description: 'Replacement text' },
        replace_all: { type: 'boolean', description: 'Replace every occurrence' },
      },
      required: ['file_path', 'old_string', 'new_string'],
    },
  },
  Write: {
    description: 'Write a whole file (creates or overwrites). Read an existing file before overwriting it. Absolute path.',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path of the file' },
        content: { type: 'string', description: 'The whole content' },
      },
      required: ['file_path', 'content'],
    },
  },
}

type Stat = { status: 'pending' | 'running' | 'done' | 'error'; model: string; effort?: Effort; answeredBy: string; ms: number; startedAt: number; inTok: number; outTok: number; steps: number }
type Run = {
  slug: string
  dir: string
  cwd: string
  request: string
  mode: Mode
  cap: number
  verdicts: Verdict[]
  expected?: Phase
  status: RunStatus
  order: Phase[]
  startedAt: number
  endedAt?: number
  stats: Record<Phase, Stat>
  decisions: Decision[]
  clarified: boolean
  tdd: 'strict' | 'off'
  batches?: string[][]
  batchIdx: number
  blockers?: string
  feedback?: { verdict: Verdict; text: string }
  lastVerdictText?: string
  adjust?: string
  retried: boolean
  retryReason?: string
  note: string
  routing: string[]
  turnId?: string
  awaitTurn: boolean
  inFlight?: string
  asyncSeen: boolean
  owner?: string
}
type Config = { mode: 'preguntar' | Mode; cap: number; profile: string; models: Record<Phase, string>; efforts: Record<Phase, Effort>; skip: Phase[] }

let home = ''
let cpamKey = ''
let headless = false
let frame = 0
let paneOpen = false
let draft = ''
const pickedGroup: Partial<Record<Phase, string>> = {}
let config: Config = { mode: 'preguntar', cap: 3, profile: 'barato', models: { ...DEFAULT_PROFILES.barato }, efforts: { ...DEFAULT_EFFORTS.barato }, skip: [] }
let profiles: Record<string, Record<Phase, string>> = { ...DEFAULT_PROFILES }
let profileEfforts: Record<string, Record<Phase, Effort>> = { ...DEFAULT_EFFORTS }
let modelIds: string[] = []
let modelLabels: Record<string, string> = {}
let zeroNames: string[] = []
let excluded: string[] = []
let modelsNote = 'cargando modelos del CPAM…'
const registerErrors: string[] = []
let run: Run | undefined
let asking = false
let stateDirReady = false
const agentPhase = new Map<string, Phase>()
const answers = new Map<string, string>()
const stepTexts = new Map<string, string[]>()
const handbacks = new Map<string, string>()
const autoAgents = new Set<string>()
const cpamCalls = new Map<string, string>()
const unavailable = new Map<string, number>()
let fallbackModel = DEFAULT_FALLBACK
const HANDBACK_TOOL = {
  name: 'SubagentHandback',
  description: 'Deliver your final report to your caller. The call ends your run, so make it your last step: put your whole report in message.',
  input_schema: { type: 'object', properties: { message: { type: 'string', description: 'your full report' } }, required: ['message'] },
}
const thinking = new Map<string, any[]>()

const now = () => Date.now()
const stamp = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19)
}
const clip = (s: string, n: number) => {
  s = String(s ?? '')
  return s.length > n ? s.slice(0, Math.max(0, n - 1)) + '…' : s
}
const blankStat = (model: string, effort?: Effort): Stat => ({ status: 'pending', model, effort, answeredBy: '', ms: 0, startedAt: 0, inTok: 0, outTok: 0, steps: 0 })
const roundNow = (r: Run) => Math.min(r.cap, r.verdicts.length + (r.expected === 'build' || r.expected === 'veredicto' ? 1 : 0)) || 0
const STATUS_LABEL: Record<RunStatus, string> = {
  running: 'CORRIENDO',
  pasa: 'PASA ✔',
  'no-verificado': 'NO VERIFICADO',
  bloqueado: 'BLOQUEADO',
  fallido: 'FALLÓ',
  parado: 'PARADO',
  cortado: 'CORTADO',
}

const mapValues = <T, U>(o: Record<string, T>, f: (v: T) => U) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v)]))

async function loadConfig($: any) {
  const savedProfiles: any = await $.store.get('profiles').catch(() => undefined)
  if (savedProfiles && typeof savedProfiles === 'object') profiles = { ...DEFAULT_PROFILES, ...mapValues<any, Record<Phase, string>>(savedProfiles, fillPhases) }
  const savedEfforts: any = await $.store.get('profileEfforts').catch(() => undefined)
  if (savedEfforts && typeof savedEfforts === 'object') profileEfforts = { ...DEFAULT_EFFORTS, ...mapValues<any, Record<Phase, Effort>>(savedEfforts, (e) => ({ ...AUTO_EFFORTS, ...e })) }
  try {
    const ex = JSON.parse(String((home ? await $.fs.read(`${home}/.config/forge/exclude.json`).catch(() => '') : '') || '[]'))
    excluded = Array.isArray(ex) ? ex.filter((x) => typeof x === 'string' && x) : []
  } catch {
    excluded = []
  }
  try {
    const fb = JSON.parse(String((home ? await $.fs.read(`${home}/.config/forge/fallback.json`).catch(() => '') : '') || '{}'))
    fallbackModel = typeof fb.model === 'string' && fb.model ? fb.model : DEFAULT_FALLBACK
  } catch {
    fallbackModel = DEFAULT_FALLBACK
  }
  const zeroRaw = home ? await $.fs.read(`${home}/.pi/zero.json`).catch(() => '') : ''
  let zero: any = {}
  try {
    zero = zeroRaw ? JSON.parse(String(zeroRaw)) : {}
  } catch {}
  const z = zeroProfiles(zero, excluded)
  zeroNames = Object.keys(z.profiles)
  profiles = { ...profiles, ...z.profiles }
  profileEfforts = { ...profileEfforts, ...z.efforts }
  const saved: any = await $.store.get('config').catch(() => undefined)
  if (saved && typeof saved === 'object') {
    const base = profiles[saved.profile] || {}
    config = {
      ...config,
      ...saved,
      models: fillPhases({ ...(saved.models ? base : config.models), ...(saved.models || {}) }),
      efforts: { ...AUTO_EFFORTS, ...(profileEfforts[saved.profile] || {}), ...(saved.efforts || {}) },
      skip: Array.isArray(saved.skip) ? saved.skip.filter((p: Phase) => OPTIONAL_PHASES.includes(p)) : [],
    }
  }
}

function own<T>(all: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(all).filter(([n]) => !zeroNames.includes(n)))
}

async function saveConfig($: any) {
  await $.store.set('config', config).catch(() => undefined)
  await exportState($)
}

function currentPhase(r: Run): Phase | undefined {
  return r.order.find((p) => r.stats[p].status === 'running') || r.expected
}

async function exportState($: any) {
  if (headless) return
  if (!home) home = (await $.env.get('HOME').catch(() => '')) || ''
  if (!home) return
  const dir = `${home}/.local/state/forge`
  if (!stateDirReady) {
    const made = await $.process.run(['mkdir', '-p', dir]).catch(() => ({ exitCode: 1 }))
    stateDirReady = made.exitCode === 0
  }
  const snap = stateSnapshot({
    version: VERSION,
    profile: config.profile,
    profiles,
    profileEfforts,
    zeroProfiles: zeroNames,
    models: config.models,
    efforts: config.efforts,
    skip: config.skip,
    labels: modelLabels,
    mode: config.mode,
    cap: config.cap,
    modelIds,
    asking,
    now: now(),
    run: run && {
      status: run.status,
      request: run.request,
      slug: run.slug,
      round: roundNow(run),
      cap: run.cap,
      phase: currentPhase(run),
      order: run.order,
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      stats: run.stats,
      verdicts: run.verdicts,
      decisions: run.decisions,
      batch: run.batches ? { index: run.batchIdx, total: run.batches.length, tasks: run.batches[run.batchIdx] || [] } : undefined,
    },
  })
  await $.fs.write(`${dir}/state.json`, JSON.stringify(snap, null, 2) + '\n').catch(() => undefined)
}

async function nervLoaded($: any) {
  return ((await $.command.list().catch(() => [])) as any[]).some((c: any) => c.name === 'nerv')
}

async function showRun($: any) {
  if (paneOpen || !(await nervLoaded($))) await openPane($)
}

async function fetchModels($: any) {
  const res = await $.http.fetch(`${CPAM}/v1/models`, { headers: { authorization: `Bearer ${cpamKey}` } }).catch((err: any) => ({ ok: false, status: 0, text: String(err) }))
  if (!res.ok) {
    modelsNote = `CPAM sin respuesta (${res.status || 'red'})`
    return
  }
  try {
    modelIds = (JSON.parse(res.text).data || []).map((m: any) => m.id).filter((id: string) => !isExcluded(id, excluded))
    modelsNote = `${modelIds.length} modelos en el CPAM`
  } catch {
    modelsNote = 'lista de modelos ilegible'
  }
  const beta = await $.http.fetch(`${CPAM}/v1beta/models`, { headers: { 'x-goog-api-key': cpamKey } }).catch(() => undefined)
  try {
    for (const m of (beta?.ok ? JSON.parse(beta.text).models : []) || []) {
      const id = String(m?.name || '').replace(/^models\//, '')
      if (id && m.displayName) modelLabels[id] = String(m.displayName)
    }
  } catch {}
  await exportState($)
  $.ui.invalidate('ui.render')
}

async function recentRunDir($: any): Promise<string | undefined> {
  const cwd = await $.session.cwd().catch(() => '')
  if (!cwd) return undefined
  const runs: { dir: string; at: number }[] = []
  for (const d of ((await $.fs.list(`${cwd}/.sdd`).catch(() => [])) as any[]).filter((x: any) => x.kind === 'dir')) {
    const st: any = await $.fs.stat(`${cwd}/.sdd/${d.name}/run.json`).catch(() => undefined)
    if (st?.mtimeMs && now() - st.mtimeMs < 15 * 60000) runs.push({ dir: `${cwd}/.sdd/${d.name}`, at: st.mtimeMs })
  }
  return runs.sort((a, b) => b.at - a.at)[0]?.dir
}

let restoreTriedAt = 0
let sessionId = ''
let inboxSeen = ''
let inboxBusy = false

async function checkInbox($: any) {
  if (inboxBusy || !home || !sessionId) return
  inboxBusy = true
  try {
    const path = `${home}/.local/state/forge/inbox-${sessionId}.json`
    const raw = await $.fs.read(path).catch(() => '')
    if (!raw) return
    const msg = JSON.parse(String(raw))
    if (!msg?.id || msg.id === inboxSeen || msg.done) return
    inboxSeen = msg.id
    if (!msg.at || now() - Number(msg.at) > 30000) return
    const text = await commandText($, String(msg.args || ''))
    await $.fs.write(path, JSON.stringify({ ...msg, done: true, text: text ?? '' }) + '\n').catch(() => undefined)
    $.ui.invalidate('ui.render')
  } catch {
  } finally {
    inboxBusy = false
  }
}

async function restoreRun($: any, agentId?: string) {
  if (run || (!agentId && now() - restoreTriedAt < 30000)) return
  if (!agentId) restoreTriedAt = now()
  let dir = await $.store.get('activeRun').catch(() => undefined)
  if (typeof dir !== 'string' || !dir) dir = await recentRunDir($)
  if (typeof dir !== 'string' || !dir) return
  try {
    const saved = JSON.parse(String((await $.fs.read(`${dir}/run.json`).catch(() => '')) || ''))
    if (!saved || saved.status !== 'running' || run) return
    const sid = await $.session.id().catch(() => '')
    if (!(saved.owner && saved.owner === sid) && !(agentId && saved.inFlight === agentId)) return
    const log = String((await $.fs.read(`${dir}/routing.log`).catch(() => '')) || '')
    run = { ...saved, routing: [...log.split('\n').filter(Boolean), `${stamp()} forge se recargó a mitad del run; sigue desde ${saved.phase || 'la fase en curso'}`] }
    await exportState($)
    $.ui.invalidate('ui.render')
  } catch {}
}

async function persist($: any) {
  await exportState($)
  if (!run) return
  if (!run.owner) run.owner = await $.session.id().catch(() => undefined)
  await $.store.set('activeRun', run.status === 'running' ? run.dir : null).catch(() => undefined)
  const { routing, ...rest } = run
  await $.fs.write(`${run.dir}/run.json`, JSON.stringify(rest, null, 2) + '\n').catch(() => undefined)
  await $.fs.write(`${run.dir}/rounds.json`, JSON.stringify({ cap: run.cap, verdicts: run.verdicts }, null, 2) + '\n').catch(() => undefined)
  await $.fs.write(`${run.dir}/routing.log`, routing.join('\n') + (routing.length ? '\n' : '')).catch(() => undefined)
}

function matchProfile() {
  const match = Object.entries(profiles).find(([n, p]) => PHASES.every((k) => p[k] === config.models[k] && (profileEfforts[n]?.[k] || 'auto') === config.efforts[k]))
  config.profile = match ? match[0] : 'custom'
}

async function setModel($: any, phase: Phase, model: string) {
  config.models = { ...config.models, [phase]: model }
  matchProfile()
  await saveConfig($)
  $.ui.invalidate('ui.render')
}

async function setEffort($: any, phase: Phase, effort: Effort) {
  config.efforts = { ...config.efforts, [phase]: effort }
  matchProfile()
  await saveConfig($)
  $.ui.invalidate('ui.render')
}

async function setProfile($: any, name: string) {
  if (!profiles[name]) return false
  config.profile = name
  config.models = { ...profiles[name] }
  config.efforts = { ...AUTO_EFFORTS, ...(profileEfforts[name] || {}) }
  await saveConfig($)
  $.ui.invalidate('ui.render')
  return true
}

async function openPane($: any) {
  const r = await $.ui.open({ id: PANE, title: 'FORGE' }).catch(() => ({ isPlaced: false }))
  paneOpen = true
  $.ui.invalidate('ui.render')
  return r
}

async function startRun($: any, args: string): Promise<{ error?: string }> {
  if (run && run.status === 'running') return { error: `ya hay un run corriendo (${run.slug}). /forge stop para cortarlo.` }
  const parsed = parseStart(args)
  if (!parsed.request) return { error: 'falta el pedido: /forge [--auto|--interactive] [--cap N] [--profile barato|calidad] <pedido>' }
  if (parsed.profile && !(await setProfile($, parsed.profile))) return { error: `no existe el perfil "${parsed.profile}" (hay: ${Object.keys(profiles).join(', ')})` }
  let mode: Mode = parsed.mode || (config.mode === 'preguntar' ? 'automatic' : config.mode)
  if (!parsed.mode && config.mode === 'preguntar' && !headless) {
    const pick = await $.ui.ask('¿En qué modo corre forge?', { options: ['interactive', 'automatic'], header: 'forge' }).catch(() => 'automatic')
    mode = pick === 'interactive' ? 'interactive' : 'automatic'
  }
  const cwd = await $.session.cwd()
  const taken = ((await $.fs.list(`${cwd}/.sdd`).catch(() => [])) as any[]).map((f: any) => f.name)
  const slug = slugify(parsed.request, taken)
  const dir = `${cwd}/.sdd/${slug}`
  const made = await $.process.run(['mkdir', '-p', dir]).catch((err: any) => ({ exitCode: 1, stderr: String(err) }))
  if (made.exitCode !== 0) return { error: `no pude crear ${dir}: ${made.stderr}` }
  await $.fs.write(`${dir}/request.md`, parsed.request + '\n')
  const stats = {} as Record<Phase, Stat>
  for (const p of PHASES) stats[p] = blankStat(config.models[p], config.efforts[p])
  let sddConfig: any = {}
  try {
    sddConfig = JSON.parse(String((await $.fs.read(`${cwd}/.sdd/config.json`).catch(() => '')) || '{}'))
  } catch {}
  const order = phaseOrder(config.skip)
  run = {
    slug,
    dir,
    cwd,
    request: parsed.request,
    mode,
    cap: parsed.cap || config.cap,
    verdicts: [],
    expected: order[0],
    status: 'running',
    order,
    decisions: [],
    clarified: false,
    tdd: sddConfig?.tdd?.mode === 'off' ? 'off' : 'strict',
    batchIdx: 0,
    startedAt: now(),
    stats,
    retried: false,
    note: '',
    routing: [],
    awaitTurn: true,
    asyncSeen: false,
  }
  run.routing.push(`${stamp()} run ${slug} · modo ${mode} · cap ${run.cap} · perfil ${config.profile} · tdd ${run.tdd} · fases ${order.join(' → ')} · ${order.map((p) => `${p}=${config.models[p]}`).join(' ')}`)
  await persist($)
  return {}
}

async function statusText($: any) {
  const lines = [`forge · perfil ${config.profile} · modo ${config.mode} · cap ${config.cap} · ${modelsNote}`, `fases: ${phaseOrder(config.skip).join(' → ')}`]
  for (const err of registerErrors) lines.push(`⚠ no se registró ${err}`)
  for (const p of PHASES)
    lines.push(`  ${p.padEnd(9)} ${config.skip.includes(p) ? '(salteada) ' : ''}${config.models[p]} · effort ${config.efforts[p]}  → ${routeFor(config.models[p]).kind === 'cpam' ? 'CPAM' : 'Claude Code'}`)
  if (!run) return lines.concat('sin runs en esta sesión').join('\n')
  lines.push(
    `run ${run.slug} · ${STATUS_LABEL[run.status]} · ronda ${run.verdicts.length}/${run.cap} · ${run.verdicts.join(' → ') || 'sin veredictos'} · analyze ${run.decisions.join(' → ') || '—'} · ${mmss((run.endedAt || now()) - run.startedAt)}`,
  )
  for (const p of run.order) {
    const s = run.stats[p]
    if (s.status === 'pending') continue
    lines.push(`  ${p.padEnd(9)} ${s.status.padEnd(7)} ${s.answeredBy || s.model}  ${s.steps} pasos  ${mmss(s.status === 'running' ? now() - s.startedAt : s.ms)}  in ${tokens(s.inTok)} out ${tokens(s.outTok)}`)
  }
  if (run.note) lines.push(`nota: ${run.note}`)
  lines.push(`artefactos: ${run.dir}`)
  return lines.join('\n')
}

async function stopRun($: any, why: string) {
  if (!run || run.status !== 'running') return 'no hay un run corriendo'
  run.status = 'parado'
  run.endedAt = now()
  run.note = why
  run.routing.push(`${stamp()} parado: ${why}`)
  await persist($)
  if (run.turnId) await $.turn.abort({ turnId: run.turnId }).catch(() => undefined)
  $.ui.invalidate('ui.render')
  return `run ${run.slug} parado`
}

async function commandText($: any, args: string): Promise<string | undefined> {
  const [head, ...rest] = args.trim().split(/\s+/)
  const sub = (head || '').toLowerCase()
  if (sub === 'stop' || sub === 'parar') return stopRun($, 'pedido por el usuario')
  if (sub === 'status' || sub === 'estado') return statusText($)
  if (sub === 'profile' || sub === 'perfil') {
    if (rest[0] === 'save' && rest[1]) {
      profiles = { ...profiles, [rest[1]]: { ...config.models } }
      profileEfforts = { ...profileEfforts, [rest[1]]: { ...config.efforts } }
      await $.store.set('profiles', own(profiles)).catch(() => undefined)
      await $.store.set('profileEfforts', own(profileEfforts)).catch(() => undefined)
      config.profile = rest[1]
      await saveConfig($)
      return `perfil ${rest[1]} guardado`
    }
    if ((rest[0] === 'delete' || rest[0] === 'borrar') && rest[1]) {
      if (BUILTIN_PROFILES.includes(rest[1])) return `${rest[1]} es de fábrica, no se borra`
      if (zeroNames.includes(rest[1])) return `${rest[1]} viene de ~/.pi/zero.json: se edita en zero-pi`
      if (!profiles[rest[1]]) return `no existe el perfil ${rest[1]}`
      const { [rest[1]]: _gone, ...left } = profiles
      const { [rest[1]]: _goneEffort, ...leftEfforts } = profileEfforts
      profiles = left
      profileEfforts = leftEfforts
      await $.store.set('profiles', own(profiles)).catch(() => undefined)
      await $.store.set('profileEfforts', own(profileEfforts)).catch(() => undefined)
      if (config.profile === rest[1]) config.profile = 'custom'
      await saveConfig($)
      return `perfil ${rest[1]} borrado`
    }
    if (!rest[0]) return `perfiles: ${Object.keys(profiles).join(', ')} · activo: ${config.profile}`
    return (await setProfile($, rest[0])) ? `perfil ${rest[0]} activo` : `no existe el perfil ${rest[0]}`
  }
  if (sub === 'phase' || sub === 'fase') {
    const phase = rest[0] as Phase
    const on = rest[1] === 'on' || rest[1] === 'si' || rest[1] === 'sí'
    if (!OPTIONAL_PHASES.includes(phase) || (!on && rest[1] !== 'off' && rest[1] !== 'no')) return `uso: /forge phase <${OPTIONAL_PHASES.join('|')}> <on|off>`
    config.skip = on ? config.skip.filter((p) => p !== phase) : [...new Set([...config.skip, phase])]
    await saveConfig($)
    $.ui.invalidate('ui.render')
    return `${phase} ${on ? 'activa' : 'salteada'} · fases ${phaseOrder(config.skip).join(' → ')}`
  }
  if (sub === 'model' || sub === 'modelo') {
    const phase = rest[0] as Phase
    if (!PHASES.includes(phase) || !rest[1]) return `uso: /forge model <${PHASES.join('|')}> <modelo>`
    await setModel($, phase, rest[1])
    return `${phase} → ${rest[1]} (${routeFor(rest[1]).kind === 'cpam' ? 'CPAM' : 'Claude Code'})`
  }
  if (sub === 'effort' || sub === 'esfuerzo') {
    const phase = rest[0] as Phase
    if (!PHASES.includes(phase) || !isEffort(rest[1])) return `uso: /forge effort <${PHASES.join('|')}> <${EFFORTS.join('|')}>`
    await setEffort($, phase, rest[1])
    return `${phase} · effort ${rest[1]}`
  }
  if (sub === 'mode' || sub === 'modo') {
    const m = rest[0] === 'ask' ? 'preguntar' : rest[0]
    if (m !== 'interactive' && m !== 'automatic' && m !== 'preguntar') return 'uso: /forge mode <interactive|automatic|ask>'
    config.mode = m
    await saveConfig($)
    return `modo por defecto ${m}`
  }
  if (sub === 'cap') {
    const n = Number(rest[0])
    if (!Number.isInteger(n) || n < 1) return 'uso: /forge cap <n>'
    config.cap = n
    await saveConfig($)
    return `cap ${n}`
  }
  return undefined
}

function submitLater($: any, text: string) {
  $.clock.after(30, async () => {
    if (run) run.awaitTurn = true
    await $.prompt.submit({ text }).catch(async (err: any) => {
      if (!run) return
      run.note = `no pude mandar la instrucción al modelo principal: ${err} · /forge continue`
      run.routing.push(`${stamp()} ${run.note}`)
      await persist($)
    })
  })
}

function launch($: any) {
  if (!run || !run.expected) return
  $.clock.after(30, async () => {
    if (!run || !run.expected) return
    run.awaitTurn = true
    await $.prompt.submit({ text: startInstruction(run.slug, run.expected) }).catch(async (err: any) => {
      if (!run) return
      run.status = 'fallido'
      run.note = `no pude mandar la instrucción de arranque: ${err}`
      await persist($)
    })
  })
}

async function phaseOf($: any, agentId: string): Promise<Phase | undefined> {
  if (agentPhase.has(agentId)) return agentPhase.get(agentId)
  const info = ((await $.agent.list().catch(() => [])) as any[]).find((a: any) => a.id === agentId)
  const phase = phaseOfAgentType(info?.type)
  if (phase) agentPhase.set(agentId, phase)
  return phase
}

async function postCpam($: any, body: any): Promise<{ ok: boolean; status: number; text: string }> {
  const script = 'curl -sS -H @<(printf "x-api-key: %s\\n" "$(cat "$1")") -H "anthropic-version: 2023-06-01" -H "content-type: application/json" --max-time 590 -w "\\n%{http_code}" --data-binary @- "$2"'
  try {
    const r = await $.process.run(['bash', '-c', script, 'forge', `${home}/.config/cli-proxy-api/api-key.txt`, `${CPAM}/v1/messages`], { stdin: JSON.stringify(body), timeoutMs: 600000 })
    const out = String(r.stdout || '')
    const cut = out.lastIndexOf('\n')
    const status = Number(out.slice(cut + 1)) || 0
    return { ok: status >= 200 && status < 300, status, text: status ? out.slice(0, cut) : String(r.stderr || out).slice(0, 300) }
  } catch (err: any) {
    return { ok: false, status: 0, text: String(err) }
  }
}

async function callCpam($: any, body: any) {
  let last = ''
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await $.clock.sleep(2000 * attempt)
    const res = await postCpam($, body)
    if (res.ok) {
      try {
        return { data: JSON.parse(res.text) }
      } catch {
        last = 'respuesta ilegible'
        continue
      }
    }
    last = `HTTP ${res.status}: ${String(res.text || '').slice(0, 300)}`
    if (res.status && res.status < 500 && res.status !== 429) break
  }
  return { error: last }
}

async function finishPhase($: any, phase: Phase, agentId: string | undefined, content: any) {
  if (!run) return 'forge: sin run'
  const st = run.stats[phase]
  st.ms = now() - st.startedAt
  const fromContent = Array.isArray(content) ? content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n') : ''
  const answer = pickAnswer(phase, String((agentId && (handbacks.get(agentId) || answers.get(agentId))) || fromContent || ''), (agentId && stepTexts.get(agentId)) || [])
  if (agentId) {
    stepTexts.delete(agentId)
    handbacks.delete(agentId)
    autoAgents.delete(agentId)
  }
  const cpamFailed = answer.startsWith('FORGE_CPAM_ERROR')
  const round = run.verdicts.length + 1
  const batch = phase === 'build' && run.batches ? { index: run.batchIdx, total: run.batches.length } : undefined
  let outcome: Outcome = 'ok'
  let reason = ''
  let asked = false
  let stopNow = false
  if (cpamFailed) {
    outcome = 'fail'
    reason = answer.split('\n')[0]
  } else if (phase === 'clarify') {
    const status = parseClarifyStatus(answer)
    if (answer.trim().length < 40 || !status) {
      outcome = 'fail'
      reason = 'clarifications came back without a "## Status" of continue|blocked'
    } else {
      let text = answer.trim()
      if (status === 'blocked' && run.mode === 'interactive' && !headless) {
        asked = true
        asking = true
        await exportState($)
        const questions = section(text, 'Blocking questions') || text
        const pick = await $.ui
          .ask(`forge · clarify necesita una respuesta antes de explorar:\n\n${clip(questions, 1500)}\n\nRespondé en «Other» o seguí con los supuestos.`, { options: ['Seguir con los supuestos', 'Parar'], header: 'forge' })
          .catch(() => 'Parar')
        asking = false
        if (pick === 'Parar') stopNow = true
        else
          text += `\n\n## Resolution\n${pick === 'Seguir con los supuestos' ? 'The user chose to proceed under the recorded assumptions.' : `User answer to the blocking questions (it overrides the assumptions):\n\n${pick}`}`
      } else if (status === 'blocked')
        text += '\n\n## Resolution\nAutomatic mode: nobody could answer the blocking questions, so the run proceeds under the recorded assumptions. Treat them as assumptions, not as confirmed requirements.'
      await $.fs.write(`${run.dir}/clarifications.md`, text + '\n')
      run.clarified = true
      if (status === 'blocked') run.routing.push(`${stamp()} clarify bloqueado · ${asked ? (stopNow ? 'el usuario paró' : 'respondió el usuario') : 'modo automatic: sigue con supuestos'}`)
    }
  } else if (phase === 'explore') {
    if (answer.trim().length < 40) {
      outcome = 'fail'
      reason = 'the findings report came back empty'
    } else await $.fs.write(`${run.dir}/findings.md`, answer.trim() + '\n')
  } else if (phase === 'plan') {
    const missing: string[] = []
    for (const f of ['proposal.md', 'spec.md', 'design.md', 'tasks.md']) {
      const text = await $.fs.read(`${run.dir}/${f}`).catch(() => '')
      if (typeof text !== 'string' || text.trim().length < 20) missing.push(f)
      else if (f === 'tasks.md') {
        const defects = validateTasks(text)
        if (defects.length) missing.push(`tasks.md structure (${defects.slice(0, 8).join('; ')})`)
      }
    }
    if (missing.length) {
      outcome = 'fail'
      reason = `missing, empty or malformed plan artifacts: ${missing.join(', ')}`
    }
  } else if (phase === 'analyze') {
    const d = parseDecision(answer)
    if (!d) {
      outcome = 'fail'
      reason = 'no "Decision: continue|replan" line in the checklist'
    } else {
      await $.fs.write(`${run.dir}/checklist.md`, answer.trim() + '\n')
      run.decisions.push(d)
      outcome = d
      run.blockers = d === 'replan' ? clip(section(answer, 'Blockers') || answer.trim(), 6000) : undefined
    }
  } else if (phase === 'build') {
    if (!answer.trim()) {
      outcome = 'fail'
      reason = 'the build envelope came back empty'
    } else {
      const prev = batch && batch.index > 0 ? String((await $.fs.read(`${run.dir}/build-r${round}.md`).catch(() => '')) || '') : ''
      const body = batch ? `${prev ? `${prev.trimEnd()}\n\n` : ''}## Batch ${batch.index + 1}/${batch.total}: ${(run.batches?.[batch.index] || []).join(', ')}\n\n${answer.trim()}` : answer.trim()
      await $.fs.write(`${run.dir}/build-r${round}.md`, body + '\n')
    }
  } else {
    await $.fs.write(`${run.dir}/veredicto-r${round}.md`, answer.trim() + '\n')
    run.lastVerdictText = clip(answer.trim(), 6000)
    const v = parseVerdict(answer)
    if (v) {
      outcome = v
      run.verdicts.push(v)
      if (v !== 'pasa') run.feedback = { verdict: v, text: clip(answer, 6000) }
    } else reason = 'no parseable "VEREDICTO: <pasa|corregir|replantear>" line at the end'
  }
  st.status = outcome === 'fail' || reason ? 'error' : 'done'
  if (outcome !== 'fail' && !reason) {
    if ((phase === 'build' && run.feedback?.verdict === 'corregir') || (phase === 'plan' && run.feedback?.verdict === 'replantear')) run.feedback = undefined
    if (phase === 'plan') run.blockers = undefined
    run.adjust = undefined
  }
  const nextBatch = phase === 'build' && st.status === 'done' && !!run.batches && run.batchIdx + 1 < run.batches.length
  const step = nextBatch
    ? { next: 'build' as Phase, status: 'running' as RunStatus }
    : advance(phase, outcome, { rounds: run.verdicts.length, cap: run.cap, retried: run.retried, order: run.order, replans: run.decisions.filter((d) => d === 'replan').length })
  if (nextBatch) run.batchIdx++
  else if (phase === 'build' && !step.retry) {
    run.batches = undefined
    run.batchIdx = 0
  }
  run.retried = !!step.retry
  run.retryReason = step.retry ? reason : undefined
  run.expected = step.next
  run.status = step.status
  const who = st.answeredBy || st.model
  const label = batch ? `build lote ${batch.index + 1}/${batch.total}` : phase
  const head = `${label} ${st.status === 'done' ? 'listo' : 'falló'} · ${who} · ${st.steps} pasos · ${mmss(st.ms)}${phase === 'veredicto' && outcome !== 'fail' && !reason ? ` · veredicto ${outcome} (ronda ${run.verdicts.length}/${run.cap})` : ''}${phase === 'analyze' && outcome !== 'fail' ? ` · decisión ${outcome} (replans ${run.decisions.filter((d) => d === 'replan').length}/${REPLAN_CAP})` : ''}${reason ? ` · ${reason}` : ''}`
  run.routing.push(`${stamp()} ${head}`)
  $.ui.log(head)
  if (stopNow && run.status === 'running') {
    run.status = 'parado'
    run.note = 'parado en clarify: había preguntas bloqueantes'
  } else if (step.next && run.status === 'running' && run.mode === 'interactive' && !headless && !step.retry && !asked && !nextBatch) {
    $.ui.invalidate('ui.render')
    asking = true
    await exportState($)
    const pick = await $.ui
      .ask(`forge: ${phase} terminó (${clip(who, 30)}). ¿Seguimos con ${step.next}?`, { options: ['Continuar', 'Parar'], header: 'forge' })
      .catch(() => 'Parar')
    asking = false
    if (pick === 'Parar') {
      run.status = 'parado'
      run.note = 'parado entre fases'
    } else if (pick !== 'Continuar') run.adjust = pick
  }
  if (run.status !== 'running') {
    run.endedAt = now()
    run.expected = run.status === 'parado' ? step.next : undefined
    run.routing.push(`${stamp()} fin: ${STATUS_LABEL[run.status]} · veredictos ${run.verdicts.join(' → ') || '—'} · analyze ${run.decisions.join(' → ') || '—'}`)
  } else if (!nextBatch) run.stats[step.next as Phase] = { ...blankStat(config.models[step.next as Phase], config.efforts[step.next as Phase]) }
  await persist($)
  $.ui.invalidate('ui.render')
  if (run.status === 'running') return nextInstruction(run.slug, step.next as Phase, head)
  const outcomeText =
    run.status === 'pasa'
      ? `Outcome: PASA (verified) after ${run.verdicts.length} round(s).`
      : run.status === 'no-verificado'
        ? `Outcome: NOT VERIFIED: the cap of ${run.cap} rounds was reached without "pasa" (verdicts: ${run.verdicts.join(', ')}).`
        : run.status === 'bloqueado'
          ? `Outcome: BLOCKED, NOT verified: the analyze gate asked to replan ${REPLAN_CAP} times. Remaining blockers are in ${run.dir}/checklist.md.`
          : run.status === 'parado'
            ? `Outcome: stopped by the user before ${step.next}. NOT verified. It can be resumed with /forge continue.`
            : `Outcome: FAILED: ${phase} did not deliver twice (${reason}). NOT verified.`
  return finalInstruction(`${head}\nOutcome phases: ${run.order.join(' → ')}\n${outcomeText}\nArtifacts: ${run.dir}${run.lastVerdictText ? `\nLast veredicto reasoning:\n${clip(run.lastVerdictText, 1500)}` : ''}`)
}

function drawPane($: any, e: any) {
  const { Box, Text, Button, Select, Input } = $.ui.resolve(e)
  const cols = Math.max(24, e.props.bodyColumns || 48)
  const t = (children: any[], extra: any = {}) => Text({ wrap: 'truncate', color: C.text, children, ...extra })
  const s = (text: string, color: string, extra: any = {}) => Text({ color, children: [text], ...extra })
  const card = (key: string, title: string, color: string, rows: any[]) =>
    Box({ key, flexDirection: 'column', borderStyle: 'round', borderColor: color, paddingX: 1, children: [t([s(title, color, { bold: true })]), ...rows] })
  const spin = SPIN[frame % SPIN.length]
  const running = run?.status === 'running'
  const status = run ? STATUS_LABEL[run.status] : 'EN ESPERA'
  const statusColor = !run ? C.muted : run.status === 'running' ? C.lime : run.status === 'pasa' ? C.lime : run.status === 'parado' || run.status === 'cortado' ? C.amber : C.red
  const out: any[] = []
  out.push(
    t([
      s(' FORGE ', C.ink, { bold: true, backgroundColor: C.violet }),
      s(' SDD ', C.pink, { bold: true }),
      s(running ? ` ${spin} ${status}` : ` ◎ ${status}`, statusColor, { bold: true }),
    ]),
  )
  if (run) {
    const elapsed = mmss((run.endedAt || now()) - run.startedAt)
    out.push(
      card('run', `RUN · ${run.slug}`, C.violet, [
        t([s(clip(run.request, cols * 2), C.text)]),
        t([
          s('ronda ', C.muted),
          s(`${roundNow(run)}/${run.cap}`, C.cyan, { bold: true }),
          s('  modo ', C.muted),
          s(run.mode, C.text),
          s('  ⏱ ', C.muted),
          s(elapsed, C.text),
        ]),
        t([s('veredictos ', C.muted), ...(run.verdicts.length ? run.verdicts.map((v, i) => s(`${i ? ' → ' : ''}${v}`, v === 'pasa' ? C.lime : v === 'corregir' ? C.amber : C.red, { bold: true })) : [s('—', C.muted)])]),
        ...(run.note ? [t([s(run.note, C.amber)])] : []),
      ]),
    )
  }
  const phaseRows: any[] = []
  for (const p of PHASES) {
    const skipped = run ? !run.order.includes(p) : config.skip.includes(p)
    const st = run?.stats[p]
    const state = st?.status || 'pending'
    const icon = skipped ? '⊘' : state === 'running' ? spin : state === 'done' ? '✔' : state === 'error' ? '✖' : '·'
    const color = skipped ? C.muted : state === 'running' ? C.cyan : state === 'done' ? C.lime : state === 'error' ? C.red : C.muted
    const ms = st ? (state === 'running' ? now() - st.startedAt : st.ms) : 0
    const route = routeFor(config.models[p])
    const batchNote = p === 'build' && run?.batches && state === 'running' ? `lote ${run.batchIdx + 1}/${run.batches.length} ` : ''
    phaseRows.push(
      Box({
        key: `head-${p}`,
        flexDirection: 'row',
        columnGap: 1,
        children: [
          t([
            s(`${icon} `, color, { bold: true }),
            s(p.toUpperCase().padEnd(10), color, { bold: true }),
            s(skipped || state === 'pending' ? '' : `${mmss(ms)} ${batchNote}`, C.text),
            s(skipped ? 'salteada' : st && state !== 'pending' ? `${st.steps}p in ${tokens(st.inTok)} out ${tokens(st.outTok)}` : route.kind === 'cpam' ? 'CPAM' : 'Claude', C.muted),
          ]),
          ...(OPTIONAL_PHASES.includes(p) && !running
            ? [Button({ key: `skip-${p}`, label: config.skip.includes(p) ? 'activar' : 'saltear', plain: true, onPress: () => void commandText($, `phase ${p} ${config.skip.includes(p) ? 'on' : 'off'}`) })]
            : []),
        ],
      }),
    )
    if (st?.answeredBy && state !== 'pending') phaseRows.push(t([s('  ↳ ', C.muted), s(st.answeredBy, C.pink)]))
    const catalog = modelCatalog(modelIds, modelLabels)
    const current = config.models[p]
    const group = pickedGroup[p] || groupOf(current)
    let models = catalog.find((g) => g.group === group)?.options || []
    if (group === groupOf(current) && !models.some((o) => o.value === current)) models = [{ value: current, label: current }, ...models].slice(0, 64)
    const groups = catalog.map((g) => ({ value: g.group, label: g.group === 'claude' ? 'claude (tu plan)' : g.group === 'cpam' ? 'cpam (rota)' : g.group }))
    if (!groups.some((g) => g.value === group)) groups.unshift({ value: group, label: group })
    phaseRows.push(
      Box({
        key: `row-${p}`,
        flexDirection: 'row',
        columnGap: 1,
        paddingLeft: 2,
        children: [
          Select({
            key: `group-${p}`,
            options: groups,
            value: group,
            onSelect: (v: string) => {
              pickedGroup[p] = v
              $.ui.invalidate('ui.render')
            },
          }),
          ...(models.length
            ? [Select({ key: `model-${p}`, options: models, value: models.some((o) => o.value === current) ? current : undefined, onSelect: (v: string) => void setModel($, p, v) })]
            : [t([s('sin modelos', C.muted)])]),
          route.kind === 'cpam' && effortBlocked(current)
            ? t([s('⚡n/a', C.muted)])
            : Select({
                key: `effort-${p}`,
                options: EFFORTS.map((x) => ({ value: x, label: `⚡${x}` })),
                value: config.efforts[p],
                onSelect: (v: string) => void setEffort($, p, v as Effort),
              }),
        ],
      }),
    )
  }
  out.push(card('phases', 'FASES', C.cyan, phaseRows))
  const profileOptions = [...Object.keys(profiles).map((k) => ({ value: k, label: `perfil ${k}` })), ...(config.profile === 'custom' ? [{ value: 'custom', label: 'perfil custom' }] : [])]
  out.push(
    card('config', 'CONFIG', C.amber, [
      Select({ key: 'profile', options: profileOptions, value: config.profile, onSelect: (v: string) => void setProfile($, v) }),
      Select({
        key: 'mode',
        options: [
          { value: 'preguntar', label: 'modo: preguntar al arrancar' },
          { value: 'interactive', label: 'modo: interactive' },
          { value: 'automatic', label: 'modo: automatic' },
        ],
        value: config.mode,
        onSelect: (v: string) => {
          config.mode = v as Config['mode']
          void saveConfig($)
          $.ui.invalidate('ui.render')
        },
      }),
      Box({
        flexDirection: 'row',
        columnGap: 1,
        children: [
          t([s('cap ', C.muted), s(String(config.cap), C.cyan, { bold: true })]),
          Button({ key: 'cap-down', label: '−', plain: true, onPress: () => void bumpCap($, -1) }),
          Button({ key: 'cap-up', label: '+', plain: true, onPress: () => void bumpCap($, 1) }),
        ],
      }),
      t([s(modelsNote, C.muted)]),
    ]),
  )
  if (running)
    out.push(Box({ flexDirection: 'row', children: [Button({ key: 'stop', label: '■ Parar', hotkey: 's', onPress: () => void stopRun($, 'botón Parar') })] }))
  else
    out.push(
      card('start', 'NUEVO RUN', C.lime, [
        Input({ key: 'request', placeholder: 'pedido para forge…', value: draft, onInput: (v: string) => (draft = v), onSubmit: (v: string) => void startFromPane($, v) }),
        Box({ flexDirection: 'row', columnGap: 2, children: [Button({ key: 'start', label: '▶ Iniciar', hotkey: 'i', onPress: () => void startFromPane($, draft) })] }),
      ]),
    )
  return Box({ flexDirection: 'column', children: out })
}

async function bumpCap($: any, delta: number) {
  config.cap = Math.max(1, Math.min(9, config.cap + delta))
  await saveConfig($)
  $.ui.invalidate('ui.render')
}

async function startFromPane($: any, text: string) {
  const res = await startRun($, text)
  if (res.error) {
    $.ui.toast(`forge: ${res.error}`)
    return
  }
  draft = ''
  launch($)
  $.ui.invalidate('ui.render')
}

export function register(on: any) {
  on('session.start', async ($: any, e: any, next: any) => {
    const r = await next(e)
    home = (await $.env.get('HOME').catch(() => '')) || ''
    headless = (await $.env.get('CLAUDE_CODE_ENTRYPOINT').catch(() => '')) === 'sdk-cli'
    cpamKey = String((await $.fs.read(`${home}/.config/cli-proxy-api/api-key.txt`).catch(() => '')) || '').trim()
    await loadConfig($)
    await restoreRun($)
    await exportState($)
    for (const p of PHASES) {
      await $.agent
        .register({
          name: p,
          description: `forge SDD phase "${p}". Only call it when a [forge] instruction asks for it.`,
          prompt: PHASE_PROMPTS[p],
          tools: PHASE_TOOLS[p],
          model: 'haiku',
        })
        .catch((err: any) => {
          registerErrors.push(`forge:${p}: ${err}`)
          $.ui.log(`forge: no pude registrar forge:${p}: ${err}`, { to: 'debug' })
        })
    }
    if (!headless)
      await $.command
        .register({
          name: 'forge',
          description: 'SDD clarify → explore → plan → analyze → build → veredicto, cada fase en su modelo del CPAM',
          argumentHint: '<pedido> | stop | status | continue | ui | profile [n|save n|delete n] | model <fase> <id> | effort <fase> <nivel> | phase <clarify|analyze> <on|off> | mode <m> | cap <n>',
          immediate: true,
        })
        .catch((err: any) => $.ui.log(`forge: /forge no registrado: ${err}`, { to: 'debug' }))
    void fetchModels($)
    sessionId = await $.session.id().catch(() => '')
    $.clock.every(120, () => {
      frame++
      if (frame % 3 === 0) void checkInbox($)
      if (paneOpen && run?.status === 'running') $.ui.invalidate('ui.render')
    })
    return r
  })

  on('command.run', { command: 'forge' }, async ($: any, e: any) => {
    await restoreRun($)
    const args = String(e.args || '').trim()
    const sub = args.split(/\s+/)[0]?.toLowerCase() || ''
    if (!args || sub === 'ui') {
      await openPane($)
      return {}
    }
    if (sub === 'continue' || sub === 'seguir') {
      if (!run || !run.expected || (run.status !== 'parado' && run.status !== 'cortado')) return { text: 'no hay un run parado para seguir' }
      run.status = 'running'
      run.note = ''
      run.endedAt = undefined
      run.stats[run.expected] = blankStat(config.models[run.expected], config.efforts[run.expected])
      await persist($)
      await showRun($)
      launch($)
      return { text: `sigo ${run.slug} desde ${run.expected}` }
    }
    const text = await commandText($, args)
    if (text !== undefined) return { text }
    const res = await startRun($, args)
    if (res.error) return { text: `${res.error}` }
    await showRun($)
    launch($)
    return { text: `run ${run?.slug} · modo ${run?.mode} · cap ${run?.cap} · perfil ${config.profile}\nartefactos: ${run?.dir}` }
  })

  on('prompt.submit', async ($: any, e: any, next: any) => {
    const m = /^\s*\/forge(?:\s+([\s\S]*))?$/.exec(String(e.text || ''))
    if (!m || !headless) return next(e)
    const args = String(m[1] || '').trim()
    const text = await commandText($, args)
    if (text !== undefined) return { drop: text.replace(/\n\s*/g, ' | ') }
    const res = await startRun($, args)
    if (res.error || !run) return { drop: `forge: ${res.error}` }
    return next({ ...e, text: startInstruction(run.slug, run.expected || 'explore') })
  })

  on('turn.start', async ($: any, e: any, next: any) => {
    if (run?.awaitTurn && run.status === 'running') {
      run.turnId = e.turnId
      run.awaitTurn = false
    }
    return next(e)
  })

  on('agent.spawn', async ($: any, e: any, next: any) => {
    if (!phaseOfAgentType(e.subagentType) || run?.status !== 'running') return next(e)
    if (e.background) run.routing.push(`${stamp()} ${e.subagentType} venía en segundo plano; forge lo pide en primer plano`)
    const r = await next({ ...e, background: false })
    if (e.permissionMode === 'auto' && r?.agentId) autoAgents.add(r.agentId)
    return r
  })

  on('tool.check', async ($: any, e: any, next: any) => {
    const r = await next(e)
    const agentId = e.tool_use_id ? cpamCalls.get(e.tool_use_id) : undefined
    if (!agentId) return r
    cpamCalls.delete(e.tool_use_id)
    if (!run || run.status !== 'running' || !forgeMayRun(e.tool, e.input, run.cwd, run.dir)) return r
    if (r?.decision === 'allow' || r?.rule) return r
    if (r?.decision === 'deny' && !/classifier|auto mode/i.test(String(r.reason || ''))) return r
    return { decision: 'allow', reason: 'forge: fase servida por el CPAM, sin clasificador del modo auto' }
  })

  on('agent.offer', async ($: any, e: any, next: any) => {
    if (phaseOfAgentType(e.agent) && run?.status !== 'running') return { isOffered: false }
    return next(e)
  })

  on('tool.call', { tool: 'Agent' }, async ($: any, e: any, next: any) => {
    if (!phaseOfAgentType(e.subagent_type)) return next(e)
    if (!run || run.status !== 'running' || !run.expected) return { deny: '[forge] There is no running forge run. Do not call forge agents.' }
    const phase = run.expected
    const model = config.models[phase]
    const route = routeFor(model)
    const st = run.stats[phase]
    if (phase === 'build' && !run.batches) {
      const batches = buildBatches(parseTasks(String((await $.fs.read(`${run.dir}/tasks.md`).catch(() => '')) || '')))
      run.batches = batches.length > 1 ? batches : undefined
      run.batchIdx = 0
    }
    const batch = phase === 'build' && run.batches ? { index: run.batchIdx, total: run.batches.length, tasks: run.batches[run.batchIdx] || [] } : undefined
    if (batch && batch.index > 0 && st.startedAt) Object.assign(st, { status: 'running', model, effort: config.efforts[phase] })
    else Object.assign(st, { status: 'running', model, effort: config.efforts[phase], answeredBy: '', startedAt: now(), ms: 0, steps: 0, inTok: 0, outTok: 0 })
    run.routing.push(
      `${stamp()} ${phase}${batch ? ` lote ${batch.index + 1}/${batch.total} (${batch.tasks.join(',')})` : ''} arranca · ronda ${roundNow(run)}/${run.cap} · modelo ${model} · effort ${config.efforts[phase]} → ${route.kind === 'cpam' ? 'CPAM' : 'Claude Code'}`,
    )
    await persist($)
    $.ui.invalidate('ui.render')
    const input: any = {
      ...e,
      subagent_type: `forge:${phase}`,
      description: `forge ${phase}`,
      run_in_background: false,
      prompt: briefFor({
        phase,
        slug: run.slug,
        dir: run.dir,
        cwd: run.cwd,
        request: run.request,
        round: roundNow(run),
        cap: run.cap,
        mode: run.mode === 'interactive' && !headless ? 'interactive' : 'automatic',
        clarified: run.clarified,
        feedback: run.feedback && ((phase === 'build' && run.feedback.verdict === 'corregir') || (phase === 'plan' && run.feedback.verdict === 'replantear')) ? run.feedback : undefined,
        blockers: phase === 'plan' ? run.blockers : undefined,
        batch,
        tdd: run.tdd,
        adjust: run.adjust,
        retryReason: run.retryReason,
      }),
    }
    delete input.model
    if (route.kind === 'claude' && route.alias && AGENT_MODELS.includes(route.alias)) input.model = route.alias
    run.inFlight = 'sync'
    const r = await next(input)
    if (!run) return r
    run.inFlight = undefined
    if (r.result?.status === 'async_launched' && r.result.agentId) {
      run.inFlight = r.result.agentId
      run.asyncSeen = true
      agentPhase.set(r.result.agentId, phase)
      run.routing.push(`${stamp()} ${phase} quedó en segundo plano (${r.result.agentId}); forge sigue cuando termine`)
      await persist($)
      return {
        result: r.result,
        context: [
          `[forge] ${phase} is running in the background. End your turn now with no commentary. When it finishes, ignore the agent's completion notification: forge itself will send you the next [forge] instruction.`,
        ],
      }
    }
    if ('deny' in r && r.deny) {
      run.stats[phase].status = 'error'
      run.status = 'fallido'
      run.endedAt = now()
      run.note = `la fase ${phase} fue rechazada: ${r.deny}`
      run.routing.push(`${stamp()} ${run.note}`)
      await persist($)
      $.ui.invalidate('ui.render')
      return { deny: finalInstruction(`${phase} was refused (${r.deny}). Outcome: FAILED, NOT verified.`) }
    }
    const text = await finishPhase($, phase, r.result?.agentId, r.result?.content)
    return { result: { ...r.result, content: [{ type: 'text', text }] } }
  })

  on('turn.step', async function* ($: any, e: any, next: any) {
    if (!e.agentId) return yield* next(e)
    const phase = await phaseOf($, e.agentId)
    if (!phase) return yield* next(e)
    await restoreRun($, e.agentId)
    if (run && run.status !== 'running') {
      const text = `forge: el run ${run.slug} está ${STATUS_LABEL[run.status]}; esta fase no sigue.`
      const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'forge' }
      yield { kind: 'text', index: 0, text }
      yield { kind: 'stop', stopReason: 'end_turn', usage }
      return { turnId: e.turnId, index: e.index, answer: text, toolUses: [], stopReason: 'end_turn', usage }
    }
    const st = run?.stats[phase]
    const model = st?.status === 'running' ? st.model : config.models[phase]
    const route = routeFor(model)
    const effort = route.kind === 'cpam' && effortBlocked(model) ? undefined : st?.status === 'running' ? st.effort : config.efforts[phase]
    if (route.kind === 'claude') {
      const level = claudeEffort(effort)
      const res = yield* next({ ...e, ...(route.model ? { model: route.model } : {}), ...(level ? { effort: level } : {}) })
      if (st && run) {
        st.steps++
        st.inTok += (res?.usage?.input_tokens || 0) + (res?.usage?.cache_read_input_tokens || 0) + (res?.usage?.cache_creation_input_tokens || 0)
        st.outTok += res?.usage?.output_tokens || 0
        st.answeredBy = res?.usage?.model || e.model
        if (res?.answer) stepTexts.set(e.agentId, [...(stepTexts.get(e.agentId) || []), String(res.answer)])
        run.routing.push(`${stamp()} ${phase} paso ${e.index} · Claude Code · effort ${level || 'default'} · respondió ${st.answeredBy} · stop=${res?.stopReason} · in=${res?.usage?.input_tokens || 0} cache=${(res?.usage?.cache_read_input_tokens || 0) + (res?.usage?.cache_creation_input_tokens || 0)} out=${res?.usage?.output_tokens || 0}`)
        void persist($)
      }
      return res
    }
    const found = await $.session.messages({ agentId: e.agentId, as: 'api' }).catch((err: any) => ({ deny: String(err) }))
    const cwd = run?.cwd || (await $.session.cwd().catch(() => ''))
    const fail = (why: string) => ({ error: why })
    const ask = (m: string) =>
      callCpam($, {
        model: cpamModel(m, m === route.model || !effortBlocked(m) ? effort : undefined),
        max_tokens: 32000,
        system: `${PHASE_PROMPTS[phase]}\n\nEnvironment: working directory ${cwd}; platform linux; date ${new Date().toISOString().slice(0, 10)}.`,
        tools: [...PHASE_TOOLS[phase].filter((name) => name !== 'Glob' && name !== 'Grep').map((name) => ({ name, ...TOOLS[name] })), ...(autoAgents.has(e.agentId) ? [HANDBACK_TOOL] : [])],
        messages: cleanMessages(found, thinking),
      })
    const down = (m: string) => now() - (unavailable.get(m) || 0) < 30 * 60000
    let got: any
    if (!Array.isArray(found)) got = fail(`no pude leer la conversación del agente: ${found.deny}`)
    else if (down(route.model) && fallbackModel !== route.model) got = await ask(fallbackModel)
    else {
      got = await ask(route.model)
      if (got.error && modelUnavailable(got.error) && fallbackModel !== route.model) {
        unavailable.set(route.model, now())
        if (run) run.routing.push(`${stamp()} ${phase} · ${route.model} no está disponible en el CPAM (${String(got.error).slice(0, 120)}) → sigue con ${fallbackModel} por 30 min`)
        got = await ask(fallbackModel)
      }
    }
    if (got.error) {
      if (st && run) run.routing.push(`${stamp()} ${phase} paso ${e.index} · CPAM ${route.model} · ERROR ${got.error}`)
      void persist($)
      const text = `FORGE_CPAM_ERROR: ${route.model}: ${got.error}`
      yield { kind: 'text', index: 0, text }
      const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: route.model }
      yield { kind: 'stop', stopReason: 'end_turn', usage }
      return { turnId: e.turnId, index: e.index, answer: text, toolUses: [], stopReason: 'end_turn', usage }
    }
    const data = got.data
    for (const [id, blocks] of thinkingByTool(data.content || [])) thinking.set(id, blocks)
    let answer = ''
    const toolUses: any[] = []
    const blocks = data.content || []
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i]
      if (b.type === 'text' && b.text) {
        answer += b.text
        yield { kind: 'text', index: i, text: b.text }
      } else if (b.type === 'tool_use') {
        if (b.name === HANDBACK_TOOL.name && typeof b.input?.message === 'string') handbacks.set(e.agentId, b.input.message)
        if (b.id) cpamCalls.set(b.id, e.agentId)
        toolUses.push({ name: b.name, input: b.input ?? {} })
        yield { kind: 'tool', index: i, id: b.id, name: b.name }
        yield { kind: 'input', index: i, json: JSON.stringify(b.input ?? {}) }
      }
    }
    const u = data.usage || {}
    const usage = {
      input_tokens: u.input_tokens || 0,
      output_tokens: u.output_tokens || 0,
      cache_read_input_tokens: u.cache_read_input_tokens || 0,
      cache_creation_input_tokens: u.cache_creation_input_tokens || 0,
      model: data.model || route.model,
    }
    const stop = data.stop_reason || (toolUses.length ? 'tool_use' : 'end_turn')
    if (st && run) {
      st.steps++
      st.inTok += usage.input_tokens + usage.cache_read_input_tokens
      st.outTok += usage.output_tokens
      st.answeredBy = `${route.model} (${usage.model})`
      if (answer) stepTexts.set(e.agentId, [...(stepTexts.get(e.agentId) || []), answer])
      run.routing.push(`${stamp()} ${phase} paso ${e.index} · CPAM pedido ${cpamModel(route.model, effort)} · respondió ${usage.model} · stop=${stop} · tools=${toolUses.map((x) => x.name).join(',') || '-'} · in=${usage.input_tokens} cache=${usage.cache_read_input_tokens} out=${usage.output_tokens}`)
      void persist($)
      $.ui.invalidate('ui.render')
    }
    yield { kind: 'stop', stopReason: stop, usage }
    return { turnId: e.turnId, index: e.index, answer, toolUses, stopReason: stop, usage }
  })

  on('turn.complete', async ($: any, e: any, next: any) => {
    if (e.agentId && (await phaseOf($, e.agentId))) await restoreRun($, e.agentId)
    if (e.agentId) {
      const phase = await phaseOf($, e.agentId)
      if (phase) answers.set(e.agentId, String(e.answer || ''))
      if (phase && run && run.status === 'running' && run.inFlight === e.agentId) {
        run.inFlight = undefined
        const text = await finishPhase($, phase, e.agentId, [{ type: 'text', text: String(e.answer || '') }])
        submitLater($, text)
      }
      return next(e)
    }
    if (run && run.status === 'running' && !run.inFlight && !run.asyncSeen && run.turnId && e.turnId === run.turnId) {
      run.status = 'cortado'
      run.endedAt = now()
      run.note = 'el turno principal terminó antes de cerrar el run · /forge continue'
      run.routing.push(`${stamp()} ${run.note}`)
      await persist($)
      $.ui.invalidate('ui.render')
    }
    return next(e)
  })

  on('ui.close', { id: PANE }, async ($: any, e: any, next: any) => {
    paneOpen = false
    return next(e)
  })

  on('ui.render', { component: 'Pane' }, async ($: any, e: any, next: any) => {
    if (e.requestId !== PANE) return next(e)
    paneOpen = true
    try {
      return drawPane($, e)
    } catch (err) {
      const { Text } = $.ui.resolve(e)
      return Text({ wrap: 'truncate', color: C.red, children: [`forge: no pude dibujar el panel: ${err}`] })
    }
  })
}
