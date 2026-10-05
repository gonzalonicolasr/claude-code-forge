import { expect, test, describe, mock } from 'claude-code/testing'
import { zeroTarget, aliasOf, editZeroProfile, profileName, builtinModified, routeFor, phaseOfAgentType, parseVerdict, advance, slugify, parseStart, modelCatalog, groupOf, cleanMessages, thinkingByTool, stateSnapshot, exportStatus, DEFAULT_PROFILES, DEFAULT_EFFORTS, BUILTIN_PROFILES, cpamModel, claudeEffort, compareModels, zeroProfiles, isExcluded, effortBlocked, groupLabel, PHASES, phaseOrder, parseDecision, parseClarifyStatus, pickAnswer, forgeMayRun, modelUnavailable, section, parseTasks, validateTasks, buildBatches, nextWave, planUnits, normalizePath, samePath, tickTasks, waveEvidence, waveEnvelope, PARALLEL_MAX, parseSize, isNoddHandoff, noddHandoffProblem, parseContinue, adoptedRunResumable } from './logic.ts'
import { PHASE_PROMPTS, finalInstruction, NODD_HINT, briefFor } from './prompts.ts'

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

  test('lee el Size de clarify: small sólo con la línea exacta, cualquier otra cosa es normal', () => {
    expect(parseSize('## Status\ncontinue\n\n## Size\nSize: small\n')).toBe('small')
    expect(parseSize('Size: normal')).toBe('normal')
    expect(parseSize('**Size:** `small`')).toBe('small')
    expect(parseSize('Size: small\n...\nSize: normal')).toBe('normal')
    expect(parseSize('## Status\ncontinue')).toBe('normal')
    expect(parseSize('Size: smallish')).toBe('normal')
    expect(parseSize('Size: small or normal')).toBe('normal')
    expect(parseSize('the size: small change')).toBe('normal')
    expect(parseSize('')).toBe('normal')
  })

  test('clarify pide la línea Size y el cierre recomienda NODD sólo si el pedido fue chico', () => {
    expect(PHASE_PROMPTS.clarify).toContain('`Size: small` or `Size: normal`')
    expect(PHASE_PROMPTS.clarify).toContain('When in doubt, `Size: normal`')
    expect(finalInstruction('x', 'small')).toContain(NODD_HINT)
    expect(NODD_HINT).toContain('https://nodd.com.ar')
    expect(finalInstruction('x', 'normal')).not.toContain('NODD')
    expect(finalInstruction('x')).not.toContain('NODD')
  })

  test('reconoce cuando el CPAM dice que un modelo no está disponible, y nada más', () => {
    expect(modelUnavailable(`HTTP 400: {"detail":"The 'gpt-6.1-sol' model is not supported when using Codex with a ChatGPT account."}`)).toBe(true)
    expect(modelUnavailable('HTTP 404: model_not_found')).toBe(true)
    expect(modelUnavailable('HTTP 429: usage_limit_reached')).toBe(false)
    expect(modelUnavailable('HTTP 400: max_tokens is too large')).toBe(false)
    expect(modelUnavailable('HTTP 0: aborted')).toBe(false)
  })

  test('forge sólo deja correr sin clasificador lo de su fase: lecturas, bash y escrituras dentro del proyecto', () => {
    const cwd = '/home/g/toy', dir = '/home/g/toy/.sdd/x'
    expect(forgeMayRun('Write', { file_path: '/home/g/toy/.sdd/x/plan.md' }, cwd, dir)).toBe(true)
    expect(forgeMayRun('Edit', { file_path: '/home/g/toy/lib.js' }, cwd, dir)).toBe(true)
    expect(forgeMayRun('Write', { file_path: '/home/g/.bashrc' }, cwd, dir)).toBe(false)
    expect(forgeMayRun('Write', { file_path: '/home/g/toy/../.bashrc' }, cwd, dir)).toBe(false)
    expect(forgeMayRun('Write', { file_path: '/home/g/toyota/a' }, cwd, dir)).toBe(false)
    expect(forgeMayRun('Write', { file_path: 'lib.js' }, cwd, dir)).toBe(false)
    expect(forgeMayRun('Bash', { command: 'npm test' }, cwd, dir)).toBe(true)
    expect(forgeMayRun('WebFetch', { url: 'https://x' }, cwd, dir)).toBe(false)
    expect(forgeMayRun('SubagentHandback', { message: 'informe' }, cwd, dir)).toBe(false)
  })

  test('si el mensaje final de una fase viene vacío de formato, se usa el último paso que lo trae', () => {
    const good = '## Status\ncontinue\n\n## Assumptions\n- el recall híbrido está en src/recall.ts'
    expect(pickAnswer('clarify', 'Listo, ya está.', ['mirando archivos', good, 'ok'])).toBe(good)
    expect(pickAnswer('clarify', good, ['otro'])).toBe(good)
    expect(pickAnswer('clarify', 'nada', ['tampoco'])).toBe('nada')
    expect(pickAnswer('veredicto', 'fin', ['## Veredicto\npasa'])).toBe('## Veredicto\npasa')
    const queja = '`SubagentHandback` is not available among the tools in this session, so I can’t call it. The exploration report was delivered above.'
    expect(pickAnswer('explore', queja, ['## Hallazgos\n- recall híbrido mezcla puntajes sin normalizar'])).toBe('## Hallazgos\n- recall híbrido mezcla puntajes sin normalizar')
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

describe('tandas paralelas', () => {
  const task = (id: string, o: { p?: boolean; files?: string; depends?: string; review?: number; done?: boolean } = {}) =>
    [`- [${o.done ? 'x' : ' '}] ${id} — tarea ${id}${o.p ? ' [P]' : ''}`, `  - files: ${o.files ?? `\`/r/${id}.js\``}`, `  - depends: [${o.depends ?? ''}]`, '  - evidence: `node --test` passes', `  - review: ~${o.review ?? 100} changed lines`].join('\n')
  const doc = (...ts: string[]) => ts.join('\n')
  const units = (text: string, root = '/r') => planUnits(parseTasks(text, root)).map((u) => (u.parallel ? `P:${u.tasks.join(',')}` : u.tasks.join(',')))

  test('parseTasks guarda los paths normalizados y la marca [P] de la cabecera', () => {
    const t = parseTasks(doc(task('T001', { p: true, files: '`src/a.ts` (new), `./src/a.test.ts`' }), task('T002', { files: 'lib/b.ts (new), /abs/c.ts' })), '/r')
    expect(t.map((x) => [x.id, x.parallel, x.paths, x.files])).toEqual([
      ['T001', true, ['src/a.ts', 'src/a.test.ts'], 2],
      ['T002', false, ['lib/b.ts', '/abs/c.ts'], 1],
    ])
    expect(parseTasks('- [ ] T001 — x\n  - files:\n    - `src/x.ts` (new)\n    - `/r/y/../z.ts`\n  - depends: []')[0]!.paths).toEqual(['src/x.ts', '/r/z.ts'])
    expect([normalizePath('a/./b.ts (new)', '/r/'), normalizePath('/r/x/../y.ts', '/r'), normalizePath('/otro/y.ts', '/r')]).toEqual(['a/b.ts', 'y.ts', '/otro/y.ts'])
    expect([samePath('src/a.ts', '/x/src/a.ts'), samePath('a.ts', 'ba.ts')]).toEqual([true, false])
    expect(parseTasks(['### T001 — [x] hecha', '### T002 — [ ] pendiente', '### T003 — sin caja [P]', '## [x] T004 — b', '- [x] **T005. c**'].join('\n')).map((t) => [t.id, t.done, t.parallel])).toEqual([
      ['T001', true, false],
      ['T002', false, false],
      ['T003', false, true],
      ['T004', true, false],
      ['T005', true, false],
    ])
  })

  test('sin [P] los lotes quedan iguales que siempre', () => {
    const text = doc(task('T001', { review: 300, done: true }), task('T002', { depends: 'T001', review: 500 }), task('T003', { depends: 'T002', review: 400 }), task('T004'))
    expect(planUnits(parseTasks(text)).map((u) => u.tasks)).toEqual(buildBatches(parseTasks(text)))
    expect(nextWave(parseTasks(text))).toEqual({ tasks: ['T002'], parallel: false })
    const six = doc(...Array.from({ length: 6 }, (_, i) => task(`T00${i + 1}`)))
    expect(units(six)).toEqual(['T001,T002,T003,T004', 'T005,T006'])
    expect(nextWave(parseTasks(doc(task('T001', { done: true }))))).toBe(undefined)
  })

  test('tres [P] con archivos distintos van juntas', () => {
    expect(units(doc(task('T001', { p: true }), task('T002', { p: true }), task('T003', { p: true }), task('T004', { depends: 'T001, T002, T003' })))).toEqual(['P:T001,T002,T003', 'T004'])
  })

  test('si dos se pisan en un archivo, la segunda queda para después', () => {
    const text = doc(task('T001', { p: true, files: '`/r/a.js`' }), task('T002', { p: true, files: '`/r/a.js`, `/r/b.js`' }), task('T003', { p: true, files: '`/r/c.js`' }))
    expect(units(text)).toEqual(['P:T001,T003', 'T002'])
  })

  test('una [P] que depende de otra de la misma tanda no entra', () => {
    const text = doc(task('T001', { p: true }), task('T002', { p: true, depends: 'T001' }), task('T003', { p: true }))
    expect(units(text)).toEqual(['P:T001,T003', 'T002'])
    expect(units(doc(task('T001', { p: true }), task('T002', { p: true, depends: 'T001' })))).toEqual(['T001,T002'])
  })

  test('si la primera no tiene [P] corre sola en su lote y la tanda sale después', () => {
    const text = doc(task('T001'), task('T002', { p: true }), task('T003', { p: true }), task('T004'))
    expect(units(text)).toEqual(['T001', 'P:T002,T003', 'T004'])
    expect(nextWave(parseTasks(text))).toEqual({ tasks: ['T001'], parallel: false })
  })

  test('un lote secuencial se corta antes de una tarea cuyas depends no están hechas ni en el lote', () => {
    expect(nextWave(parseTasks(doc(task('T001', { depends: 'T009' }), task('T002'), task('T003', { depends: 'T001' }))))).toEqual({ tasks: ['T002'], parallel: false })
    expect(nextWave(parseTasks(doc(task('T001'), task('T002', { depends: 'T001' }))))).toEqual({ tasks: ['T001', 'T002'], parallel: false })
  })

  test('el tope es de tres tareas por tanda', () => {
    expect(PARALLEL_MAX).toBe(3)
    expect(units(doc(...['T001', 'T002', 'T003', 'T004', 'T005'].map((id) => task(id, { p: true }))))).toEqual(['P:T001,T002,T003', 'P:T004,T005'])
  })

  test('(new), ./ y paths relativos se normalizan contra el code root antes de comparar', () => {
    const text = doc(task('T001', { p: true, files: '`src/a.ts` (new)' }), task('T002', { p: true, files: '`/r/src/a.ts`' }), task('T003', { p: true, files: '`./src/b.ts`' }))
    expect(units(text)).toEqual(['P:T001,T003', 'T002'])
    expect(units(text, '/otro')).toEqual(['P:T001,T003', 'T002'])
    expect(units(doc(task('T001', { p: true, files: '`/r/src/a.ts`' }), task('T002', { p: true, files: '`/r/lib/a.ts`' })))).toEqual(['P:T001,T002'])
  })

  test('las hechas cuentan como dependencias cumplidas y una tarea sin files no comparte tanda', () => {
    const text = doc(task('T001', { done: true }), task('T002', { p: true, depends: 'T001' }), task('T003', { p: true, files: '' }), task('T004', { p: true }))
    expect(units(text)).toEqual(['P:T002,T004', 'T003'])
  })

  test('tilda las tareas entregadas en tasks.md y nada más', () => {
    const text = ['- [ ] T001 — a [P]', '  - files: `/r/a`', '## [ ] T002 — b', '- [ ] **T003. c [P]**', '### T004 — d', '### T005 — [ ] e', '### T006 — [x] f', '- [ ] T010 — g', '  - depends: [T001]'].join('\n')
    const ticked = tickTasks(text, ['T001', 'T002', 'T003', 'T004', 'T005', 'T006'])
    expect(ticked).toBe(['- [x] T001 — a [P]', '  - files: `/r/a`', '## [x] T002 — b', '- [x] **T003. c [P]**', '### T004 — [x] d', '### T005 — [x] e', '### T006 — [x] f', '- [ ] T010 — g', '  - depends: [T001]'].join('\n'))
    expect(parseTasks(ticked).filter((t) => t.done).map((t) => t.id)).toEqual(['T001', 'T002', 'T003', 'T004', 'T005', 'T006'])
  })

  test('la evidencia de cada hijo se agrega en orden de id y el sobre de la tanda va bajo ## Wave', () => {
    expect(waveEvidence(2, [{ id: 'T003', text: '| T003 | t | red | green | |\n' }, { id: 'T002', text: '' }])).toBe(
      '## T002 (parallel wave 2)\n\n_No tdd-evidence/T002.md was written._\n\n## T003 (parallel wave 2)\n\n| T003 | t | red | green | |',
    )
    expect(waveEnvelope(2, 3, ['T002', 'T003'], { T002: { ok: true, text: ' hecho ' }, T003: { ok: false, text: '', reason: 'envelope vacío' } })).toBe(
      '## Wave 2/3: T002, T003\n\n### T002\n\nhecho\n\n### T003 (failed: envelope vacío)\n\n(no envelope)',
    )
  })
})

describe('build en tandas paralelas (hooks)', () => {
  const DIR = '/w/.sdd/suma-en-paralelo'
  const TASKS = [
    ['T001', ''],
    ['T002', ' [P]'],
    ['T003', ' [P]'],
    ['T004', ' [P]'],
    ['T005', ''],
  ]
    .map(([id, p]) => [`- [ ] ${id} — tarea${p}`, `  - files: \`src/${id}.ts\``, `  - depends: [${id === 'T005' ? 'T002, T003, T004' : ''}]`, '  - evidence: `bun test` passes', '  - review: ~50 changed lines'].join('\n'))
    .join('\n')

  async function world($: any, on: any, agent: (e: any) => Promise<any>) {
    mock.env(on, { HOME: '/h' })
    mock.store(on)
    const clock = mock.clock(on)
    const files: Record<string, string> = {}
    const submitted: string[] = []
    on('fs.read', async (_$: any, e: any) => ({ value: files[e.path] ?? '' }))
    on('fs.write', async (_$: any, e: any) => {
      files[e.path] = e.text
      return { value: undefined }
    })
    on('fs.list', async () => ({ value: [] }))
    on('fs.stat', async () => ({ deny: 'no existe' }))
    on('process.run', async () => ({ value: { exitCode: 0, stdout: '', stderr: '' } }))
    on('command.list', async () => ({ value: [] }))
    on('ui.log', async () => ({ value: undefined }))
    on('turn.complete', async (_$: any, e: any) => ({ text: e.answer }))
    on('tool.call', { tool: 'Agent' }, async (_$: any, e: any) => {
      if (e.subagent_type === 'forge:explore') return done('## Code roots\n- /w\n\nfindings de prueba, suficientemente largos para pasar.')
      if (e.subagent_type === 'forge:plan') {
        for (const f of ['proposal.md', 'spec.md', 'design.md']) files[`${DIR}/${f}`] = `# ${f}\n\ncontenido suficiente para validar.\n`
        files[`${DIR}/tasks.md`] = TASKS
        return done('plan escrito')
      }
      if (e.subagent_type === 'forge:veredicto') return done('todo verde\nVEREDICTO: pasa')
      return agent(e)
    })
    on('session.cwd', async () => ({ value: '/w' }))
    on('session.id', async () => ({ value: 'sesion' }))
    on('prompt.submit', async (_$: any, e: any) => {
      submitted.push(e.text)
      return { drop: '' }
    })
    await $.command.run({ command: 'forge', args: 'phase clarify off' })
    await $.command.run({ command: 'forge', args: 'phase analyze off' })
    return { clock, files, submitted }
  }

  const done = (text: string, agentId = 'a') => ({ result: { status: 'completed', agentId, content: [{ type: 'text', text }], totalToolUseCount: 0, totalDurationMs: 1, totalTokens: 0, usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use: null, service_tier: null, cache_creation: null }, prompt: 'p' } })
  const call = ($: any) => $.tool.call({ tool: 'Agent', subagent_type: 'forge:build', description: 'forge build', prompt: 'forge suma-en-paralelo build' })
  const textOf = (r: any) => String(r?.result?.content?.[0]?.text ?? r?.text ?? r?.deny ?? '')
  const tick = (files: Record<string, string>, ids: string[]) => {
    files[`${DIR}/tasks.md`] = tickTasks(files[`${DIR}/tasks.md`]!, ids)
  }

  async function toBuild($: any, w: { files: Record<string, string>; clock: any; submitted: string[] }) {
    const start: any = await $.command.run({ command: 'forge', args: '--auto suma en paralelo' })
    expect(start.text.startsWith('run suma-en-paralelo')).toBe(true)
    await w.clock.advance(30)
    expect(w.submitted.splice(0).map((t) => t.includes('subagent_type "forge:explore"'))).toEqual([true])
    await $.tool.call({ tool: 'Agent', subagent_type: 'forge:explore', description: 'forge explore', prompt: 'x' })
    const plan = textOf(await $.tool.call({ tool: 'Agent', subagent_type: 'forge:plan', description: 'forge plan', prompt: 'x' }))
    expect(plan).toContain('call the Agent tool with subagent_type "forge:build"')
    const first = textOf(await call($))
    expect(first).toContain('build lote 1/3 listo')
    expect(first).toContain('make 3 Agent tool calls IN ONE SINGLE MESSAGE')
    expect(w.files['/h/.local/state/forge/state.json'] && JSON.parse(w.files['/h/.local/state/forge/state.json']!).run.batch).toEqual({ index: 2, total: 3, tasks: ['T002', 'T003', 'T004'], parallel: true })
  }

  test('tres llamadas a la vez toman una tarea cada una, la de más se rechaza y la tanda cierra una sola vez', async ($, on) => {
    const seen: string[] = []
    const prompts: Record<string, string> = {}
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    let allIn!: () => void
    const entered = new Promise<void>((r) => (allIn = r))
    const w = await world($, on, async (e) => {
      const wave = /Implement ONLY task (T\d+)/.exec(e.prompt)
      if (wave) {
        const id = wave[1]!
        seen.push(id)
        prompts[id] = e.prompt
        if (seen.length === 3) allIn()
        await gate
        if (id === 'T003') return done('', `ag-${id}`)
        w.files[`${DIR}/tdd-evidence/${id}.md`] = `| ${id} | src/${id}.test.ts | red | green | |`
        return done(`hice ${id}`, `ag-${id}`)
      }
      const ids = (/implement ONLY tasks ([T\d, ]+), then return/.exec(e.prompt)?.[1] || '').split(', ').filter(Boolean)
      tick(w.files, ids)
      return done(`hice ${ids.join(',')}`)
    })
    await toBuild($, w)
    const calls = [call($), call($), call($), call($)]
    const extra = textOf(await calls[3])
    expect(extra).toContain('Extra forge:build call refused')
    await entered
    expect([...seen].sort()).toEqual(['T002', 'T003', 'T004'])
    expect(prompts.T002).toContain('Do NOT edit /w/.sdd/suma-en-paralelo/tasks.md')
    expect(prompts.T002).toContain('/w/.sdd/suma-en-paralelo/tdd-evidence/T002.md')
    release()
    const out = (await Promise.all(calls.slice(0, 3))).map(textOf)
    const closing = out.filter((t) => t.includes('Next:'))
    expect(closing.length).toBe(1)
    expect(out.filter((t) => t.includes('Do not call anything for this result')).length).toBe(2)
    expect(closing[0]).toContain('build tanda 2/3 (T002, T003, T004) listo · 2/3 entregadas · se reintentan solas: T003')
    expect(closing[0]).toContain('call the Agent tool with subagent_type "forge:build"')
    const tasks = parseTasks(w.files[`${DIR}/tasks.md`]!)
    expect(tasks.filter((t) => t.done).map((t) => t.id)).toEqual(['T001', 'T002', 'T004'])
    expect(w.files[`${DIR}/tdd-evidence.md`]).toBe('## T002 (parallel wave 2)\n\n| T002 | src/T002.test.ts | red | green | |\n\n## T004 (parallel wave 2)\n\n| T004 | src/T004.test.ts | red | green | |\n')
    expect(w.files[`${DIR}/build-r1.md`]).toContain('## Batch 1/3: T001\n\nhice T001\n\n## Wave 2/3: T002, T003, T004\n\n### T002\n\nhice T002\n\n### T003 (failed: the build envelope came back empty)\n\n(no envelope)\n\n### T004\n\nhice T004')
    const retry = textOf(await call($))
    expect(retry).toContain('build lote 3/4 listo')
    expect(w.files[`${DIR}/build-r1.md`]).toContain('## Batch 3/4: T003')
    expect(textOf(await call($))).toContain('Next: call the Agent tool with subagent_type "forge:veredicto"')
    const end = textOf(await $.tool.call({ tool: 'Agent', subagent_type: 'forge:veredicto', description: 'forge veredicto', prompt: 'x' }))
    expect(end).toContain('Outcome: PASA (verified) after 1 round(s).')
    const saved = JSON.parse(w.files[`${DIR}/run.json`]!)
    expect([saved.status, saved.verdicts, saved.flights, saved.unit]).toEqual(['pasa', ['pasa'], {}, undefined])
    expect(JSON.parse(w.files[`${DIR}/rounds.json`]!)).toEqual({ cap: 3, verdicts: ['pasa'] })
  })

  test('en segundo plano y con menos llamadas que las pedidas, la tanda cierra con las que salieron y el resto va en el lote siguiente', async ($, on) => {
    const w = await world($, on, async (e) => {
      const wave = /Implement ONLY task (T\d+)/.exec(e.prompt)
      if (wave) return { result: { status: 'async_launched', agentId: `ag-${wave[1]}`, description: 'd', prompt: e.prompt, outputFile: '/tmp/x' } }
      const ids = (/implement ONLY tasks ([T\d, ]+), then return/.exec(e.prompt)?.[1] || '').split(', ').filter(Boolean)
      tick(w.files, ids)
      return done(`hice ${ids.join(',')}`)
    })
    await toBuild($, w)
    const launched = await Promise.all([call($), call($)])
    expect(launched.map((r: any) => r.result.status)).toEqual(['async_launched', 'async_launched'])
    expect(Object.keys(JSON.parse(w.files[`${DIR}/run.json`]!).flights).sort()).toEqual(['ag-T002', 'ag-T003'])
    await $.turn.complete({ agentId: 'ag-T003', answer: 'hice T003', turnId: 't3', durationMs: 1, isAborted: false } as any)
    await w.clock.advance(100)
    expect(w.submitted).toEqual([])
    await $.turn.complete({ agentId: 'ag-T002', answer: 'hice T002', turnId: 't2', durationMs: 1, isAborted: false } as any)
    await w.clock.advance(100)
    expect(w.submitted.length).toBe(1)
    expect(w.submitted[0]).toContain('2/2 entregadas · sin lanzar, van en la próxima: T004')
    expect(w.submitted[0]).toContain('Next: call the Agent tool with subagent_type "forge:build"')
    expect(parseTasks(w.files[`${DIR}/tasks.md`]!).filter((t) => t.done).map((t) => t.id)).toEqual(['T001', 'T002', 'T003'])
    const saved = JSON.parse(w.files[`${DIR}/run.json`]!)
    expect([saved.unit.tasks, saved.unit.parallel, saved.flights, saved.verdicts]).toEqual([['T004', 'T005'], false, {}, []])
    expect(textOf(await call($))).toContain('build lote 3/3 listo')
  })
})

