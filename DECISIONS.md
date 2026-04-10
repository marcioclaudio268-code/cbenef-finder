# DECISIONS

## Decisoes de direcao

- O core do produto permanece em CST / CFOP / cBenef.
- Lucro Presumido e Lucro Real continuam dentro do core atual.
- Simples Nacional fica como camada futura de adaptacao, nao como foco principal agora.
- TRIB nao entra no fluxo funcional atual.
- Operacao interna em Sao Paulo e venda direta a consumidor final continuam como premissa base.
- Item fora de ST usa CFOP padrao 5102.

## Decisoes de base

- `cbenef_rules` e a base central de classificacao.
- Regras importadas, operacionais validas e regras invalidas precisam coexistir com governanca explicita.
- Regras erradas conhecidas nao devem ser apagadas.
- Regra invalida deve virar `invalid` ou `inactive`, com motivo registrado.
- Regra nova so entra no motor depois de validacao formal.

## Decisoes de execucao

- Somente regra `validated + active` deve disputar no motor.
- O motor deve filtrar primeiro pela premissa correta de SP, consumidor final, CST / RPA e ST / fora de ST.
- Depois disso, a engine pode ranquear por NCM, descricao, prioridade e aderencia semantica.

## Decisoes de rastreabilidade

- Toda regra deve separar evidencia e decisao.
- Fundamento legal principal e URL oficial devem ficar registrados.
- Motivo do status, quem validou, data de validacao e vigencia precisam ser preservados quando houver ciclo de governanca completo.

## Decisoes de descarte

- Nao apagar regra errada conhecida.
- Registrar motivo.
- Referenciar regra substituta quando ela existir.
- Preservar historico para auditoria.
