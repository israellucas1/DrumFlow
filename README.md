# DrumFlow

Aplicativo web (local) de estudo de bateria: metrônomo de alta precisão, grade musical sincronizada,
biblioteca de rudimentos e editor de grooves/viradas. Sem login, sem backend — dados no `localStorage`.

## Como rodar

Requisitos: Node 20+.

```bash
npm install
npm run dev        # abre em http://127.0.0.1:5173
npm test           # testes unitários (Vitest)
npm run build      # checagem de tipos + build de produção em dist/
npm run preview    # serve o build de produção
```

## Onde ficam os exercícios

Com o app rodando pelo servidor (`npm run dev`, `Iniciar-DrumFlow.bat` ou `Iniciar-DrumFlow-Celular.bat`),
cada exercício é gravado como arquivo em **`dados/exercicios/<id>.json`** — continua salvo depois de
fechar o servidor e é compartilhado entre PC e celular. Excluídos vão para `dados/lixeira/`.
Para fazer backup ou levar para outra máquina, copie a pasta `dados`.

O navegador mantém uma cópia (cache): o app abre na hora e, se o servidor cair, as alterações
ficam numa fila e são gravadas quando ele volta. Na primeira conexão de cada navegador, os
exercícios que só existiam nele são enviados para a pasta (nada se perde); a partir daí a pasta
manda. Servido como site estático (sem o servidor), o app salva só no navegador.

API (plugin do Vite em `server/exerciseStorePlugin.ts`): `GET /api/exercicios`,
`PUT /api/exercicios/:id`, `DELETE /api/exercicios/:id`. Qualquer aparelho da rede que acesse o
app pode gravar nessa pasta — use o modo celular só em rede de confiança.

## Planos de Estudo

Aba **Planos de Estudo** (`#/estudo`): programa "Gospel Chops — 30 dias de treino", em 6 fases de
5 sessões, com sessões de 15 min, 30 min, 1 h ou 1h30 (blocos diferentes por duração; a soma é
sempre exata). Código em `src/study/` (regras puras e testadas) e `src/components/study/`.

- **Progressão por sessões concluídas, nunca por datas.** O próximo dia só avança ao concluir a
  sessão principal de forma válida (todos os exercícios feitos ou pulados, avaliação preenchida e
  pelo menos 70% do tempo de prática tocado). Datas ficam só no histórico.
- Sessões podem ser pausadas, retomadas, interrompidas e repetidas. Repetir dias antigos e o
  "treino livre" de um exercício registram prática mas não mexem na sequência.
- O tempo praticado conta apenas com o metrônomo tocando (relógio de áudio) e é salvo como valor
  absoluto — recarregar a página não conta nada duas vezes.
- **BPM por exercício**, independente do dia: sobe após 2 autoavaliações "limpo e relaxado"
  seguidas, mantém com "ok" e reduz com "difícil" (o usuário pode sempre escolher). O app **não
  mede** a execução: precisão e controle vêm da autoavaliação e são apresentados como tal.
- Testes de referência (singles, doubles, paradiddle, RLRLKK) nos Dias 1, 15 e 30 para comparar a
  evolução. Depois do Dia 30 seguem ciclos de consolidação.
- Progresso salvo no navegador e em `dados/estudo/progresso.json` (compartilhado com o celular).

## Faixas de acompanhamento

Configurações → **Faixas de acompanhamento**: envie uma música (MP3/WAV/OGG, até 30 MB), informe o
BPM (há **tap tempo**) e o **início do 1º tempo** (ouça e clique em "Marcar 1º tempo agora"). Nos
controles de reprodução, escolha a faixa em **Acompanhamento**. A música é agendada no mesmo relógio
de áudio do metrônomo (sincronia com clique, grade, loop, pausa e retomada). Tocar num BPM diferente
do da música muda a velocidade **e o tom** — o app avisa e oferece "Usar BPM da música". Arquivos
em `dados/faixas/`.

## Partitura

Seletor **Grade | Partitura | Ambos** acima da grade (Prática, Editor e Planos de Estudo). Notação
padrão de bateria: mãos com haste para cima, pés para baixo, barras por tempo, quiálteras 3 e 6,
pausas, acentos, ghost notes entre parênteses, apojaturas e a sequência D/E. Cursor e destaque da
nota tocada sincronizados com o áudio. Gravação da notação em `src/music/notation.ts` (pura, testada).

## Gravar e ouvir

Botão **Gravar** nos controles: grava pelo microfone enquanto o exercício toca desde a contagem
(use fone de ouvido). O microfone é captado por AudioWorklet com marcação do relógio de áudio, então
**"Ouvir com o clique"** reproduz a gravação alinhada ao tempo 1 (com desconto de latência e ajuste
fino ±150 ms). Também dá para ouvir só a gravação e baixar em **WAV**. As gravações ficam só na aba
aberta. O navegador só libera o microfone em endereço seguro: funciona em `http://127.0.0.1:5173`,
mas **não** pelo Wi-Fi (`http://192.168…`).

## Trocar os sons

Configurações → **Sons**:
- **Som do metrônomo:** Clássico, Woodblock, Cowbell, Clave, Tique seco ou Meus sons.
- **Kit de bateria:** Acústico, Eletrônico (808), Vintage/jazz ou Meus sons.
- **Meus sons:** carregue um arquivo curto (WAV/MP3/OGG, até 5 MB) para cada peça e para os três
  cliques do metrônomo. Ficam em `dados/sons/`; o arquivo substituído vai para `dados/lixeira/`.
  Peças sem arquivo usam o som sintetizado. Para criar novos timbres sintetizados, edite as
  camadas em `src/audio/soundCatalog.ts`.

