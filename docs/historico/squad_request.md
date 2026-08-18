# Solicitação de Integração: Detecção Automática de Squad no Sploit

## Contexto
Temos atualmente uma funcionalidade que detecta automaticamente áreas do projeto (backend, frontend, QA, etc.) e sugere agentes correspondentes com nomes/personas. Essa função já está implementada e funcional via CLI, mas ainda precisa ser integrada ao fluxo principal do Sploit.

### O Que Já Funciona
1. **Análise de Projeto:**
   - O script `detectar.ts` percorre a estrutura do projeto e identifica áreas com base em nomes de pastas e arquivos (ex.: `test/`, `backend/`, `package.json`).
   - Ele retorna um JSON com sugestões de agentes, incluindo tipo, caminho e nome/persona sugerido.

   **Exemplo de saída:**
   ```json
   [
     { "tipo": "qa", "path": "test", "nomeSugestao": "Carla" },
     { "tipo": "scripts", "path": "bin", "nomeSugestao": "Serafim" }
   ]
   ```

2. **CLI para Rodar Manualmente:**
   - Criamos o script `detectar-squad-cli.ts`, que pode ser executado via terminal:
     ```bash
     bun run squad/detectar-squad-cli.ts --path <diretorio-do-projeto>
     ```
   - Isso permite obter o JSON da análise diretamente do terminal.

### O Que Falta
Queremos que essa funcionalidade esteja integrada diretamente no fluxo principal do Sploit. Especificamente:

1. **Integração com o Onboarding:**
   - Ao abrir ou iniciar um novo projeto no Sploit, o script `detectar.ts` deve ser executado automaticamente.
   - Os resultados (áreas detectadas) devem ser mostrados ao usuário com possibilidade de revisão.

2. **Geração de Squad:**
   - Após a confirmação do usuário, criar os agentes sugeridos automaticamente dentro do projeto (incluindo memórias/quadro).

3. **UI/UX:**
   - Mostrar as áreas detectadas em uma interface amigável, onde seja possível ajustar os nomes/tipos sugeridos antes de criar os agentes.

### Especificações Técnicas
1. **Função Existente:**
   - `sploit-src/packages/opencode/src/squad/detectar.ts`
   - Detecta áreas do projeto e retorna um array de objetos como este:
     ```ts
     interface AreaDetectada {
       tipo: string;
       path: string;
       nomeSugestao: string;
     }
     ```

2. **Novo Fluxo Sugerido:**
   - **Onboarding:**
     - Alterar o fluxo de onboarding para chamar o método `detectarAreasProjeto()` automaticamente quando um novo projeto é aberto ou inicializado.
     - Mostrar os resultados na UI (exemplo: lista de áreas detectadas).
   - **Confirmação do Usuário:**
     - Permitir edição dos nomes/personas diretamente na interface antes de confirmar.
   - **Geração Automática:**
     - Após confirmação, criar os arquivos do squad e memórias necessários:
       - `squad.json`: Definir agentes baseados no JSON da análise.
       - Quadros/memórias: Criar templates iniciais.

3. **Componentes Impactados:**
   - **Onboarding Handler:**
     Arquivo que lida com a lógica de onboarding e/ou inicialização de projetos.
   - **UI:**
     Novos componentes de interface para exibir e editar áreas detectadas.