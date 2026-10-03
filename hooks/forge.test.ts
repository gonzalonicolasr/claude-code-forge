import { expect, test, describe, mock } from 'claude-code/testing'
import { routeFor, phaseOfAgentType, parseVerdict, advance, slugify, parseStart, modelCatalog, groupOf, cleanMessages, thinkingByTool, stateSnapshot, exportStatus, DEFAULT_PROFILES, DEFAULT_EFFORTS, BUILTIN_PROFILES, cpamModel, claudeEffort, compareModels, zeroProfiles, isExcluded, effortBlocked, groupLabel, PHASES, phaseOrder, parseDecision, parseClarifyStatus, pickAnswer, section, parseTasks, validateTasks, buildBatches } from './logic.ts'

describe('ruteo', () => {
  test('los tipos forge:<fase> se reconocen y el resto no', () => {
    expect(phaseOfAgentType('forge:explore')).toBe('explore')
    expect(phaseOfAgentType('forge:clarify')).toBe('clarify')
    expect(phaseOfAgentType('forge:analyze')).toBe('analyze')
    expect(phaseOfAgentType('forge:veredicto')).toBe('veredicto')
    expect(phaseOfAgentType('forge:probe')).toBe(undefined)
    expect(phaseOfAgentType('general-purpose')).toBe(undefined)
    expect(phaseOfAgentType(undefined)).toBe(undefined)
  })

  test('un modelo con prefijo de cuenta o sin claude va al CPAM', () => {
    expect(routeFor('ag3/gemini-3.7-flash-high')).toEqual({ kind: 'cpam', model: 'ag3/gemini-3.7-flash-high' })
    expect(routeFor('prolite/gpt-5.6-terra')).toEqual({ kind: 'cpam', model: 'prolite/gpt-5.6-terra' })
    expect(routeFor('personal/claude-opus-5')).toEqual({ kind: 'cpam', model: 'personal/claude-opus-5' })
    expect(routeFor('glm-5.3')).toEqual({ kind: 'cpam', model: 'glm-5.3' })
  })

  test('un alias o id de Claude sin prefijo pasa por Claude Code', () => {
    expect(routeFor('haiku')).toEqual({ kind: 'claude', alias: 'haiku' })
    expect(routeFor('opus')).toEqual({ kind: 'claude', alias: 'opus' })
    expect(routeFor('claude-sonnet-4-6')).toEqual({ kind: 'claude', model: 'claude-sonnet-4-6' })
  })

  test('el catálogo agrupa por prefijo, suma Claude y saca imágenes', () => {
    const many = Array.from({ length: 80 }, (_, i) => `oc/m${String(i).padStart(2, '0')}`)
    const cat = modelCatalog(['prolite/gpt-5.6-terra', 'ag3/gemini-3.7-flash-high', 'plus/gpt-image-2', 'claude-sonnet-4-6', 'glm-5.3', ...many])
    expect(cat.map((g) => g.group)).toEqual(['claude', 'prolite', 'ag3', 'oc', 'cpam'])
    expect(cat[0].options.map((o) => o.value)).toEqual(['haiku', 'sonnet', 'opus', 'fable'])
    const all = cat.flatMap((g) => g.options.map((o) => o.value))
    expect(all).not.toContain('plus/gpt-image-2')
    expect(all).not.toContain('claude-sonnet-4-6')
    expect(cat.find((g) => g.group === 'oc')?.options.length).toBe(64)
    expect(cat.find((g) => g.group === 'cpam')?.options).toEqual([{ value: 'glm-5.3', label: 'glm-5.3' }])
  })

  test('isExcluded saca las cuentas de la lista por prefijo, sin importar mayúsculas', () => {
    expect(isExcluded('trabajo/claude-opus-5', ['trabajo'])).toBe(true)
    expect(isExcluded('Trabajo/x', ['trabajo'])).toBe(true)
    expect(isExcluded('trabajo-personal/x', ['trabajo'])).toBe(false)
    expect(isExcluded('glm-5.3', ['trabajo'])).toBe(false)
    expect(isExcluded('trabajo/x', [])).toBe(false)
  })

  test('los modelos quedan por familia y el más nuevo arriba, con el nombre lindo del CPAM', () => {
    const ids = ['prolite/gpt-5.5', 'prolite/gpt-6.1-sol', 'prolite/gpt-6-luna', 'prolite/gpt-5.6-terra', 'personal/claude-opus-4-20250514', 'personal/claude-opus-5-5', 'personal/claude-opus-4-8', 'personal/claude-haiku-4-5-20251001']
    const cat = modelCatalog(ids, { 'prolite/gpt-6.1-sol': 'GPT 6.1 Sol', 'claude-opus-5-5': 'Claude Opus 5.5' })
    expect(cat.map((g) => g.group)).toEqual(['claude', 'personal', 'prolite'])
    expect(cat[1].options.map((o) => o.value)).toEqual(['personal/claude-haiku-4-5-20251001', 'personal/claude-opus-5-5', 'personal/claude-opus-4-8', 'personal/claude-opus-4-20250514'])
    expect(cat[2].options.map((o) => o.value)).toEqual(['prolite/gpt-6.1-sol', 'prolite/gpt-6-luna', 'prolite/gpt-5.6-terra', 'prolite/gpt-5.5'])
    expect(cat[2].options[0].label).toBe('GPT 6.1 Sol')
    expect(cat[1].options[1].label).toBe('Claude Opus 5.5')
    expect(compareModels('gemini-3.8-flash-high', 'gemini-3.7-flash-high')).toBeLessThan(0)
  })

  test('el effort viaja como sufijo al CPAM y como nivel a Claude Code', () => {
    expect(cpamModel('prolite/gpt-6-luna', 'high')).toBe('prolite/gpt-6-luna(high)')
    expect(cpamModel('prolite/gpt-6-luna', 'off')).toBe('prolite/gpt-6-luna(none)')
    expect(cpamModel('prolite/gpt-6-luna', 'auto')).toBe('prolite/gpt-6-luna')
    expect(cpamModel('x(low)', 'high')).toBe('x(low)')
    expect(claudeEffort('minimal')).toBe('low')
    expect(claudeEffort('xhigh')).toBe('xhigh')
    expect(claudeEffort('auto')).toBe(undefined)
  })

  test('importa los perfiles de zero-pi con las seis fases y su thinking, y deja afuera los de las cuentas excluidas', () => {
    const z = zeroProfiles({
      profiles: {
        'solo-gemini': {
          models: { clarify: 'ag/gemini-3.1-flash-lite', explore: 'ag/gemini-3.7-flash-high', plan: 'ag/gemini-3.1-pro-low', analyze: 'ag/gemini-3.6-flash-high', build: 'ag/gemini-3.1-pro-low', veredicto: 'ag/gemini-3.1-pro-low' },
          thinking: { clarify: 'medium', explore: 'high', plan: 'xhigh', analyze: 'high', build: 'high', veredicto: 'raro' },
        },
        viejo: { models: { explore: 'ag/a', plan: 'prolite/b', build: 'prolite/c', veredicto: 'prolite/d' } },
        'solo-claude-trabajo': { models: { explore: 'ag/a', plan: 'ag/b', build: 'ag/c', veredicto: 'ag/d' } },
        'reparto-cuotas': { models: { explore: 'ag/x', plan: 'personal/y', build: 'trabajo/claude-opus-5', veredicto: 'prolite/z' } },
        'analiza-laburo': { models: { explore: 'ag/x', plan: 'personal/y', analyze: 'trabajo/claude-opus-4-8', build: 'personal/y', veredicto: 'prolite/z' } },
      },
    }, ['trabajo'])
    expect(Object.keys(z.profiles)).toEqual(['zero:solo-gemini', 'zero:viejo'])
    expect(z.profiles['zero:solo-gemini']).toEqual({ clarify: 'ag/gemini-3.1-flash-lite', explore: 'ag/gemini-3.7-flash-high', plan: 'ag/gemini-3.1-pro-low', analyze: 'ag/gemini-3.6-flash-high', build: 'ag/gemini-3.1-pro-low', veredicto: 'ag/gemini-3.1-pro-low' })
    expect(z.efforts['zero:solo-gemini']).toEqual({ clarify: 'medium', explore: 'high', plan: 'xhigh', analyze: 'high', build: 'high', veredicto: 'auto' })
    expect(z.profiles['zero:viejo'].clarify).toBe('ag/a')
    expect(z.profiles['zero:viejo'].analyze).toBe('prolite/b')
    expect(zeroProfiles(undefined).profiles).toEqual({})
  })

  test('los ocho perfiles de fábrica traen modelo y effort para las seis fases', () => {
    for (const name of BUILTIN_PROFILES) {
      expect(Object.keys(DEFAULT_PROFILES[name]).sort()).toEqual([...PHASES].sort())
      expect(Object.keys(DEFAULT_EFFORTS[name]).sort()).toEqual([...PHASES].sort())
    }
  })

  test('el effort se marca no aplicable donde se midió que no cambia nada', () => {
    expect(effortBlocked('ag3/gpt-oss-120b-medium')).toContain('gpt-oss')
    expect(effortBlocked('ds/deepseek-flash')).toContain('deepseek-flash')
    expect(effortBlocked('oc/kimi-k3')).toContain('OpenCode')
    expect(effortBlocked('prolite/gpt-6-sol')).toBe('')
    expect(effortBlocked('ds/deepseek-v4-pro')).toBe('')
    expect(groupLabel('prolite', ['prolite/gpt-6-sol', 'prolite/codex-auto-review'])).toBe('prolite · GPT')
    expect(groupLabel('ag3', ['ag3/gemini-3-flash', 'ag3/claude-sonnet-4-6', 'ag3/gpt-oss-120b-medium'])).toBe('ag3 · Gemini/Claude/gpt-oss')
  })

  test('cada modelo cae en su grupo', () => {
    expect(groupOf('opus')).toBe('claude')
    expect(groupOf('claude-sonnet-4-6')).toBe('claude')
    expect(groupOf('ag3/gemini-3.7-flash-high')).toBe('ag3')
    expect(groupOf('glm-5.3')).toBe('cpam')
  })
})