describe('tamaño del pedido (hooks)', () => {
  const done = (text: string) => ({ result: { status: 'completed', agentId: 'a', content: [{ type: 'text', text }], totalToolUseCount: 0, totalDurationMs: 1, totalTokens: 0, usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use: null, service_tier: null, cache_creation: null }, prompt: 'p' } })
  const textOf = (r: any) => String(r?.result?.content?.[0]?.text ?? r?.text ?? r?.deny ?? '')
  const agent = ($: any, phase: string) => $.tool.call({ tool: 'Agent', subagent_type: `forge:${phase}`, description: `forge ${phase}`, prompt: 'x' })
  const CLARIFY = (size: string) => `## Status\ncontinue\n\n## Size\nSize: ${size}\n\n## Assumptions\n- es un typo en el README, nada más`

  async function world($: any, on: any, size: string, picks: string[] = []) {
    mock.env(on, { HOME: '/h' })
    mock.store(on)
    const clock = mock.clock(on)
    const files: Record<string, string> = {}
    const logs: string[] = []
    const asks: string[] = []
    let dir = ''
    on('fs.read', async (_$: any, e: any) => ({ value: files[e.path] ?? '' }))
    on('fs.write', async (_$: any, e: any) => {
      files[e.path] = e.text
      return { value: undefined }
    })
    on('fs.list', async () => ({ value: [] }))
    on('fs.stat', async () => ({ deny: 'no existe' }))
    on('process.run', async () => ({ value: { exitCode: 0, stdout: '', stderr: '' } }))
    on('command.list', async () => ({ value: [] }))
    on('ui.log', async (_$: any, e: any) => {
      logs.push(JSON.stringify(e))
      return { value: undefined }
    })
    on('tool.call', { tool: 'AskUserQuestion' }, async (_$: any, e: any) => {
      const q = String(e.questions?.[0]?.question ?? '')
      asks.push(q)
      return { result: { questions: e.questions, answers: { [q]: picks.shift() ?? 'Continuar' } } }
    })
    on('tool.call', { tool: 'Agent' }, async (_$: any, e: any) => {
      if (e.subagent_type === 'forge:clarify') return done(CLARIFY(size))
      if (e.subagent_type === 'forge:explore') return done('## Code roots\n- /w\n\nfindings de prueba, suficientemente largos para pasar.')
      if (e.subagent_type === 'forge:plan') {
        for (const f of ['proposal.md', 'spec.md', 'design.md']) files[`${dir}/${f}`] = `# ${f}\n\ncontenido suficiente para validar.\n`
        files[`${dir}/tasks.md`] = '- [ ] T001 — arreglar el typo\n  - files: `README.md`\n  - depends: []\n  - evidence: `bun test` passes\n  - review: ~1 changed lines'
        return done('plan escrito')
      }
      if (e.subagent_type === 'forge:build') {
        files[`${dir}/tasks.md`] = tickTasks(files[`${dir}/tasks.md`]!, ['T001'])
        return done('typo arreglado')
      }
      return done('todo verde\nVEREDICTO: pasa')
    })
    on('session.cwd', async () => ({ value: '/w' }))
    on('session.id', async () => ({ value: 'sesion' }))
    on('prompt.submit', async () => ({ drop: '' }))
    await $.command.run({ command: 'forge', args: 'phase clarify on' })
    await $.command.run({ command: 'forge', args: 'phase analyze off' })
    return {
      files,
      logs,
      asks,
      start: async (args: string) => {
        const r: any = await $.command.run({ command: 'forge', args })
        dir = `/w/.sdd/${String(r.text).split(' ')[1]}`
        await clock.advance(30)
        return dir
      },
    }
  }

  test('en automatic un pedido chico se anota en routing.log y en el log, el run sigue igual y el cierre recomienda NODD', async ($, on) => {
    const w = await world($, on, 'small')
    const dir = await w.start('--auto arreglá un typo del README')
    const after = textOf(await agent($, 'clarify'))
    expect(after).toContain('Next: call the Agent tool with subagent_type "forge:explore"')
    expect(w.files[`${dir}/clarifications.md`]).toContain('Size: small')
    expect(w.files[`${dir}/routing.log`]).toContain(`tamaño small: ${NODD_HINT}`)
    expect(w.logs.filter((l) => l.includes('nodd.com.ar')).length).toBe(1)
    expect(w.asks).toEqual([])
    expect(JSON.parse(w.files[`${dir}/run.json`]!).size).toBe('small')
    expect(JSON.parse(w.files['/h/.local/state/forge/state.json']!).run.size).toBe('small')
    await agent($, 'explore')
    await agent($, 'plan')
    expect(textOf(await agent($, 'build'))).toContain('forge:veredicto')
    const end = textOf(await agent($, 'veredicto'))
    expect(end).toContain('Outcome: PASA (verified) after 1 round(s).')
    expect(end).toContain(NODD_HINT)
    expect(w.logs.filter((l) => l.includes('nodd.com.ar')).length).toBe(1)
  })

  test('en interactive el aviso va una sola vez en la pausa después de clarify, y un pedido normal no avisa nada', async ($, on) => {
    const w = await world($, on, 'small', ['Continuar', 'Parar'])
    const dir = await w.start('--interactive arreglá un typo del README')
    expect(textOf(await agent($, 'clarify'))).toContain('forge:explore')
    expect(w.asks.length).toBe(1)
    expect(w.asks[0]).toContain('¿Seguimos con explore?')
    expect(w.asks[0]).toContain(NODD_HINT)
    expect(w.logs.some((l) => l.includes('nodd.com.ar'))).toBe(false)
    const stopped = textOf(await agent($, 'explore'))
    expect(w.asks.length).toBe(2)
    expect(w.asks[1]).not.toContain('nodd.com.ar')
    expect(stopped).toContain('stopped by the user before plan')
    expect(stopped).toContain(NODD_HINT)
    expect(JSON.parse(w.files[`${dir}/run.json`]!).size).toBe('small')
  })

  test('con Size: normal no hay aviso ni recomendación en el cierre', async ($, on) => {
    const w = await world($, on, 'normal')
    const dir = await w.start('--auto agregá un endpoint nuevo')
    await agent($, 'clarify')
    expect(w.files[`${dir}/routing.log`]).not.toContain('nodd.com.ar')
    expect(JSON.parse(w.files[`${dir}/run.json`]!).size).toBe('normal')
    await agent($, 'explore')
    await agent($, 'plan')
    await agent($, 'build')
    const end = textOf(await agent($, 'veredicto'))
    expect(end).toContain('Outcome: PASA')
    expect(end).not.toContain('NODD')
    expect(w.logs.some((l) => l.includes('nodd.com.ar'))).toBe(false)
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
    const mb: any = await $.command.run({ command: 'forge', args: 'model build prolite/gpt-6-sol' })
    expect(mb.text).toBe('build → prolite/gpt-6-sol (CPAM) · perfil equilibrado ★ modificado (/forge profile reset equilibrado lo restaura)')
    const edited = JSON.parse(files['/h/.local/state/forge/state.json'])
    expect([edited.profile, edited.profiles.equilibrado.build, edited.profiles.equilibrado.modified, edited.profiles.turbo.modified]).toEqual(['equilibrado', 'prolite/gpt-6-sol', true, false])
    const eff: any = await $.command.run({ command: 'forge', args: 'effort plan xhigh' })
    expect(eff.text.startsWith('plan · effort xhigh · perfil equilibrado ★ modificado')).toBe(true)
    expect(JSON.parse(files['/h/.local/state/forge/state.json']).efforts.plan).toBe('xhigh')
    const cl: any = await $.command.run({ command: 'forge', args: 'model clarify ag3/gemini-3.5-flash-lite' })
    expect(cl.text.startsWith('clarify → ag3/gemini-3.5-flash-lite (CPAM) · perfil equilibrado')).toBe(true)
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
    expect(after.profiles.mio).toEqual({ ...DEFAULT_PROFILES.equilibrado, build: 'prolite/gpt-6-sol', effort: { ...DEFAULT_EFFORTS.equilibrado, plan: 'xhigh' }, builtin: false, modified: false, source: 'forge' })
    expect([after.mode, after.cap, after.profile]).toEqual(['ask', 5, 'mio'])
    const del2: any = await $.command.run({ command: 'forge', args: 'profile delete equilibrado' })
    expect(del2.text).toBe('equilibrado es de fábrica, no se borra · /forge profile reset equilibrado lo restaura')
    const reset: any = await $.command.run({ command: 'forge', args: 'profile reset equilibrado' })
    expect(reset.text).toBe('perfil equilibrado restaurado de fábrica')
    const restored = JSON.parse(files['/h/.local/state/forge/state.json'])
    expect([restored.profiles.equilibrado.build, restored.profiles.equilibrado.effort.plan, restored.profiles.equilibrado.modified, restored.profile]).toEqual([DEFAULT_PROFILES.equilibrado.build, DEFAULT_EFFORTS.equilibrado.plan, false, 'mio'])
    expect(restored.profiles.mio.build).toBe('prolite/gpt-6-sol')
    expect(((await $.command.run({ command: 'forge', args: 'profile reset equilibrado' })) as any).text).toBe('equilibrado ya está como de fábrica')
    expect(((await $.command.run({ command: 'forge', args: 'profile reset mio' })) as any).text).toBe('mio no es de fábrica: sólo se restauran los de fábrica')
    const gone: any = await $.command.run({ command: 'forge', args: 'profile delete mio' })
    expect(gone.text).toBe('perfil mio borrado')
    const last = JSON.parse(files['/h/.local/state/forge/state.json'])
    expect([last.profiles.mio, last.profile]).toEqual([undefined, 'custom'])
  })
})

