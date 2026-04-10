# BACKLOG

## Agora

- completar campos fiscais faltantes nas regras legadas da `cbenef_rules`
- revisar regras incompletas com foco em:
  - output_icms_rate
  - output_cst_icms
  - output_cfop
  - macro_group
  - legal_basis
  - legal_basis_url
- reduzir ambiguidades em NCMs duplicados
- revisar taxonomia e coerencia de `macro_group`
- alinhar a base importada com a consolidacao operacional do projeto
- reforcar o core em CST / CFOP / cBenef
- melhorar cobertura dos grupos principais:
  - arroz
  - feijao
  - farinha de mandioca
  - maca e pera
  - hortifrutigranjeiros e ovos em estado natural
  - cesta basica paulista nos itens mais literais
- ampliar testes de regressao para casos reais e casos ambiguos
- garantir que respostas ambiguas caiam em baixa confianca

## Proximo

- consolidar criterios de ranking entre regras com mesmo NCM
- endurecer o motor para fallback seguro
- melhorar o tratamento de descricao insuficiente
- revisar consistencia entre banco, edge function, tipos e card de resultado
- revisar bases legais faltantes nas regras prioritarias
- consolidar separacao explicita entre:
  - item em ST
  - item fora de ST
  - item com beneficio fiscal paulista
  - item que exige revisao

## Depois

- ampliar cobertura de regras apos saneamento inicial
- melhorar auditoria da decisao
- exibir melhor explicacao do motivo da classificacao
- criar fluxo de homologacao interna por grupo de produto
- preparar base para piloto controlado
- desenhar adaptador futuro para Simples Nacional sem mexer no core em CST

## Bloqueios

- regras legadas ainda incompletas
- NCMs duplicados com pouca discriminacao semantica
- taxonomia ainda irregular em alguns grupos
- parte da base ainda sem fundamento legal preenchido
- divergencia entre base importada e consolidacao interna em alguns segmentos
- risco de falsa precisao em descricoes genericas

## Nao fazer agora

- refactor amplo sem necessidade
- redesign de interface como prioridade
- remocao de legado sem analise
- expansao para modulos fora da classificacao fiscal
- automacoes paralelas fora do nucleo do projeto
- grandes mudancas no Lovable
- troca do core de CST para CSOSN
- expansao imediata para engine multi-regime

## Regra de execucao

Toda tarefa nova deve responder claramente:

- melhora a confiabilidade da classificacao?
- reduz ambiguidade?
- melhora a rastreabilidade?
- fortalece o core em CST / CFOP / cBenef?

Se a resposta for nao, a tarefa sai da frente da fila.
