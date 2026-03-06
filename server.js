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
const TIFLUX_API_URL = process.env.TIFLUX_API_URL || 'https://api.tiflux.com/api/v2';
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
        // Dispara requisições em paralelo para otimizar o tempo de resposta
        // O TiFlux V2 retorna erro HTTP 400 se as queries de listagem limitarem mais que 100 por conta.
        // O parâmetro correto para paginação é "offset" (ex: offset=100).
        const headers = { 'Authorization': `Bearer ${TIFLUX_API_TOKEN}` };
        // Para garantir que preventivas não sumam, buscamos especificamente o desk_id=67231 (Suporte TI).
        const [openTI, closedTI1, closedTI2, openGeneral, closedGeneral] = await Promise.all([
            axios.get(`${TIFLUX_API_URL}/tickets?limit=100&desk_id=67231`, { headers }),
            axios.get(`${TIFLUX_API_URL}/tickets?limit=100&is_closed=true&desk_id=67231`, { headers }),
            axios.get(`${TIFLUX_API_URL}/tickets?limit=100&is_closed=true&desk_id=67231&offset=100`, { headers }),
            axios.get(`${TIFLUX_API_URL}/tickets?limit=100`, { headers }),
            axios.get(`${TIFLUX_API_URL}/tickets?limit=100&is_closed=true`, { headers })
        ]);

        let ticketsTI_O = openTI.data?.data || openTI.data || [];
        let ticketsTI_C1 = closedTI1.data?.data || closedTI1.data || [];
        let ticketsTI_C2 = closedTI2.data?.data || closedTI2.data || [];
        let ticketsGen_O = openGeneral.data?.data || openGeneral.data || [];
        let ticketsGen_C = closedGeneral.data?.data || closedGeneral.data || [];

        // Combinar todos removendo duplicatas por ticket_number
        const allRaw = [...ticketsTI_O, ...ticketsTI_C1, ...ticketsTI_C2, ...ticketsGen_O, ...ticketsGen_C];
        const uniqueMap = new Map();
        allRaw.forEach(t => {
            if (t && t.ticket_number) uniqueMap.set(t.ticket_number, t);
        });
        const rawTickets = Array.from(uniqueMap.values());

        if (rawTickets.length > 0) {
            console.log(`TiFlux retornou ${rawTickets.length} chamados únicos.`);
        }

        if (rawTickets.length === 0) {
            console.error('Nenhum ticket retornado.');
            return res.json([]);
        }

        // Mapear a resposta definitiva de acordo com o Payload da API V2 do TiFlux
        const demands = rawTickets.map(ticket => {
            if (String(ticket.ticket_number) === '27109' || String(ticket.ticket_number) === '27069') {
                console.log(`--- ENCONTRADO TICKET ${ticket.ticket_number} ---`);
                console.log('is_closed:', ticket.is_closed);
                console.log('title:', ticket.title);
                console.log('stage:', JSON.stringify(ticket.stage));
                console.log('status:', JSON.stringify(ticket.status));
                console.log('updated_at:', ticket.updated_at);
            }

            const rawStage = (ticket.stage?.name || '').toLowerCase();
            const rawTitle = (ticket.title || '').toLowerCase();
            let finalStatus = 'Analise'; // Default fallback

            // Mapeamento Rígido Analisando Título e Estágio
            if (rawStage.includes('qp') || rawTitle.includes('qp')) {
                finalStatus = 'QP';
            } else if (rawStage.includes('nális') || rawStage.includes('nalis') || rawStage.includes('analise') || rawTitle.includes('análise') || rawTitle.includes('analise')) {
                finalStatus = 'Analise';
            } else if (rawTitle.includes('preventiva')) {
                finalStatus = 'Preventiva';
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
                status: finalStatus,
                closedAt: ticket.closed_at ? ticket.closed_at.split('T')[0].split(' ')[0] : (
                    ticket.is_closed ||
                        ticket.stage?.name?.toLowerCase().includes('concluido') ||
                        ticket.stage?.name?.toLowerCase().includes('fechado') ||
                        ticket.status?.name?.toLowerCase().includes('fechado') ||
                        ticket.status?.name?.toLowerCase().includes('concluido') ||
                        ticket.stage?.name?.toLowerCase().includes('closed') ||
                        ticket.status?.name?.toLowerCase().includes('closed') ?
                        (ticket.updated_at ? ticket.updated_at.split('T')[0].split(' ')[0] : new Date().toISOString().split('T')[0]) : null
                )
            };
        });

        // O usuário pediu especificamente "QP", "Análise" e agora incluir "Preventiva" para controle
        const filteredDemands = demands.filter(d => d.status === 'Analise' || d.status === 'QP' || d.status === 'Preventiva');

        return res.json(filteredDemands);

    } catch (error) {
        if (error.response) {
            console.error('Erro na resposta do TiFlux:', error.response.status, JSON.stringify(error.response.data));
        } else {
            console.error('Erro na requisição ao TiFlux:', error.message);
        }
        res.status(500).json({ error: 'Falha ao buscar demandas', details: error.message });
    }
});

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`✅ Servidor rodando na porta ${PORT}`);
        console.log(`🌐 API de Demandas: http://localhost:${PORT}/api/demandas`);
        console.log(`⚠️ ATENÇÃO: Configure seu TIFLUX_API_TOKEN no arquivo .env para ativar a integração real.`);
    });
}

export default app;