const ZERO = {
  models: { explore: 'personal/claude-sonnet-5-5' },
  profiles: {
    'solo-claude': {
      models: { clarify: 'personal/claude-sonnet-5-5', explore: 'personal/claude-sonnet-5-5', plan: 'personal/claude-opus-5-5', analyze: 'personal/claude-opus-5-5', build: 'personal/claude-opus-5-5', veredicto: 'personal/claude-opus-5-5' },
      providers: { clarify: 'cliproxy', explore: 'cliproxy', plan: 'cliproxy', analyze: 'cliproxy', build: 'cliproxy', veredicto: 'cliproxy' },
      thinking: { clarify: 'medium', explore: 'high', plan: 'xhigh', analyze: 'high', build: 'high', veredicto: 'xhigh' },
    },
    'solo-gemini': {
      models: { explore: 'ag/gemini-3.8-flash-high', plan: 'ag/gemini-pro-agent', build: 'ag/gemini-3.8-flash-high', veredicto: 'ag/gemini-pro-agent' },
      providers: { explore: 'cliproxy', plan: 'cliproxy', build: 'cliproxy', veredicto: 'cliproxy' },
    },
  },
  activeProfile: 'solo-claude',
}

describe('perfiles editables', () => {
  test('los alias del plan de Claude van a zero-pi como anthropic con el id concreto; lo del CPAM queda en cliproxy', () => {
    expect(zeroTarget('fable')).toEqual({ provider: 'anthropic', model: 'claude-fable-5-1' })
    expect(zeroTarget('haiku')).toEqual({ provider: 'anthropic', model: 'claude-haiku-4-5-20251001' })
    expect(zeroTarget('sonnet')).toEqual({ provider: 'anthropic', model: 'claude-sonnet-5-5' })
    expect(zeroTarget('opus')).toEqual({ provider: 'anthropic', model: 'claude-opus-5-5' })
    expect(zeroTarget('claude-opus-4-8')).toEqual({ provider: 'anthropic', model: 'claude-opus-4-8' })
    expect(zeroTarget('personal/claude-opus-5-5')).toEqual({ provider: 'cliproxy', model: 'personal/claude-opus-5-5' })
    expect(zeroTarget('prolite/gpt-6-sol')).toEqual({ provider: 'cliproxy', model: 'prolite/gpt-6-sol' })
    expect(zeroTarget('ag/gemini-pro-agent')).toEqual({ provider: 'cliproxy', model: 'ag/gemini-pro-agent' })
    expect(zeroTarget('toString')).toEqual({ provider: 'cliproxy', model: 'toString' })
    expect([aliasOf('claude-fable-5-1'), aliasOf('claude-opus-4-8')]).toEqual(['fable', 'claude-opus-4-8'])
    const z = zeroProfiles({ profiles: { x: { models: { explore: 'claude-haiku-4-5-20251001', plan: 'claude-opus-5-5', build: 'claude-opus-5-5', veredicto: 'personal/claude-opus-5-5' }, providers: { explore: 'anthropic', plan: 'anthropic', build: 'cliproxy', veredicto: 'cliproxy' } } } })
    expect(z.profiles['zero:x']).toEqual({ clarify: 'haiku', explore: 'haiku', plan: 'opus', analyze: 'opus', build: 'claude-opus-5-5', veredicto: 'personal/claude-opus-5-5' })
  })

  test('editar un perfil de zero-pi toca sólo esa fase y deja el resto del archivo igual, con el mismo orden', () => {
    const raw = JSON.stringify(ZERO, null, 2) + '\n'
    const r: any = editZeroProfile(raw, 'solo-claude', 'analyze', { model: 'fable' })
    const want = JSON.parse(raw)
    want.profiles['solo-claude'].models.analyze = 'claude-fable-5-1'
    want.profiles['solo-claude'].providers.analyze = 'anthropic'
    expect(r.text).toBe(JSON.stringify(want, null, 2) + '\n')
    const auto: any = editZeroProfile(r.text, 'solo-claude', 'analyze', { effort: 'auto' })
    expect(Object.keys(JSON.parse(auto.text).profiles['solo-claude'].thinking)).toEqual(['clarify', 'explore', 'plan', 'build', 'veredicto'])
    const gem: any = editZeroProfile(raw, 'solo-gemini', 'clarify', { model: 'prolite/gpt-6-luna', effort: 'low' })
    const g = JSON.parse(gem.text).profiles['solo-gemini']
    expect([g.models.clarify, g.providers.clarify, g.thinking]).toEqual(['prolite/gpt-6-luna', 'cliproxy', { clarify: 'low' }])
    expect(JSON.stringify(JSON.parse(gem.text).profiles['solo-claude'])).toBe(JSON.stringify(ZERO.profiles['solo-claude']))
    expect(editZeroProfile(raw, 'no-existe', 'plan', { model: 'opus' })).toEqual({ error: '~/.pi/zero.json no tiene el perfil no-existe' })
    expect('error' in editZeroProfile('{roto', 'solo-claude', 'plan', { model: 'opus' })).toBe(true)
  })

  test('los nombres de perfil nuevos se limpian y no pisan otros ni los reservados', () => {
    expect(profileName('Mi Perfil Rápido!', [])).toEqual({ name: 'mi-perfil-rapido' })
    expect(profileName('  .x_1.2-  ', [])).toEqual({ name: 'x_1.2' })
    expect(profileName('mio', ['mio'])).toEqual({ error: 'ya existe el perfil mio' })
    expect(profileName('custom', [])).toEqual({ error: 'custom es un nombre reservado' })
    expect(profileName('turbo', [])).toEqual({ error: 'turbo es un nombre reservado' })
    expect('error' in profileName('¡¡!!', [])).toBe(true)
    expect(builtinModified('turbo', DEFAULT_PROFILES.turbo, DEFAULT_EFFORTS.turbo)).toBe(false)
    expect(builtinModified('turbo', { ...DEFAULT_PROFILES.turbo, plan: 'opus' }, DEFAULT_EFFORTS.turbo)).toBe(true)
    expect(builtinModified('turbo', DEFAULT_PROFILES.turbo, { ...DEFAULT_EFFORTS.turbo, plan: 'auto' })).toBe(true)
    expect(builtinModified('mio', DEFAULT_PROFILES.turbo, DEFAULT_EFFORTS.turbo)).toBe(false)
  })

  test('cambiar una fase con un perfil de zero-pi activo lo escribe en zero.json, hace un solo backup y el perfil sigue elegido', async ($, on) => {
    mock.env(on, { HOME: '/h' })
    mock.store(on)
    const raw = JSON.stringify(ZERO, null, 2) + '\n'
    const files: Record<string, string> = {}
    const writes: string[] = []
    on('fs.read', async (_$: any, e: any) => ({ value: e.path in files ? files[e.path] : e.path === '/h/.pi/zero.json' ? raw : '' }))
    on('fs.stat', async (_$: any, e: any) => (e.path === '/h/.pi/zero.json' ? { value: { kind: 'file', size: (files[e.path] || raw).length, mtimeMs: writes.length } } : { deny: 'no existe' }))
    on('fs.write', async (_$: any, e: any) => {
      files[e.path] = e.text
      writes.push(e.path)
      return { value: undefined }
    })
    on('process.run', async () => ({ exitCode: 0, stdout: '', stderr: '' }))
    on('command.list', async () => [])
    on('session.start', async (_$: any, e: any) => ({ cwd: e.cwd }))
    await $.session.start({ cwd: '/tmp', surface: null, isInteractive: false })
    expect(((await $.command.run({ command: 'forge', args: 'profile zero:solo-claude' })) as any).text).toBe('perfil zero:solo-claude activo')
    const r: any = await $.command.run({ command: 'forge', args: 'model analyze fable' })
    expect(r.text).toBe('analyze → fable (Claude Code) · zero:solo-claude guardado en ~/.pi/zero.json')
    const written = JSON.parse(files['/h/.pi/zero.json'])
    expect([written.profiles['solo-claude'].models.analyze, written.profiles['solo-claude'].providers.analyze]).toEqual(['claude-fable-5-1', 'anthropic'])
    expect(written.profiles['solo-gemini']).toEqual(ZERO.profiles['solo-gemini'])
    expect([written.models, written.activeProfile]).toEqual([ZERO.models, 'solo-claude'])
    const backups = Object.keys(files).filter((f) => f.startsWith('/h/.pi/zero.json.bak-forge-'))
    expect(backups.length).toBe(1)
    expect(files[backups[0]!]).toBe(raw)
    const st = JSON.parse(files['/h/.local/state/forge/state.json'])
    expect([st.profile, st.models.analyze, st.profiles['zero:solo-claude'].analyze, st.profiles['zero:solo-claude'].source]).toEqual(['zero:solo-claude', 'fable', 'fable', 'zero-pi'])
    const e: any = await $.command.run({ command: 'forge', args: 'effort plan medium' })
    expect(e.text).toBe('plan · effort medium · zero:solo-claude guardado en ~/.pi/zero.json')
    await $.command.run({ command: 'forge', args: 'effort analyze auto' })
    const again = JSON.parse(files['/h/.pi/zero.json']).profiles['solo-claude']
    expect([again.thinking.plan, 'analyze' in again.thinking]).toEqual(['medium', false])
    expect(Object.keys(files).filter((f) => f.startsWith('/h/.pi/zero.json.bak-forge-')).length).toBe(1)
    const st2 = JSON.parse(files['/h/.local/state/forge/state.json'])
    expect([st2.profile, st2.efforts.plan, st2.efforts.analyze]).toEqual(['zero:solo-claude', 'medium', 'auto'])
  })

  test('profile new copia la config actual en un perfil propio y lo elige; delete lo saca', async ($, on) => {
    mock.env(on, { HOME: '/h' })
    mock.store(on)
    const files: Record<string, string> = {}
    on('fs.write', async (_$: any, e: any) => {
      files[e.path] = e.text
    })
    on('process.run', async () => ({ exitCode: 0, stdout: '', stderr: '' }))
    on('command.list', async () => [])
    await $.command.run({ command: 'forge', args: 'profile turbo' })
    const made: any = await $.command.run({ command: 'forge', args: 'profile new Prueba X' })
    expect(made.text).toBe('perfil prueba-x creado con la config actual y activo')
    const st = JSON.parse(files['/h/.local/state/forge/state.json'])
    expect([st.profile, st.profiles['prueba-x'].builtin, st.profiles['prueba-x'].source, st.profiles['prueba-x'].plan, st.profiles['prueba-x'].effort.plan]).toEqual(['prueba-x', false, 'forge', DEFAULT_PROFILES.turbo.plan, DEFAULT_EFFORTS.turbo.plan])
    expect(((await $.command.run({ command: 'forge', args: 'profile new prueba-x' })) as any).text).toBe('no se creó: ya existe el perfil prueba-x')
    expect(((await $.command.run({ command: 'forge', args: 'profile new custom' })) as any).text).toBe('no se creó: custom es un nombre reservado')
    expect(((await $.command.run({ command: 'forge', args: 'profile new' })) as any).text).toBe('uso: /forge profile new <nombre>')
    const m: any = await $.command.run({ command: 'forge', args: 'model plan opus' })
    expect(m.text).toBe('plan → opus (Claude Code) · perfil prueba-x actualizado')
    const st2 = JSON.parse(files['/h/.local/state/forge/state.json'])
    expect([st2.profile, st2.profiles['prueba-x'].plan, st2.profiles.turbo.plan]).toEqual(['prueba-x', 'opus', DEFAULT_PROFILES.turbo.plan])
    expect(((await $.command.run({ command: 'forge', args: 'profile delete prueba-x' })) as any).text).toBe('perfil prueba-x borrado')
    const st3 = JSON.parse(files['/h/.local/state/forge/state.json'])
    expect([st3.profiles['prueba-x'], st3.profile]).toEqual([undefined, 'custom'])
  })
})

