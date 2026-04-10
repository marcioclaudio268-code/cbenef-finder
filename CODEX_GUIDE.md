# CODEX_GUIDE

## Finalidade

Este arquivo orienta o uso do Codex neste repositorio.

O Codex deve trabalhar dentro do escopo do projeto e evitar improvisacoes que desviem da ideia central do sistema.

## Resumo do produto

CBENEF TRIB e um classificador fiscal estruturado para produtos novos em operacao interna no Estado de Sao Paulo.

Entrada:

- descricao
- EAN
- NCM

Saida principal:

- %ICMS saida
- CST
- CFOP
- cBenef
- confidence_score
- confidence_level
- fundamento legal
- aviso quando a descricao for insuficiente

## Regime do core atual

O core atual da engine e baseado em regime normal / RPA no nivel de ICMS da mercadoria.

Estrutura principal:

- CST
- CFOP
- cBenef
- beneficio fiscal paulista
- situacao de ST / fora de ST

O Codex nao deve reorientar o projeto para Simples Nacional como base principal.

## Regras de atuacao

O Codex deve:

- trabalhar em mudancas pequenas e auditaveis
- priorizar o core da classificacao fiscal
- preservar o escopo do projeto
- sinalizar riscos antes de mudancas destrutivas
- preferir correcoes localizadas a refactors amplos
- respeitar o uso do GitHub como fonte de verdade
- considerar o Lovable como camada final, nao ambiente principal de desenvolvimento
- reforcar o core em CST

## O que o Codex nao deve fazer

- ampliar o sistema para frentes paralelas
- transformar o projeto em ERP
- criar simulador tributario generico
- mexer no Lovable
- remover legado sem analise
- alterar migrations antigas sem necessidade extrema
- criar taxonomia incoerente
- inventar fundamento legal
- inventar regra fiscal sem evidencia
- fazer mudancas grandes sem necessidade objetiva
- trocar o core atual de CST para CSOSN
- assumir Simples Nacional como foco principal da engine

## Regras para cbenef_rules

- evitar mudancas em massa sem validacao
- preferir micro-rodadas controladas
- identificar regras por chave segura, como `ncm + cbenef_code`
- evitar pilotos em NCM conflitado na primeira rodada
- nao inventar `macro_group`
- reaproveitar taxonomia existente e coerente
- preencher base legal quando houver fundamento claro
- sinalizar quando faltar base segura
- alinhar a base com a consolidacao operacional ja validada no projeto

## Regras para migrations

- nao alterar migrations antigas
- criar migrations novas para mudancas novas
- manter mudancas pequenas, claras e reversiveis
- evitar acoes destrutivas
- nao remover `output_trib_code` sem analise explicita
- mostrar diff completo ao final

## Regras para frontend

O Codex so deve mexer em frontend quando a tarefa exigir claramente isso.

Prioridade de frontend no escopo atual:

- refletir o resultado fiscal central do sistema
- nao criar frentes novas
- nao refazer UI sem motivo funcional

## Regime tributario

Se surgir tema de Simples Nacional, o Codex deve tratar isso como:

- assunto futuro
- adaptador de saida
- camada separada do core

O Codex nao deve misturar CST, CSOSN, RPA e Simples Nacional sem instrucao explicita e sem desenho arquitetural aprovado.

## Formato esperado de resposta

Sempre que possivel, o Codex deve responder com:

1. objetivo da alteracao
2. arquivos alterados
3. diff
4. riscos
5. pendencias
6. confirmacao do que nao foi alterado

## Criterio de bloqueio

Se a alteracao proposta nao fortalecer diretamente a confiabilidade da classificacao fiscal estruturada em CST, ela deve ser reavaliada antes de ser implementada.

## Regra final

Fortalecer o nucleo do produto.
Nao ampliar escopo.
Nao improvisar alem da base disponivel.
Nao misturar regime normal com Simples.
