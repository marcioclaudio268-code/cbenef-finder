# RULE_GOVERNANCE

## Objetivo

Formalizar como regras de `cbenef_rules` entram, convivem, competem e sao descartadas.

## Conceitos obrigatorios

### Origem

- `imported`
- `manual_validated`
- `legacy_invalid`
- `office_operational`

### Status

- `draft`
- `validated`
- `active`
- `inactive`
- `invalid`

### Campos de governanca

- `status_reason`
- `validated_by`
- `validated_at`
- `valid_from`
- `valid_to`
- `priority`

## Regra de competencia

Somente regra `validated + active` deve disputar no motor.

Regras `draft`, `inactive` e `invalid` nao devem concorrer como regra final.

## Fluxo de promocao

1. `imported` entra como `draft`
2. revisao operacional compara com fonte oficial
3. se bater, vira `validated`
4. so depois pode virar `active`
5. regra errada conhecida nunca e apagada; vira `invalid` ou `inactive`

## Separacao entre regra e evidencia

Cada regra precisa manter a diferenca clara entre:

- fundamento legal principal
- URL oficial
- tipo de operacao coberta
- premissa operacional
- observacao de restricao

## Resolucao de conflito da engine

1. considerar apenas regras `active`
2. preferir regras `validated` do dominio operacional do projeto
3. filtrar pela premissa correta: SP, consumidor final, CST / RPA, ST ou fora de ST
4. depois ranquear por NCM, descricao, prioridade e aderencia semantica

## Taxonomia minima formal

- hortifruti
- basicos_graos
- farinhas
- queijos
- laticinios
- carnes_bovinas
- carnes_suinas
- aves
- pescados
- cesta_basica_outros

## Campo logico futuro de confianca da regra

- `imported_low`
- `office_validated`
- `legal_confirmed`

## Politica formal de descarte

- nao apagar
- marcar como invalida
- registrar motivo
- referenciar regra correta substituta quando houver

## Criterio pratico de qualidade

Uma regra so deve ir para producao quando:

- o NCM for nao conflitado
- a descricao for literal ou muito proxima do enquadramento legal
- o fundamento legal sustentar diretamente o efeito fiscal
- o macro_group for coerente com a taxonomia do projeto
- a premissa operacional estiver clara
- o historico da decisao ficar rastreavel