describe('veredicto', () => {
  test('lee la línea VEREDICTO final', () => {
    expect(parseVerdict('Todo bien.\n\nVEREDICTO: pasa')).toBe('pasa')
    expect(parseVerdict('Falta el test.\nVEREDICTO: corregir\n')).toBe('corregir')
    expect(parseVerdict('**Veredicto:** `replantear`')).toBe('replantear')
  })

  test('si hay varias gana la última', () => {
    expect(parseVerdict('Antes pensé VEREDICTO: pasa pero no.\nVEREDICTO: corregir')).toBe('corregir')
  })

  test('acepta la palabra sola en la última línea y rechaza lo ambiguo', () => {
    expect(parseVerdict('razones...\n**corregir**')).toBe('corregir')
    expect(parseVerdict('no sé si pasa o hay que corregir')).toBe(undefined)
    expect(parseVerdict('')).toBe(undefined)
    expect(parseVerdict('VEREDICTO: aprobado')).toBe(undefined)
  })
})

describe('transiciones', () => {
  const ctx = { rounds: 0, cap: 3, retried: false }

  test('clarify → explore → plan → analyze → build → veredicto', () => {
    expect(PHASES).toEqual(['clarify', 'explore', 'plan', 'analyze', 'build', 'veredicto'])
    expect(advance('clarify', 'ok', ctx)).toEqual({ next: 'explore', status: 'running' })
    expect(advance('explore', 'ok', ctx)).toEqual({ next: 'plan', status: 'running' })
    expect(advance('plan', 'ok', ctx)).toEqual({ next: 'analyze', status: 'running' })
    expect(advance('analyze', 'continue', ctx)).toEqual({ next: 'build', status: 'running' })
    expect(advance('build', 'ok', ctx)).toEqual({ next: 'veredicto', status: 'running' })
  })

  test('clarify y analyze se pueden saltear y el orden se ajusta', () => {
    expect(phaseOrder(['clarify'])).toEqual(['explore', 'plan', 'analyze', 'build', 'veredicto'])
    const order = phaseOrder(['clarify', 'analyze', 'build' as any])
    expect(order).toEqual(['explore', 'plan', 'build', 'veredicto'])
    expect(advance('plan', 'ok', { ...ctx, order })).toEqual({ next: 'build', status: 'running' })
    expect(advance('veredicto', 'replantear', { ...ctx, rounds: 1, order })).toEqual({ next: 'plan', status: 'running' })
  })

  test('analyze replan vuelve a plan, el segundo bloquea y no consume rondas', () => {
    expect(advance('analyze', 'replan', { ...ctx, replans: 1 })).toEqual({ next: 'plan', status: 'running' })
    expect(advance('analyze', 'replan', { ...ctx, replans: 2 })).toEqual({ status: 'bloqueado' })
    expect(advance('analyze', 'replan', { ...ctx, rounds: 3, replans: 1 })).toEqual({ next: 'plan', status: 'running' })
    expect(advance('analyze', 'ok', ctx)).toEqual({ next: 'analyze', status: 'running', retry: true })
    expect(advance('analyze', 'fail', { ...ctx, retried: true })).toEqual({ status: 'fallido' })
  })

  test('pasa termina, corregir re-corre build, replantear re-corre plan', () => {
    expect(advance('veredicto', 'pasa', { ...ctx, rounds: 1 })).toEqual({ status: 'pasa' })
    expect(advance('veredicto', 'corregir', { ...ctx, rounds: 1 })).toEqual({ next: 'build', status: 'running' })
    expect(advance('veredicto', 'replantear', { ...ctx, rounds: 2 })).toEqual({ next: 'plan', status: 'running' })
    expect(advance('plan', 'ok', { ...ctx, rounds: 2 })).toEqual({ next: 'analyze', status: 'running' })
  })

  test('al llegar al cap sin pasa queda no verificado', () => {
    expect(advance('veredicto', 'corregir', { ...ctx, rounds: 3 })).toEqual({ status: 'no-verificado' })
    expect(advance('veredicto', 'replantear', { ...ctx, rounds: 1, cap: 1 })).toEqual({ status: 'no-verificado' })
    expect(advance('veredicto', 'pasa', { ...ctx, rounds: 3 })).toEqual({ status: 'pasa' })
  })

  test('una fase que no entrega se reintenta una vez y después falla', () => {
    expect(advance('plan', 'fail', ctx)).toEqual({ next: 'plan', status: 'running', retry: true })
    expect(advance('plan', 'fail', { ...ctx, retried: true })).toEqual({ status: 'fallido' })
    expect(advance('veredicto', 'ok', ctx)).toEqual({ next: 'veredicto', status: 'running', retry: true })
  })
})

