# Runtime Parity Report

- Source commit: `23105ef01c6c6d3c928f6d2cd947047daaafb275`
- Public endpoint: `https://gquohrcdfcsbinucwjxb.supabase.co/functions/v1/get-cbenef`
- Conclusion: `desalinhado`

## Runtime Inspection

- No commit/version header was exposed by the public function response.

## Case Comparison

| Case | Local current-code expectation | Public response | Result |
| --- | --- | --- | --- |
| C01 | prefixo_apenas_contexto / exact=0 / prefix=1 | matched_rule_id=20c26676-eaa6-4953-89e0-ca233f044c85, matched_by_ncm_prefix=true, confidence=low, cbenef_code=SP000100 | desalinhado |
|  | Local note: O NCM 02011000 encontra apenas cobertura por prefixo; o codigo atual deve manter baixa confianca, nao promover regra. | Public note: Carne bovina desossada — isenção cesta básica SP | public_promoted_rule, public_matched_rule_id_non_null |
| L02 | prefixo_apenas_contexto / exact=0 / prefix=6 | matched_rule_id=e693f8e6-d756-4885-9688-da425c177bd8, matched_by_ncm_prefix=true, confidence=low, cbenef_code=SP810100 | desalinhado |
|  | Local note: O NCM 04032000 encontra apenas cobertura por prefixo; o codigo atual deve manter baixa confianca, nao promover regra. | Public note: Produto classificado como manteiga pela descrição normalizada. Sujeito a substituição tributária em SP. | public_promoted_rule, public_matched_rule_id_non_null |

## Summary

- Cases analyzed: 2
- Conclusion: desalinhado

