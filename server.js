// Force redeploy - Update: 2026-03-18 11:41
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
app.all(['/api/demandas', '/demandas', '/'], async (req, res) => {
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
        const [openTI, closedTI1, closedTI2, openWeb, closedWeb, openGeneral, closedGeneral] = await Promise.all([
            axios.get(`${TIFLUX_API_URL}/tickets?limit=100&desk_id=67231`, { headers }),
            axios.get(`${TIFLUX_API_URL}/tickets?limit=100&is_closed=true&desk_id=67231`, { headers }),
            axios.get(`${TIFLUX_API_URL}/tickets?limit=100&is_closed=true&desk_id=67231&offset=100`, { headers }),
            axios.get(`${TIFLUX_API_URL}/tickets?limit=100&desk_id=67230`, { headers }),
            axios.get(`${TIFLUX_API_URL}/tickets?limit=100&is_closed=true&desk_id=67230`, { headers }),
            axios.get(`${TIFLUX_API_URL}/tickets?limit=100`, { headers }),
            axios.get(`${TIFLUX_API_URL}/tickets?limit=100&is_closed=true`, { headers })
        ]);

        let ticketsTI_O = openTI.data?.data || openTI.data || [];
        let ticketsTI_C1 = closedTI1.data?.data || closedTI1.data || [];
        let ticketsTI_C2 = closedTI2.data?.data || closedTI2.data || [];
        let ticketsWeb_O = openWeb.data?.data || openWeb.data || [];
        let ticketsWeb_C = closedWeb.data?.data || closedWeb.data || [];
        let ticketsGen_O = openGeneral.data?.data || openGeneral.data || [];
        let ticketsGen_C = closedGeneral.data?.data || closedGeneral.data || [];

        // Combinar todos removendo duplicatas por ticket_number
        const allRaw = [...ticketsTI_O, ...ticketsTI_C1, ...ticketsTI_C2, ...ticketsWeb_O, ...ticketsWeb_C, ...ticketsGen_O, ...ticketsGen_C];
        
        // DEBUG: Procurar 28324 para espelhamento visual no 19233
        let debug28324Info = 'Não encontrado na lista bruta.';
        const dTarget = allRaw.find(t => t && (t.ticket_number == 28324 || String(t.ticket_number).includes('28324')));
        if (dTarget) {
            debug28324Info = `ENCONTRADO! Desk: ${dTarget.desk_id} (${dTarget.desk?.name}) | Stage: ${dTarget.stage?.name} | Status: ${dTarget.status?.name || dTarget.status}`;
        }
        console.log(`[DEBUG] 28324 Info: ${debug28324Info}`);

        const uniqueMap = new Map();
        allRaw.forEach(t => {
            if (t && t.ticket_number) uniqueMap.set(String(t.ticket_number), t);
        });

        // --- BUSCA INDIVIDUAL DE CHAMADOS ABERTOS NÃO ENCONTRADOS ---
        const openTicketsIds = req.body && req.body.openTickets ? req.body.openTickets : [];
        if (openTicketsIds.length > 0) {
            const missingIds = openTicketsIds.filter(id => !uniqueMap.has(String(id)));
            if (missingIds.length > 0) {
                console.log(`[SYNC] Buscando ${missingIds.length} chamados abertos/recentes faltantes individualmente:`, missingIds.slice(0, 10));
                // Limitar a 100 por motivos de segurança contra rate limit da API
                const idsToFetch = missingIds.slice(0, 100);
                const individualPromises = idsToFetch.map(id => 
                    axios.get(`${TIFLUX_API_URL}/tickets/${id}`, { headers }).catch(e => null)
                );
                
                const individualResults = await Promise.all(individualPromises);
                let addedCount = 0;
                individualResults.forEach(res => {
                    const ticket = res && (res.data?.data || res.data);
                    if (ticket && ticket.ticket_number) {
                        uniqueMap.set(String(ticket.ticket_number), ticket);
                        addedCount++;
                    }
                });
                console.log(`[SYNC] Recuperados ${addedCount} chamados individualmente.`);
            }
        }

        // --- MAPEAMENTO DE APONTAMENTOS (DESATIVADO) ---
        // Removido conforme solicitado para focar em updated_at e etapa

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

            const rawStage = (ticket.stage?.name || '').toLowerCase();
            const rawTitle = (ticket.title || '').toLowerCase();
            let finalStatus = 'Analise'; // Default fallback

            // Mapeamento Rígido Analisando Título e Estágio
            const isQP = /qp|quality|melhoria|melhorar/i.test(rawTitle) || /qp/i.test(rawStage);
            const isAnalise = /analis/i.test(rawTitle) || /analis/i.test(rawStage);
            const isAdhoc = /adhoc/i.test(rawTitle) || /adhoc/i.test(rawStage);

            if (ticket.ticket_number == 19233 || String(ticket.ticket_number).includes('19233')) {
                console.log(`[DEBUG 19233] rawTitle: "${rawTitle}"`);
                console.log(`[DEBUG 19233] isQP: ${isQP}, isAnalise: ${isAnalise}`);
            }

            if (isAdhoc) {
                finalStatus = 'Adhoc';
            } else if (isQP) {
                // Tenta diferenciar Melhoria de Correção por palavras-chave no título
                if (rawTitle.includes('[m]') || rawTitle.includes('melhoria') || rawTitle.includes('melhorar')) {
                    finalStatus = 'QP - Melhoria';
                } else {
                    finalStatus = 'QP - Correção';
                }
            } else if (isAnalise) {
                finalStatus = 'Analise';
            } else if (rawStage.includes('preventiva')) {
                finalStatus = 'Preventiva';
            } else if (rawStage.includes('backlog')) {
                finalStatus = 'Backlog';
            } else {
                // Fallback dinâmico secundário
                if (isQP) finalStatus = 'QP - Correção';
                else if (isAnalise) finalStatus = 'Analise';
                else finalStatus = ticket.stage?.name || 'Outros';
            }

            // Se for Backlog, precisamos inferir qual o "Status de Exibição" (Coluna) para que não suma no portal
            let displayStatus = finalStatus;
            if (finalStatus === 'Backlog') {
                // Tenta descobrir se é QP ou Analise pelo título
                if (isQP) {
                    if (rawTitle.includes('[m]') || rawTitle.includes('melhoria')) {
                        displayStatus = 'QP - Melhoria';
                    } else {
                        displayStatus = 'QP - Correção';
                    }
                } else if (isAnalise) {
                    displayStatus = 'Analise';
                } else if (isAdhoc) {
                    displayStatus = 'Adhoc';
                } else {
                    displayStatus = 'Analise'; // Fallback
                }
            }

            // Proteção contra status nulo ou em formato de objeto
            const statusStr = typeof ticket.status === 'string' ? ticket.status : (ticket.status?.name || '');

            // Se o chamado estiver fechado no TiFlux, ajustamos o status para a aba de concluídos
            const isActuallyClosed = ticket.is_closed === true || 
                ticket.is_closed === 1 ||
                ticket.closed_at ||
                rawStage.includes('concluido') ||
                rawStage.includes('fechado') ||
                rawStage.includes('finalizado') ||
                rawStage.includes('encerrado') ||
                (statusStr && (statusStr.toLowerCase().includes('fechado') || statusStr.toLowerCase().includes('concluido')));

            if (isActuallyClosed) {
                if (finalStatus === 'Analise') finalStatus = 'Analise Concluida';
                else if (finalStatus === 'QP - Melhoria') finalStatus = 'QP - Melhoria Concluida';
                else if (finalStatus === 'QP - Correção') finalStatus = 'QP - Correção Concluida';
                else if (finalStatus === 'Preventiva') finalStatus = 'Preventiva Concluida';
                else if (finalStatus === 'Adhoc') finalStatus = 'Adhoc Concluida';
            }

            // Extracao Dinamica do Num. da Quality (Ex: [QP 33230] ou Análise Webposto - 27403 ou ADHOC #28785)
            const titleMatch = rawTitle.match(/(?:(?:qp|quality|an[áa]lise|adhoc)(?:.*?[#\-])?|[#])\s*(\d+)/i);
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
                desc: (ticket.ticket_number == 19233 || String(ticket.ticket_number).includes('19233'))
                    ? `[DBG 28324: ${debug28324Info}] ${ticket.title}`
                    : (ticket.title || 'Descrição Ausente'),
                prioridade: ticket.priority?.name === 'High' ? 'Alta' : (ticket.priority?.name === 'Normal' ? 'Normal' : 'Baixa'),
                responsavel: ticket.responsible?.name || 'Não atribuído',
                createdAt: createdAtFormatted,
                date: formattedDate,
                slaUpdated: true,
                status: finalStatus, // "Backlog" se for o caso
                kanbanStatus: displayStatus, // Coluna onde deve aparecer (QP ou Análise)
                etapa: ticket.stage?.name || '',
                obs: '',
                info: '', // Removido descritivo do apontamento
                lastDevCheck: ticket.updated_at ? ticket.updated_at.split('T')[0] : '',
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
            ['Backlog', 'Analise', 'QP - Melhoria', 'QP - Correção', 'Preventiva', 'Adhoc', 'Analise Concluida', 'QP - Melhoria Concluida', 'QP - Correção Concluida', 'Adhoc Concluida', 'Preventiva Concluida'].includes(d.status)
        );

        return res.json(filteredDemands);
    } catch (e) {
        console.error('Erro na API:', e);
        res.status(500).json({ error: e.message });
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

        console.log(`[EMAIL] Iniciando envio individual para ${requestedTasks.length} tarefas. Recipient fallback: ${emailSettings.senderEmail}`);

        const transporter = nodemailer.createTransport({
            host: emailSettings.smtpHost,
            port: parseInt(emailSettings.smtpPort) || 587,
            secure: emailSettings.smtpSecure || (emailSettings.smtpPort == 465),
            auth: {
                user: emailSettings.smtpUser,
                pass: emailSettings.smtpPass
            },
            tls: {
                rejectUnauthorized: false
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
                        <p style="margin: 10px 0 0 0; opacity: 0.8;">Portal de Demandas - GTHolding</p>
                    </div>
                    <div style="padding: 30px; color: #374151; line-height: 1.6;">
                        <p>Olá <strong>${task.solicitante || task.cliente}</strong>,</p>
                        <p>Sua demanda #${task.number} possui <strong>novidades</strong> e atualizações importantes:</p>
                        
                        <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e2e8f0;">
                            <strong style="display: block; margin-bottom: 5px; color: #1e293b;">#${task.number} - ${task.desc}</strong>
                            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 15px 0;">
                            <p style="margin: 0; font-size: 14px;"><strong>Status Atual:</strong> <span style="color: #2563eb;">${task.emailStatus || task.status}</span></p>
                            <p style="margin: 5px 0 0 0; font-size: 14px;"><strong>Previsão/Vencimento:</strong> ${taskDateBR}</p>
                        </div>

                        ${(task.info || task.obs) ? `
                        <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-left: 4px solid #f59e0b; padding: 20px; margin: 20px 0; border-radius: 4px;">
                            <strong style="color: #92400e; display: block; margin-bottom: 8px;">📢 Mensagem / Novidades:</strong>
                            <div style="color: #92400e; white-space: pre-wrap;">${task.info || task.obs}</div>
                        </div>` : ''}

                        <p style="margin-top: 25px;">Para acompanhar mais detalhes, acesse nosso portal ou responda a este e-mail.</p>
                        <p>Atenciosamente,<br><strong>Equipe GTHolding</strong></p>
                    </div>
                    <div style="background-color: #f3f4f6; padding: 20px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e5e7eb;">
                        Mensagem automática enviada via Portal de Demandas em ${dateStr}
                    </div>
                </div>
            `;

            try {
                // Se o e-mail não vier na task, tentamos buscar por fallback no banco se necessário, 
                // mas o frontend já está passando o networkEmail ou clientEmail.
                let recipient = (task.clientEmail || task.emailVal || '').toString().replace(/;/g, ',');

                if (!recipient) {
                    console.error(`[EMAIL] Falha: Recipiente vazio para o chamado #${task.number}`);
                    results.push({ task: task.number, success: false, error: 'E-mail não fornecido.', recipient: 'N/A' });
                    continue;
                }

                console.log(`[EMAIL] Enviando para: ${recipient} | Assunto: [ATUALIZAÇÃO] Chamado #${task.number}`);

                await transporter.sendMail({
                    from: `"${emailSettings.senderName || 'GTHolding Suporte'}" <${emailSettings.senderEmail || emailSettings.smtpUser}>`,
                    to: recipient,
                    subject: `[ATUALIZAÇÃO] Chamado #${task.number} - ${task.cliente}`,
                    html: emailHtml
                });
                console.log(`[EMAIL] Sucesso no envio para: ${recipient}`);
                results.push({ task: task.number, success: true, recipient });
            } catch (err) {
                console.error(`[EMAIL] Falha crítica de envio para ${recipient || 'N/A'} (#${task.number}):`, err.message);
                
                let errorType = err.message;
                if (err.message.includes('Invalid login') || err.message.includes('auth')) {
                    errorType = 'Erro de Autenticação SMTP (Verifique as configurações e senha de app)';
                } else if (err.message.includes('recipient') || err.message.includes('No recipients')) {
                    errorType = 'Endereço de e-mail inválido ou recusado pelo servidor de destino';
                }

                results.push({ 
                    task: task.number, 
                    success: false, 
                    error: errorType,
                    recipient: recipient || 'Inexistente'
                });
            }
        }

        res.json({ success: true, results });
    } catch (error) {
        console.error('Erro na rota de envio individual:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Rota para enviar e-mail de conclusão de demanda
 */
app.post('/api/send-completion-email', async (req, res) => {
    try {
        let { task, recipient } = req.body;
        if (recipient) recipient = recipient.toString().replace(/;/g, ',');
        if (!task || !recipient) {
            return res.status(400).json({ success: false, error: 'Tarefa ou destinatário inválido.' });
        }

        const emailSettingsSnap = await db.collection('settings').doc('email').get();
        const emailSettings = emailSettingsSnap.exists ? emailSettingsSnap.data() : {};

        console.log(`[COMPLETION-EMAIL] Enviando para: ${recipient} | Chamado: #${task.number}`);

        const transporter = nodemailer.createTransport({
            host: emailSettings.smtpHost,
            port: parseInt(emailSettings.smtpPort) || 587,
            secure: emailSettings.smtpSecure || (emailSettings.smtpPort == 465),
            auth: {
                user: emailSettings.smtpUser,
                pass: emailSettings.smtpPass
            },
            tls: {
                rejectUnauthorized: false
            }
        });

        const dateStr = new Date().toLocaleDateString('pt-BR');
        const emailHtml = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
                <div style="background-color: #10b981; padding: 25px; text-align: center; color: white;">
                    <h2 style="margin: 0;">✅ Demanda Concluída</h2>
                    <p style="margin: 10px 0 0 0; opacity: 0.8;">Portal de Demandas - GTHolding</p>
                </div>
                <div style="padding: 30px; color: #374151; line-height: 1.6;">
                    <p>Olá,</p>
                    <p>Informamos que o chamado <strong>#${task.number}</strong> foi concluído com sucesso.</p>
                    
                    <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e2e8f0;">
                        <strong style="display: block; margin-bottom: 5px; color: #1e293b;">#${task.number} - ${task.desc}</strong>
                        <p style="margin: 5px 0 0 0; font-size: 14px;"><strong>Cliente:</strong> ${task.cliente}</p>
                        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 15px 0;">
                        <p style="margin: 0; font-size: 14px;"><strong>Status:</strong> <span style="color: #10b981;">CONCLUÍDO</span></p>
                        ${task.resolvedVersion ? `<p style="margin: 5px 0 0 0; font-size: 14px;"><strong>Versão:</strong> ${task.resolvedVersion}</p>` : ''}
                    </div>

                    ${task.resolvedDesc ? `
                    <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 20px; margin: 20px 0; border-radius: 8px;">
                        <strong style="color: #166534; display: block; margin-bottom: 8px;">📋 Detalhes da Solução:</strong>
                        <div style="color: #166534; white-space: pre-wrap;">${task.resolvedDesc}</div>
                    </div>` : ''}

                    <p style="margin-top: 25px;">Se houver alguma dúvida, entre em contato com nossa equipe.</p>
                    <p>Atenciosamente,<br><strong>Equipe GTHolding</strong></p>
                </div>
                <div style="background-color: #f3f4f6; padding: 20px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e5e7eb;">
                    Mensagem automática enviada via Portal de Demandas em ${dateStr}
                </div>
            </div>
        `;

        await transporter.sendMail({
            from: `"${emailSettings.senderName || 'GTHolding Suporte'}" <${emailSettings.senderEmail || emailSettings.smtpUser}>`,
            to: recipient,
            subject: `[CONCLUÍDO] Chamado #${task.number} - ${task.cliente}`,
            html: emailHtml
        });

        res.json({ success: true, message: 'E-mail de conclusão enviado com sucesso.' });
    } catch (error) {
        console.error('[COMPLETION-EMAIL] Erro:', error);
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

    const networkSnap = await db.collection('networks').doc(networkId).get();
    if (!networkSnap.exists) return res.status(404).json({ error: 'Rede não encontrada.' });
    const network = networkSnap.data();

    if (!network.reportEmail) return res.status(400).json({ error: 'Rede sem e-mail de relatório.' });
    const recipient = network.reportEmail.toString().replace(/;/g, ',');

    try {
        const result = await processNetworkReport(networkId, recipient); // Pass recipient to processNetworkReport
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
async function processNetworkReport(networkId, customRecipient = null) {
    const networkSnap = await db.collection('networks').doc(networkId).get();
    if (!networkSnap.exists) throw new Error('Rede não encontrada.');
    
    const network = networkSnap.data();
    const recipient = (customRecipient || network.reportEmail || '').toString().replace(/;/g, ',');
    if (!recipient) throw new Error('E-mail de relatório não configurado para esta rede.');

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
        const t = doc.data();
        const statusNormalized = (t.status || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const isClosed = statusNormalized.includes('concluido') || 
                         statusNormalized.includes('concluida') || 
                         statusNormalized.includes('fechado') ||
                         statusNormalized.includes('finalizado');

        // Flexible client matching
        const normalize = (str) => (str || '').toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const taskClientNormalized = normalize(t.cliente);
        
        const isMatch = clientNames.filter(cn => cn).some(cn => {
            const cnNormalized = normalize(cn);
            return taskClientNormalized.includes(cnNormalized) || cnNormalized.includes(taskClientNormalized);
        });

        if (!isClosed && isMatch) {
            openTasks.push({ id: doc.id, ...t });
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
                        <th style="padding: 12px; border: 1px solid #e5e7eb;">Última Verif. Dev</th>
                        <th style="padding: 12px; border: 1px solid #e5e7eb;">Status / Etapa</th>
                    </tr>
                </thead>
                <tbody>
        `;

        openTasks.sort((a,b) => (a.date || '').localeCompare(b.date || '')).forEach(t => {
            const isOverdue = t.date && new Date(t.date) < new Date().setHours(0,0,0,0);
            const statusStyle = isOverdue ? 'color: #ef4444; font-weight: bold;' : '';
            
            // Formatar data para PT-BR
            const formattedDueDate = t.date ? t.date.split('-').reverse().join('/') : 'S/D';
            
            // Mapear status amigável (se for QP, mostra Em andamento + etapa)
            let displayStatus = t.status;
            if (t.status && t.status.includes('QP')) {
                displayStatus = 'Em andamento';
            }
            if (t.etapa) {
                const statusNormalized = displayStatus.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const etapaNormalized = t.etapa.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                
                // Only append if it's not redundant (e.g. "Analise (Análise)" or "Em andamento (Pending)" where 'pending' means 'em andamento')
                if (!statusNormalized.includes(etapaNormalized) && !etapaNormalized.includes(statusNormalized) && etapaNormalized !== 'pending') {
                    displayStatus += ` (${t.etapa})`;
                }
            }

            tasksHtml += `
                <tr>
                    <td style="padding: 10px; border: 1px solid #e5e7eb;">#${t.number}</td>
                    <td style="padding: 10px; border: 1px solid #e5e7eb;">${t.cliente}</td>
                    <td style="padding: 10px; border: 1px solid #e5e7eb;">${t.desc}</td>
                    <td style="padding: 10px; border: 1px solid #e5e7eb; ${statusStyle}">${formattedDueDate} ${isOverdue ? '⏰' : ''}</td>
                    <td style="padding: 10px; border: 1px solid #e5e7eb;">${t.lastDevCheck ? t.lastDevCheck.split('-').reverse().join('/') : '-'}</td>
                    <td style="padding: 10px; border: 1px solid #e5e7eb;">${displayStatus}</td>
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
                    Este é um relatório automático gerado pelo Portal de Demandas - GTHolding.<br>
                    Para dúvidas ou ajustes, entre em contato com nosso suporte técnico.
                </div>
            </div>
        </div>
    `;

    // 5. Enviar e-mail
    await transporter.sendMail({
        from: `"${emailSettings.senderName || 'GTHolding Suporte'}" <${emailSettings.senderEmail || emailSettings.smtpUser}>`,
        to: recipient,
        subject: `[RELATÓRIO] Demandas Abertas - Rede ${network.name} - ${dateStr}`,
        html: fullHtml
    });

    return { success: true, status: 'sent', taskCount: openTasks.length };
}

/**
 * Rota API para Analytics do Módulo de Customer Success
 */
app.get('/api/cs/analytics', async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Firebase Admin não configurado.' });

    try {
        const clientsSnap = await db.collection('csClients').get();
        let clients = [];
        clientsSnap.forEach(doc => {
            const data = doc.data();
            // Pega os analytics do frontend ou calcula um básico se não tiver
            if (data.analytics) clients.push(data);
        });

        const totalClients = clients.length;
        if (totalClients === 0) return res.json({ total: 0 });

        // 1. Distribuição de Saúde
        const distCount = { 'Saudável': 0, 'Estável': 0, 'Médio Risco': 0, 'Alto Risco': 0 };
        // 2. Análise de Fatores Críticos (Médias)
        const medCount = { interacao: 0, grow: 0, engage: 0, reclamacao: 0 };
        // 3. Matriz de Priorização (Quem atender agora)
        const priorityList = [];

        clients.forEach(c => {
            const a = c.analytics;
            
            // Dist
            distCount[a.classificacao] = (distCount[a.classificacao] || 0) + 1;
            
            // Averages
            medCount.interacao += (a.interacao_num || 3);
            medCount.grow += (a.grow_num || 3);
            medCount.engage += (a.engage_num || 3);
            medCount.reclamacao += (a.reclamacao_num || 5);

            // Priority Logic (Algoritmo Matriz)
            if (a.score <= 40 || a.churn_probability > 60 || a.alerta) {
                priorityList.push({
                    id: c.id,
                    name: c.name,
                    score: a.score,
                    prob: a.churn_probability,
                    tendencia: a.tendencia,
                    motivo: a.alerta ? 'Alerta Crítico' : (a.score <= 40 ? 'Score Baixo' : 'Alta Prob. Churn'),
                    mrr_simulated: Math.floor(Math.random() * 5000) + 500 // Como não temos MRR na base, usamos um mock para ordenação (Ideal seria ter o campo mensalidade na base)
                });
            }
        });

        // Calculando percentuais da distribuição
        const distribuicao = {
            'Saudável': parseFloat(((distCount['Saudável'] / totalClients) * 100).toFixed(1)),
            'Estável': parseFloat(((distCount['Estável'] / totalClients) * 100).toFixed(1)),
            'Médio Risco': parseFloat(((distCount['Médio Risco'] / totalClients) * 100).toFixed(1)),
            'Alto Risco': parseFloat(((distCount['Alto Risco'] / totalClients) * 100).toFixed(1))
        };

        // Calculando médias dos fatores (Escala 1 a 5)
        const averages = {
            interacao: parseFloat((medCount.interacao / totalClients).toFixed(1)),
            grow: parseFloat((medCount.grow / totalClients).toFixed(1)),
            engage: parseFloat((medCount.engage / totalClients).toFixed(1)),
            reclamacao: parseFloat((medCount.reclamacao / totalClients).toFixed(1))
        };

        // Encontrar Pior Fator Crítico
        const lowestAvg = Math.min(averages.interacao, averages.grow, averages.engage, averages.reclamacao);
        let piorFator = '';
        if (lowestAvg === averages.reclamacao) piorFator = 'Reclamação';
        else if (lowestAvg === averages.engage) piorFator = 'Engage (Satisfação)';
        else if (lowestAvg === averages.grow) piorFator = 'Grow (Evolução)';
        else piorFator = 'Interação';

        const insight = `O principal detrator da saúde da carteira atualmente é a variável ${piorFator}.`;

        // Ordenando Matriz (Prioriza maior Probabilidade -> Menor Score -> Maior MRR mock)
        priorityList.sort((a, b) => {
            if (b.prob !== a.prob) return b.prob - a.prob;
            if (a.score !== b.score) return a.score - b.score;
            return b.mrr_simulated - a.mrr_simulated;
        });

        res.json({
            total: totalClients,
            distribuicao,
            fatores_criticos: averages,
            insight_principal: insight,
            priorizacao: priorityList.slice(0, 15) // Top 15 críticos
        });

    } catch (e) {
        console.error('Erro na API Analytics CS:', e);
        res.status(500).json({ error: e.message });
    }
});

/**
 * Rota Cron para Salvar Snapshot Diário do Health Score (Pode rodar 1x por dia ou semana)
 * Necessário para o gráfico de Tendência e Evolução
 */
app.get('/api/cron/cs-health-snapshot', async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Firebase Admin não configurado.' });

    try {
        const clientsSnap = await db.collection('csClients').get();
        let recordsAdded = 0;

        const batch = db.batch();

        clientsSnap.forEach(doc => {
            const data = doc.data();
            const a = data.analytics;
            
            if (a) {
                // Prepara inserção na timeline histórica
                const historyRef = db.collection('health_scores').doc();
                batch.set(historyRef, {
                    client_id: doc.id,
                    score: a.score,
                    interacao: a.interacao_num,
                    grow: a.grow_num,
                    engage: a.engage_num,
                    reclamacao: a.reclamacao_num,
                    trend: a.trend,
                    churn_probability: a.churn_probability,
                    classificacao: a.classificacao,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp() // Timestamp do snapshot
                });
                recordsAdded++;
            }
        });

        // Executar lote no banco
        if (recordsAdded > 0) {
            await batch.commit();
        }

        res.json({ success: true, message: `Snapshot diário concluído. ${recordsAdded} registros salvos no histórico.` });
    } catch (e) {
        console.error('Erro no Snapshot Cron CS:', e);
        res.status(500).json({ error: e.message });
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
