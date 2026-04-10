# PROJECT_SCOPE

## Essencia do produto

CBENEF TRIB existe para receber um produto novo informado pelo cliente e devolver um cadastro fiscal sugerido estruturado, com base atualizada e rastreavel.

O sistema deve funcionar como classificador fiscal objetivo para mercadorias em Sao Paulo.

## Entrada esperada

- descricao do item
- EAN
- NCM

## Saida esperada

A resposta central do sistema, no escopo atual, e:

- %ICMS saida
- CST
- CFOP
- cBenef
- confidence_score
- confidence_level
- fundamento legal
- aviso quando a descricao for insuficiente

## Regime fiscal do core atual

O core atual da engine deve permanecer baseado em:

- CST
- CFOP
- cBenef
- beneficio fiscal paulista
- situacao de ST / fora de ST

Isso significa que o foco atual da engine e compativel com o regime normal / RPA no nivel de ICMS da mercadoria.

Nesta fase, o projeto nao deve ser reorientado para CSOSN / Simples Nacional como base principal.

## Norte obrigatorio

Toda decisao de produto, codigo, modelagem e backlog deve fortalecer este nucleo:

receber item/EAN/descricao/NCM e devolver cadastro fiscal sugerido estruturado em logica paulista de CST.

## Premissa operacional

- operacao interna no Estado de Sao Paulo
- venda direta a consumidor final
- item fora de ST: CFOP padrao 5102
- item em ST sem beneficio fiscal identificado: padrao de apoio com CST 060, CFOP 5405 e cBenef em branco
- TRIB fora do fluxo funcional atual

## Prioridade atual

1. confiabilidade operacional
2. saneamento da base `cbenef_rules`
3. reducao de ambiguidades
4. rastreabilidade legal
5. limpeza estrutural

## O que deve ser feito agora

- completar campos fiscais faltantes nas regras legadas
- reduzir conflitos por NCM duplicado
- melhorar a coerencia da taxonomia
- manter respostas de baixa confianca quando a base nao sustentar decisao segura
- preservar fundamento legal nas regras
- manter o frontend alinhado ao resultado central do sistema
- consolidar o motor paulista em CST

## O que nao deve ser feito agora

- transformar o projeto em ERP
- criar modulos paralelos fora da classificacao fiscal
- transformar o core atual em engine principal de Simples Nacional
- trocar CST por CSOSN como base do sistema
- expandir para multiplos regimes sem estabilizar o core
- usar o Lovable como ambiente principal de desenvolvimento
- remover legado sem validacao
- inventar taxonomias sem coerencia com a base atual
- priorizar estetica acima de coerencia funcional

## Criterio de pronto

Esta fase pode ser considerada concluida quando:

- a base principal de regras estiver suficientemente completa
- os campos centrais estiverem preenchidos nas regras relevantes
- os conflitos mais perigosos estiverem tratados
- o sistema devolver sugestoes coerentes para os grupos principais
- os casos ambiguos resultarem em baixa confianca, nao em falsa precisao
- houver base legal rastreavel nas regras prioritarias
- a engine estiver estavel em CST / CFOP / cBenef para a premissa atual

## Criterio para nao sair do escopo

Se uma mudanca nao melhorar diretamente a classificacao fiscal estruturada da mercadoria em SP, ela nao e prioridade agora.

## Regra de decisao

Quando houver duvida entre expandir funcionalidade ou consolidar a base atual, a decisao correta e consolidar a base atual.
