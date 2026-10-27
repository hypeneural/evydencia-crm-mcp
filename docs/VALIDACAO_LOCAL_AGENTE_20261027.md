# Validação local do agente — somente este checkout
**27/10/2026 · escopo fechado · sem produção**

## Objetivo único
Validar a PR deste projeto e seus contratos de ferramentas com fixtures sintéticas e mock HTTP em loopback. A validação não autoriza publicar, usar um token real ou executar uma ação comercial.

## Limites de execução
- Diretório permitido: **somente a raiz deste checkout e seus subdiretórios**. Não procurar, abrir, clonar, atualizar, pesquisar ou mencionar outros repositórios ou diretórios de projeto.
- Não acessar VPS, SSH, serviços HTTPS, banco de dados, gerenciadores remotos, plugins reais, GitHub API ou credenciais.
- Não executar `git checkout -B`, `reset --hard`, `push --force`, merge, release ou reinício de serviços.
- Não disparar impressão, mensagens nem alterações reais de pedidos. Testes são exclusivamente sintéticos.
- Não executar runbooks antigos de release, publicação, smoke online ou scripts de instalação.

## Um comando autorizado
Na raiz deste projeto:
```powershell
npm run agent:validate:local
```
Ele valida sintaxe e contratos sintéticos de lote/cliente/impressão, além da integração local do gateway. Usa Node 22, não carrega `.env`, remove variáveis de tokens do ambiente filho, não chama rede externa e imprime um JSON pequeno com `ok`, etapas e tempos. Sem repetir o comando se o mesmo HEAD já passou.

## Foco da validação
- Somente impressão: `so_imprime` exige escopo de impressão; nenhuma chamada para mutação comercial.
- Somente alteração: `so_baixa` não inicializa cliente de impressora.
- Combinado: `baixa_e_imprime` executa etapas sequenciais com releitura do pedido.
- A entrada de lote exige IDs únicos, snapshots e confirmação explícita; falhas retornam reconciliação, nunca retry automático.
- `spooled` não comprova papel impresso. Nenhum teste local altera esse fato.

## Reconciliação de commits locais divergentes

O runner oficial deste repositório é `scripts/validate-agent-local.mjs`, executado por `npm run agent:validate:local`. **Não criar, importar, substituir ou publicar uma cópia com o nome `scripts/agent-validate-local.mjs`.** A CI inclui `test/agent-validator-contract.test.mjs`, que reprova duplicações.

Um resultado `LOCAL_PASS` de outro commit não prova que aquele SHA foi enviado à PR, nem que o serviço em produção o utiliza. Para conferir o estado do checkout sem descartá-lo:
```powershell
git status --short
git rev-parse HEAD
git branch -vv
git log -5 --oneline
```
Se existir commit local próprio com runner alternativo, preservar histórico e **não fazer push, reset, rebase, merge ou cherry-pick automático**. Apenas registrar o SHA e informar que o arquivo duplicado não deve entrar na PR. O validador oficial já está versionado e aprovado; a decisão de integrar qualquer alteração não duplicada pertence à revisão técnica.

**Escopo da aprovação:** testes sintéticos e parser local. Nenhum desses scripts precisa ser implantado como serviço, nem substitui teste funcional de impressão física, fila remota ou release de aplicação.

## Entrega
Se o comando retornar `ok=true`, registrar apenas HEAD local **deste repositório**, `PASS`, tempos por etapa e se houve alterações locais. Se falhar, indicar a etapa e corrigir somente se o defeito estiver reproduzido neste checkout. Não executar comandos fora deste escopo.

**Importante:** o script não garante que o gateway esteja publicado nem que a impressão física tenha ocorrido. Isso é responsabilidade de outro processo operacional, fora deste plano.

Fontes oficiais: Node child_process https://nodejs.org/api/child_process.html ; autenticação MCP https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization .
