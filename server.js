import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// API Key TiFlux (Configurar no arquivo .env)
const TIFLUX_API_URL = process.env.TIFLUX_API_URL || 'https://api.tiflux.com.br/api/v1';
const TIFLUX_API_TOKEN = process.env.TIFLUX_API_TOKEN || 'SEU_TOKEN_AQUI';

/**
 * Rota para buscar os chamados no TiFlux (QP e Analise)
 */
app.get(['/api/demandas', '/demandas', '/'], async (req, res) => {
    // Se bater na raiz da function, redireciona ou trata como demandas
    if (req.path === '/' || req.path === '/api' || req.path === '/api/') {
        // Prossegue para buscar demandas
    }
    try {
        // --- CÓDIGO DE INTEGRAÇÃO REAL (Comentado) ---
        // Adicionando limit=150 para que ele puxe mais chamados que possam estar em páginas anteriores do TiFlux
        const response = await axios.get(`${TIFLUX_API_URL}/tickets?limit=150`, {
            headers: { 'Authorization': `Bearer ${TIFLUX_API_TOKEN}` }
        });

        // Log do primeiro item para descobrir os nomes exatos dos campos da API v2!
        let rawTickets = response.data;
        if (response.data && response.data.data) { // Paginação padrão v2
            rawTickets = response.data.data;
        }

        if (rawTickets.length > 0) {
            console.log('--- ESTRUTURA TICKETS DO TIFLUX ---');
            console.log(JSON.stringify(rawTickets[0], null, 2));
            console.log('-----------------------------------');
        }

        if (!Array.isArray(rawTickets)) {
            console.error('TiFlux retornou formato não-array:', rawTickets);
            return res.json([]); // Retorna vazio se não for array
        }

        // Mapear a resposta definitiva de acordo com o Payload da API V2 do TiFlux
        const demands = rawTickets.map(ticket => {
            const rawStage = (ticket.stage?.name || '').toLowerCase();
            const rawTitle = (ticket.title || '').toLowerCase();
            let finalStatus = 'Analise'; // Default fallback

            // Mapeamento Rígido Analisando Título e Estágio
            if (rawStage.includes('qp') || rawTitle.includes('qp')) {
                finalStatus = 'QP';
            } else if (rawStage.includes('nális') || rawStage.includes('nalis') || rawStage.includes('analise') || rawTitle.includes('análise') || rawTitle.includes('analise')) {
                finalStatus = 'Analise';
            } else {
                finalStatus = ticket.stage?.name || 'Outros';
            }

            // Extracao Dinamica do Num. da Quality (Ex: [QP 33230] ou Análise Webposto - 27403)
            const titleMatch = rawTitle.match(/\[?(?:qp|quality|an[áa]lise(?:.*?-)?)\s*(\d+)\]?/i);
            const numQuality = titleMatch ? titleMatch[1] : '';

            // Calc SLA Date
            const defaultDate = ticket.created_at ? new Date(ticket.created_at) : new Date();
            const createdAtFormatted = defaultDate.toISOString().split('T')[0];
            let daysToAdd = 0;
            if (finalStatus === 'Analise') {
                daysToAdd = 7;
            } else if (finalStatus === 'QP') {
                daysToAdd = 30;
            }
            defaultDate.setDate(defaultDate.getDate() + daysToAdd);
            const formattedDate = defaultDate.toISOString().split('T')[0];

            return {
                id: String(ticket.ticket_number || Math.random()),
                number: String(ticket.ticket_number || 'N/A'),
                quality: numQuality,
                cliente: ticket.client?.name || 'Cliente Desconhecido',
                desc: ticket.title || 'Descrição Ausente',
                prioridade: ticket.priority?.name === 'High' ? 'Alta' : (ticket.priority?.name === 'Normal' ? 'Normal' : 'Baixa'),
                responsavel: ticket.responsible?.name || 'Não atribuído',
                createdAt: createdAtFormatted,
                date: formattedDate,
                status: finalStatus
            };
        });

        // O usuário pediu especificamente "QP" e "Análise"
        const filteredDemands = demands.filter(d => d.status === 'Analise' || d.status === 'QP');

        return res.json(filteredDemands);

    } catch (error) {
        console.error('Erro na rota /api/demandas:', error.message);

        let errorDetails = error.message;
        let apiData = null;

        if (error.response) {
            apiData = error.response.data;
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(apiData, null, 2));
        }

        res.status(500).json({
            error: 'Falha ao buscar demandas',
            message: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
            apiResponse: apiData
        });
    }
});

app.get(['/api/debug', '/debug'], (req, res) => {
    res.json({
        url: req.url,
        path: req.path,
        env: {
            NODE_ENV: process.env.NODE_ENV,
            VERCEL: !!process.env.VERCEL
        }
    });
});

app.get(['/api/health', '/health'], (req, res) => {
    res.json({
        status: 'ok',
        vercel: !!process.env.VERCEL,
        hasToken: !!process.env.TIFLUX_API_TOKEN,
        tokenPrefix: process.env.TIFLUX_API_TOKEN ? process.env.TIFLUX_API_TOKEN.substring(0, 5) + '...' : 'none',
        apiUrl: TIFLUX_API_URL,
        timestamp: new Date().toISOString()
    });
});

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`✅ Servidor rodando na porta ${PORT}`);
        console.log(`🌐 API de Demandas: http://localhost:${PORT}/api/demandas`);
        console.log(`⚠️ ATENÇÃO: Configure seu TIFLUX_API_TOKEN no arquivo .env para ativar a integração real.`);
    });
}

export default app;