describe('gates y tareas', () => {
  test('lee el Status de clarify y la Decision de analyze', () => {
    expect(parseClarifyStatus('## Status\ncontinue\n\n## Assumptions\n- x')).toBe('continue')
    expect(parseClarifyStatus('## Status\n**blocked**\n## Blocking questions\n- ¿A o B?')).toBe('blocked')
    expect(parseClarifyStatus('Status: `continue`')).toBe('continue')
    expect(parseClarifyStatus('sin estado')).toBe(undefined)
  })

  test('si el mensaje final de una fase viene vacío de formato, se usa el último paso que lo trae', () => {
    const good = '## Status\ncontinue\n\n## Assumptions\n- el recall híbrido está en src/recall.ts'
    expect(pickAnswer('clarify', 'Listo, ya está.', ['mirando archivos', good, 'ok'])).toBe(good)
    expect(pickAnswer('clarify', good, ['otro'])).toBe(good)
    expect(pickAnswer('clarify', 'nada', ['tampoco'])).toBe('nada')
    expect(pickAnswer('veredicto', 'fin', ['## Veredicto\npasa'])).toBe('## Veredicto\npasa')
    expect(pickAnswer('explore', 'ok', ['## Hallazgos\n- el índice no se reconstruye al borrar'])).toBe('## Hallazgos\n- el índice no se reconstruye al borrar')
    expect(parseDecision('## Decision\nDecision: replan')).toBe('replan')
    expect(parseDecision('**Decision:** `continue`')).toBe('continue')
    expect(parseDecision('Decision: replan\n...\nDecision: continue')).toBe('continue')
    expect(parseDecision('no decision here')).toBe(undefined)
    expect(section('## Blockers\n- T002 sin test\n\n## Decision\nDecision: replan', 'Blockers')).toBe('- T002 sin test')
  })

  const tasks = [
    '- [x] T001 — uno',
    '  - files: `/r/a.js`, `/r/a.test.js` (new)',
    '  - depends: []',
    '  - evidence: `node --test` passes',
    '  - review: ~300 changed lines',
    '- [ ] T002 — dos',
    '  - files:',
    '    - `/r/b.js`',
    '  - depends: [T001]',
    '  - evidence: `node --test` passes',
    '  - review: ~500 changed lines',
    '- [ ] T003 — tres',
    '  - files: `/r/c.js`',
    '  - depends: [T002]',
    '  - evidence: `node --test` passes',
    '  - review: ~400 changed lines',
    '- [ ] T004 — cuatro',
    '  - files: `/r/d.js`',
    '  - depends: []',
    '  - evidence: `node --test` passes',
    '  - review: ~100 changed lines',
    '',
    '## Review Workload',
    '- T001: ~300',
    '**Total: ~1300 changed lines**',
  ].join('\n')

  test('parsea tareas y las valida como zero-validate', () => {
    const t = parseTasks(tasks)
    expect(t.map((x) => [x.id, x.done, x.files, x.review])).toEqual([
      ['T001', true, 2, 300],
      ['T002', false, 1, 500],
      ['T003', false, 1, 400],
      ['T004', false, 1, 100],
    ])
    expect(validateTasks(tasks)).toEqual([])
    const broken = '- [ ] T001 — a\n  - files: `/a`\n  - depends: [T002]\n- [ ] T002 — b\n  - files: `/b`\n  - depends: [T009]\n  - evidence: x\n  - review: ~10 changed lines'
    expect(validateTasks(broken)).toEqual(['T001 depends on later task T002', 'T001 is missing evidence', 'T001 is missing its review estimate', 'T002 depends on unknown T009'])
    expect(validateTasks('nada')).toEqual(['tasks.md has no T### tasks'])
  })

  test('arma los lotes de build con tope de 800 líneas y 4 tareas, saltando las hechas', () => {
    expect(buildBatches(parseTasks(tasks))).toEqual([['T002'], ['T003', 'T004']])
    const many = Array.from({ length: 6 }, (_, i) => ({ id: `T00${i + 1}`, done: false, files: 1, depends: [], evidence: 'x', review: null, reviewRaw: null }))
    expect(buildBatches(many)).toEqual([['T001', 'T002', 'T003', 'T004'], ['T005', 'T006']])
    expect(buildBatches([{ id: 'T001', done: false, files: 1, depends: [], evidence: 'x', review: 1200, reviewRaw: '~1200' }])).toEqual([['T001']])
  })
})