const NODD_REQUIREMENTS = [
  '# Login con magic link',
  '',
  'Promoted from the NODD run `login-magic-link`. NODD kept the inline route until the work',
  'outgrew it; this document is the handoff, not a fresh start.',
  '',
  '## Objective',
  '',
  'Que el usuario entre con un link que le llega por mail.',
  '',
  '## Problem',
  '',
  'Hoy el login sólo acepta password.',
  '',
  '## Scope',
  '',
  'El endpoint del link y el mail; el rediseño de la pantalla de login queda afuera.',
  '',
  '## Constraints',
  '',
  'Sin dependencias nuevas.',
  '',
  '## Remaining work',
  '',
  '- T3 — Mandar el mail con el link',
  '- T4 — Validar el token del link',
  '',
  '## Already resolved — do not redo',
  '',
  'The work below is **already done and verified**. It must not be redone, re-planned or',
  're-implemented. Treat it as existing context; plan only what remains.',
  '',
  '- **T1 — Tabla de tokens**',
  '  - verified by: `bun test tokens`',
  '  - observed: 4 pass, 0 fail',
  '  - review candidate: no',
  '- **T2 — Expiración de 15 minutos**',
  '  - verified by: `bun test tokens`',
  '  - observed: 6 pass, 0 fail',
  '  - review candidate: no',
  '',
].join('\n')

