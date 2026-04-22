# Resumo Executivo

- O endurecimento reduziu falsa precisao no replay em massa: NAO.
- No fluxo publico da amostra real, a mudanca visivel antes vs depois foi nao detectada.
- As contagens de BATEU/DIVERGIU/INCONCLUSIVO ficaram estaveis em massa, entao o efeito veio de seguranca de selecao, nao de virada estatistica bruta.
- Respostas baixas e nao promovidas passaram de 7024 para 7024 no replay em massa.
- A piora de aderencia por campo no replay deve ser lida como aumento de conservadorismo onde antes havia promocao fraca por prefixo, nao como regressao automatica do motor.
- O efeito observado aponta os casos residuais mais para cobertura de base do que para disputa prematura de prefixo: PARCIAL.
- Smoke test no endpoint publicado com casos de prefixo ainda retornou promocao fraca com `matched_rule_id` preenchido, entao o ambiente real ainda nao refletiu o codigo conservador local.
- Conclusao operacional: o Bloco 1 nao pode ser tratado como homologado no ambiente real ainda.