describe('arranque', () => {
  test('slug corto, sin tildes y sin pisar runs existentes', () => {
    expect(slugify('Agregá una función suma(a, b)')).toBe('agrega-una-funcion-suma-a-b')
    expect(slugify('x', ['x'])).toBe('x-2')
    expect(slugify('!!!')).toBe('run')
    expect(slugify('a'.repeat(60)).length).toBeLessThanOrEqual(60)
  })

  test('las banderas se separan del pedido', () => {
    expect(parseStart('--auto --cap 2 agregá suma')).toEqual({ request: 'agregá suma', mode: 'automatic', cap: 2 })
    expect(parseStart('--interactive --profile calidad hacé X')).toEqual({ request: 'hacé X', mode: 'interactive', profile: 'calidad' })
  })
})

describe('mensajes al CPAM', () => {
  test('saca el thinking del motor y repone el firmado por el CPAM antes de su tool_use', () => {
    const sig = { type: 'thinking', thinking: '', signature: 'cpa-gemini-carrier' }
    const cache = thinkingByTool([sig, { type: 'tool_use', id: 't1', name: 'Bash', input: {} }])
    const out = cleanMessages(
      [
        { role: 'user', content: 'hola' },
        { role: 'assistant', content: [{ type: 'thinking', thinking: 'x', signature: 'claude' }, { type: 'tool_use', id: 't1', name: 'Bash', input: {} }] },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] },
      ],
      cache,
    )
    expect(out[1].content).toEqual([sig, { type: 'tool_use', id: 't1', name: 'Bash', input: {} }])
    expect(out[0]).toEqual({ role: 'user', content: 'hola' })
  })

  test('no le manda al CPAM el CLAUDE.md ni el mail del usuario, sí el entorno y la fecha', () => {
    const env = { type: 'text', text: '<system-reminder>\n# Environment\ncwd /x\n</system-reminder>' }
    const date = { type: 'text', text: "<system-reminder>\nToday's date is 2026-10-02.\n</system-reminder>" }
    const brief = { type: 'text', text: 'forge run x · phase explore' }
    const out = cleanMessages(
      [
        {
          role: 'user',
          content: [
            env,
            { type: 'text', text: '<system-reminder>\nCodebase and user instructions are shown below. password cocacola\n</system-reminder>' },
            { type: 'text', text: '<system-reminder>\n# userEmail\nalguien@x.com\n</system-reminder>' },
            date,
            brief,
          ],
        },
      ],
      new Map(),
    )
    expect(out[0].content).toEqual([env, date, brief])
    expect(JSON.stringify(out)).not.toContain('cocacola')
  })
})

