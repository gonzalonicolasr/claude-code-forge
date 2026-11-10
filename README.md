# forge

El SDD de zero-pi (`/forge`: clarify → explore → plan → analyze → build → veredicto, con tope de rondas) como **mod de Claude Code** (v2.1.287+). La sesión principal sigue en tu plan de Claude; **cada fase corre en el modelo que elijas**: cualquiera del CPAM local (GPT, Gemini, GLM, Kimi, DeepSeek, Claude por cuenta…) o Claude a través de Claude Code.

## ¿forge o NODD?

forge es para **features**: algo que merece una spec, un plan con tareas y un veredicto que lo revise. Para el laburo chico de todos los días (un typo, un renombre, un estilo, un fix de una línea, un ajuste de config) está [NODD](https://nodd.com.ar), la otra extensión de Gon para pi y Claude Code: te hace declarar la ruta antes de escribir y no deja tildar una tarea sin una corrida de tests observada. Lo hacés directo y con los tests corridos de verdad.

forge no decide por vos: si clarify marca el pedido como `Size: small`, te lo dice una vez (en interactive, en la pausa que sigue a clarify; en automatic, en el log y en `routing.log`) y el resumen final lo repite en una línea. El run sigue igual: nunca bloquea ni cambia el orden de las fases.

## Uso

```bash
claude --plugin-dir ~/projects/forge
```

| Comando | Qué hace |
|---|---|
| `/forge <pedido>` | Arranca un run. Banderas: `--auto` / `--interactive`, `--cap N`, `--profile barato\|calidad\|<tuyo>`, `--dir <ruta>` (ver abajo) |
| `/forge` o `/forge ui` | Abre el panel FORGE (con NERV cargado, un run nuevo no lo abre solo: se sigue en la pestaña FORGE de NERV) |
| `/forge status` | Modelos por fase, estado del run, tiempos y tokens |
| `/forge stop` | Corta el run (funciona en medio de un turno) |
| `/forge continue [<slug>]` (o `seguir`) | Retoma un run parado o cortado desde la fase que faltaba. Si el mod se recargó y el run ya no está en memoria, lo levanta de su `run.json` (sin slug, el cortado o parado más reciente; con `<slug>`, ese). Si no hay ninguno, **adopta un handoff de NODD** (ver abajo). Acepta `--auto` / `--interactive`, `--cap N` y `--profile` para el run adoptado, y `--dir <ruta>` para buscar el run o el handoff en otro proyecto |
| `/forge profile [nombre]` · `/forge profile save <nombre>` · `/forge profile delete <nombre>` | Ver, activar, guardar o borrar perfiles (los de fábrica no se borran) |
| `/forge model <fase> <modelo>` | Cambia el modelo de una fase (`clarify`, `explore`, `plan`, `analyze`, `build`, `veredicto`) |
| `/forge phase <clarify\|analyze> <on\|off>` | Activa o saltea uno de los dos gates (en el panel: botón *saltear* / *activar*). Las otras cuatro fases no se pueden saltear |
| `/forge effort <fase> <nivel>` | Cambia el effort de una fase: `auto` (no toca nada), `off`, `minimal`, `low`, `medium`, `high`, `xhigh` (los niveles de pi/zero-pi) |
| `/forge mode <interactive\|automatic\|ask>` | Modo por defecto. `ask` (o `preguntar`) lo consulta al arrancar |
| `/forge cap <n>` | Tope de rondas por defecto (3) |
| `/forge config [save-default\|reset]` | La config es por sesión: muestra si usás la de esta sesión o el default, la fija como default o vuelve al default |

**Banderas mal formadas**: si a `--cap`, `--profile` o `--dir` les falta el valor (o el valor empieza con `--`), o `--cap` no es un entero entre 1 y 9, forge no arranca y devuelve el error (por ejemplo `/forge --cap abc hola`, `--cap 0` o `--cap 12`). Un cap guardado inválido se usa como 3.

**Directorio del run**: el run trabaja en el directorio de la sesión (`$.session.cwd()`) en el momento de arrancar, y ahí deja `.sdd/<slug>/`; las fases usan ese mismo directorio hasta el final. Si la sesión se abrió en otro lado, o una tool anterior la movió (por ejemplo a un worktree), `--dir <ruta>` lo fija a mano: ruta absoluta o con `~`, sin espacios, y tiene que existir. Sin `--dir`, si el directorio es tu `$HOME`, no está dentro de un repo git o es un worktree de git, forge arranca igual pero lo avisa en el mensaje de arranque y en `routing.log` (en `claude -p`, en el log), con el `/forge --dir …` para apuntarlo bien. forge no adivina el proyecto por el texto del pedido.

**Handoff desde NODD** (contrato en `zero-pi/docs/forge-contract.md`, sección *Handoff desde NODD*): `/nodd-promote <slug>` deja un solo archivo, `.sdd/<slug>/requirements.md`, con la línea `Promoted from the NODD run`. Un directorio es un handoff cuando tiene ese `requirements.md` y no tiene `run.json`, `execution.json`, `design.md`, `tasks.md` ni `request.md` (`noddHandoffProblem` en `logic.ts`). `/forge continue <slug>` lo **adopta**: abre un run con ese mismo slug y directorio, copia `requirements.md` a `request.md` byte a byte, **saltea clarify** (no hay línea `Size:` ni aviso de NODD) y arranca en explore; después sigue igual que cualquier run. Los briefs de explore y plan nombran `requirements.md` y aclaran que lo de *Already resolved — do not redo* es contexto ya hecho, no trabajo. El run queda marcado con `origin: "nodd"` en `run.json` y en `state.json`, y el panel lo muestra (`↳ desde NODD`). Sin slug: si no hay un run parado, adopta el único handoff de `.sdd/`; si hay varios, los lista; si no hay ninguno, dice lo de siempre. Un directorio que no es handoff no se adopta y forge dice por qué. Si un run adoptado se corta antes de que plan escriba `spec.md` y el mod se recargó (ya no está en memoria), `/forge continue <slug>` lo retoma **desde explore**, sin clarify, conservando `routing.log`; con `spec.md` escrito no se retoma así. En `claude -p`, `/forge continue <slug>` hace lo mismo y reescribe el prompt con la llamada a explore.

**Modo interactive:** después de cada fase aparece «¿Seguimos con X?» con *Continuar* / *Parar*. Lo que escribas en *Other* se le pasa como ajuste a la fase siguiente.

**Headless** (`claude -p`): `/forge …` también anda, pero ahí el comando no se registra (en `-p` un comando de mod no tiene sesión para arrancar un turno), así que lo toma el hook de `prompt.submit`. Siempre corre en automatic. Para pruebas:

```bash
claude -p "/forge --auto agregá suma(a, b) con su test" --plugin-dir ~/projects/forge \
  --permission-mode default --allowedTools Agent Bash Read Glob Grep Edit Write
```

### Modelos y perfiles

- Con prefijo de cuenta (`ag3/…`, `prolite/…`, `oc/…`) o sin prefijo pero que no sea Claude (`glm-5.3`): **va al CPAM** (`POST http://127.0.0.1:8317/v1/messages`, clave en `~/.config/cli-proxy-api/api-key.txt`).
- `haiku` / `sonnet` / `opus` / `fable`, o un id `claude-*` sin prefijo: **pasa por Claude Code** (tu plan).
- Perfiles de fábrica (se pueden pisar con `profile save`, no se pueden borrar). Cada id de CPAM respondió 200 el 2026-10-02 y los de build devolvieron `tool_use` con una tool de prueba:

| Perfil | clarify | explore | plan | analyze | build | veredicto |
|---|---|---|---|---|---|---|
| `turbo` | `ag3/gemini-3.5-flash-lite` · minimal | `ag3/gemini-3.5-flash-lite` · minimal | `prolite/gpt-6-luna` · low | `prolite/gpt-6-luna` · low | `ag3/gemini-3.5-flash-lite` · low | `prolite/gpt-6-luna` · low |
| `barato` | `ag3/gemini-3.7-flash-high` · low | `ag3/gemini-3.7-flash-high` · low | `ag3/gemini-3.7-flash-high` · medium | `prolite/gpt-6-luna` · medium | `ag3/gemini-3.7-flash-high` · medium | `prolite/gpt-6-sol` · high |
| `equilibrado` | `ag3/gemini-3.7-flash-high` · low | `ag3/gemini-3.7-flash-high` · medium | `prolite/gpt-6-sol` · high | `prolite/gpt-6-luna` · high | `prolite/gpt-6-luna` · medium | `sonnet` · high |
| `calidad` | `ag3/gemini-3.8-flash-high` · medium | `ag3/gemini-3.8-flash-high` · high | `prolite/gpt-6-sol` · xhigh | `prolite/gpt-6-astra` · high | `prolite/gpt-6-sol` · high | `opus` · xhigh |
| `open-source` | `ds/deepseek-flash` · (n/a) | `ds/deepseek-flash` · (n/a) | `ds/deepseek-v4-pro` · high | `ds/deepseek-v4-pro` · high | `ds/deepseek-v4-pro` · high | `ag3/gpt-oss-120b-medium` · (n/a) |
| `gemini` | `ag3/gemini-3.8-flash-high` · low | `ag3/gemini-3.8-flash-high` · medium | `ag3/gemini-pro-agent` · high | `ag3/gemini-pro-agent` · high | `ag3/gemini-3.8-flash-high` · high | `ag3/gemini-pro-agent` · high |
| `openai` | `prolite/gpt-6-luna` · low | `prolite/gpt-6-luna` · medium | `prolite/gpt-6-sol` · xhigh | `prolite/gpt-6-sol` · high | `prolite/gpt-6-sol` · high | `prolite/gpt-6-astra` · xhigh |
| `solo-claude` | `haiku` · medium | `haiku` · medium | `opus` · high | `sonnet` · high | `sonnet` · high | `opus` · xhigh |

Van ordenados de más rápido/barato a más fuerte (`turbo` → `calidad`) y después los de un solo proveedor. Clarify va en un modelo barato (sólo anota supuestos) y analyze en uno fuerte (es un revisor adversarial del plan), como en zero-pi. Lo fuerte de OpenAI va en `gpt-6-sol`: el plan de ChatGPT de la cuenta no ofrece `gpt-6.1-sol` (al 2026-10-03 da 400 "not supported when using Codex with a ChatGPT account"); lo rápido va en `gpt-6-luna`. `opus`/`sonnet`/`haiku` son alias del plan de Claude Code (hoy Opus 5.5 y Sonnet 5.5). Los pares modelo+effort nuevos de clarify y analyze respondieron 200 por el CPAM el 2026-10-02 (`ag3/gemini-pro-agent` contesta como `gemini-pro-default`).

- **Perfiles de zero-pi**: al arrancar, forge lee `~/.pi/zero.json` y suma cada perfil como `zero:<nombre>` con los `models` y el `thinking` de las seis fases (el `thinking` pasa a ser el effort). Un perfil viejo sin `clarify`/`analyze` usa el modelo de explore para clarify y el de plan para analyze. Deja afuera los que usan una cuenta excluida en cualquier fase o la nombran en el nombre del perfil (ver abajo). Lo mismo vale para perfiles propios guardados antes de las seis fases. No se guardan en el store de forge ni se pueden borrar desde forge: se editan en zero-pi.
- **El selector** ordena los grupos por cuenta (`claude` del plan, `personal`, `priv8`, `prolite`, `plus`, `ag*`, `ds`, `oc`, `cpam`), los modelos de cada grupo por familia y del más nuevo al más viejo, y los muestra con el `displayName` del CPAM (`GET /v1beta/models`), como el proveedor `cliproxy` de pi.

  - `openai` va todo por `prolite/`: la cuenta `plus/` devolvía 429 *usage_limit_reached*.
  - `open-source` usa DeepSeek directo (`ds/`, **pago por token**) y gpt-oss: los `oc/*` (GLM, Kimi, DeepSeek por OpenCode Go) devuelven 400 *MissingSessionID* porque OpenCode ahora exige el header `x-opencode-session` y el CPAM no lo manda, y los `glm-*` sin prefijo dan 429 por falta de saldo.
- El selector del panel saca los modelos de imagen y las **cuentas excluidas**: los prefijos del CPAM que listes en `~/.config/forge/exclude.json`, un array de strings (por ejemplo `["trabajo"]` saca `trabajo/*` del selector y los perfiles de zero-pi que la usan o tienen `trabajo` en el nombre). Sirve para no mezclar una cuenta del laburo con lo personal. Si el archivo no existe, no se excluye nada.

### El panel

Pane `forge` (título FORGE) con la paleta EVA: el estado del run, la ronda x/cap, los veredictos, el tiempo total y una tarjeta por fase (pendiente `·`, spinner, `✔` o `✖`). Para cada fase muestra tiempo, pasos y tokens, qué modelo respondió de verdad y dos `Select`, uno para el grupo/cuenta y otro para el modelo. Los `Select` del motor aceptan 64 opciones como máximo, por eso van en dos niveles. Además tiene perfil, modo, cap con `−`/`+`, un campo para escribir el pedido y los botones ▶ Iniciar / ■ Parar.

### Effort por fase

- **CPAM**: va como sufijo del modelo, `prolite/gpt-6-luna(high)`; `off` se manda como `(none)`. Medido el 2026-10-02: `prolite/gpt-6-sol(none)` dio 0 tokens de razonamiento y `(xhigh)` 12 en la misma pregunta; `ag3/gemini-3.8-flash-high(low)` 2.5k tokens de salida y `(xhigh)` 14k; `prolite/gpt-6-luna(low)` 0 y `(high)` 53. `thinking.budget_tokens` y `output_config.effort` en el body **no** cambiaron nada en GPT.
- **Claude Code** (haiku/sonnet/opus/fable): `turn.step` reescribe `effort` (`minimal`/`off` bajan a `low`).
- **Sin efecto, se muestra `n/a`**: `gpt-oss-*` y `ds/deepseek-flash` (mismo razonamiento con `none` y `xhigh`), `oc/*` (no responden por el CPAM) y `glm-*` directo (sin saldo).
- `routing.log` anota el id con el sufijo que se mandó en cada paso (`CPAM pedido prolite/gpt-6-luna(low) · respondió gpt-6-luna`).

### Estado para otros mods: `~/.local/state/forge/state-<sessionId>.json`

**Un run por sesión.** Cada sesión de Claude Code tiene su propio run: `/forge <pedido>` arranca aunque otra sesión tenga uno corriendo, y `stop`, `status`, `continue` y los hooks que avanzan fases sólo tocan el de la sesión. En el store, cada sesión guarda el suyo bajo `run:<sessionId>` (`{ dir, slug, cwd, status, at }`); la config (perfil, modelos, efforts, modo, cap, fases salteadas) también es por sesión: cada una guarda la suya en `config:<sessionId>`; una sesión nueva arranca con la global (`config`, el default) y la sigue mientras no cambie nada. `/forge config` dice cuál se está usando, `/forge config save-default` fija la de la sesión como default y `/forge config reset` vuelve al default (en NERV: *★ fijar como default* y *↺ default* en la tarjeta PERFIL, que muestra *(esta sesión)* o *(default)*). Editar los modelos de un perfil guarda el perfil (la lista de perfiles es una sola), pero no cambia la config activa de otra sesión. Un run guarda en `run.json` la config con la que arrancó (`profile`, `models`, `efforts`): cambiar perfil o modelos después, en cualquier sesión, no lo toca (un run viejo sin esos campos los saca de `stats`). Al recargar el mod, una sesión rehidrata sólo el run cuyo `run.json` tiene `owner` igual a su id (o el de un hijo suyo que vuelve por `agentId`). La clave vieja `activeRun` (un run para todas) se migra sola a `run:<owner>` y se borra. Las entradas terminadas hace más de un día se limpian.

forge reescribe el archivo de la sesión en cada cambio de configuración y en cada paso de un run (no en `claude -p`; sin id de sesión usa `state.json`) y lo borra al cerrar la sesión. Lo lee la pestaña FORGE de NERV de esa misma sesión, que manda las órdenes de vuelta por el inbox de la sesión o con `$.command.run({ command: 'forge', args })`. `others` lista los runs corriendo de las otras sesiones (`[{ slug, project, status }]`) para la línea «otros: N corriendo (…)» del panel. Cada sesión relee la config compartida del store cada ~5 s.

```json
{ "version", "profile", "profiles": { "<nombre>": { "clarify", "explore", "plan", "analyze", "build", "veredicto", "effort": { … }, "builtin", "source": "forge|zero-pi" } },
  "phaseOrder": ["clarify", "explore", "plan", "analyze", "build", "veredicto"], "phases": [ las seis, siempre ],
  "models": { "<fase>": "<id>" × 6 }, "efforts": { … × 6 }, "effortLevels": [], "effortNotes": { "<fase>": "<por qué no aplica>" × 6 },
  "mode": "interactive|automatic|ask", "cap",
  "catalog": { "<grupo>": ["<id>"] }, "groupLabels": { "<grupo>": "prolite · GPT" }, "labels": { "<id>": "GPT 6.1 Sol" },
  "run": null | { "status": "running|paused|pasa|no-verificado|bloqueado|falló|parado", "request", "slug", "round", "cap", "phase",
    "phaseOrder": [], "startedAt", "endedAt", "batch": null | { "index", "total", "tasks": ["T002"], "parallel"?: true },
    "phases": [{ "name", "status": "pending|running|done|failed", "model", "effort", "responded", "ms", "startedAt", "tokensIn", "tokensOut", "steps" }],
    "verdicts": [], "decisions": ["replan", "continue"], "size": null | "small" | "normal", "origin": null | "nodd" },
  "others": [{ "slug", "project", "status" }], "updatedAt" }
```

`phaseOrder` (arriba) es el orden activo de la configuración: sin las fases salteadas. `run.phaseOrder` y `run.phases` son las del run en curso, en orden (un run arrancado con clarify salteado no la lista). `paused` es la pausa entre fases del modo interactive, mientras espera *Continuar* / *Parar* (o la respuesta a una pregunta bloqueante de clarify). `bloqueado` es el segundo `replan` de analyze. `decisions` son las decisiones de analyze en orden, `size` el tamaño que marcó clarify (`null` antes de clarify o con clarify salteado, que cuenta como `normal`) y `origin` vale `"nodd"` cuando el run adoptó un handoff de NODD, y `batch` la unidad de build en curso (índice desde 1): un lote secuencial, o una tanda paralela con `parallel: true` y en `tasks` todas las tareas de la tanda. El catálogo saca las cuentas excluidas y los modelos de imagen, y suma el grupo `claude` (haiku/sonnet/opus/fable de tu plan). Cada sesión escribe su propio archivo, así que dos sesiones con forge no se pisan.

## Artefactos (`.sdd/<slug>/` del repo de trabajo)

| Archivo | Lo escribe |
|---|---|
| `request.md` | forge, el pedido textual (en un run adoptado de NODD, copia exacta de `requirements.md`) |
| `requirements.md` | NODD (`/nodd-promote`): forge sólo lo lee para adoptar el handoff |
| `clarifications.md` | forge, con la respuesta de clarify (`## Status`, `## Size` con la línea exacta `Size: small\|normal`, `## Assumptions`, `## Non-blocking decisions`, `## Blocking questions`) y, si estaba bloqueado, un `## Resolution` con lo que contestaste o con la nota de modo automatic |
| `findings.md` | forge, con la respuesta de explore |
| `proposal.md`, `spec.md`, `design.md`, `tasks.md` | la fase plan (forge valida `tasks.md` como `/zero-validate`: cada `T###` con `files`, `depends`, `evidence` y `review`, y dependencias hacia atrás) |
| `checklist.md` | forge, con la respuesta de analyze (`## Analyzed artifacts`, `## Checklist`, `## Blockers`, `Decision: continue\|replan`) |
| `tdd-evidence.md`, checkboxes de `tasks.md` | la fase build; en una tanda paralela los hijos escriben `tdd-evidence/<T###>.md` y forge tilda y junta la evidencia |
| `build-rN.md`, `veredicto-rN.md` | forge, con lo que devolvió cada ronda |
| `rounds.json` | forge: `{ cap, verdicts }` |
| `run.json` | forge: el estado completo del run |
| `routing.log` | forge: **cada paso de cada fase, qué modelo se pidió y cuál respondió** (el campo `model` de la respuesta del CPAM) y los tokens |

**Clarify** registra supuestos antes de explorar y sólo frena ante una ambigüedad que mandaría todo el build para otro lado. En modo interactive, si vuelve `blocked`, forge te muestra las preguntas con `$.ui.ask`: lo que escribas en *Other* queda como respuesta en `clarifications.md`, *Seguir con los supuestos* sigue igual y *Parar* corta el run (se retoma con `/forge continue`). En automatic y en `claude -p` nadie contesta: el brief le pide que no bloquee, y si igual bloquea forge anota en `## Resolution` que se siguió con los supuestos. Clarify también deja la línea `Size: small` o `Size: normal`: `small` sólo cuando el pedido entero es un cambio de un paso que no amerita una spec (typo, renombre, estilo, fix de una línea o ajuste de config, en uno o dos archivos y sin comportamiento nuevo); ante la duda o si falta la línea, `normal` (`parseSize`). Con `small` forge recomienda NODD una sola vez, como dice [¿forge o NODD?](#forge-o-nodd), y lo guarda como `size` en `run.json`.

**Analyze** revisa la calidad del plan (ambigüedad, criterios testeables, grafo de tareas, evidencia concreta, TDD, alcance, tamaño) después de la validación estructural. `continue` pasa a build; el primer `replan` vuelve a plan con los `## Blockers` en el brief y después otra vez a analyze; el segundo `replan` del run lo corta como **BLOQUEADO** (no verificado). Ni clarify ni analyze cuentan rondas.

**Build por lotes y tandas paralelas** (como zero-pi, contrato en `zero-pi/docs/forge-contract.md`): antes de cada unidad de build, forge vuelve a leer `tasks.md` y elige la próxima, por código:

- **Tanda paralela**: arranca con la primera tarea elegible (sus `depends:` ya están `[x]` o entregadas en esta ronda). Si tiene `[P]` en la cabecera (`- [ ] T002 — Agregar parser [P]`), se le suman, en orden, las siguientes tareas elegibles con `[P]` cuyos `files:` no se pisan (los paths se comparan después de sacar `(new)`, normalizar `./` y `..`, y recortar el code root; un path relativo y otro absoluto que termina igual cuentan como el mismo), hasta 3 (`PARALLEL_MAX`). Si junta 2 o más, la instrucción al modelo principal le pide **N llamadas a Agent en un solo mensaje**, y Claude Code las corre a la vez.
- **Lote secuencial**: si la tanda queda de una sola tarea, va el loteo de siempre (hasta 4 tareas o 800 líneas estimadas por `review: ~N changed lines`), cortado antes de una tarea cuyas `depends:` no estén hechas ni en el lote y antes de una `[P]` que podría abrir una tanda de 2 o más. Sin ningún `[P]` en `tasks.md`, los lotes salen iguales que antes; si entra todo en un lote, se comporta como siempre.

En una tanda, el hook `tool.call` le asigna a cada llamada la siguiente tarea libre de la tanda (se toma sin ningún `await` en el medio, así dos llamadas simultáneas nunca agarran la misma), y lleva un registro por llamada (`flights` en `run.json`, por `tool_use_id` o por `agentId` si quedó en segundo plano). Cada hijo implementa sólo su tarea, **no toca** `tasks.md` ni `tdd-evidence.md`, escribe su evidencia en `tdd-evidence/<T###>.md` y corre sólo sus tests. Cuando vuelve el último, forge, por código: tilda `[x]` las entregadas en `tasks.md` (respetando la forma de la cabecera: `- [x] …`, `## [x] …` o `### T001 — [x] …`), agrega cada `tdd-evidence/<T###>.md` a `tdd-evidence.md` bajo `## T### (parallel wave <i>)` y suma los sobres a `build-rN.md` bajo `## Wave i/n: …`; después avanza una sola vez. Los otros resultados le dicen al modelo que no haga nada. Los tokens de la fase build se suman entre los hijos y el tiempo es el de reloj.

- Un hijo que falla (sobre vacío, error del CPAM o llamada rechazada) deja su tarea en `[ ]` y se reintenta **una vez, sola**, como lote secuencial; si vuelve a fallar, el run termina como FALLÓ.
- Si el modelo lanza menos llamadas que las pedidas, la tanda cierra con las que salieron y las demás van en la unidad siguiente. Una llamada de más se rechaza con un `[forge] Extra … call refused` (también en las otras fases: una sola llamada por fase a la vez).
- En segundo plano (`async_launched`) cada hijo cierra en su `turn.complete`; el último manda la próxima instrucción con `$.prompt.submit`.
- Todas las unidades son una sola ronda; el veredicto corre una vez al final, y las tandas no suman rondas.

**TDD**: si el repo tiene `.sdd/config.json` con `tdd.mode: "off"`, forge se lo avisa a build y veredicto; si no, van en strict.

El veredicto tiene que terminar en `VEREDICTO: pasa|corregir|replantear` (`parseVerdict` también acepta `**Veredicto:** \`x\`` o la palabra sola en la última línea). `pasa` cierra el run, `corregir` vuelve a build y `replantear` vuelve a plan (y de ahí a analyze, como en zero-pi), siempre con el razonamiento del veredicto en el brief. Si se llega al cap sin `pasa`, el run queda en **NO VERIFICADO**. Una fase que no entrega (clarify sin `## Status`, sin findings, artefactos de plan faltantes o mal formados, analyze sin `Decision:`, veredicto sin línea parseable, error del CPAM o la tool Agent que vuelve con error, como un límite de uso) se reintenta una vez y, si vuelve a fallar, el run termina como **FALLÓ**, con la razón en la nota de `run.json`. Si la tool Agent vuelve con error y sin un resultado completo, forge no arma un resultado a medias (Claude Code lo rechaza por no cumplir el esquema de Agent): contesta con un `deny` que lleva la próxima instrucción `[forge]`, el reintento o el cierre.

## Cómo funciona (y por qué así)

1. **Agentes**: en `session.start` se registran `forge:clarify|explore|plan|analyze|build|veredicto` con `$.agent.register`. Clarify, explore, analyze y veredicto tienen Read/Glob/Grep/Bash (sólo lectura: forge escribe `clarifications.md`, `findings.md` y `checklist.md` con lo que devuelven; en zero-pi clarify y analyze escriben su archivo ellos); plan y build suman Write/Edit. El modelo registrado es `haiku`: si el ruteo fallara de forma abierta (fail-open), la fase caería en el modelo más barato y no en Opus.
2. **El modelo principal es sólo el despachante.** forge le manda (`$.prompt.submit` o reescribiendo el prompt en headless) «llamá a Agent con `forge:explore`». El hook `tool.call` sobre `Agent` reescribe la llamada: fija la fase que toca, mete el brief completo como prompt y elige el modelo. Cuando la fase vuelve, forge guarda los artefactos, decide la transición (`advance`) y **reemplaza el resultado de la tool** por la próxima instrucción. Así el orden de las fases lo controla el mod y no el modelo, y el contexto principal casi no crece.
3. **Ruteo**: `turn.step` reconoce los pasos de un subagente `forge:*` y, si el modelo de la fase es del CPAM, responde él en lugar del motor. Arma los mensajes con `$.session.messages({ agentId, as: 'api' })`, llama al CPAM, streamea `text` / `tool` / `input` / `stop`, Claude Code ejecuta las tools y vuelve a llamar al hook en el paso siguiente. Si el modelo es de Claude, hace `yield* next(e)` (con `model` cambiado si es un id).
4. **Segundo plano**: en la REPL Claude Code corre los agentes en segundo plano aunque se pida `run_in_background: false` y `agent.spawn` con `background: false` (verificado). forge maneja los dos casos. En primer plano (lo que pasa en `-p`) avanza dentro del `tool.call`. En segundo plano, la tool devuelve `async_launched`, la fase se cierra en el `turn.complete` del subagente y forge manda la próxima instrucción con `$.prompt.submit`.

## Gotchas verificados (2026-10-02, Claude Code 2.1.287)

- Un subagente lanzado con `$.agent.spawn` desde el mismo mod **no pasa** por el `turn.step` de ese mod: el mod se saltea a sí mismo. `$.tool.call({ tool: 'Agent' })` está **prohibido**: *"runs the Agent tool: that is $.agent.spawn (host check)"*. Por eso el modelo principal tiene que lanzar cada fase.
- `$.prompt.submit` desde un `command.run` falla (*"it would wait on the turn this hook is holding"*). Desde un timer (`$.clock.after`) anda en la REPL. En `claude -p "/comando"` no hay sesión: tanto `submit` como `spawn` fallan con *"no session is bound"*.
- En `-p`, un `/algo` que no es un comando registrado llega como texto a `prompt.submit` (con origin `sdk`). `CLAUDE_CODE_ENTRYPOINT` vale `sdk-cli` en `-p` y así forge detecta el modo headless.
- **Privacidad**: el primer mensaje de cualquier subagente trae como `<system-reminder>` tu `CLAUDE.md` global, `MEMORY.md` y tu mail (unos 65k caracteres con credenciales). Antes de mandar algo al CPAM, `cleanMessages` saca todos los system-reminders salvo el entorno y la fecha. También bajó el input de cada paso de explore de unos 22k a unos 1.7k tokens.
- `omitClaudeMd: true` en `$.agent.register` hizo que el modelo principal no viera el tipo `forge:explore` (pasó una vez). Se sacó: la privacidad la resuelve el filtro del punto anterior.
- Gemini 3 por el CPAM devuelve un bloque `thinking` con firma (`cpa-gemini-carrier-v1`) antes de cada `tool_use`. El motor no guarda el thinking de un paso hecho por un hook, así que forge lo cachea por id de tool_use y lo vuelve a poner en el paso siguiente.
- El `Select` acepta como máximo 64 opciones (con más, el motor rechaza el render del pane).
- `$.tool.list()` no trae los input schemas: los de Bash, Read, Glob, Grep, Edit y Write están declarados a mano en `register.ts`.
- Al guardar un archivo del mod con `--plugin-dir` en la REPL, el mod se recarga y **pierde el run en memoria**. El estado queda en `.sdd/<slug>/run.json`: un run que seguía corriendo se rehidrata solo en el próximo paso de su fase, y uno cortado o parado se levanta con `/forge continue`, que busca en el `.sdd/` del directorio de la sesión y en el último run parado o terminado que guardó forge (clave `lastRun` del store).
- Si el turno principal termina con el run a medias, el run queda **CORTADO** y la nota dice por qué: un error de la API (por ejemplo «You've hit your weekly limit», si viene en la respuesta), una negativa del modelo, una interrupción o un fin de turno normal (`reason` de `turn.complete`). Se retoma con `/forge continue`.

## Desarrollo

```bash
claude plugin validate . --strict   # limpio
claude plugin test                   # 122 tests: versión del plugin, ruteo, catálogo y orden de modelos, effort (sufijo y n/a), perfiles de fábrica y de zero-pi con seis fases, parseo del veredicto, Status y Size de clarify y Decision de analyze, el aviso de NODD para pedidos chicos (automatic, interactive y normal), transiciones (orden de seis fases, fases salteadas, replan y bloqueo, cap), validación de tareas, lotes de build y tandas paralelas (`nextWave`, `planUnits`, tildado y evidencia, y el hook `tool.call` con tres llamadas simultáneas, una de más, un hijo que falla, segundo plano y menos llamadas que las pedidas), slug y banderas, handoff de NODD (`noddHandoffProblem`, `parseContinue`, briefs, y por los hooks: adoptar, rechazar un directorio que no es handoff, `continue` sin slug con uno o varios handoffs, el `continue` de siempre con un run parado, `claude -p`, y retomar un run adoptado desde memoria, desde disco antes de `spec.md` y tras recuperarlo de `run.json`), una fase que falla (vacía, sin `## Status` o con la tool Agent en error: siempre un resultado de Agent válido o un `deny`), `continue` desde `run.json` después de un reload y la razón del corte del turno principal, el directorio del run (`--dir`, y el aviso en `$HOME`, fuera de git o en un worktree), limpieza de mensajes, render del panel y state.json, y un run por sesión (otra sesión con un run corriendo no lo ve ni lo toca, arranca el suyo y lo lista en `others`; la dueña lo retoma tras la migración de `activeRun`; config por sesión con default y save-default/reset; un run en curso no cambia de modelos si la sesión cambia de perfil; el state de la sesión se reescribe si falta o si zero.json suma perfiles; el aviso de fin de una fase no abre un turno del modelo principal; los comandos lentos corren una vez a un log y sólo el último lote de build corre la suite completa; clarify, plan, build, analyze y veredicto piden lo mínimo que cumple el pedido)
```

Archivos: `hooks/register.ts` (hooks y panel), `hooks/logic.ts` (lógica pura testeable), `hooks/prompts.ts` (prompts de fase adaptados de zero-pi, briefs e instrucciones al despachante), `hooks/forge.test.ts`.

## Pendiente

- En segundo plano, el motor igual le avisa al modelo principal cuando termina el agente, y eso le suma un turno corto por fase en tu plan de Claude.
- Lo que zero-pi tiene y forge todavía no:
  - `/zero-checkpoint` antes de cada build (parche de restauración en `.sdd/<slug>/checkpoints/`).
  - El ledger de ejecución (`zero_execution`: `execution.json`, `.sdd/.executions/`, intentos y recibos por fase) y el reporte de costo al final (`/zero-cost`).
  - La validación de `spec.md` (bloques `### REQ:` con `Acceptance criteria`) y el chequeo del total de `## Review Workload`: forge sólo valida la estructura de las tareas.
  - El algoritmo de reanudación por artefactos (`/forge --continue` que detecta en qué fase quedó un run viejo) y la pregunta ante un slug existente: forge siempre arranca un slug nuevo y `continue` sólo retoma un run que forge dejó cortado o parado (en memoria o en su `run.json`), adopta un handoff de NODD o retoma desde explore un run adoptado que se cortó antes de `spec.md`.
  - La memoria del run en Cortex, las métricas en `~/.pi/zero-runs.jsonl`, el archivado de specs (`spec-merge`) y los comandos de git/PR/issue.
  - El `cap` de `.sdd/config.json` (`rounds.cap`): forge usa el suyo.
- zero-pi no deja saltear clarify ni analyze; forge sí, a pedido (`/forge phase … off`). Por defecto corren las seis.
