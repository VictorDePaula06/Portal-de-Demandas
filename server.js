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
 * Rota para Reenviar E-mail de Atualização Individual (Demandas)
 */
app.post('/api/send-overdue-emails', async (req, res) => {
    try {
        const { tasks: requestedTasks } = req.body;
        if (!requestedTasks || !Array.isArray(requestedTasks) || requestedTasks.length === 0) {
            return res.status(400).json({ success: false, error: 'Lista de tarefas inválida.' });
        }

        const emailSettingsSnap = await db.collection('settings').doc('email').get();
        const emailSettings = emailSettingsSnap.exists ? emailSettingsSnap.data() : {};

        const transporter = nodemailer.createTransport({
            host: emailSettings.smtpHost,
            port: parseInt(emailSettings.smtpPort) || 587,
            secure: emailSettings.smtpPort == 465,
            auth: {
                user: emailSettings.smtpUser,
                pass: emailSettings.smtpPass
            }
        });

        const results = [];
        for (const task of requestedTasks) {
            const dateStr = new Date().toLocaleDateString('pt-BR');
            // Formatar data da tarefa para BR se for ISO
            const taskDateBR = task.date ? (task.date.includes('-') ? task.date.split('-').reverse().join('/') : task.date) : 'S/D';

            const emailHtml = `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
                    <div style="background-color: #1e293b; padding: 25px; text-align: center; color: white;">
                        <h2 style="margin: 0;">Atualização de Demanda</h2>
                        <p style="margin: 10px 0 0 0; opacity: 0.8;">Portal de Demandas - Globaltera</p>
                    </div>
                    <div style="padding: 30px; color: #374151; line-height: 1.6;">
                        <p>Olá <strong>${task.solicitante || task.cliente}</strong>,</p>
                        <p>Sua demanda #${task.number} possui <strong>novidades</strong> e atualizações importantes:</p>
                        
                        <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e2e8f0;">
                            <strong style="display: block; margin-bottom: 5px; color: #1e293b;">#${task.number} - ${task.desc}</strong>
                            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 15px 0;">
                            <p style="margin: 0; font-size: 14px;"><strong>Status Atual:</strong> <span style="color: #2563eb;">${task.status}</span></p>
                            <p style="margin: 5px 0 0 0; font-size: 14px;"><strong>Previsão/Vencimento:</strong> ${taskDateBR}</p>
                        </div>

                        ${(task.info || task.obs) ? `
                        <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-left: 4px solid #f59e0b; padding: 20px; margin: 20px 0; border-radius: 4px;">
                            <strong style="color: #92400e; display: block; margin-bottom: 8px;">📢 Mensagem / Novidades:</strong>
                            <div style="color: #92400e; white-space: pre-wrap;">${task.info || task.obs}</div>
                        </div>` : ''}

                        <p style="margin-top: 25px;">Para acompanhar mais detalhes, acesse nosso portal ou responda a este e-mail.</p>
                        <p>Atenciosamente,<br><strong>Equipe Globaltera</strong></p>
                    </div>
                    <div style="background-color: #f3f4f6; padding: 20px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e5e7eb;">
                        Mensagem automática enviada via Portal de Demandas em ${dateStr}
                    </div>
                </div>
            `;

            try {
                // Se o e-mail não vier na task, tentamos buscar por fallback no banco se necessário, 
                // mas o frontend já está passando o networkEmail ou clientEmail.
                const recipient = task.clientEmail || (task.emailVal); // task.emailVal é o nome do campo se houver

                if (!recipient) {
                    results.push({ task: task.number, success: false, error: 'E-mail não fornecido.' });
                    continue;
                }

                await transporter.sendMail({
                    from: `"${emailSettings.senderName || 'Globaltera Suporte'}" <${emailSettings.senderEmail || emailSettings.smtpUser}>`,
                    to: recipient,
                    subject: `[ATUALIZAÇÃO] Chamado #${task.number} - ${task.cliente}`,
                    html: emailHtml
                });
                results.push({ task: task.number, success: true });
            } catch (err) {
                results.push({ task: task.number, success: false, error: err.message });
            }
        }

        res.json({ success: true, results });
    } catch (error) {
        console.error('Erro na rota de envio individual:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Rota para enviar relatório de uma rede específica (Manual)
 */
app.post('/api/send-network-report', async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Firebase Admin não configurado.' });

    const { networkId } = req.body;
    if (!networkId) return res.status(400).json({ error: 'ID da rede não fornecido.' });

    try {
        const result = await processNetworkReport(networkId);
        res.json(result);
    } catch (error) {
        console.error('Erro ao processar relatório de rede:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Rota Cron para enviar relatórios de todas as redes (Segundas-feiras)
 */
app.get('/api/cron/network-reports', async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Firebase Admin não configurado.' });

    console.log('[CRON] Iniciando processamento de relatórios semanais...');
    
    try {
        const networksSnap = await db.collection('networks').get();
        const results = [];

        for (const doc of networksSnap.docs) {
            const network = doc.data();
            if (network.reportEmail && network.autoReportEnabled === true) {
                console.log(`[CRON] Processando rede: ${network.name} -> ${network.reportEmail}`);
                const res = await processNetworkReport(doc.id);
                results.push({ network: network.name, ...res });
            } else {
                console.log(`[CRON] Skipping rede: ${network.name} (AutoReport not enabled or email missing)`);
            }
        }

        res.json({ success: true, results });
    } catch (error) {
        console.error('[CRON] Erro no processamento semanal:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Função Nucleo para Gerar e Enviar Relatório de Rede
 */
async function processNetworkReport(networkId) {
    const networkSnap = await db.collection('networks').doc(networkId).get();
    if (!networkSnap.exists) throw new Error('Rede não encontrada.');
    
    const network = networkSnap.data();
    if (!network.reportEmail) throw new Error('E-mail de relatório não configurado para esta rede.');

    // 1. Obter lista de postos ativos da rede
    const clientNames = (network.clients || [])
        .filter(c => typeof c === 'string' || c.active !== false)
        .map(c => typeof c === 'string' ? c : c.name);

    if (clientNames.length === 0) return { success: true, status: 'skipped', reason: 'Nenhum posto ativo na rede.' };

    // 2. Buscar demandas abertas para estes postos
    // Firestore não suporta "IN" com muitos itens (>30), então buscamos todas as abertas e filtramos em memória
    // ou fazemos múltiplas queries. Como o volume de demandas abertas costuma ser controlado, filtramos em memória.
    const tasksSnap = await db.collection('tasks').get();
    const openTasks = [];
    
    tasksSnap.forEach(doc => {
        const task = doc.data();
        const isClosed = task.status && task.status.toLowerCase().includes('concluido');
        if (!isClosed && clientNames.includes(task.cliente)) {
            openTasks.push({ id: doc.id, ...task });
        }
    });

    if (openTasks.length === 0) {
        // Enviar e-mail mesmo se não houver nada? Geralmente é bom informar que está tudo limpo.
        // Mas o usuário não especificou. Vou assumir que enviamos um relatório de "Nada Pendente".
    }

    // 3. Configurar Transporter
    const settingsSnap = await db.collection('settings').doc('email').get();
    const emailSettings = settingsSnap.data() || {};

    const transporter = nodemailer.createTransport({
        host: emailSettings.smtpHost,
        port: parseInt(emailSettings.smtpPort) || 587,
        secure: emailSettings.smtpSecure || false,
        auth: {
            user: emailSettings.smtpUser,
            pass: emailSettings.smtpPass
        }
    });

    // 4. Gerar HTML do Relatório
    const dateStr = new Date().toLocaleDateString('pt-BR');
    let tasksHtml = '';
    
    if (openTasks.length > 0) {
        // Agrupar por status ou apenas listar
        tasksHtml = `
            <table style="width: 100%; border-collapse: collapse; margin-top: 20px; font-family: sans-serif;">
                <thead>
                    <tr style="background-color: #f3f4f6; text-align: left;">
                        <th style="padding: 12px; border: 1px solid #e5e7eb;">Chamado</th>
                        <th style="padding: 12px; border: 1px solid #e5e7eb;">Posto</th>
                        <th style="padding: 12px; border: 1px solid #e5e7eb;">Descrição</th>
                        <th style="padding: 12px; border: 1px solid #e5e7eb;">Vencimento</th>
                        <th style="padding: 12px; border: 1px solid #e5e7eb;">Status</th>
                    </tr>
                </thead>
                <tbody>
        `;

        openTasks.sort((a,b) => (a.date || '').localeCompare(b.date || '')).forEach(t => {
            const isOverdue = t.date && new Date(t.date) < new Date().setHours(0,0,0,0);
            const statusStyle = isOverdue ? 'color: #ef4444; font-weight: bold;' : '';
            
            tasksHtml += `
                <tr>
                    <td style="padding: 10px; border: 1px solid #e5e7eb;">#${t.number}</td>
                    <td style="padding: 10px; border: 1px solid #e5e7eb;">${t.cliente}</td>
                    <td style="padding: 10px; border: 1px solid #e5e7eb;">${t.desc}</td>
                    <td style="padding: 10px; border: 1px solid #e5e7eb; ${statusStyle}">${t.date || 'S/D'} ${isOverdue ? '⏰' : ''}</td>
                    <td style="padding: 10px; border: 1px solid #e5e7eb;">${t.status}</td>
                </tr>
            `;
        });

        tasksHtml += `</tbody></table>`;
    } else {
        tasksHtml = `
            <div style="padding: 20px; background-color: #f0fdf4; color: #166534; border-radius: 8px; margin-top: 20px; text-align: center;">
                <strong>Excelente!</strong> Não existem demandas abertas para os postos desta rede no momento.
            </div>
        `;
    }

    const fullHtml = `
        <div style="max-width: 800px; margin: 0 auto; font-family: sans-serif; color: #374151;">
            <div style="background-color: #1e293b; padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Relatório de Demandas - Rede ${network.name}</h1>
                <p style="color: #94a3b8; margin: 10px 0 0 0;">Posicionamento atualizado em ${dateStr}</p>
            </div>
            <div style="padding: 30px; background-color: #ffffff; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
                <p>Olá,</p>
                <p>Segue abaixo a listagem consolidada de todas as demandas que encontram-se <strong>abertas</strong> no portal para os postos da rede <strong>${network.name}</strong>.</p>
                
                ${tasksHtml}

                <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #94a3b8; text-align: center;">
                    Este é um relatório automático gerado pelo Portal de Demandas - Globaltera.<br>
                    Para dúvidas ou ajustes, entre em contato com nosso suporte técnico.
                </div>
            </div>
        </div>
    `;

    // 5. Enviar e-mail
    await transporter.sendMail({
        from: `"${emailSettings.senderName || 'Globaltera Suporte'}" <${emailSettings.senderEmail || emailSettings.smtpUser}>`,
        to: network.reportEmail,
        subject: `[RELATÓRIO] Demandas Abertas - Rede ${network.name} - ${dateStr}`,
        html: fullHtml
    });

    return { success: true, status: 'sent', taskCount: openTasks.length };
}

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`✅ Servidor rodando na porta ${PORT}`);
        console.log(`🌐 API de Demandas: http://localhost:${PORT}/api/demandas`);
        console.log(`⚠️ ATENÇÃO: Configure seu TIFLUX_API_TOKEN no arquivo .env para ativar a integração real.`);
    });
}

export default app;
