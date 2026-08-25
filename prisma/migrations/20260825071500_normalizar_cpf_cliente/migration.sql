-- Normaliza `Cliente.cpf` para só dígitos.
--
-- O CPF é a chave natural do Cliente (`@unique`), mas os DTOs sempre aceitaram
-- as duas formas — `03112345675` e `031.123.456-75` — e o cadastro pelo painel
-- (`ClientesService.create`) gravava o que chegou. Um cadastro mascarado ficava
-- invisível para toda busca por CPF, que compara dígitos: o autofill do POS, a
-- rota `/admin/clientes/cpf/:cpf` e a checagem de duplicado das vendas. Pior,
-- a `@unique` não protegia — para o banco as duas formas são strings
-- diferentes, então o mesmo cliente entrava duas vezes.
--
-- O código já foi corrigido para gravar só dígitos e para ler nos dois
-- formatos. Esta migration acerta o que ficou para trás, para que as leituras
-- por dígito espalhadas pelos services voltem a ser suficientes.

-- Reescreve só as linhas com máscara, e só quando o CPF limpo está livre.
--
-- Os dois guards existem para não violar a `@unique` no meio da migration:
--   - `ordem = 1` resolve o caso de duas linhas mascaradas que colapsam no
--     mesmo CPF (ex.: `031.123.456-75` e `031123456-75`);
--   - o `NOT EXISTS` resolve o caso de já existir a linha limpa equivalente.
--
-- Fica de fora, portanto, o cliente realmente duplicado — a linha mascarada
-- permanece como está. Consolidar esses cadastros (qual mantém as vendas)
-- é decisão de negócio, não de migration. Para listá-los:
--
--   SELECT c.id, c.cpf, c.nome, c."createdAt"
--   FROM "Cliente" c
--   WHERE c.cpf ~ '\D'
--   ORDER BY c."createdAt";
WITH normalizados AS (
  SELECT
    c.id,
    regexp_replace(c.cpf, '\D', '', 'g') AS cpf_limpo,
    ROW_NUMBER() OVER (
      PARTITION BY regexp_replace(c.cpf, '\D', '', 'g')
      ORDER BY c."createdAt", c.id
    ) AS ordem
  FROM "Cliente" c
  WHERE c.cpf ~ '\D'
)
UPDATE "Cliente" c
SET cpf = n.cpf_limpo
FROM normalizados n
WHERE c.id = n.id
  AND n.ordem = 1
  AND NOT EXISTS (
    SELECT 1
    FROM "Cliente" o
    WHERE o.id <> c.id
      AND o.cpf = n.cpf_limpo
  );