test('el panel dibuja las seis fases con su modelo, el saltear de los gates y el botón de iniciar', async ($) => {
  const m: any = await ($ as any).ui.mount({
    plugin: 'forge',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'forge',
    props: { title: 'FORGE', isFocused: false, bodyColumns: 48, placement: 'dock', scroll: { offset: 0, bodyRows: 60, contentRows: 60 }, view: {} },
  })
  const text = JSON.stringify(await m.drawn())
  expect(text).toContain('FORGE')
  for (const p of ['CLARIFY', 'EXPLORE', 'PLAN', 'ANALYZE', 'BUILD', 'VEREDICTO']) expect(text).toContain(p)
  expect(await m.find({ key: 'model-clarify' })).toBeDefined()
  expect(await m.find({ key: 'model-analyze' })).toBeDefined()
  expect(await m.find({ key: 'skip-clarify' })).toBeDefined()
  expect(await m.find({ key: 'model-build' })).toBeDefined()
  expect(await m.find({ key: 'start' })).toBeDefined()
})

describe('estado exportado', () => {
  test('el snapshot trae los perfiles de fábrica marcados, el catálogo y run null', () => {
    const snap = stateSnapshot({
      version: '0.2.0',
      profile: 'barato',
      profiles: { ...DEFAULT_PROFILES, mio: { ...DEFAULT_PROFILES.barato } },
      profileEfforts: DEFAULT_EFFORTS,
      models: DEFAULT_PROFILES.barato,
      efforts: DEFAULT_EFFORTS.barato,
      mode: 'preguntar',
      cap: 3,
      modelIds: ['prolite/gpt-6-luna', 'plus/gpt-image-2'],
      asking: false,
      now: 1,
    })
    expect(Object.keys(snap.profiles)).toEqual([...BUILTIN_PROFILES, 'mio'])
    expect(BUILTIN_PROFILES).toEqual(['turbo', 'barato', 'equilibrado', 'calidad', 'open-source', 'gemini', 'openai', 'solo-claude'])
    expect(snap.profiles.turbo.builtin).toBe(true)
    expect(snap.profiles.mio.builtin).toBe(false)
    expect(snap.profiles.mio.effort.plan).toBe('auto')
    expect(snap.profiles.turbo.effort.explore).toBe('minimal')
    expect(snap.efforts).toEqual(DEFAULT_EFFORTS.barato)
    expect(snap.mode).toBe('ask')
    expect(snap.catalog).toEqual({ claude: ['haiku', 'sonnet', 'opus', 'fable'], prolite: ['prolite/gpt-6-luna'] })
    expect(snap.phaseOrder).toEqual(['clarify', 'explore', 'plan', 'analyze', 'build', 'veredicto'])
    expect(Object.keys(snap.models)).toEqual([...PHASES])
    expect(Object.keys(snap.effortNotes)).toEqual([...PHASES])
    expect(snap.labels['prolite/gpt-6-luna']).toBe('gpt-6-luna')
    expect(snap.run).toBe(null)
  })

  test('el estado del run se traduce y una fase corriendo informa su tiempo', () => {
    const stat = (status: any) => ({ status, model: 'm', answeredBy: '', ms: 5, startedAt: 100, inTok: 1, outTok: 2, steps: 3 })
    const snap = stateSnapshot({
      version: 'x',
      profile: 'p',
      profiles: {},
      profileEfforts: {},
      models: DEFAULT_PROFILES.barato,
      efforts: DEFAULT_EFFORTS.barato,
      mode: 'automatic',
      cap: 2,
      modelIds: [],
      asking: false,
      now: 1100,
      skip: ['clarify'],
      run: {
        status: 'fallido',
        request: 'r',
        slug: 's',
        round: 1,
        cap: 2,
        phase: 'build',
        order: ['explore', 'plan', 'analyze', 'build', 'veredicto'],
        startedAt: 0,
        stats: { clarify: stat('pending'), explore: stat('done'), plan: stat('error'), analyze: stat('done'), build: stat('running'), veredicto: stat('pending') },
        verdicts: [],
        decisions: ['replan', 'continue'],
        batch: { index: 1, total: 3, tasks: ['T004'] },
      },
    })
    expect(snap.phaseOrder).toEqual(['explore', 'plan', 'analyze', 'build', 'veredicto'])
    expect(snap.run?.status).toBe('falló')
    expect(snap.run?.phaseOrder).toEqual(['explore', 'plan', 'analyze', 'build', 'veredicto'])
    expect(snap.run?.phases.map((p) => [p.name, p.status])).toEqual([
      ['explore', 'done'],
      ['plan', 'failed'],
      ['analyze', 'done'],
      ['build', 'running'],
      ['veredicto', 'pending'],
    ])
    expect(snap.run?.phases[3].ms).toBe(1000)
    expect(snap.run?.decisions).toEqual(['replan', 'continue'])
    expect(snap.run?.batch).toEqual({ index: 2, total: 3, tasks: ['T004'] })
    expect(exportStatus('bloqueado', false)).toBe('bloqueado')
    expect(exportStatus('running', true)).toBe('paused')
    expect(exportStatus('cortado', false)).toBe('parado')
  })

  test('/forge profile aplica el perfil y escribe state.json con los de fábrica', async ($, on) => {
    mock.env(on, { HOME: '/h' })
    mock.store(on)
    const files: Record<string, string> = {}
    on('fs.write', async (_$: any, e: any) => {
      files[e.path] = e.text
    })
    on('process.run', async () => ({ exitCode: 0, stdout: '', stderr: '' }))
    on('command.list', async () => [])
    const r: any = await $.command.run({ command: 'forge', args: 'profile equilibrado' })
    expect(r.text).toBe('perfil equilibrado activo')
    const state = JSON.parse(files['/h/.local/state/forge/state.json'])
    expect(state.profile).toBe('equilibrado')
    expect(state.models).toEqual(DEFAULT_PROFILES.equilibrado)
    for (const name of BUILTIN_PROFILES) expect(state.profiles[name].builtin).toBe(true)
    const del: any = await $.command.run({ command: 'forge', args: 'profile delete turbo' })
    expect(del.text).toBe('turbo es de fábrica, no se borra')
    await $.command.run({ command: 'forge', args: 'model build prolite/gpt-6-sol' })
    expect(JSON.parse(files['/h/.local/state/forge/state.json']).profile).toBe('custom')
    const eff: any = await $.command.run({ command: 'forge', args: 'effort plan xhigh' })
    expect(eff.text).toBe('plan · effort xhigh')
    expect(JSON.parse(files['/h/.local/state/forge/state.json']).efforts.plan).toBe('xhigh')
    const cl: any = await $.command.run({ command: 'forge', args: 'model clarify ag3/gemini-3.5-flash-lite' })
    expect(cl.text).toBe('clarify → ag3/gemini-3.5-flash-lite (CPAM)')
    await $.command.run({ command: 'forge', args: 'effort analyze low' })
    const mid = JSON.parse(files['/h/.local/state/forge/state.json'])
    expect([mid.models.clarify, mid.efforts.analyze]).toEqual(['ag3/gemini-3.5-flash-lite', 'low'])
    await $.command.run({ command: 'forge', args: 'model clarify ag3/gemini-3.7-flash-high' })
    await $.command.run({ command: 'forge', args: 'effort analyze high' })
    const off: any = await $.command.run({ command: 'forge', args: 'phase clarify off' })
    expect(off.text).toBe('clarify salteada · fases explore → plan → analyze → build → veredicto')
    expect(JSON.parse(files['/h/.local/state/forge/state.json']).phaseOrder).toEqual(['explore', 'plan', 'analyze', 'build', 'veredicto'])
    const bad: any = await $.command.run({ command: 'forge', args: 'phase build off' })
    expect(bad.text).toBe('uso: /forge phase <clarify|analyze> <on|off>')
    await $.command.run({ command: 'forge', args: 'phase clarify on' })
    expect(JSON.parse(files['/h/.local/state/forge/state.json']).phaseOrder).toEqual([...PHASES])
    await $.command.run({ command: 'forge', args: 'profile save mio' })
    await $.command.run({ command: 'forge', args: 'mode ask' })
    await $.command.run({ command: 'forge', args: 'cap 5' })
    const after = JSON.parse(files['/h/.local/state/forge/state.json'])
    expect(after.profiles.mio).toEqual({ ...DEFAULT_PROFILES.equilibrado, build: 'prolite/gpt-6-sol', effort: { ...DEFAULT_EFFORTS.equilibrado, plan: 'xhigh' }, builtin: false, source: 'forge' })
    expect([after.mode, after.cap, after.profile]).toEqual(['ask', 5, 'mio'])
    const gone: any = await $.command.run({ command: 'forge', args: 'profile delete mio' })
    expect(gone.text).toBe('perfil mio borrado')
    expect(JSON.parse(files['/h/.local/state/forge/state.json']).profiles.mio).toBe(undefined)
  })
})