## Som no celular

- iPhone/iPad: o app pede o canal de **mídia** (ignora a chave de silencioso). Ainda assim, use o
  volume de mídia e toque em Reproduzir (o navegador só libera som após um toque).
- Configurações → "Testar" e "Diagnóstico de áudio" mostram o estado do áudio.

## Atalhos

| Tela | Tecla | Ação |
|---|---|---|
| Prática/Editor | Espaço | Reproduzir / pausar / retomar |
| Prática/Editor | Home | Reiniciar desde a contagem |
| Prática/Editor | Esc | Parar |
| Prática (ou editor sem seleção) | ↑ ↓ | BPM ±1 (Shift ±5) |
| Editor | Delete | Excluir notas selecionadas |
| Editor | ← → | Mover um passo (Shift: um tempo) |
| Editor | ↑ ↓ | Trocar a peça (linha) da seleção |
| Editor | A | Alternar acento |
| Editor | Ctrl+Z / Ctrl+Y | Desfazer / refazer |
| Editor | Ctrl+C / Ctrl+V | Copiar / colar no compasso atual |
| Editor | Ctrl+D | Duplicar no passo seguinte |
| Editor | Ctrl+S | Salvar |

## Arquitetura

```
src/
  music/        modelo musical puro (tipos, fórmulas de compasso, matemática de tempo,
                timeline, quantização, operações de edição, histórico, validação)
  audio/        AudioEngine (contexto + grafo), Metronome (cliques), DrumSynth (bateria
                sintetizada), AudioScheduler (despertador em Web Worker)
  transport/    Transport (estado, agendamento, posição) e TempoMap (tempo ↔ posição)
  storage/      ExerciseRepository / SettingsRepository (interface + localStorage)
  data/         rudimentos e exercícios de demonstração
  app/          serviços (singletons), estado React, rotas por hash
  components/   grade, controles, telas (prática, rudimentos, editor, meus, configurações)
  tests/        Vitest
```

O núcleo musical (`music/`, `transport/`) não depende de React nem do navegador e é testado com um
relógio falso — dá para trocar a UI, adicionar MIDI ou sincronizar na nuvem sem reescrevê-lo.

### Tempo e sincronização

- **Relógio único:** tudo deriva de `AudioContext.currentTime`. O transporte mantém um
  `TempoMap` linear por partes (âncoras absolutas tempo↔posição), então não há soma incremental
  nem acúmulo de erro.
- **Scheduler com antecipação:** um Web Worker acorda o transporte a cada 25 ms; ele agenda, com
  horário explícito (`start(t)`), todo evento cuja posição cai em `[fronteira, horizonte)`, sendo
  o horizonte = posição em `agora + 120 ms`. Intervalos semiabertos e contíguos ⇒ cada evento é
  agendado exatamente uma vez. Os timers só acordam o scheduler; não decidem quando o som toca.
- **Visual:** a cada `requestAnimationFrame`, a grade lê `transport.getPosition()`, que converte
  `currentTime − outputLatency` em posição musical. Perder frames não desincroniza nada; o
  frame seguinte já cai no lugar certo. Destaques e playhead são atualizados direto no DOM
  (sem re-render do React por frame).
- **Pausa:** cada reprodução usa ganhos de "sessão"; pausar desconecta-os e interrompe todas as
  fontes agendadas — nenhum clique já programado soa depois. A posição é preservada; retomar
  reagenda a partir dela (sem duplicar).
- **Mudança de BPM em execução:** aplicada na fronteira de agendamento (≤ 120 ms à frente). Tudo
  antes já está agendado com o andamento antigo; depois, com o novo. O mapa é contínuo nesse
  ponto: sem salto visual, sem clique duplicado; o único intervalo afetado fica entre as duas
  durações. Coberto por teste (`transport.test.ts`).
- **Edição durante a reprodução:** o mesmo exercício recarregado preserva a posição dentro do
  ciclo a partir da fronteira; trocar de exercício para a reprodução.
- **Compassos:** duração = numerador × 4/denominador semínimas; BPM refere-se à semínima. Em x/8
  o metrônomo marca cada colcheia (primeiro tempo acentuado).

### Modelo de dados

`Exercise { id, name, description, tempoSignature, bpm, totalBars, subdivision, loopEnabled,
countInBars, events[] }` e `MusicEvent { id, barIndex, beatPosition (semínimas), instrument,
limb, velocity 1–127, accent, duration?, ornament? }`. Vários eventos podem ocupar a mesma
posição. A posição visual é sempre calculada a partir do modelo. Trocar a subdivisão não move
notas (as fora da grade aparecem tracejadas); quantizar é uma ação explícita.

## Limitações conhecidas

- Sons de bateria são sintetizados (sem samples); servem de referência, não de timbre realista.
- A latência de saída usada para alinhar o visual vem de `AudioContext.outputLatency`, que alguns
  navegadores (ex.: Safari antigo) não informam; nesses casos o visual pode adiantar alguns ms.
- Em fórmulas compostas (6/8, 12/8) o metrônomo marca colcheias, não semínimas pontuadas.
- Em abas em segundo plano o navegador pode reduzir o ritmo do Worker; o lookahead de 120 ms
  cobre atrasos normais, mas não suspensões longas.
- Persistência apenas local (por navegador). A interface `ExerciseRepository` foi feita para
  receber um backend futuramente.
