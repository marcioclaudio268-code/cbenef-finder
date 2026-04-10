# CBENEF TRIB

CBENEF TRIB e um classificador fiscal estruturado para produtos novos, focado em operacao interna no Estado de Sao Paulo.

O sistema recebe descricao, EAN e/ou NCM e devolve um cadastro fiscal sugerido com base atualizada e rastreavel.

## Saida central

- %ICMS saida
- CST
- CFOP
- cBenef
- confidence_score
- confidence_level
- fundamento legal
- aviso quando a descricao for insuficiente

## Core atual

- regime normal / RPA em CST
- Lucro Presumido dentro do core atual
- Lucro Real dentro do core atual
- Simples Nacional como camada futura de adaptacao, nao como foco principal
- operacao interna em SP
- venda direta a consumidor final
- item fora de ST => CFOP padrao 5102
- TRIB fora do fluxo funcional atual

## Fonte de verdade documental

- [PROJECT_SCOPE.md](PROJECT_SCOPE.md)
- [BACKLOG.md](BACKLOG.md)
- [DECISIONS.md](DECISIONS.md)
- [CODEX_GUIDE.md](CODEX_GUIDE.md)
- [REGIME_POLICY.md](REGIME_POLICY.md)
- [RULE_GOVERNANCE.md](RULE_GOVERNANCE.md)

## Principio do projeto

Confiabilidade operacional primeiro. Limpeza estrutural em seguida.

## Estado atual

O projeto ainda esta em fase de saneamento.
A infraestrutura principal existe, mas a base fiscal precisa de completude, reducao de ambiguidades e governanca clara antes de producao.