describe('handoff desde NODD', () => {
  test('un directorio es handoff sólo con la línea de NODD y sin identidad, plan ni request.md', () => {
    expect(isNoddHandoff(['requirements.md'], NODD_REQUIREMENTS)).toBe(true)
    expect(isNoddHandoff(['requirements.md', 'notas.txt'], NODD_REQUIREMENTS)).toBe(true)
    expect(noddHandoffProblem([], NODD_REQUIREMENTS)).toBe('no tiene requirements.md')
    expect(noddHandoffProblem(['requirements.md'], '# Spec\n\nEscrita a mano por el SDD.')).toContain('no trae la línea')
    expect(isNoddHandoff(['requirements.md'], 'Esto no fue Promoted from the NODD run `x`.')).toBe(false)
    expect(noddHandoffProblem(['requirements.md', 'run.json'], NODD_REQUIREMENTS)).toBe('ya es un run (run.json)')
    expect(noddHandoffProblem(['requirements.md', 'execution.json'], NODD_REQUIREMENTS)).toBe('ya es un run (execution.json)')
    expect(noddHandoffProblem(['requirements.md', 'design.md', 'tasks.md'], NODD_REQUIREMENTS)).toBe('ya tiene plan (design.md, tasks.md)')
    expect(noddHandoffProblem(['requirements.md', 'request.md'], NODD_REQUIREMENTS)).toBe('ya tiene request.md')
  })

  test('un run adoptado y cortado antes de spec.md se puede retomar; uno con spec.md, corriendo o sin la marca no', () => {
    const files = ['requirements.md', 'request.md', 'run.json', 'findings.md']
    expect(adoptedRunResumable(files, NODD_REQUIREMENTS, { origin: 'nodd', status: 'parado' })).toBe(true)
    expect(adoptedRunResumable(files, NODD_REQUIREMENTS, { origin: 'nodd', status: 'cortado' })).toBe(true)
    expect(adoptedRunResumable([...files, 'spec.md'], NODD_REQUIREMENTS, { origin: 'nodd', status: 'parado' })).toBe(false)
    expect(adoptedRunResumable(files, NODD_REQUIREMENTS, { origin: 'nodd', status: 'running' })).toBe(false)
    expect(adoptedRunResumable(files, NODD_REQUIREMENTS, { status: 'parado' })).toBe(false)
    expect(adoptedRunResumable(files, '# Spec escrita a mano', { origin: 'nodd', status: 'parado' })).toBe(false)
    expect(adoptedRunResumable([...files, 'execution.json'], NODD_REQUIREMENTS, { origin: 'nodd', status: 'parado' })).toBe(false)
  })

  test('continue lee un slug opcional y las banderas, y rechaza lo que no es un slug', () => {
    expect(parseContinue('continue')).toEqual({ slug: '' })
    expect(parseContinue('seguir login-magic-link')).toEqual({ slug: 'login-magic-link' })
    expect(parseContinue('continue --auto --cap 2 login-magic-link')).toEqual({ slug: 'login-magic-link', mode: 'automatic', cap: 2 })
    expect(parseContinue('Continue --interactive')).toEqual({ slug: '', mode: 'interactive' })
    expect(parseContinue('continue a b')).toEqual({ error: 'uso: /forge continue [--auto|--interactive] [--cap N] [--profile p] [<slug>]' })
    expect(parseContinue('continue ../etc')).toEqual({ error: 'slug inválido: ../etc' })
    expect(parseContinue('continuar con el login')).toBe(undefined)
    expect(parseContinue('status')).toBe(undefined)
  })

  test('los briefs de explore y plan de un run adoptado nombran requirements.md y lo resuelto como contexto; los demás no', () => {
    const base = { slug: 's', dir: '/w/.sdd/s', cwd: '/w', request: NODD_REQUIREMENTS, round: 0, cap: 3 }
    const explore = briefFor({ ...base, phase: 'explore', handoff: true })
    const plan = briefFor({ ...base, phase: 'plan', handoff: true })
    for (const b of [explore, plan]) {
      expect(b).toContain('/w/.sdd/s/requirements.md')
      expect(b).toContain('"Already resolved — do not redo" in requirements.md are context, not work')
    }
    expect(plan).toContain('write no task for them')
    expect(briefFor({ ...base, phase: 'build', handoff: true })).not.toContain('requirements.md')
    expect(briefFor({ ...base, phase: 'plan' })).not.toContain('requirements.md')
  })
})

