import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import admin from 'firebase-admin';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// API Key TiFlux (Configurar no arquivo .env)
const TIFLUX_API_URL = process.env.TIFLUX_API_URL || 'https://api.tiflux.com/api/v2';
const TIFLUX_API_TOKEN = process.env.TIFLUX_API_TOKEN || 'SEU_TOKEN_AQUI';

// Inicializar Firebase Admin
const FIREBASE_SERVICE_ACCOUNT = process.env.FIREBASE_SERVICE_ACCOUNT;
if (FIREBASE_SERVICE_ACCOUNT) {
    try {
        const serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log("Firebase Admin inicializado com Service Account.");
    } catch (e) {
        console.error("Erro ao inicializar Firebase Admin com Service Account:", e.message);
    }
} else {
    console.warn("Firebase Admin não inicializado: Defina FIREBASE_SERVICE_ACCOUNT no .env para habilitar automações.");
}

const db = admin.apps.length > 0 ? admin.firestore() : null;

/**
 * Utilitário para adicionar dias úteis a uma data (Pula sábados e domingos)
 */
function addBusinessDays(startDate, days) {
    let date = new Date(startDate);
    let added = 0;
    while (added < days) {
        date.setDate(date.getDate() + 1);
        // getDay() retorna 0 para Domingo e 6 para Sábado
        if (date.getDay() !== 0 && date.getDay() !== 6) {
            added++;
        }
    }
    return date;
}

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
            axios.get(`${TIFLUX_API_URL}/tickets?limit=200&desk_id=67231`, { headers }),
            axios.get(`${TIFLUX_API_URL}/tickets?limit=100&is_closed=true&desk_id=67231`, { headers }),
            axios.get(`${TIFLUX_API_URL}/tickets?limit=100&is_closed=true&desk_id=67231&offset=100`, { headers }),
            axios.get(`${TIFLUX_API_URL}/tickets?limit=200`, { headers }),
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
            // Log profundo para o ticket de teste específico
            if (String(ticket.ticket_number) === '26191') {
                console.log('--- DEBUG TICKET 26191 FULL OBJECT ---');
                console.log(JSON.stringify(ticket, null, 2));
                console.log('---------------------------------------');
            }

            const rawStage = (ticket.stage?.name || '').toLowerCase();
            const rawTitle = (ticket.title || '').toLowerCase();
            let finalStatus = 'Analise'; // Default fallback

            // Mapeamento Rígido Analisando Título e Estágio
            // Se tiver "Melhoria" ou "QP" no título/estágio, consideramos como QP (Melhoria ou Correção)
            if (rawStage.includes('qp') || rawTitle.includes('qp') || rawTitle.includes('melhoria') || rawTitle.includes('melhorar')) {
                // Tenta diferenciar Melhoria de Correção por palavras-chave no título
                if (rawTitle.includes('[m]') || rawTitle.includes('melhoria') || rawTitle.includes('melhorar')) {
                    finalStatus = 'QP - Melhoria';
                } else {
                    finalStatus = 'QP - Correção';
                }
            } else if (rawStage.includes('nális') || rawStage.includes('nalis') || rawStage.includes('analise') || rawTitle.includes('análise') || rawTitle.includes('analise')) {
                finalStatus = 'Analise';
            } else if (rawTitle.includes('preventiva')) {
                finalStatus = 'Preventiva';
            } else {
                finalStatus = ticket.stage?.name || 'Outros';
            }

            // Se o chamado estiver fechado no TiFlux, ajustamos o status para a aba de concluídos
            const isActuallyClosed = ticket.is_closed ||
                (ticket.closed_at) ||
                rawStage.includes('concluido') ||
                rawStage.includes('fechado') ||
                rawStage.includes('finalizado') ||
                rawStage.includes('encerrado');

            if (isActuallyClosed) {
                if (finalStatus === 'Analise') finalStatus = 'Analise Concluida';
                else if (finalStatus === 'QP - Melhoria') finalStatus = 'QP - Melhoria Concluida';
                else if (finalStatus === 'QP - Correção') finalStatus = 'QP - Correção Concluida';
                else if (finalStatus === 'Preventiva') finalStatus = 'Preventiva Concluida';
            }

            // Extracao Dinamica do Num. da Quality (Ex: [QP 33230] ou Análise Webposto - 27403)
            const titleMatch = rawTitle.match(/\[?(?:qp|quality|an[áa]lise(?:.*?-)?)\s*(\d+)\]?/i);
            const numQuality = titleMatch ? titleMatch[1] : '';

            // Calc SLA Date (Usando Dias Úteis)
            const defaultDate = ticket.created_at ? new Date(ticket.created_at) : new Date();
            const createdAtFormatted = defaultDate.toISOString().split('T')[0];
            let daysToAdd = 0;
            if (finalStatus === 'Analise') {
                daysToAdd = 7;
            } else if (finalStatus.includes('QP')) {
                daysToAdd = 30;
            }
            
            const slaDate = addBusinessDays(defaultDate, daysToAdd);
            const formattedDate = slaDate.toISOString().split('T')[0];

            return {
                id: String(ticket.ticket_number || Math.random()),
                number: String(ticket.ticket_number || 'N/A'),
                quality: numQuality,
                cliente: ticket.client?.name || 'Cliente Desconhecido',
                clientEmail: ticket.contact?.email ||
                    ticket.contact?.main_email ||
                    ticket.requestor?.email ||
                    ticket.requestor?.main_email ||
                    ticket.client?.main_email ||
                    ticket.client?.email ||
                    ticket.contact_email ||
                    (ticket.requestor_email) ||
                    '',
                desc: ticket.title || 'Descrição Ausente',
                prioridade: ticket.priority?.name === 'High' ? 'Alta' : (ticket.priority?.name === 'Normal' ? 'Normal' : 'Baixa'),
                responsavel: ticket.responsible?.name || 'Não atribuído',
                createdAt: createdAtFormatted,
                date: formattedDate,
                slaUpdated: true,
                status: finalStatus,
                obs: '', // Adicionando campo de obs para evitar undefined no frontend vindo do sync
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
        // Incluímos as versões "Concluida" para que o app.js possa atualizar o status local se o ticket fechar no TiFlux
        const filteredDemands = demands.filter(d =>
            ['Analise', 'QP - Melhoria', 'QP - Correção', 'Preventiva', 'Analise Concluida', 'QP - Melhoria Concluida', 'QP - Correção Concluida', 'Adhoc Concluida', 'Preventiva Concluida'].includes(d.status)
        );

        /**
 * Rota de Debug para ver os dados crus do TiFlux
 */
        app.get('/api/debug/ticket/:id', async (req, res) => {
            try {
                const headers = { 'Authorization': `Bearer ${TIFLUX_API_TOKEN}` };
                const response = await axios.get(`${TIFLUX_API_URL}/tickets/${req.params.id}`, { headers });
                res.json(response.data);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

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

/**
 * Rota para buscar clientes do TiFlux
 */
app.get('/api/tiflux/clients', async (req, res) => {
    try {
        const headers = { 'Authorization': `Bearer ${TIFLUX_API_TOKEN}` };
        // Buscamos os primeiros 200 clientes (ajustar paginação se necessário futuramente)
        const response = await axios.get(`${TIFLUX_API_URL}/clients?limit=200&active=true`, { headers });
        
        const clients = response.data?.data || response.data || [];
        const formattedClients = clients.map(c => ({
            id: c.id,
            name: c.name,
            trade_name: c.trade_name
        })).sort((a, b) => a.name.localeCompare(b.name));

        res.json(formattedClients);
    } catch (error) {
        console.error('Erro ao buscar clientes no TiFlux:', error.message);
        res.status(500).json({ error: 'Falha ao buscar clientes', details: error.message });
    }
});

/**
 * Rota para enviar e-mails de chamados vencidos
 */
app.post('/api/send-overdue-emails', async (req, res) => {
    if (!db) {
        return res.status(503).json({
            success: false,
            error: 'Firebase Admin não configurado.',
            details: 'Configure FIREBASE_SERVICE_ACCOUNT no .env para habilitar notificações.'
        });
    }

    try {
        const settingsSnap = await db.collection('settings').doc('email').get();
        if (!settingsSnap.exists) {
            return res.status(404).json({ error: 'Configurações de e-mail não encontradas no Firestore.' });
        }
        const emailSettings = settingsSnap.data();

        if (!emailSettings.smtpHost || !emailSettings.smtpUser || !emailSettings.smtpPass) {
            return res.status(400).json({ error: 'Configurações de SMTP incompletas.' });
        }

        const transporter = nodemailer.createTransport({
            host: emailSettings.smtpHost,
            port: parseInt(emailSettings.smtpPort) || 587,
            secure: emailSettings.smtpSecure || false,
            auth: {
                user: emailSettings.smtpUser,
                pass: emailSettings.smtpPass
            }
        });

        const overdueTasks = req.body.tasks || [];
        const results = [];
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        for (const task of overdueTasks) {
            // Verificar se o chamado já foi notificado recentemente para evitar spam
            // Se force: true, ignoramos essa trava (reenvio individual)
            if (task.notified && !task.force) continue;

            if (!task.clientEmail || !emailRegex.test(task.clientEmail)) {
                console.log(`[E-mail Skip] Chamado #${task.number} ignorado por e-mail inválido: "${task.clientEmail}"`);
                results.push({ id: task.id, status: 'skipped', reason: 'Email inválido ou ausente' });
                continue;
            }

            const subject = emailSettings.subjectTemplate
                .replace(/{cliente}/g, task.cliente || '')
                .replace(/{numero}/g, task.number || '');

            const html = (emailSettings.bodyTemplate || '')
                .replace(/\n/g, '<br>')
                .replace(/{cliente}/g, task.cliente || '')
                .replace(/{numero}/g, task.number || '')
                .replace(/{descricao}/g, task.desc || '')
                .replace(/{vencimento}/g, task.date || '');

            try {
                await transporter.sendMail({
                    from: `"${emailSettings.senderName}" <${emailSettings.senderEmail}>`,
                    to: task.clientEmail,
                    subject: subject,
                    html: html
                });

                // Marcar como notificado no Firestore para evitar envios duplicados
                await db.collection('tasks').doc(task.id).update({
                    notified: true,
                    lastNotifiedAt: admin.firestore.FieldValue.serverTimestamp()
                });

                results.push({ id: task.id, status: 'sent' });
            } catch (err) {
                console.error(`Erro ao enviar e-mail para ${task.id}:`, err.message);
                results.push({ id: task.id, status: 'error', error: err.message });
            }
        }

        res.json({ success: true, results });
    } catch (error) {
        console.error('Erro ao processar envios de e-mail:', error);
        res.status(500).json({ error: 'Falha ao processar envios', details: error.message });
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
