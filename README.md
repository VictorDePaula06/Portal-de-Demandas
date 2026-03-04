# Portal de Demandas

Portal para gerenciar demandas de clientes (N1, Análise, QP, Adhoc e novos clientes CS).

## 🚀 Funcionalidades

- Kanban para acompanhamento de demandas.
- Filtros por status e SLA.
- Gerenciamento de demandas em tempo real.
- Integração com API (CORS habilitado).

## 🛠️ Tecnologias Utilizadas

- **Frontend**: HTML5, Vanilla CSS, JavaScript (Vite).
- **Backend**: Node.js, Express, Axios, Dotenv.

## ⚙️ Configuração Local

1.  **Clone o repositório:**
    ```bash
    git clone https://github.com/VictorDePaula06/Portal-de-Demandas.git
    cd Portal-de-Demandas
    ```

2.  **Instale as dependências:**
    ```bash
    npm install
    ```

3.  **Configuração de variáveis de ambiente:**
    Crie um arquivo `.env` na raiz do projeto com as seguintes chaves (substitua pelos valores reais):
    ```env
    PORT=3000
    # Adicione outras chaves se necessário
    ```

4.  **Execute o servidor e o frontend:**
    ```bash
    # No terminal 1 (Backend)
    npm run server

    # No terminal 2 (Frontend)
    npm run dev
    ```

## 📄 Licença

Este projeto está sob a licença MIT.