describe('handoff desde NODD (hooks)', () => {
  const SLUG = 'login-magic-link'
  const DIR = `/w/.sdd/${SLUG}`
  const STATE = '/h/.local/state/forge/state.json'
  const done = (text: string) => ({ result: { status: 'completed', agentId: 'a', content: [{ type: 'text', text }], totalToolUseCount: 0, totalDurationMs: 1, totalTokens: 0, usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use: null, service_tier: null, cache_creation: null }, prompt: 'p' } })
  const textOf = (r: any) => String(r?.result?.content?.[0]?.text ?? r?.text ?? r?.deny ?? '')
  const agent = ($: any, phase: string) => $.tool.call({ tool: 'Agent', subagent_type: `forge:${phase}`, description: `forge ${phase}`, prompt: 'x' })
  const forge = async ($: any, args: string) => String(((await $.command.run({ command: 'forge', args })) as any).text)

  async function world($: any, on: any, env: Record<string, string> = {}, seed: Record<string, string> = {}) {
    mock.env(on, { HOME: '/h', ...env })
    mock.store(on)
    const clock = mock.clock(on)
    const files: Record<string, string> = { ...seed }
    const submitted: string[] = []
    const seen: string[] = []
    const prompts: Record<string, string> = {}
    on('fs.read', async (_$: any, e: any) => ({ value: files[e.path] ?? '' }))
    on('fs.write', async (_$: any, e: any) => {
      files[e.path] = e.text
      return { value: undefined }
    })
    on('fs.list', async (_$: any, e: any) => {
      const pre = `${String(e.path).replace(/\/$/, '')}/`
      const kids = new Map<string, string>()
      for (const f of Object.keys(files)) {
        if (!f.startsWith(pre)) continue
        const [name, ...more] = f.slice(pre.length).split('/')
        kids.set(name!, more.length ? 'dir' : 'file')
      }
      return kids.size ? { value: [...kids].map(([name, kind]) => ({ name, kind })) } : { deny: 'no existe' }
    })
    on('fs.stat', async (_$: any, e: any) => (e.path in files ? { value: { kind: 'file', size: files[e.path]!.length, mtimeMs: Date.now() } } : { deny: 'no existe' }))
    on('process.run', async () => ({ value: { exitCode: 0, stdout: '', stderr: '' } }))
    on('command.list', async () => ({ value: [] }))
    on('ui.log', async () => ({ value: undefined }))
    on('tool.call', { tool: 'Agent' }, async (_$: any, e: any) => {
      const phase = String(e.subagent_type).replace('forge:', '')
      seen.push(e.subagent_type)
      prompts[phase] = e.prompt
      const dir = String(/Run directory \(artifacts\): (\S+)/.exec(e.prompt)?.[1] || '')
      if (phase === 'clarify') return done('## Status\ncontinue\n\n## Size\nSize: normal\n\n## Assumptions\n- nada')
      if (phase === 'explore') return done('## Code roots\n- /w\n\nfindings de prueba, suficientemente largos para pasar.')
      if (phase === 'plan') {
        for (const f of ['proposal.md', 'spec.md', 'design.md']) files[`${dir}/${f}`] = `# ${f}\n\ncontenido suficiente para validar.\n`
        files[`${dir}/tasks.md`] = '- [ ] T001 — mandar el mail\n  - files: `src/mail.ts`\n  - depends: []\n  - evidence: `bun test` passes\n  - review: ~40 changed lines'
        return done('plan escrito')
      }
      if (phase === 'build') {
        files[`${dir}/tasks.md`] = tickTasks(files[`${dir}/tasks.md`]!, ['T001'])
        return done('mail hecho')
      }
      return done('todo verde\nVEREDICTO: pasa')
    })
    on('session.cwd', async () => ({ value: '/w' }))
    on('session.id', async () => ({ value: 'sesion' }))
    on('session.start', async (_$: any, e: any) => ({ cwd: e.cwd }))
    on('prompt.submit', async (_$: any, e: any) => {
      submitted.push(e.text)
      return { drop: '' }
    })
    await $.command.run({ command: 'forge', args: 'phase clarify on' })
    await $.command.run({ command: 'forge', args: 'phase analyze off' })
    return { clock, files, submitted, seen, prompts }
  }

  test('adopta el handoff: request.md es requirements.md byte a byte, arranca en explore y clarify no corre', async ($, on) => {
    const w = await world($, on)
    w.files[`${DIR}/requirements.md`] = NODD_REQUIREMENTS
    const text = await forge($, `continue --auto ${SLUG}`)
    expect(text).toBe(`adopto el handoff de NODD ${SLUG}: arranca en explore sin clarify · modo automatic · cap 3 · perfil barato\nartefactos: ${DIR}`)
    expect(w.files[`${DIR}/request.md`]).toBe(NODD_REQUIREMENTS)
    const saved = JSON.parse(w.files[`${DIR}/run.json`]!)
    expect([saved.slug, saved.dir, saved.origin, saved.expected, saved.order, saved.request]).toEqual([SLUG, DIR, 'nodd', 'explore', ['explore', 'plan', 'build', 'veredicto'], NODD_REQUIREMENTS])
    const state = JSON.parse(w.files[STATE]!)
    expect([state.run.origin, state.run.phaseOrder[0], state.run.slug]).toEqual(['nodd', 'explore', SLUG])
    expect(w.files[`${DIR}/routing.log`]).toContain('adoptado de NODD')
    await w.clock.advance(30)
    expect(w.submitted.length).toBe(1)
    expect(w.submitted[0]).toContain('subagent_type "forge:explore"')
    expect(textOf(await agent($, 'clarify'))).toContain('Next: call the Agent tool with subagent_type "forge:plan"')
    await agent($, 'plan')
    await agent($, 'build')
    expect(textOf(await agent($, 'veredicto'))).toContain('Outcome: PASA (verified) after 1 round(s).')
    expect(w.seen).toEqual(['forge:explore', 'forge:plan', 'forge:build', 'forge:veredicto'])
    expect(w.prompts.explore).toContain(`${DIR}/requirements.md`)
    expect(w.prompts.explore).toContain('are context, not work')
    expect(w.prompts.plan).toContain(`${DIR}/requirements.md`)
    expect(w.prompts.plan).toContain('write no task for them')
    expect(w.prompts.build).not.toContain('requirements.md')
    expect(w.files[`${DIR}/clarifications.md`]).toBe(undefined)
    expect(w.files[`${DIR}/requirements.md`]).toBe(NODD_REQUIREMENTS)
    expect(JSON.parse(w.files[`${DIR}/run.json`]!).status).toBe('pasa')
  })

  test('no adopta un directorio que no es handoff y lo dice en castellano', async ($, on) => {
    const w = await world($, on)
    w.files['/w/.sdd/a-mano/requirements.md'] = '# Spec\n\nEscrita a mano.\n'
    w.files['/w/.sdd/con-plan/requirements.md'] = NODD_REQUIREMENTS
    w.files['/w/.sdd/con-plan/design.md'] = '# design'
    w.files['/w/.sdd/de-zero/requirements.md'] = NODD_REQUIREMENTS
    w.files['/w/.sdd/de-zero/execution.json'] = '{}'
    w.files['/w/.sdd/de-zero/request.md'] = 'pedido'
    expect(await forge($, 'continue a-mano')).toContain('no adopto .sdd/a-mano: no es un handoff de NODD (su requirements.md no trae la línea «Promoted from the NODD run»)')
    expect(await forge($, 'continue con-plan')).toContain('no es un handoff de NODD (ya tiene plan (design.md))')
    expect(await forge($, 'continue de-zero')).toContain('no es un handoff de NODD (ya es un run (execution.json))')
    expect(await forge($, 'continue no-esta')).toContain('no es un handoff de NODD (no existe /w/.sdd/no-esta)')
    expect(await forge($, 'continue ../afuera')).toBe('slug inválido: ../afuera')
    expect(await forge($, 'continue')).toBe('no hay un run parado para seguir')
    expect(['a-mano', 'con-plan'].map((d) => w.files[`/w/.sdd/${d}/request.md`])).toEqual([undefined, undefined])
    expect(Object.keys(w.files).filter((f) => f.endsWith('/run.json'))).toEqual([])
    expect(JSON.parse(w.files[STATE]!).run).toBe(null)
    await w.clock.advance(30)
    expect(w.submitted).toEqual([])
  })

  test('continue sin slug adopta el único handoff y, si hay varios, los lista', async ($, on) => {
    const w = await world($, on)
    expect(await forge($, 'continue')).toBe('no hay un run parado para seguir')
    w.files['/w/.sdd/viejo/requirements.md'] = NODD_REQUIREMENTS
    w.files['/w/.sdd/viejo/run.json'] = '{"status":"pasa"}'
    w.files['/w/.sdd/uno/requirements.md'] = NODD_REQUIREMENTS
    w.files['/w/.sdd/dos/requirements.md'] = NODD_REQUIREMENTS
    expect(await forge($, 'continue')).toBe('hay 2 handoffs de NODD en .sdd/: dos, uno. Elegí uno con /forge continue <slug>.')
    delete w.files['/w/.sdd/dos/requirements.md']
    expect(await forge($, 'continue --auto')).toContain('adopto el handoff de NODD uno: arranca en explore sin clarify')
    expect(w.files['/w/.sdd/uno/request.md']).toBe(NODD_REQUIREMENTS)
    expect(w.files['/w/.sdd/viejo/request.md']).toBe(undefined)
    expect(await forge($, 'continue')).toBe('ya hay un run corriendo (uno). /forge stop para cortarlo.')
  })

  test('un run parado se sigue retomando igual, aunque haya un handoff en .sdd/', async ($, on) => {
    const w = await world($, on)
    w.files['/w/.sdd/uno/requirements.md'] = NODD_REQUIREMENTS
    expect(await forge($, '--auto agregá suma')).toContain('run agrega-suma')
    await w.clock.advance(30)
    expect(await forge($, 'stop')).toBe('run agrega-suma parado')
    expect(await forge($, 'continue')).toBe('sigo agrega-suma desde clarify')
    await w.clock.advance(30)
    expect(w.submitted.length).toBe(2)
    expect(w.submitted[1]).toContain('subagent_type "forge:clarify"')
    await forge($, 'stop')
    expect(await forge($, 'seguir agrega-suma')).toBe('sigo agrega-suma desde clarify')
    expect(JSON.parse(w.files['/w/.sdd/agrega-suma/run.json']!).origin).toBe(undefined)
    expect(w.files['/w/.sdd/uno/request.md']).toBe(undefined)
  })

  test('en claude -p, /forge continue <slug> adopta el handoff y reescribe el prompt con la llamada a explore', async ($, on) => {
    const w = await world($, on, { CLAUDE_CODE_ENTRYPOINT: 'sdk-cli' })
    await $.session.start({ cwd: '/w', surface: null, isInteractive: false })
    w.files[`${DIR}/requirements.md`] = NODD_REQUIREMENTS
    await $.prompt.submit({ text: `/forge continue ${SLUG}` } as any)
    expect(w.submitted.length).toBe(1)
    expect(w.submitted[0]).toContain(`Run \`${SLUG}\` is ready`)
    expect(w.submitted[0]).toContain('subagent_type "forge:explore"')
    const saved = JSON.parse(w.files[`${DIR}/run.json`]!)
    expect([saved.origin, saved.mode, saved.expected]).toEqual(['nodd', 'automatic', 'explore'])
    expect(w.files[`${DIR}/request.md`]).toBe(NODD_REQUIREMENTS)
  })

  test('un run adoptado y parado antes de terminar explore vuelve a explore, sin clarify y con la marca de NODD', async ($, on) => {
    const w = await world($, on)
    w.files[`${DIR}/requirements.md`] = NODD_REQUIREMENTS
    await forge($, `continue --auto ${SLUG}`)
    expect(await forge($, 'stop')).toBe(`run ${SLUG} parado`)
    expect(await forge($, 'continue')).toBe(`sigo ${SLUG} desde explore`)
    await w.clock.advance(30)
    expect(w.submitted.at(-1)).toContain('subagent_type "forge:explore"')
    await agent($, 'clarify')
    expect(w.seen).toEqual(['forge:explore'])
    expect(w.prompts.explore).toContain('are context, not work')
    const saved = JSON.parse(w.files[`${DIR}/run.json`]!)
    expect([saved.origin, saved.order[0], saved.expected]).toEqual(['nodd', 'explore', 'plan'])
  })

  test('desde disco, un run adoptado que se cortó antes de spec.md se retoma desde explore; con spec.md no', async ($, on) => {
    const w = await world($, on)
    w.files[`${DIR}/requirements.md`] = NODD_REQUIREMENTS
    w.files[`${DIR}/request.md`] = NODD_REQUIREMENTS
    w.files[`${DIR}/findings.md`] = '## Code roots\n- /w\n'
    w.files[`${DIR}/routing.log`] = 'línea vieja del run\n'
    w.files[`${DIR}/run.json`] = JSON.stringify({ slug: SLUG, status: 'parado', origin: 'nodd', expected: 'plan', order: ['explore', 'plan', 'build', 'veredicto'] })
    expect(await forge($, `continue --auto ${SLUG}`)).toContain(`retomo el run adoptado de NODD ${SLUG}: plan no llegó a escribir spec.md, así que vuelve a explore sin clarify`)
    const saved = JSON.parse(w.files[`${DIR}/run.json`]!)
    expect([saved.status, saved.origin, saved.expected, saved.order]).toEqual(['running', 'nodd', 'explore', ['explore', 'plan', 'build', 'veredicto']])
    expect(w.files[`${DIR}/request.md`]).toBe(NODD_REQUIREMENTS)
    expect(w.files[`${DIR}/routing.log`]!.startsWith('línea vieja del run\n')).toBe(true)
    await w.clock.advance(30)
    expect(w.submitted.at(-1)).toContain('subagent_type "forge:explore"')
    await forge($, 'stop')
    w.files['/w/.sdd/con-spec/requirements.md'] = NODD_REQUIREMENTS
    w.files['/w/.sdd/con-spec/spec.md'] = '# spec'
    w.files['/w/.sdd/con-spec/run.json'] = JSON.stringify({ slug: 'con-spec', status: 'parado', origin: 'nodd', expected: 'analyze' })
    expect(await forge($, 'continue con-spec')).toContain('no es un handoff de NODD (ya es un run (run.json))')
  })

  test('un run adoptado que se recupera de run.json tras un reload conserva la marca y sigue en explore', async ($, on) => {
    const stat = { status: 'pending', model: 'm', answeredBy: '', ms: 0, startedAt: 0, inTok: 0, outTok: 0, steps: 0 }
    const w = await world($, on, {}, {
      [`${DIR}/requirements.md`]: NODD_REQUIREMENTS,
      [`${DIR}/request.md`]: NODD_REQUIREMENTS,
      [`${DIR}/run.json`]: JSON.stringify({
      slug: SLUG, dir: DIR, cwd: '/w', request: NODD_REQUIREMENTS, mode: 'automatic', cap: 3, verdicts: [], expected: 'explore', status: 'running',
      order: ['explore', 'plan', 'build', 'veredicto'], startedAt: 1, stats: Object.fromEntries(PHASES.map((p) => [p, stat])), decisions: [], clarified: false,
      tdd: 'strict', unitIdx: 0, delivered: [], retryAlone: [], flights: {}, retried: false, note: '', awaitTurn: false, asyncSeen: false, owner: 'sesion', origin: 'nodd',
      }),
    })
    expect(await forge($, 'status')).toContain(`run ${SLUG} · desde NODD · CORRIENDO`)
    await agent($, 'clarify')
    expect(w.seen).toEqual(['forge:explore'])
    expect(w.prompts.explore).toContain(`${DIR}/requirements.md`)
    const saved = JSON.parse(w.files[`${DIR}/run.json`]!)
    expect([saved.origin, saved.expected, saved.order[0]]).toEqual(['nodd', 'plan', 'explore'])
    expect(JSON.parse(w.files[STATE]!).run.origin).toBe('nodd')
  })
})
