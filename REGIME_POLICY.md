# REGIME_POLICY

## Objetivo

Este arquivo existe para impedir mistura de logica entre regime normal / RPA e Simples Nacional no CBENEF TRIB.

## Regra principal

O core atual da engine deve permanecer orientado a:

- CST
- CFOP
- cBenef
- beneficio fiscal paulista
- situacao de ST / fora de ST
- operacao interna em SP
- venda direta a consumidor final

## O que isso significa na pratica

Nesta fase do projeto, a engine principal atende a logica-base de mercadoria aplicavel a:

- Lucro Presumido
- Lucro Real
- demais operacoes tratadas em regime normal / RPA no nivel de ICMS da mercadoria

## O que nao deve ser feito agora

- trocar a base principal de CST para CSOSN
- adaptar todo o motor para Simples Nacional
- misturar retorno de regime normal com retorno de Simples na mesma regra
- tratar Simples como premissa principal do banco, da edge function ou do card

## Por que isso foi definido

- a planilha-base do projeto foi construida em CST
- a consolidacao operacional do projeto trabalha em CST, CFOP e cBenef
- a engine atual ja esta modelada para devolver `%ICMS`, `CST`, `CFOP` e `cBenef`
- misturar isso agora com logica principal de Simples criaria divergencia de escopo

## Papel futuro do Simples Nacional

Simples Nacional pode ser atendido futuramente, mas como camada separada.

Modelo esperado no futuro:

- core da decisao fiscal da mercadoria
- adaptador de saida para regime normal / RPA
- adaptador de saida para Simples Nacional

## Regra de implementacao

Enquanto o projeto nao tiver arquitetura multi-regime aprovada:

- banco continua orientado ao core em CST
- edge function continua orientada ao core em CST
- frontend continua mostrando `%ICMS`, `CST`, `CFOP` e `cBenef`
- prompts para Codex nao devem deslocar o foco para CSOSN

## Criterio para abrir a fase Simples

So abrir frente de Simples Nacional quando:

- o nucleo da mercadoria em SP estiver estavel
- a base cbenef_rules estiver saneada
- as regras principais estiverem consolidadas
- houver desenho claro de adaptacao por regime
