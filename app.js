// Portal de Demandas - v1.2
// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyCEdnLpfnidHwW0ITNbGwQY1JkMihlsVFo",
    authDomain: "portal-de-demandas.firebaseapp.com",
    projectId: "portal-de-demandas",
    storageBucket: "portal-de-demandas.firebasestorage.app",
    messagingSenderId: "462772597904",
    appId: "1:462772597904:web:809708ecf323339b209415",
    measurementId: "G-DQ1Y92V6PR"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

let tasks = [];
let csClients = [];
let implantacoes = [];

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const formatDate = (dateStr) => {
    if (!dateStr || dateStr === '-') return '-';
    
    // Tenta detectar DD/MM/YYYY ou similar
    const brMatch = String(dateStr).match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4,})$/);
    if (brMatch) {
        let [_, d, m, y] = brMatch;
        if (y.length > 4) y = y.slice(-4);
        return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
    }
    
    // Tenta detectar YYYY-MM-DD ou similar
    const isoMatch = String(dateStr).match(/^(\d{4,})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (isoMatch) {
        let [_, y, m, d] = isoMatch;
        if (y.length > 4) y = y.slice(-4);
        return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
    }
    
    return dateStr;
};

// --- Custom Modal System ---
function showConfirmModal(title, message, onConfirm, isCritical = false) {
    const modal = document.getElementById('customConfirmModal');
    const titleEl = document.getElementById('confirmTitle');
    const messageEl = document.getElementById('confirmMessage');
    const btnAccept = document.getElementById('btnAcceptConfirm');
    const btnCancel = document.getElementById('btnCancelConfirm');
    const iconContainer = document.getElementById('confirmIcon');

    if (!modal || !titleEl || !messageEl || !btnAccept || !btnCancel) return;

    titleEl.textContent = title;
    messageEl.textContent = message;

    // Ajustar cores baseadas na criticidade
    if (isCritical) {
        btnAccept.style.background = 'var(--status-critical)';
        btnAccept.style.borderColor = 'var(--status-critical)';
        iconContainer.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="var(--status-critical)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 0 10px rgba(239, 68, 68, 0.3));">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
        `;
    } else {
        btnAccept.style.background = 'var(--accent-primary)';
        btnAccept.style.borderColor = 'var(--accent-primary)';
        iconContainer.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="var(--status-warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 0 10px rgba(245, 158, 11, 0.3));">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
        `;
    }

    const handleConfirm = () => {
        onConfirm();
        closeCustomConfirm();
    };

    const closeCustomConfirm = () => {
        modal.classList.remove('active');
        btnAccept.removeEventListener('click', handleConfirm);
        btnCancel.removeEventListener('click', closeCustomConfirm);
    };

    btnAccept.addEventListener('click', handleConfirm);
    btnCancel.addEventListener('click', closeCustomConfirm);
    modal.classList.add('active');

    // Fechar ao clicar fora
    modal.onclick = (e) => {
        if (e.target === modal) closeCustomConfirm();
    };
}

function showAlertModal(title, message) {
    // Reutiliza o sistema de confirm mas esconde o botão cancelar e muda o ícone
    const modal = document.getElementById('customConfirmModal');
    const titleEl = document.getElementById('confirmTitle');
    const messageEl = document.getElementById('confirmMessage');
    const btnAccept = document.getElementById('btnAcceptConfirm');
    const btnCancel = document.getElementById('btnCancelConfirm');
    const iconContainer = document.getElementById('confirmIcon');

    if (!modal || !titleEl || !messageEl || !btnAccept || !btnCancel) return;

    titleEl.textContent = title;
    messageEl.textContent = message;
    btnCancel.style.display = 'none';
    btnAccept.textContent = 'OK';
    btnAccept.style.background = 'var(--accent-primary)';
    btnAccept.style.borderColor = 'var(--accent-primary)';
    
    iconContainer.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 0 10px rgba(59, 130, 246, 0.3));">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
    `;

    const closeAlert = () => {
        modal.classList.remove('active');
        btnAccept.removeEventListener('click', closeAlert);
        // Restaurar estado do modal para modo confirm
        setTimeout(() => {
            btnCancel.style.display = 'inline-block';
            btnAccept.textContent = 'Confirmar';
        }, 300);
    };

    btnAccept.addEventListener('click', closeAlert);
    modal.classList.add('active');
}


// Estado global para o filtro de relatórios
let reportSelectedClients = new Set();
let reportListInitialized = false;

function updateReportCustomerList() {
    const listContainer = document.getElementById('reportCustomerList');
    const searchInput = document.getElementById('reportCustomerSearch');
    const header = document.getElementById('reportCustomerHeader');
    const dropdown = document.getElementById('reportCustomerDropdown');
    const selectedText = document.getElementById('selectedClientsText');
    const btnSelectAll = document.getElementById('btnSelectAllClients');
    
    if (!listContainer) return;

    // 1. Inicialização de Listeners (Apenas uma vez)
    if (!reportListInitialized) {
        if (header && dropdown) {
            header.onclick = (e) => {
                e.stopPropagation();
                dropdown.classList.toggle('active');
            };
            document.addEventListener('click', (e) => {
                if (dropdown && !dropdown.contains(e.target)) dropdown.classList.remove('active');
            });
        }

        if (searchInput) {
            searchInput.oninput = (e) => renderReportClients(e.target.value);
        }

        if (btnSelectAll) {
            btnSelectAll.onclick = () => {
                const filteredByNetwork = getFilteredItems(tasks);
                const allClients = [...new Set(filteredByNetwork.map(t => t.cliente || 'Sem Cliente'))].sort();
                const areAllSelected = allClients.every(c => reportSelectedClients.has(c));
                
                if (areAllSelected) {
                    reportSelectedClients.clear();
                } else {
                    allClients.forEach(c => reportSelectedClients.add(c));
                }
                
                renderReportClients(searchInput?.value || '');
            };
        }
        reportListInitialized = true;
    }

    // 2. Função de Renderização
    window.renderReportClients = function(filter = '') {
        const filteredByNetwork = getFilteredItems(tasks);
        const allClients = [...new Set(filteredByNetwork.map(t => t.cliente || 'Sem Cliente'))].sort();
        console.log(`Dropdown Relatórios: Renderizando ${allClients.length} clientes. Filtro: "${filter}"`);
        const listContainer = document.getElementById('reportCustomerList');
        if (!listContainer) return;

        listContainer.innerHTML = '';
        const filteredClients = allClients.filter(c => 
            String(c).toLowerCase().includes(String(filter).toLowerCase())
        );

        if (filteredClients.length === 0) {
            listContainer.innerHTML = '<div style="padding: 1rem; text-align: center; color: var(--text-muted); font-size: 0.8rem;">Nenhum cliente encontrado.</div>';
        } else {
            filteredClients.forEach(client => {
                const isChecked = reportSelectedClients.has(client);
                const label = document.createElement('label');
                label.className = 'client-checkbox-item';
                label.innerHTML = `
                    <input type="checkbox" value="${client}" class="report-client-checkbox" ${isChecked ? 'checked' : ''}>
                    <span title="${client}">${client}</span>
                `;
                
                const checkbox = label.querySelector('input');
                checkbox.onchange = (e) => {
                    if (e.target.checked) reportSelectedClients.add(client);
                    else reportSelectedClients.delete(client);
                    updateReportSelectedText();
                };
                listContainer.appendChild(label);
            });
        }
        updateReportSelectedText();
    };

    function updateReportSelectedText() {
        const selectedText = document.getElementById('selectedClientsText');
        const btnSelectAll = document.getElementById('btnSelectAllClients');
        if (!selectedText) return;

        const count = reportSelectedClients.size;
        if (count === 0) {
            selectedText.textContent = 'Selecionar Clientes...';
            if (btnSelectAll) btnSelectAll.textContent = 'Selecionar Todos';
        } else if (count === 1) {
            selectedText.textContent = Array.from(reportSelectedClients)[0];
            if (btnSelectAll) btnSelectAll.textContent = 'Desmarcar Todos';
        } else {
            selectedText.textContent = `${count} Clientes Selecionados`;
            if (btnSelectAll) btnSelectAll.textContent = 'Desmarcar Todos';
        }
    }

    // Inicializa a renderização
    renderReportClients(searchInput?.value || '');
}

// Chamar atualização quando as tarefas carregarem
db.collection('tasks').onSnapshot((snapshot) => {
    tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderBoard();
    if (typeof renderMaintenanceBoard === 'function') renderMaintenanceBoard();
    if (typeof updateBadgePreventivas === 'function') updateBadgePreventivas();
    updateReportCustomerList();
});

db.collection('csClients').onSnapshot((snapshot) => {
    csClients = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    if (typeof renderCSBoard === 'function') renderCSBoard();
});

db.collection('implantacoes').onSnapshot((snapshot) => {
    implantacoes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    if (typeof renderImplantacoesBoard === 'function') renderImplantacoesBoard();
});

let isSyncing = false;
let isProcessingEmails = false;

// Function to fetch demands from the new backend API
async function fetchDemandasDaAPI() {
    if (isSyncing) return;
    isSyncing = true;
    const syncButton = document.getElementById('btnSyncTiFlux');
    const syncIcon = syncButton?.querySelector('.icon-sync');
    const lastSyncLabel = document.getElementById('lastSyncTime');

    try {
        // Visual Feedback: Start Rotation & Disable Button
        if (syncIcon) syncIcon.classList.add('rotating');
        if (syncButton) syncButton.disabled = true;
        if (lastSyncLabel) lastSyncLabel.innerText = 'Sincronizando...';

        // Busca estado atual do banco PRIMEIRO, para listar o que está aberto
        const currentSnap = await db.collection('tasks').get();
        const currentTasksMap = new Map();
        const openTicketsIds = [];
        
        currentSnap.forEach(doc => {
            const data = doc.data();
            currentTasksMap.set(doc.id, data);
            // Identifica chamados abertos válidos para forçar a verificação de novidades/fechamento
            if (data.status && !data.status.includes('Concluida') && data.number && data.number !== 'N/A' && data.number !== 'undefined') {
                openTicketsIds.push(data.number);
            }
        });

        const fetchOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ openTickets: openTicketsIds })
        };

        let response = await fetch('/api/demandas', fetchOptions);
        if (!response.ok) {
            // Fallback para caso a Vercel esteja limpando o prefixo /api
            response = await fetch('/demandas', fetchOptions);
        }
        if (!response.ok) {
            throw new Error('Falha ao buscar demandas do servidor');
        }
        const apiTasks = await response.json();

        // Merge API tasks with local tasks (avoiding duplicates by ID, updating existing ones)
        if (apiTasks.length > 0) {
            let newTasksCount = 0;
            let updatedTasksCount = 0;
            let syncdItems = [];

            const batch = db.batch();
            let hasChanges = false;

            apiTasks.forEach(apiTask => {
                const localTask = currentTasksMap.get(apiTask.id);
                const isApiTaskCompleted = apiTask.status && apiTask.status.includes('Concluida');

                if (!localTask) {
                    // Se o chamado já vem fechado do TiFlux e não é uma Preventiva, não adicionamos como "Novo"
                    // para evitar poluir o portal com chamados que já foram resolvidos antes de entrarem aqui.
                    if (isApiTaskCompleted && apiTask.status !== 'Preventiva Concluida') {
                        return;
                    }

                    newTasksCount++;
                    const taskRef = db.collection('tasks').doc(apiTask.id);
                    batch.set(taskRef, apiTask);
                    hasChanges = true;
                    syncdItems.push({ number: apiTask.number || 'N/A', type: 'Novo', client: apiTask.cliente });
                } else {
                    // Proteção contra sobrescrita de demandas já concluídas localmente
                    const isLocalCompleted = localTask.status && localTask.status.includes('Concluida');

                    // Se já está concluído localmente, e no TiFlux também está, ignoramos.
                    // MAS se no TiFlux ele foi REABERTO (agora não contém 'Concluida'), permitimos a atualização.
                    if (isLocalCompleted && isApiTaskCompleted) {
                        return;
                    }

                    // Se no TiFlux o chamado agora está concluído, mas no portal ainda está aberto
                    // nós permitimos a atualização para que ele mova para a aba de concluídos.
                    const changes = [];
                    if (apiTask.status !== localTask.status) changes.push('Status');
                    if (apiTask.desc !== localTask.desc) changes.push('Descrição');
                    if (apiTask.prioridade !== localTask.prioridade) changes.push('Prioridade');
                    if (apiTask.responsavel !== localTask.responsavel) changes.push('Responsável');
                    if (apiTask.cliente !== localTask.cliente) changes.push('Cliente');
                    if (apiTask.quality !== localTask.quality) changes.push('Quality');

                    if (changes.length > 0) {
                        updatedTasksCount++;
                        const taskRef = db.collection('tasks').doc(apiTask.id);

                        // Proteção: Não sobrescrever a data de vencimento (SLA) se ela já existe localmente
                        // EXCETO se o status mudou (ex: de Analise para QP), onde o prazo deve ser recalculado
                        const taskUpdate = { ...apiTask };
                        if (localTask.date && apiTask.status === localTask.status) {
                            taskUpdate.date = localTask.date;
                        }

                        // NOVO: Marcar que houve uma atualização externa (TiFlux)
                        taskUpdate.hasUpdate = true;

                        batch.set(taskRef, taskUpdate, { merge: true });
                        hasChanges = true;

                        // Detecção de Transição para Concluído:
                        // Se o novo status é concluído E o local NÃO era concluído
                        const becomesCompleted = isApiTaskCompleted && !isLocalCompleted;
                        
                        // Detecção de Reabertura:
                        // Se o local era concluído e no API está aberto
                        const becomesReopened = isLocalCompleted && !isApiTaskCompleted;

                        syncdItems.push({ 
                            id: apiTask.id, // Adicionado para facilitar o botão de conclusão
                            number: apiTask.number || 'N/A', 
                            type: 'Atu.', 
                            client: apiTask.cliente,
                            changes: changes,
                            isTransitionToClosed: becomesCompleted,
                            isReopened: becomesReopened
                        });
                    }
                }
            });

            if (hasChanges) {
                await batch.commit();
            }

            // Atualiza hora da última sincronização
            const now = new Date();
            const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            if (lastSyncLabel) lastSyncLabel.innerText = timeStr;

            if (newTasksCount > 0 || updatedTasksCount > 0) {
                showSyncResultsModal(newTasksCount, updatedTasksCount, syncdItems);
                showToast(`TiFlux: ${newTasksCount} novos e ${updatedTasksCount} atualizados!`);
            } else {
                showToast('TiFlux verificado: sem novos chamados.');
            }
        } else {
            const now = new Date();
            const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            if (lastSyncLabel) lastSyncLabel.innerText = timeStr;
            showToast('Nenhum chamado encontrado no TiFlux no momento.');
        }
    } catch (error) {
        console.error('Erro de integração:', error);
        showToast('Erro ao sincronizar com TiFlux (Servidor offline?)');
        if (lastSyncLabel) lastSyncLabel.innerText = 'Erro ao sincronizar';
    } finally {
        // Visual Feedback: Stop Rotation & Enable Button
        if (syncIcon) syncIcon.classList.remove('rotating');
        if (syncButton) syncButton.disabled = false;

        isSyncing = false;

        // Automação: Verificar e Enviar E-mails para Vencidas
        checkAndSendOverdueEmails();
    }
}

async function checkAndSendOverdueEmails() {
    if (isProcessingEmails) return;
    isProcessingEmails = true;

    // Só processa se houver tarefas carregadas
    if (tasks.length === 0) {
        isProcessingEmails = false;
        return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // Filtrar tarefas abertas que estão vencidas (date < today), ainda não foram notificadas e têm e-mail válido
    const overdueToNotify = tasks.filter(t => {
        if (!t.date || t.status.includes('Concluida')) return false;
        if (t.notified) return false;

        // Só conta se o e-mail for válido (mesma lógica do servidor)
        if (!t.clientEmail || !emailRegex.test(t.clientEmail)) return false;

        const slaDate = new Date(t.date);
        return slaDate < today;
    });

    if (overdueToNotify.length === 0) {
        isProcessingEmails = false;
        return;
    }

    console.log(`Detectados ${overdueToNotify.length} chamados vencidos.`);

    // Armazena para uso no modal/botões manuais
    window.pendingOverdueToNotify = overdueToNotify;

    // TRAVA: Se for muita coisa (mais de 5), não envia automático.
    // O usuário terá que clicar no botão do modal de Sync.
    if (overdueToNotify.length > 5) {
        console.log('Limite automático excedido (>5). Aguardando ação manual do usuário no modal.');
        isProcessingEmails = false;
        return;
    }

    console.log(`Enviando ${overdueToNotify.length} chamados automaticamente para automação.`);

    // Log individual check for the testing ticket
    const testTicket = overdueToNotify.find(t => t.number === '26191');
    if (testTicket) {
        console.log('DEBUG: Ticket 26191 encontrado na lista de vencidos. Email capturado:', testTicket.clientEmail);
    } else {
        console.log('DEBUG: Ticket 26191 NÃO está na lista de overdueToNotify.');
    }

    try {
        console.log(`Enviando ${overdueToNotify.length} chamados para automação:`, overdueToNotify);

        const response = await fetch('/api/send-overdue-emails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tasks: overdueToNotify })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.warn('Automação de e-mail não disponível ou erro no servidor:', errorText);
            return;
        }

        const result = await response.json();
        if (result.success && result.results) {
            const sentCount = result.results.filter(r => r.success).length;
            const skippedCount = result.results.filter(r => r.error === 'E-mail não fornecido.').length;
            const errorCount = result.results.length - sentCount - skippedCount;

            // PERSISTÊNCIA: Marcar como notificado no banco para não repetir
            const batch = db.batch();
            result.results.forEach(res => {
                // Mesmo que dê erro de SMTP (ex: endereço inexistente), marcamos como notificado 
                // para parar de tentar e poluir a caixa do Victor com erros
                const matchingTask = overdueToNotify.find(t => t.number === res.task);
                if (matchingTask) {
                    const taskRef = db.collection('tasks').doc(matchingTask.id);
                    batch.update(taskRef, { notified: true });
                }
            });
            await batch.commit();

            // Armazena temporariamente para o modal de sync
            window.lastEmailResult = { sentCount, skippedCount, errorCount };

            if (sentCount > 0) {
                showToast(`${sentCount} e-mails de alerta enviados com sucesso!`, 'success');
            } else if (skippedCount > 0) {
                // showToast(`${skippedCount} chamados ignorados (sem e-mail do cliente). Verifique no TiFlux.`, 'warning');
            } else if (errorCount > 0) {
                showToast(`${errorCount} erros ao tentar enviar e-mails. Verifique o console.`, 'critical');
            }

            if (result.results) console.log('Resultado da automação:', result.results);
        }
    } catch (error) {
        console.error('Erro ao disparar automação de e-mails:', error);
    } finally {
        isProcessingEmails = false;
    }
}

// Sync Results Modal Logic
function showSyncResultsModal(newCount, updatedCount, items) {
    const modal = document.getElementById('syncResultsModal');
    const summary = document.getElementById('syncSummaryText');
    const list = document.getElementById('syncResultsList');

    let emailPart = '';
    const emailActions = document.getElementById('syncEmailActions');
    const pendingCount = window.pendingOverdueToNotify ? window.pendingOverdueToNotify.length : 0;

    if (window.lastEmailResult && window.lastEmailResult.sentCount > 0) {
        emailPart = `<div style="margin-top: 10px; padding: 10px; background: rgba(16, 185, 129, 0.1); border-radius: 8px; border: 1px solid rgba(16, 185, 129, 0.2); color: #10b981; font-size: 0.85rem;">
            🚀 <strong>${window.lastEmailResult.sentCount} e-mails</strong> de alerta foram enviados com sucesso!
        </div>`;
        if (emailActions) emailActions.style.display = 'none';
    } else if (pendingCount > 0) {
        const pendingList = window.pendingOverdueToNotify.map(t => `#${t.number} (${t.cliente})`).join(', ');
        emailPart = `<div style="margin-top: 10px; padding: 10px; background: rgba(245, 158, 11, 0.1); border-radius: 8px; border: 1px solid rgba(245, 158, 11, 0.2); color: #f59e0b; font-size: 0.85rem;">
            ⚠️ Existem <strong>${pendingCount} chamados vencidos</strong> para notificação: <br>
            <span style="font-size: 0.75rem; color: var(--text-muted);">${pendingList}</span>
        </div>`;
        if (emailActions) emailActions.style.display = 'flex';
    } else {
        if (emailActions) emailActions.style.display = 'none';
    }

    summary.innerHTML = `
        Foram encontrados <strong>${newCount}</strong> novos chamados e <strong>${updatedCount}</strong> atualizados no TiFlux.
        ${emailPart}
    `;

    list.innerHTML = items.map(item => {
        const changesHtml = item.changes ? item.changes.map(c => `<span class="sync-change-badge">${c}</span>`).join('') : '';
        
        let actionBtn = '';
        let statusBadge = '';
        let reopendNotice = '';
        
        if (item.isTransitionToClosed) {
            statusBadge = `<span class="sync-badge updated" style="background: rgba(16, 185, 129, 0.2); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3);">FECHADO NO TIFLUX</span>`;
            actionBtn = `
                <button type="button" class="btn btn-primary btn-sync-complete" data-id="${item.id}" 
                    style="margin-top: 8px; padding: 6px 12px; font-size: 0.75rem; background: #10b981; border-color: #10b981; width: fit-content;">
                    Concluir e Notificar
                </button>
            `;
        } else if (item.isReopened) {
            statusBadge = `<span class="sync-badge updated" style="background: rgba(245, 158, 11, 0.2); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3);">REABERTO</span>`;
            reopendNotice = `
                <div style="margin-top: 4px; display: flex; align-items: center; gap: 4px; font-size: 0.75rem; color: #f59e0b;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                    Reaberto no TiFlux e movido para a coluna original.
                </div>
            `;
        }

        return `
        <div class="sync-item ${item.type === 'Novo' ? 'new' : 'updated'}">
            <div style="display: flex; flex-direction: column; flex: 1;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span class="sync-item-number">#${item.number}</span>
                    ${statusBadge}
                </div>
                <span style="font-size: 0.75rem; color: var(--text-muted);">${item.client}</span>
                <div style="display: flex; gap: 4px; margin-top: 4px; flex-wrap: wrap;">
                    ${changesHtml}
                </div>
                ${reopendNotice}
                ${actionBtn}
            </div>
            <span class="sync-badge ${item.type === 'Novo' ? 'new' : 'updated'}">${item.type}</span>
        </div>
    `}).join('');

    modal.classList.add('active');
}

// Listener para auto-marcar o envio de e-mail ao digitar
document.getElementById('taskResolvedEmail').addEventListener('input', (e) => {
    const email = e.target.value.trim();
    const checkbox = document.getElementById('sendCompletionEmail');
    if (email && email.includes('@') && checkbox) {
        checkbox.checked = true;
    }
});

// Handler global para botões de conclusão no modal de sync
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('btn-sync-complete')) {
        const taskId = e.target.dataset.id;
        if (taskId) {
            // Fechar modal de resultados antes de abrir o de conclusão
            const syncResultsModal = document.getElementById('syncResultsModal');
            if (syncResultsModal) syncResultsModal.classList.remove('active');
            
            // Abrir modal de conclusão
            completeTask(taskId);
        }
    }
});

const btnCloseSyncResults = document.getElementById('btnCloseSyncResults');
const btnOkSyncResults = document.getElementById('btnOkSyncResults');
const syncResultsModal = document.getElementById('syncResultsModal');

if (btnCloseSyncResults) btnCloseSyncResults.addEventListener('click', () => syncResultsModal.classList.remove('active'));
if (btnOkSyncResults) btnOkSyncResults.addEventListener('click', () => {
    syncResultsModal.classList.remove('active');
    window.lastEmailResult = null;
    window.pendingOverdueToNotify = null;
});

// Ações manuais de E-mail
const btnSendEmails = document.getElementById('btnSendEmails');
const btnSkipEmails = document.getElementById('btnSkipEmails');

if (btnSendEmails) {
    btnSendEmails.addEventListener('click', async () => {
        if (!window.pendingOverdueToNotify || window.pendingOverdueToNotify.length === 0) return;

        btnSendEmails.disabled = true;
        btnSendEmails.innerHTML = 'Enviando...';

        try {
            const overdueToNotify = window.pendingOverdueToNotify;
            console.log(`Disparando envio manual para ${overdueToNotify.length} chamados...`);

            const response = await fetch('/api/send-overdue-emails', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tasks: overdueToNotify })
            });

            if (response.ok) {
                const result = await response.json();
                if (result.success && result.results) {
                    const sentCount = result.results.filter(r => r.success).length;
                    
                    // PERSISTÊNCIA: Marcar como notificado no banco para não repetir
                    const batch = db.batch();
                    result.results.forEach(res => {
                        const matchingTask = overdueToNotify.find(t => t.number === res.task);
                        if (matchingTask) {
                            const taskRef = db.collection('tasks').doc(matchingTask.id);
                            batch.update(taskRef, { notified: true });
                        }
                    });
                    await batch.commit();

                    window.lastEmailResult = { sentCount };
                    window.pendingOverdueToNotify = null;
                    showToast(`${sentCount} e-mails enviados!`);

                    syncResultsModal.classList.remove('active');
                }
            } else {
                showToast('Erro ao enviar e-mails.', 'critical');
            }
        } catch (e) {
            console.error(e);
        } finally {
            btnSendEmails.disabled = false;
            btnSendEmails.innerHTML = 'Enviar E-mails de Alerta';
        }
    });
}

if (btnSkipEmails) {
    btnSkipEmails.addEventListener('click', async () => {
        if (!window.pendingOverdueToNotify || window.pendingOverdueToNotify.length === 0) return;

        showConfirmModal(
            'Confirmar Limpeza',
            `Deseja marcar ${window.pendingOverdueToNotify.length} chamados como avisados sem enviar e-mail para ninguém?`,
            async () => {
                btnSkipEmails.disabled = true;
                try {
                    const batch = db.batch();
                    window.pendingOverdueToNotify.forEach(task => {
                        const ref = db.collection('tasks').doc(task.id);
                        batch.update(ref, {
                            notified: true,
                            lastNotifiedAt: firebase.firestore.FieldValue.serverTimestamp(),
                            skipReason: 'Manual backlog skip'
                        });
                    });
                    await batch.commit();
                    showToast('Backlog limpo com sucesso!');
                    window.pendingOverdueToNotify = null;
                    syncResultsModal.classList.remove('active');
                } catch (e) {
                    console.error(e);
                } finally {
                    btnSkipEmails.disabled = false;
                }
            }
        );
    });
}

if (syncResultsModal) syncResultsModal.addEventListener('click', (e) => {
    if (e.target === syncResultsModal) syncResultsModal.classList.remove('active');
});

// DOM Elements Demandas
const btnNewTask = document.getElementById('btnNewTask');
const modal = document.getElementById('taskModal');
const btnCloseModal = document.getElementById('btnCloseModal');
const btnSyncTiFlux = document.getElementById('btnSyncTiFlux');
const lastSyncTime = document.getElementById('lastSyncTime');
const btnToggleHeader = document.getElementById('btnToggleHeader');
const collapsibleHeader = document.getElementById('collapsibleHeader');
const btnCancelModal = document.getElementById('btnCancelModal');
const taskForm = document.getElementById('taskForm');
const toast = document.getElementById('toast');
const taskStatusInput = document.getElementById('taskStatus');
const btnResendEmail = document.getElementById('btnResendEmail');
const emailStatusSelect = document.getElementById('emailStatusSelect');

// DOM Elements Implantações
const btnViewImplantacoes = document.getElementById('btnViewImplantacoes');
const implantacoesBoard = document.getElementById('implantacoesBoard');
const btnNewImplantation = document.getElementById('btnNewImplantation');
const implantationModal = document.getElementById('implantationModal');
const btnCloseImplantationModal = document.getElementById('btnCloseImplantationModal');
const btnCancelImplantationModal = document.getElementById('btnCancelImplantationModal');
const implantationForm = document.getElementById('implantationForm');

// DOM Elements Resolve
const resolveModal = document.getElementById('resolveModal');
const btnCloseResolveModal = document.getElementById('btnCloseResolveModal');
const btnCancelResolveModal = document.getElementById('btnCancelResolveModal');
const resolveForm = document.getElementById('resolveForm');

// Login Elements
const loginOverlay = document.getElementById('loginOverlay');
const loginForm = document.getElementById('loginForm');
const loginEmailInput = document.getElementById('loginEmail');
const loginPassInput = document.getElementById('loginPass');
const loginErrorMsg = document.getElementById('loginErrorMsg');
const sidebarFooter = document.getElementById('sidebarFooter');
const currentUserName = document.getElementById('currentUserName');
const btnLogout = document.getElementById('btnLogout');

// Sidebar Elements
const btnToggleSidebar = document.getElementById('btnToggleSidebar');
const sidebar = document.getElementById('sidebar');

// User State
const USER_STORAGE_KEY = 'portalCS_user';
let currentUser = localStorage.getItem(USER_STORAGE_KEY);

const kanbanBoard = document.querySelector('.kanban-board');
const searchInput = document.getElementById('searchInput');
const slaFilter = document.getElementById('slaFilter');
const maintenanceSearch = document.getElementById('maintenanceSearch');
const maintenanceFilter = document.getElementById('maintenanceFilter');

// Configuração de Permissões (Simulada)
// Na vida real isso viria do backend/TiFlux. Aqui vamos definir que apenas "Victor" pode excluir.
const ADMIN_USERS = ['Victor', 'victor', 'Gerente', 'Admin'];

if (searchInput) searchInput.addEventListener('input', renderBoard);
if (slaFilter) slaFilter.addEventListener('change', renderBoard);
if (maintenanceSearch) maintenanceSearch.addEventListener('input', renderMaintenanceBoard);
if (maintenanceFilter) maintenanceFilter.addEventListener('change', renderMaintenanceBoard);

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Set min date for taskDate input to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('taskDate').setAttribute('min', today);

    checkAuth();
    renderBoard();
    renderCSBoard();
    setupDragAndDrop();

    // Auto-fetch demands from API when the page loads
    fetchDemandasDaAPI();

    // Fetch Custom Users Admin List
    fetchCustomUsers();

    // Fetch Networks
    fetchNetworks();

    // Load Email Settings
    loadEmailSettings();

    // Limpeza de Bugs que podem ter ficado salvos no banco durante o desenvolvimento
    db.collection('tasks').get().then(snap => {
        snap.forEach(doc => {
            const data = doc.data();
            let deleted = false;

            // Limpa se for "undefined", "N/A" ou se estiver com um status invisível pro Kanban original
            if (data.number === 'undefined' || data.number === 'N/A' || data.cliente === 'Cliente TiFlux' || data.number === undefined) {
                doc.ref.delete();
                deleted = true;
            }

            const allowedStatuses = [
                'Analise', 'QP - Melhoria', 'QP - Correção', 'Adhoc',
                'Analise Concluida', 'QP - Melhoria Concluida', 'QP - Correção Concluida',
                'Adhoc Concluida', 'Preventiva', 'Preventiva Concluida'
            ];

            if (!deleted && !allowedStatuses.includes(data.status)) {
                // Se o status for o antigo "QP", vamos primeiro tentar migrar para "QP - Correção" em vez de deletar
                if (data.status === 'QP') {
                    doc.ref.update({ status: 'QP - Correção' });
                } else if (data.status === 'QP Concluida') {
                    doc.ref.update({ status: 'QP - Correção Concluida' });
                } else {
                    doc.ref.delete();
                    deleted = true;
                }
            }

            // Limpa os 14 Invasores do teste curinga passado
            const titleLower = (data.desc || '').toLowerCase();
            if (!deleted && data.status === 'Analise' && !titleLower.includes('analise') && !titleLower.includes('análise') && !titleLower.includes('qp')) {
                doc.ref.delete();
                deleted = true;
            }

            // ATUALIZAÇÃO RETROATIVA DE SLA E DATA DE ABERTURA
            if (!deleted && (data.status === 'Analise' || data.status === 'QP - Melhoria' || data.status === 'QP - Correção')) {
                // Se o SLA já foi atualizado (pelo backend ou manualmente), não mexemos mais
                if (data.slaUpdated === true) return;

                function addBusinessDays(startDate, days) {
                    let date = new Date(startDate);
                    let added = 0;
                    while (added < days) {
                        date.setDate(date.getDate() + 1);
                        if (date.getDay() !== 0 && date.getDay() !== 6) {
                            added++;
                        }
                    }
                    return date;
                }

                let daysToAdd = 0;
                if (data.status === 'Analise') daysToAdd = 7;
                else if (data.status.includes('QP')) daysToAdd = 30;

                // Se não tem createdAt, ou se createdAt é igual à date (o que indica que o TiFlux mandou apenas um campo), 
                // e ainda não marcamos como atualizado.
                if (!data.createdAt || data.createdAt === data.date) {
                    const originalDate = data.date;
                    if (originalDate && originalDate.includes('-')) {
                        const [y, m, d] = originalDate.split('-');
                        const baseDate = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
                        const sla = addBusinessDays(baseDate, daysToAdd);
                        const mStr = String(sla.getMonth() + 1).padStart(2, '0');
                        const dStr = String(sla.getDate()).padStart(2, '0');
                        const newSlaDate = `${sla.getFullYear()}-${mStr}-${dStr}`;

                        doc.ref.update({
                            date: newSlaDate,
                            createdAt: originalDate,
                            slaUpdated: true
                        });
                    }
                }
            }
        });
    });

    // Sidebar state
    const SIDEBAR_STATE_KEY = 'portalCS_sidebar';
    if (localStorage.getItem(SIDEBAR_STATE_KEY) === 'collapsed') {
        sidebar.classList.add('collapsed');
    }

    btnToggleSidebar.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        const isCollapsed = sidebar.classList.contains('collapsed');
        localStorage.setItem(SIDEBAR_STATE_KEY, isCollapsed ? 'collapsed' : 'expanded');
    });

    // Header Collapse Logic
    const HEADER_STATE_KEY = 'portalCS_header';
    if (localStorage.getItem(HEADER_STATE_KEY) === 'collapsed' && collapsibleHeader) {
        collapsibleHeader.classList.add('collapsed');
    }

    if (btnToggleHeader && collapsibleHeader) {
        btnToggleHeader.addEventListener('click', () => {
            collapsibleHeader.classList.toggle('collapsed');
            const isCollapsed = collapsibleHeader.classList.contains('collapsed');
            localStorage.setItem(HEADER_STATE_KEY, isCollapsed ? 'collapsed' : 'expanded');
        });
    }

    // Manual Sync Button Listener
    if (btnSyncTiFlux) {
        btnSyncTiFlux.addEventListener('click', fetchDemandasDaAPI);
    }

    if (btnViewConfig) btnViewConfig.addEventListener('click', (e) => { e.preventDefault(); switchView('config'); });

    // Restore Default Email Template
    const btnRestoreEmailDefault = document.getElementById('btnRestoreEmailDefault');
    if (btnRestoreEmailDefault) {
        btnRestoreEmailDefault.addEventListener('click', () => {
            showConfirmModal(
                'Restaurar Padrão',
                'Deseja restaurar o assunto e o corpo do e-mail para o padrão do sistema?',
                () => {
                    if (document.getElementById('emailSubject')) document.getElementById('emailSubject').value = DEFAULT_EMAIL_SUBJECT;
                    if (document.getElementById('emailBody')) document.getElementById('emailBody').value = DEFAULT_EMAIL_BODY;
                }
            );
        });
    }
});

// Auth Logic
// Variaveis e Funções para Custom Admin Users (Configurações)
let customUsers = [];
let networks = [];

function fetchCustomUsers() {
    db.collection('customUsers').onSnapshot((snapshot) => {
        customUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderUserAdminList();
        renderNetworkSelect();
    });
}

function getNetworkNameByClient(clientName) {
    if (!clientName || !networks || networks.length === 0) return '';
    const nameLower = clientName.toLowerCase();
    const network = networks.find(n => 
        n.clients && n.clients.some(c => {
            const cName = typeof c === 'string' ? c : c.name;
            return nameLower.includes(cName.toLowerCase());
        })
    );
    return network ? network.name : '';
}

function getNetworkEmailByClient(clientName) {
    if (!clientName || !networks || networks.length === 0) return '';
    const nameLower = clientName.toLowerCase().trim();
    const network = networks.find(n => 
        n.clients && n.clients.some(c => {
            const cName = (typeof c === 'string' ? c : (c.name || '')).toLowerCase().trim();
            if (!cName) return false;
            // Comparação exata ou se o nome do cliente na rede é o nome completo do cliente
            return nameLower === cName;
        })
    );
    const email = network ? (network.reportEmail || '') : '';
    console.log(`[Email Check] Cliente: "${clientName}" -> Rede: ${network ? network.name : 'Nenhuma'} -> Email: ${email || 'Não encontrado'}`);
    return email;
}

function fetchNetworks() {
    db.collection('networks').onSnapshot((snapshot) => {
        networks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderNetworkList();
        renderNetworkSelect();
        
        // NOVO: Renderizar o quadro quando as redes carregarem.
        // Isso resolve o problema de usuários restritos verem o quadro vazio no load
        // porque a filtragem depende do array 'networks' estar populado.
        renderBoard();
        if (typeof renderCSBoard === 'function') renderCSBoard();
        if (typeof updateReportCustomerList === 'function') updateReportCustomerList();
    });
}

function renderNetworkSelect() {
    const select = document.getElementById('adminUserNetwork');
    if (!select) return;

    const currentValue = select.value;
    select.innerHTML = '<option value="">Nenhuma (Acesso Geral)</option>';
    
    networks.forEach(n => {
        const option = document.createElement('option');
        option.value = n.id;
        option.textContent = n.name;
        select.appendChild(option);
    });

    select.value = currentValue;
}

function renderNetworkList() {
    const listContainer = document.getElementById('networkList');
    if (!listContainer) return;

    if (networks.length === 0) {
        listContainer.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 2rem;">Nenhuma rede cadastrada.</p>';
        return;
    }

    let html = '';
    networks.forEach(n => {
        html += `
            <div class="user-card" style="margin-bottom: 8px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div class="user-avatar" style="background: var(--accent-primary); color: white;">${n.name.slice(0, 2).toUpperCase()}</div>
                    <div style="flex: 1;">
                        <div style="color: var(--text-primary); font-weight: 600;">${n.name}</div>
                        <div style="color: var(--text-muted); font-size: 0.75rem;">${n.clients ? n.clients.length : 0} postos associados</div>
                    </div>
                </div>
                <div style="display: flex; gap: 4px;">
                    <button class="action-btn" onclick="sendNetworkReport('${n.id}')" title="Enviar Relatório de Demandas Abertas" style="background: rgba(16, 185, 129, 0.1); color: #10b981;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
                    </button>
                    <button class="action-btn edit" onclick="openEditNetworkModal('${n.id}')" title="Editar Rede">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                    </button>
                    <button class="action-btn delete" onclick="deleteNetwork('${n.id}')" title="Excluir Rede">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                    </button>
                </div>
            </div>
        `;
    });
    listContainer.innerHTML = html;
}

window.openEditNetworkModal = function(id) {
    const network = networks.find(n => n.id === id);
    if (network) {
        document.getElementById('networkId').value = network.id;
        document.getElementById('networkName').value = network.name;
        document.getElementById('networkReportEmail').value = network.reportEmail || '';
        document.getElementById('networkAutoReport').checked = network.autoReportEnabled || false;
        
        // Inicializar estado local de clientes para edição
        currentNetworkClients = [...(network.clients || [])];
        renderCurrentNetworkClients();
        
        const netForm = document.getElementById('networkForm');
        const submitBtn = netForm ? netForm.querySelector('button[type="submit"]') : null;
        if (submitBtn) submitBtn.textContent = 'Atualizar Rede';
    }
}

window.deleteNetwork = function(id) {
    showConfirmModal(
        'Excluir Rede',
        'Deseja realmente excluir esta rede? Usuários associados a ela perderão o filtro de acesso.',
        () => {
            db.collection('networks').doc(id).delete().then(() => {
                showToast('Rede removida com sucesso!', 'critical');
            });
        },
        true // isCritical
    );
}

// Estado global para o formulário de Redes
let currentNetworkClients = [];
let tifluxClients = [];

const networkForm = document.getElementById('networkForm');
if (networkForm) {
    networkForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const id = document.getElementById('networkId').value;
        const name = document.getElementById('networkName').value.trim();
        const reportEmail = document.getElementById('networkReportEmail').value.trim();
        const autoReportEnabled = document.getElementById('networkAutoReport').checked;
        
        if (!name || currentNetworkClients.length === 0) {
            showToast('Preencha o nome da rede e adicione ao menos um posto.', 'warning');
            return;
        }

        const networkData = { 
            name: name, 
            clients: currentNetworkClients,
            reportEmail: reportEmail,
            autoReportEnabled: autoReportEnabled
        };

        if (id) {
            db.collection('networks').doc(id).update(networkData).then(() => {
                showToast('Rede atualizada!');
                resetNetworkForm();
            });
        } else {
            db.collection('networks').add(networkData).then(() => {
                showToast('Rede cadastrada!');
                resetNetworkForm();
            });
        }
    });

    function resetNetworkForm() {
        const netForm = document.getElementById('networkForm');
        if (netForm) netForm.reset();
        document.getElementById('networkId').value = '';
        document.getElementById('networkReportEmail').value = '';
        document.getElementById('networkAutoReport').checked = false;
        currentNetworkClients = [];
        renderCurrentNetworkClients();
        const submitBtn = netForm ? netForm.querySelector('button[type="submit"]') : null;
        if (submitBtn) submitBtn.textContent = 'Salvar Rede';
    }

    // TiFlux Integration
    async function fetchTifluxClients() {
        try {
            const response = await fetch('/api/tiflux/clients');
            tifluxClients = await response.json();
        } catch (err) {
            console.error('Erro ao buscar clientes TiFlux:', err);
        }
    }

    const tifluxClientSearch = document.getElementById('tifluxClientSearch');
    const tifluxSearchResults = document.getElementById('tifluxSearchResults');
    const btnSearchTiflux = document.getElementById('btnSearchTiflux');

    if (btnSearchTiflux) {
        btnSearchTiflux.addEventListener('click', async () => {
            if (tifluxClients.length === 0) {
                const originalContent = btnSearchTiflux.innerHTML;
                btnSearchTiflux.disabled = true;
                btnSearchTiflux.innerHTML = '<svg class="rotating" style="height:16px; width:16px;" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>';
                await fetchTifluxClients();
                btnSearchTiflux.disabled = false;
                btnSearchTiflux.innerHTML = originalContent;
            }
            renderTifluxSearchResults(tifluxClientSearch?.value);
        });
    }

    if (tifluxClientSearch) {
        tifluxClientSearch.addEventListener('input', (e) => renderTifluxSearchResults(e.target.value));
        
        // Também permitir busca ao apertar Enter
        tifluxClientSearch.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                btnSearchTiflux?.click();
            }
        });
    }

    const btnAddManualClient = document.getElementById('btnAddManualClient');
    if (btnAddManualClient) {
        btnAddManualClient.addEventListener('click', () => {
            const name = tifluxClientSearch?.value.trim();
            if (name) {
                addClientToNetwork(name);
                tifluxClientSearch.value = '';
            } else {
                showToast('Digite o nome do posto para adicionar.', 'warning');
            }
        });
    }

    function renderTifluxSearchResults(query) {
        if (!tifluxSearchResults) return;
        if (!query || query.length < 2) {
            tifluxSearchResults.style.display = 'none';
            return;
        }

        const filtered = tifluxClients.filter(c => 
            (c.name && c.name.toLowerCase().includes(query.toLowerCase())) || 
            (c.trade_name && c.trade_name.toLowerCase().includes(query.toLowerCase()))
        );

        if (filtered.length === 0) {
            tifluxSearchResults.innerHTML = '<div style="padding: 10px; color: var(--text-muted); font-size: 0.8rem; text-align: center;">Nenhum cliente no TiFlux.</div>';
            tifluxSearchResults.style.display = 'block';
            return;
        }

        let html = '';
        filtered.forEach(c => {
            html += `
                <div class="tiflux-client-item" onclick="addClientToNetwork('${c.name.replace(/'/g, "\\'")}')" style="padding: 8px 12px; cursor: pointer; border-radius: 6px; color: var(--text-primary); font-size: 0.85rem; display: flex; align-items: center; gap: 8px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14m-7-7 7 7-7 7"/></svg>
                    <span>${c.name}</span>
                </div>
            `;
        });
        tifluxSearchResults.innerHTML = html;
        tifluxSearchResults.style.display = 'block';
    }

    window.addClientToNetwork = function(name) {
        const exists = currentNetworkClients.some(c => (typeof c === 'string' ? c : c.name) === name);
        if (!exists) {
            currentNetworkClients.push({ name: name, active: true });
            renderCurrentNetworkClients();
            showToast(`"${name}" adicionado.`);
        } else {
            showToast('Este posto já está na lista.', 'warning');
        }
        if (tifluxSearchResults) tifluxSearchResults.style.display = 'none';
        if (tifluxClientSearch) tifluxClientSearch.value = '';
    }

    // Busca interna e renderização de postos
    const internalSearch = document.getElementById('internalClientSearch');
    if (internalSearch) {
        internalSearch.addEventListener('input', (e) => renderCurrentNetworkClients(e.target.value));
    }

    window.renderCurrentNetworkClients = function(query = '') {
        const listContainer = document.getElementById('networkClientsList');
        const countSpan = document.getElementById('networkClientsCount');
        if (!listContainer) return;

        if (countSpan) countSpan.textContent = currentNetworkClients.length;

        const filtered = query 
            ? currentNetworkClients.filter(c => {
                const name = typeof c === 'string' ? c : c.name;
                return name.toLowerCase().includes(query.toLowerCase());
            })
            : currentNetworkClients;

        if (filtered.length === 0) {
            listContainer.innerHTML = `<p style="color: var(--text-muted); text-align: center; padding: 1rem; font-size: 0.8rem;">${query ? 'Nenhum posto encontrado na busca.' : 'Nenhum posto adicionado.'}</p>`;
            return;
        }

        let html = '';
        filtered.sort((a, b) => {
            const nameA = typeof a === 'string' ? a : a.name;
            const nameB = typeof b === 'string' ? b : b.name;
            return nameA.localeCompare(nameB);
        }).forEach(client => {
            const name = typeof client === 'string' ? client : client.name;
            const isActive = typeof client === 'string' ? true : (client.active !== false);
            
            html += `
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); opacity: ${isActive ? '1' : '0.5'};">
                    <span style="color: var(--text-primary); font-size: 0.85rem; font-weight: 500; text-decoration: ${isActive ? 'none' : 'line-through'};">${name}</span>
                    <button type="button" onclick="toggleClientStatus('${name.replace(/'/g, "\\'")}')" 
                        style="background: none; border: none; color: ${isActive ? 'var(--status-critical)' : 'var(--status-normal)'}; cursor: pointer; padding: 4px; border-radius: 4px; display: flex; align-items: center; transition: background 0.2s;"
                        title="${isActive ? 'Inativar Posto' : 'Reativar Posto'}">
                        ${isActive ? 
                            '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><line x1="9" x2="15" y1="9" y2="15"/><line x1="15" x2="9" y1="9" y2="15"/></svg>' : 
                            '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
                        }
                    </button>
                </div>
            `;
        });
        listContainer.innerHTML = html;
    }

    window.toggleClientStatus = function(name) {
        const index = currentNetworkClients.findIndex(c => (typeof c === 'string' ? c : c.name) === name);
        if (index !== -1) {
            const client = currentNetworkClients[index];
            if (typeof client === 'string') {
                currentNetworkClients[index] = { name: client, active: false };
            } else {
                client.active = !client.active;
            }
            renderCurrentNetworkClients(document.getElementById('internalClientSearch')?.value || '');
        }
    }

    window.removeClientFromNetwork = function(name) {
        // Agora inativamos em vez de remover completamente se já estiver no banco? 
        // O usuário disse: "não pode ter a opção de excluir um posto na rede, somente incluir, editar e inativar"
        // Vou manter a função caso queira remover antes de salvar, mas no render troquei para toggleClientStatus
        console.log("Remoção completa desabilitada pela nova regra de Inativação.");
        toggleClientStatus(name);
    }
}

window.sendNetworkReport = async function(networkId) {
    const network = networks.find(n => n.id === networkId);
    if (!network) return;

    if (!network.reportEmail) {
        showToast('Esta rede não possui e-mail de relatório cadastrado.', 'warning');
        return;
    }

    showConfirmModal(
        'Enviar Relatório',
        `Deseja enviar o relatório de demandas abertas para o e-mail: ${network.reportEmail}?`,
        async () => {
            showToast('Gerando e enviando relatório...');

            try {
                const response = await fetch('/api/send-network-report', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ networkId: networkId })
                });

                const result = await response.json();
                if (result.success) {
                    showToast('Relatório enviado com sucesso!', 'success');
                } else {
                    showToast('Erro ao enviar relatório: ' + (result.error || 'Erro desconhecido'), 'critical');
                }
            } catch (error) {
                console.error('Erro ao disparar relatório:', error);
                showToast('Erro de conexão com o servidor.', 'critical');
            }
        }
    );
}

function renderUserAdminList() {
    const listContainer = document.getElementById('userAdminList');
    if (!listContainer) return;

    if (customUsers.length === 0) {
        listContainer.innerHTML = '<div style="color: var(--text-secondary); text-align: center; padding: 2rem;">Nenhum usuário extra cadastrado ainda.</div>';
        return;
    }

    let html = '';
    customUsers.forEach(u => {
        const isAdminBadge = u.isAdmin ? `<span class="sync-badge updated" style="margin-left: 8px; font-size: 0.6rem;">ADMIN</span>` : '';
        const initials = u.name ? u.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '??';

        html += `
            <div class="user-card">
                <div style="display: flex; align-items: center;">
                    <div class="user-avatar">${initials}</div>
                    <div>
                        <div style="display: flex; align-items: center;">
                            <span style="color: var(--text-primary); font-weight: 600; font-size: 0.95rem;">${u.name}</span>
                            ${isAdminBadge}
                        </div>
                        <span style="color: var(--text-muted); font-size: 0.8rem;">${u.email}</span>
                    </div>
                </div>
                <div style="display: flex; gap: 4px;">
                    <button class="action-btn edit" onclick="openEditUserModal('${u.id}')" title="Editar Usuário">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                    </button>
                    <button class="action-btn delete" onclick="deleteCustomUser('${u.id}')" title="Excluir Usuário">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                    </button>
                </div>
            </div>
        `;
    });
    listContainer.innerHTML = html;
}

window.openEditUserModal = function (id) {
    const user = customUsers.find(u => u.id === id);
    if (user) {
        document.getElementById('adminUserId').value = user.id;
        document.getElementById('adminUserName').value = user.name;
        document.getElementById('adminUserEmail').value = user.email;
        document.getElementById('adminUserPass').value = user.pass;
        document.getElementById('adminUserIsAdmin').checked = user.isAdmin || false;
        document.getElementById('adminUserIsClient').checked = user.isClient || false;
        document.getElementById('adminUserNetwork').value = user.userNetwork || '';

        // Change button text or title to indicate editing
        const submitBtn = userAdminForm.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.textContent = 'Atualizar Usuário';

        const formTitle = userAdminForm.previousElementSibling;
        if (formTitle) formTitle.textContent = 'Editar Usuário';
    }
};

const userAdminForm = document.getElementById('userAdminForm');
if (userAdminForm) {
    userAdminForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const id = document.getElementById('adminUserId').value;
        const name = document.getElementById('adminUserName').value.trim();
        const email = document.getElementById('adminUserEmail').value.trim().toLowerCase();
        const pass = document.getElementById('adminUserPass').value.trim();
        const isAdmin = document.getElementById('adminUserIsAdmin').checked;
        const isClient = document.getElementById('adminUserIsClient').checked;
        const userNetwork = document.getElementById('adminUserNetwork').value;

        if (!name || !email || !pass) return;

        const userData = {
            name: name,
            email: email,
            pass: pass,
            isAdmin: isAdmin,
            isClient: isClient,
            userNetwork: userNetwork
        };

        if (id) {
            // Update existing user
            db.collection('customUsers').doc(id).update(userData).then(() => {
                showToast('Usuário atualizado com sucesso!');
                resetUserForm();
            });
        } else {
            // Add new user
            db.collection('customUsers').add(userData).then(() => {
                showToast('Usuário cadastrado com sucesso!');
                resetUserForm();
            });
        }
    });

    function resetUserForm() {
        userAdminForm.reset();
        document.getElementById('adminUserId').value = '';

        const submitBtn = userAdminForm.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.textContent = 'Salvar Usuário';

        const formTitle = userAdminForm.previousElementSibling;
        if (formTitle) formTitle.textContent = 'Cadastrar Novo Usuário';
    }
}

// Lógica de Configurações de E-mail (NOVO)
const emailSettingsForm = document.getElementById('emailSettingsForm');
if (emailSettingsForm) {
    const btnUnlockSettings = document.getElementById('btnUnlockSettings');
    const emailSettingsFields = document.getElementById('emailSettingsFields');
    const btnSaveEmailSettings = document.getElementById('btnSaveEmailSettings');

    if (btnUnlockSettings) {
        btnUnlockSettings.addEventListener('click', () => {
            const isLocked = emailSettingsFields.hasAttribute('disabled');
            if (isLocked) {
                emailSettingsFields.removeAttribute('disabled');
                if (btnSaveEmailSettings) btnSaveEmailSettings.style.display = 'block';
                btnUnlockSettings.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Cancelar Edição';
                btnUnlockSettings.style.background = 'rgba(239, 68, 68, 0.1)';
                btnUnlockSettings.style.color = '#ef4444';
                btnUnlockSettings.style.borderColor = 'rgba(239, 68, 68, 0.2)';
            } else {
                emailSettingsFields.setAttribute('disabled', 'true');
                if (btnSaveEmailSettings) btnSaveEmailSettings.style.display = 'none';
                btnUnlockSettings.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Habilitar Edição';
                btnUnlockSettings.style.background = 'rgba(139, 92, 246, 0.1)';
                btnUnlockSettings.style.color = '#a78bfa';
                btnUnlockSettings.style.borderColor = 'rgba(139, 92, 246, 0.2)';
            }
        });
    }

    emailSettingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const smtpUser = document.getElementById('smtpUser').value.trim();
        showConfirmModal(
            'Salvar Configurações',
            `Deseja salvar as novas configurações de e-mail para ${smtpUser}?\n\nCERTIFIQUE-SE QUE OS DADOS ESTÃO CORRETOS PARA NÃO INTERROMPER A AUTOMAÇÃO.`,
            async () => {
                const settings = {
                    smtpHost: document.getElementById('smtpHost').value.trim(),
                    smtpPort: document.getElementById('smtpPort').value.trim(),
                    smtpUser: smtpUser,
                    smtpPass: document.getElementById('smtpPass').value.trim(),
                    smtpSecure: document.getElementById('smtpSecure').checked,
                    senderName: document.getElementById('senderName').value.trim(),
                    senderEmail: document.getElementById('senderEmail').value.trim(),
                    subjectTemplate: document.getElementById('emailSubject').value.trim(),
                    bodyTemplate: document.getElementById('emailBody').value.trim()
                };

                try {
                    await db.collection('settings').doc('email').set(settings);
                    showToast('Configurações de e-mail salvas!');

                    // Bloquear novamente após salvar
                    if (emailSettingsFields) emailSettingsFields.setAttribute('disabled', 'true');
                    if (btnSaveEmailSettings) btnSaveEmailSettings.style.display = 'none';
                    if (btnUnlockSettings) {
                        btnUnlockSettings.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Habilitar Edição';
                        btnUnlockSettings.style.background = 'rgba(139, 92, 246, 0.1)';
                        btnUnlockSettings.style.color = '#a78bfa';
                        btnUnlockSettings.style.borderColor = 'rgba(139, 92, 246, 0.2)';
                    }

                    loadEmailSettings(); // Recarrega para atualizar o badge
                } catch (error) {
                    console.error('Erro ao salvar config de e-mail:', error);
                    showToast('Erro ao salvar configurações.', 'critical');
                }
            }
        );
    });
}

const DEFAULT_EMAIL_SUBJECT = 'Chamado #{numero} ainda em análise - {cliente}';
const DEFAULT_EMAIL_BODY = `Olá {cliente},

Informamos que o seu chamado #{numero}, referente a "{descricao}", ainda encontra-se em fase de análise por nossa equipe técnica.

Previsão de conclusão: {vencimento}

Estamos trabalhando para finalizá-lo o mais breve possível. Qualquer dúvida, estamos à disposição.

Atentamente,
Equipe de Suporte @ GTHolding`;

async function loadEmailSettings() {
    try {
        const doc = await db.collection('settings').doc('email').get();
        if (doc.exists) {
            const data = doc.data();

            // Atualizar indicador de e-mail ativo
            const badge = document.getElementById('activeEmailBadge');
            const display = document.getElementById('activeEmailDisplay');
            if (badge && display && data.smtpUser) {
                display.textContent = data.smtpUser;
                badge.style.display = 'flex';
            }

            if (document.getElementById('smtpHost')) document.getElementById('smtpHost').value = data.smtpHost || '';
            if (document.getElementById('smtpPort')) document.getElementById('smtpPort').value = data.smtpPort || '587';
            if (document.getElementById('smtpUser')) document.getElementById('smtpUser').value = data.smtpUser || '';
            if (document.getElementById('smtpPass')) document.getElementById('smtpPass').value = data.smtpPass || '';
            if (document.getElementById('smtpSecure')) document.getElementById('smtpSecure').checked = data.smtpSecure || false;
            if (document.getElementById('senderName')) document.getElementById('senderName').value = data.senderName || '';
            if (document.getElementById('senderEmail')) document.getElementById('senderEmail').value = data.senderEmail || '';
            if (document.getElementById('emailSubject')) document.getElementById('emailSubject').value = data.subjectTemplate || DEFAULT_EMAIL_SUBJECT;
            if (document.getElementById('emailBody')) document.getElementById('emailBody').value = data.bodyTemplate || DEFAULT_EMAIL_BODY;
        } else {
            // Se não existir nada no banco, preenche apenas os templates padrão
            if (document.getElementById('emailSubject')) document.getElementById('emailSubject').value = DEFAULT_EMAIL_SUBJECT;
            if (document.getElementById('emailBody')) document.getElementById('emailBody').value = DEFAULT_EMAIL_BODY;
        }
    } catch (error) {
        console.error('Erro ao carregar config de e-mail:', error);
    }
}

window.deleteCustomUser = function (id) {
    showConfirmModal(
        'Remover Usuário',
        'Remover este usuário do acesso ao Portal?',
        () => {
            db.collection('customUsers').doc(id).delete().then(() => {
                showToast('Usuário removido.', 'critical');
            });
        },
        true // isCritical
    );
};

function checkAuth() {
    currentUser = localStorage.getItem(USER_STORAGE_KEY);
    const isAdminUser = localStorage.getItem('portalCS_isAdmin') === 'true';
    const isClientUser = localStorage.getItem('portalCS_isClient') === 'true';

    if (currentUser) {
        loginOverlay.classList.remove('active');
        sidebarFooter.style.display = 'block';
        currentUserName.textContent = currentUser;

        // Ocultar Abas se for Acesso Cliente (Restrito)
        const btnViewCS = document.getElementById('btnViewCS');
        const btnViewImplantacoes = document.getElementById('btnViewImplantacoes');
        const btnViewConcluidas = document.getElementById('btnViewConcluidas');
        const btnViewMaintenance = document.getElementById('btnViewCSMaintenance');
        const btnViewConfig = document.getElementById('btnViewConfig');

        // Novos botões para ocultar (Modo Leitura)
        const btnNewTask = document.getElementById('btnNewTask');
        const btnSyncTiFlux = document.getElementById('btnSyncTiFlux');
        const reportCardPreventivas = document.querySelector('.report-card.preventivas');

        if (isClientUser) {
            if (btnViewCS) btnViewCS.style.display = 'none';
            if (btnViewImplantacoes) btnViewImplantacoes.style.display = 'none';
            if (btnViewConcluidas) btnViewConcluidas.style.display = 'none';
            if (btnViewMaintenance) btnViewMaintenance.style.display = 'none';
            if (btnViewConfig) btnViewConfig.style.display = 'none';
            
            // Modo Leitura com Sincronização
            if (btnNewTask) btnNewTask.style.display = 'none';
            if (btnSyncTiFlux) btnSyncTiFlux.style.display = 'flex'; // Cliente PODE sincronizar
            if (reportCardPreventivas) reportCardPreventivas.style.display = 'none';

            // Se estiver em uma aba proibida, volta para Demandas
            const currentTab = document.querySelector('.nav-item.active')?.id;
            const prohibitedTabs = ['btnViewCS', 'btnViewImplantacoes', 'btnViewConcluidas', 'btnViewCSMaintenance', 'btnViewConfig'];
            if (prohibitedTabs.includes(currentTab)) {
                document.getElementById('btnViewDemandas')?.click();
            }
        } else {
            // Restaurar visibilidade para admins/users normais
            if (btnViewCS) btnViewCS.style.display = 'flex';
            if (btnViewImplantacoes) btnViewImplantacoes.style.display = 'flex';
            if (btnViewConcluidas) btnViewConcluidas.style.display = 'flex';
            if (btnViewMaintenance) btnViewMaintenance.style.display = 'flex';
            
            if (btnNewTask) btnNewTask.style.display = 'flex';
            if (btnSyncTiFlux) btnSyncTiFlux.style.display = 'flex';
            if (reportCardPreventivas) reportCardPreventivas.style.display = 'block';

            // Configurações tem regra própria de Admin
            const isMaster = ADMIN_USERS.some(adm => currentUser.toLowerCase().includes(adm.toLowerCase()));
            if (btnViewConfig) {
                btnViewConfig.style.display = (isAdminUser || isMaster) ? 'flex' : 'none';
            }
        }

    } else {
        loginOverlay.classList.add('active');
        sidebarFooter.style.display = 'none';
    }
}

loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = loginEmailInput.value.trim().toLowerCase();
    const pass = loginPassInput.value.trim();
    loginErrorMsg.style.display = 'none';

    if (email && pass) {
        // Validação Mestra (Fallback caso banco esteja vazio ou sem usuários configurados com email)
        if (email === 'admin@admin.com' && pass === 'admin') {
            localStorage.setItem(USER_STORAGE_KEY, 'Admin Master');
            localStorage.setItem('portalCS_isAdmin', 'true');
            loginEmailInput.value = '';
            loginPassInput.value = '';
            checkAuth();
            showToast(`Bem-vindo, Administrador!`);
            setTimeout(() => location.reload(), 1000);
            return;
        }

        // Validação conta o banco (customUsers)
        const validUser = customUsers.find(u => u.email === email && u.pass === pass);

        if (validUser) {
            localStorage.setItem(USER_STORAGE_KEY, validUser.name);
            localStorage.setItem('portalCS_isAdmin', validUser.isAdmin ? 'true' : 'false');
            localStorage.setItem('portalCS_isClient', validUser.isClient ? 'true' : 'false');
            localStorage.setItem('portalCS_network', validUser.userNetwork || '');
            loginEmailInput.value = '';
            loginPassInput.value = '';
            checkAuth();
            showToast(`Bem-vindo, ${validUser.name}!`);
            setTimeout(() => location.reload(), 1000);
        } else {
            loginErrorMsg.style.display = 'block';
        }
    }
});

btnLogout.addEventListener('click', () => {
    localStorage.removeItem(USER_STORAGE_KEY);
    localStorage.removeItem('portalCS_isAdmin');
    localStorage.removeItem('portalCS_isClient');
    localStorage.removeItem('portalCS_network');
    checkAuth();
    showToast('Sessão encerrada.');
    setTimeout(() => location.reload(), 1000);
});

// Helper para Filtragem por Rede (NOVO)
function getFilteredItems(items, type = 'demanda') {
    const isAdmin = localStorage.getItem('portalCS_isAdmin') === 'true';
    const userNetworkId = localStorage.getItem('portalCS_network');
    const userRole = localStorage.getItem(USER_STORAGE_KEY);
    const isClientUser = localStorage.getItem('portalCS_isClient') === 'true';

    // Victor e outros admins masters ignore tudo
    const isMaster = ADMIN_USERS.some(adm => userRole && userRole.toLowerCase().includes(adm.toLowerCase()));

    // Master Admins e Admin Global ignoram filtros
    if (isAdmin || isMaster) {
        return items;
    }

    // Se NÃO for admin/master, o filtro deve ser RIGOROSO
    if (!userNetworkId || networks.length === 0) {
        return []; // Enquanto não carregar a rede ou se não tiver rede, NÃO mostra nada
    }

    const network = networks.find(n => n.id === userNetworkId);
    if (!network || !network.clients || network.clients.length === 0) {
        return []; // Se a rede não foi encontrada ou não tem clientes, NÃO mostra nada (segurança)
    }

    const networkClients = network.clients
        .filter(c => typeof c === 'string' || c.active !== false)
        .map(c => (typeof c === 'string' ? c : c.name).toLowerCase());
        
    return items.filter(item => {
        const clientName = (type === 'cs' ? item.name : (type === 'implantacao' ? item.unidade || item.rede : item.cliente)) || '';
        return networkClients.some(nc => clientName.toLowerCase().includes(nc));
    });
}

// Modal Actions
function openModal() {
    const isClientUser = localStorage.getItem('portalCS_isClient') === 'true';
    if (isClientUser) {
        showToast('Acesso restrito: Apenas visualização.', 'warning');
        return;
    }

    taskForm.reset();
    document.getElementById('taskId').value = '';
    const today = new Date().toISOString().split('T')[0];
    const taskCreatedAtInput = document.getElementById('taskCreatedAt');
    if (taskCreatedAtInput) taskCreatedAtInput.value = today;

    // Auto-fill currentUser name for new forms if exists
    if (currentUser) {
        document.getElementById('taskResponsavel').value = currentUser;
    }

    // Clear new fields for new task
    document.getElementById('taskObs').value = '';
    document.getElementById('taskInfo').value = '';
    document.getElementById('taskHasUpdate').checked = false;

    if (btnResendEmail) btnResendEmail.style.display = 'none';
    if (emailStatusSelect) {
        emailStatusSelect.style.display = 'none';
        emailStatusSelect.value = 'Em andamento';
    }
    modal.classList.add('active');
}

function openEditModal(id) {
    const task = tasks.find(t => t.id === id);
    if (task) {
        // Se o chamado tinha uma flag de atualização automática e o usuário abriu, 
        // mas agora o controle é manual, vamos manter a flag se ela foi setada manualmente antes.
        // No entanto, para seguir o comportamento anterior de "limpar ao abrir", 
        // poderíamos desmarcar aqui, mas como adicionamos um toggle manual, 
        // talvez seja melhor deixar o usuário decidir.
        // Por via das dúvidas, vamos manter o comportamento de 'marcar como lido' apenas se não 
        // houver um 'info' importante (decisão de UX).
        
        // Para simplificar e atender o pedido: Vamos deixar o toggle conforme está no banco.

        // Se o chamado tinha uma flag de atualização, removemos agora que o usuário abriu
        if (task.hasUpdate) {
            db.collection('tasks').doc(task.id).update({ hasUpdate: false });
        }

        // Fallback extraction for older tasks stored without the new backend quality field
        let extractedQuality = task.quality || '';
        if (!extractedQuality && task.desc) {
            const qpMatch = task.desc.match(/\[?(?:qp|quality|an[áa]lise)(?:.*?-)?\s*(\d+)\]?/i);
            if (qpMatch) extractedQuality = qpMatch[1];
        }

        document.getElementById('taskId').value = task.id;
        document.getElementById('taskNumber').value = task.number;
        document.getElementById('taskQuality').value = extractedQuality;
        document.getElementById('taskCliente').value = task.cliente || '';
        document.getElementById('taskContato').value = task.contato || '';
        document.getElementById('taskSolicitante').value = task.solicitante || '';
        document.getElementById('taskResponsavel').value = task.responsavel || '';
        document.getElementById('taskPrioridade').value = task.prioridade || 'Normal';
        document.getElementById('taskDesc').value = task.desc;

        const taskCreatedAtInput = document.getElementById('taskCreatedAt');
        if (taskCreatedAtInput) {
            taskCreatedAtInput.value = task.createdAt || task.date || '';
        }

        document.getElementById('taskDate').value = task.date;
        document.getElementById('taskStatus').value = task.status;

        const taskObs = document.getElementById('taskObs');
        if (taskObs) taskObs.value = task.obs || '';
        document.getElementById('taskInfo').value = task.info || '';
        document.getElementById('taskHasUpdate').checked = task.hasUpdate || false;

        // Ocultar campos admin para clientes
        const isClientUser = localStorage.getItem('portalCS_isClient') === 'true';
        const infoCont = document.getElementById('infoFieldContainer');
        const updateCont = document.getElementById('updateFieldContainer');
        const submitBtn = taskForm.querySelector('button[type="submit"]');

        if (isClientUser) {
            if (infoCont) infoCont.style.display = 'none';
            if (updateCont) updateCont.style.display = 'none';
            if (submitBtn) submitBtn.style.display = 'none'; // Cliente não salva nada no modal
        } else {
            if (infoCont) infoCont.style.display = 'block';
            if (updateCont) updateCont.style.display = 'flex';
            if (submitBtn) submitBtn.style.display = 'block';
        }

        // Bloqueio geral para clientes (Read-only)
        const formElements = taskForm.querySelectorAll('input, select, textarea');
        formElements.forEach(el => {
            el.disabled = isClientUser;
        });

        if (btnResendEmail) {
            // Fallback para e-mail da rede se o e-mail do cliente estiver vazio
            const networkEmail = getNetworkEmailByClient(task.cliente);
            const effectiveEmail = networkEmail || task.clientEmail;
            const hasValidEmail = effectiveEmail && emailRegex.test(effectiveEmail);
            
            btnResendEmail.style.display = hasValidEmail ? 'block' : 'none';
            btnResendEmail.disabled = isClientUser || !hasValidEmail;
            if (isClientUser) {
                btnResendEmail.title = "Acesso restrito: Apenas visualização";
                btnResendEmail.style.opacity = '0.5';
                btnResendEmail.style.cursor = 'not-allowed';
            } else {
                btnResendEmail.title = "Reenviar E-mail";
                btnResendEmail.style.opacity = '1';
                btnResendEmail.style.cursor = 'pointer';
            }

            if (emailStatusSelect) {
                emailStatusSelect.style.display = hasValidEmail ? 'block' : 'none';
                emailStatusSelect.value = 'Em andamento';
                emailStatusSelect.disabled = isClientUser;
            }

            // Remove listener anterior para não acumular
            btnResendEmail.onclick = async () => {
                const updatedTask = tasks.find(t => t.id === task.id); 
                const networkEmail = getNetworkEmailByClient(updatedTask?.cliente);
                const emailVal = networkEmail || updatedTask?.clientEmail;

                btnResendEmail.disabled = true;
                btnResendEmail.innerHTML = 'Enviando...';

                try {
                    const response = await fetch('/api/send-overdue-emails', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            tasks: [{ 
                                ...updatedTask, 
                                force: true,
                                clientEmail: emailVal,
                                emailStatus: emailStatusSelect?.value || updatedTask?.status,
                                solicitante: document.getElementById('taskSolicitante')?.value || updatedTask?.solicitante,
                                info: document.getElementById('taskInfo')?.value || updatedTask?.info,
                                obs: document.getElementById('taskObs')?.value || updatedTask?.obs
                            }]
                        })
                    });

                    if (response.ok) {
                        const data = await response.json();
                        const result = data.results?.[0];
                        if (result?.success) {
                            showToast(`E-mail enviado para ${result.recipient || 'cliente'}!`);
                        } else {
                            showToast(`Erro no servidor: ${result?.error || 'Desconhecido'}`, 'critical');
                        }
                    } else {
                        const errData = await response.json().catch(() => ({}));
                        showToast(`Erro HTTP ${response.status}: ${errData.error || 'Falha no envio'}`, 'critical');
                    }
                } catch (e) {
                    console.error(e);
                    showToast('Erro de conexão.', 'critical');
                } finally {
                    btnResendEmail.disabled = false;
                    btnResendEmail.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg> Reenviar E-mail';
                }
            };
        }

        modal.classList.add('active');
    }
}

function closeModal() {
    modal.classList.remove('active');
}

btnNewTask.addEventListener('click', openModal);
btnCloseModal.addEventListener('click', closeModal);
btnCancelModal.addEventListener('click', closeModal);
modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
});

// Modal CS Actions
function openCsModal() {
    csForm.reset();
    document.getElementById('csId').value = '';

    // Set default dates to today for ease of use
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('csDateImpl').value = today;
    document.getElementById('csDateStart').value = today;
    document.getElementById('csDateLastContact').value = today;
    document.getElementById('csDateDue').value = '';

    document.getElementById('csReclamacoes').value = 'N';

    const csObs = document.getElementById('csObs');
    if (csObs) csObs.value = '';

    csModal.classList.add('active');
}

function openEditCsModal(id) {
    const client = csClients.find(c => c.id === id);
    if (client) {
        document.getElementById('csId').value = client.id;
        document.getElementById('csName').value = client.name;
        document.getElementById('csCnpj').value = client.cnpj || '';
        document.getElementById('csContact').value = client.contact;
        document.getElementById('csDateImpl').value = client.dateImpl;
        document.getElementById('csDateStart').value = client.dateStart;
        document.getElementById('csDateLastContact').value = client.dateLastContact || '';
        document.getElementById('csDateDue').value = client.dateDue || '';
        document.getElementById('csInteracao').value = client.interacao || '';
        document.getElementById('csGrow').value = client.grow || '';
        document.getElementById('csEngage').value = client.engage || '';
        document.getElementById('csReclamacoes').value = client.reclamacoes || 'N';
        document.getElementById('csAvaliacaoGrow').value = client.avaliacaoGrow || '';
        document.getElementById('csAvaliacaoEngage').value = client.avaliacaoEngage || '';

        const csObs = document.getElementById('csObs');
        if (csObs) csObs.value = client.obs || '';

        csModal.classList.add('active');
    }
}

function closeCsModal() {
    csModal.classList.remove('active');
}

btnNewCS.addEventListener('click', openCsModal);
btnCloseCsModal.addEventListener('click', closeCsModal);
btnCancelCsModal.addEventListener('click', closeCsModal);
csModal.addEventListener('click', (e) => {
    if (e.target === csModal) closeCsModal();
});

// Modal Implantações Actions
function openImplantationModal(id = null) {
    implantationForm.reset();
    document.getElementById('impId').value = '';

    if (id) {
        const imp = implantacoes.find(i => i.id === id);
        if (imp) {
            document.getElementById('impRede').value = imp.rede || '';
            document.getElementById('impUnidade').value = imp.unidade || '';
            document.getElementById('impCnpj').value = imp.cnpj || '';
            document.getElementById('impPrevisao').value = imp.previsao || '';
            document.getElementById('impTipo').value = imp.tipo || '';
            document.getElementById('impContrato').value = imp.contrato || '';
            document.getElementById('impImplantador').value = imp.implantador || '';
            document.getElementById('impStatus').value = imp.status || '';
            document.getElementById('impQualidade').value = imp.qualidade || '';
            document.getElementById('impObs').value = imp.obs || '';

            implantationModal.querySelector('h2').textContent = 'Editar Implantação';
        }
    } else {
        implantationModal.querySelector('h2').textContent = 'Cadastrar Implantação';
    }

    implantationModal.classList.add('active');
}

function closeImplantationModal() {
    implantationModal.classList.remove('active');
}

if (btnNewImplantation) btnNewImplantation.addEventListener('click', () => openImplantationModal());
if (btnCloseImplantationModal) btnCloseImplantationModal.addEventListener('click', closeImplantationModal);
if (btnCancelImplantationModal) btnCancelImplantationModal.addEventListener('click', closeImplantationModal);
if (implantationModal) implantationModal.addEventListener('click', (e) => {
    if (e.target === implantationModal) closeImplantationModal();
});

// Save Implantação
if (implantationForm) {
    implantationForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const id = document.getElementById('impId').value || Date.now().toString();
        const data = {
            rede: document.getElementById('impRede').value.trim(),
            unidade: document.getElementById('impUnidade').value.trim(),
            cnpj: document.getElementById('impCnpj').value.trim(),
            previsao: document.getElementById('impPrevisao').value,
            tipo: document.getElementById('impTipo').value,
            contrato: document.getElementById('impContrato').value,
            implantador: document.getElementById('impImplantador').value.trim(),
            status: document.getElementById('impStatus').value.trim(),
            qualidade: document.getElementById('impQualidade').value.trim(),
            obs: document.getElementById('impObs').value.trim()
        };

        db.collection('implantacoes').doc(id).set(data, { merge: true }).then(() => {
            showToast('Implantação salva com sucesso!');
            closeImplantationModal();
        }).catch(err => {
            console.error('Erro ao salvar implantação:', err);
            showToast('Erro ao salvar no banco.', 'critical');
        });
    });
}

// Toast Notification
function showToast(message, type = 'success') {
    toast.textContent = message;
    toast.style.backgroundColor = type === 'success' ? 'var(--status-normal)' : 'var(--status-critical)';
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Save Task (Demandas)
taskForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const isClientUser = localStorage.getItem('portalCS_isClient') === 'true';
    if (isClientUser) {
        showToast('Acesso restrito: Clientes não podem criar ou alterar demandas.', 'warning');
        return;
    }

    const id = document.getElementById('taskId').value || Date.now().toString();
    const number = document.getElementById('taskNumber').value;
    const quality = document.getElementById('taskQuality').value;
    const cliente = document.getElementById('taskCliente').value;
    const contato = document.getElementById('taskContato').value;
    const solicitante = document.getElementById('taskSolicitante').value;
    const responsavel = document.getElementById('taskResponsavel').value;
    const prioridade = document.getElementById('taskPrioridade').value;
    const desc = document.getElementById('taskDesc').value;

    // Safety check just in case index.html was slow to load or not cached correctly
    const createdAtInput = document.getElementById('taskCreatedAt');
    const createdAt = createdAtInput ? createdAtInput.value : (document.getElementById('taskDate').value);

    const date = document.getElementById('taskDate').value;
    const status = document.getElementById('taskStatus').value;
    const obs = document.getElementById('taskObs').value;
    const info = document.getElementById('taskInfo').value;
    const hasUpdate = document.getElementById('taskHasUpdate').checked;

    const isNew = !document.getElementById('taskId').value;

    if (isNew) {
        const finalResponsavel = responsavel || currentUser;
        const taskDataNew = { id, number, quality, cliente, contato, solicitante, responsavel: finalResponsavel, prioridade, desc, createdAt, date, status, obs, info, hasUpdate, slaUpdated: true, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
        db.collection('tasks').doc(taskDataNew.id).set(taskDataNew).then(() => {
            showToast('Demanda criada com sucesso!');
        });
    } else {
        const taskObj = tasks.find(t => t.id === id) || {};
        const updatedTask = { ...taskObj, number, quality, cliente, contato, solicitante, responsavel, prioridade, desc, createdAt, date, status, obs, info, hasUpdate, slaUpdated: true, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
        db.collection('tasks').doc(id).set(updatedTask).then(() => {
            showToast('Demanda atualizada!');
        });
    }

    closeModal();
});

// Save CS Client
function calculateCSRisk(clientData) {
    let riskPoints = 0;

    // Interacao logic
    if (clientData.interacao === 'Resistência') riskPoints += 3;
    else if (clientData.interacao === 'Baixo') riskPoints += 1;

    // Grow logic
    if (clientData.grow === 'Estagnado/Sem contato') riskPoints += 2;

    // Engage logic
    if (clientData.engage === 'Em risco') riskPoints += 3;
    else if (clientData.engage === 'Neutro') riskPoints += 1;

    // Reclamacoes
    if (clientData.reclamacoes === 'S') riskPoints += 3;

    // Avaliacoes
    const avGrow = parseInt(clientData.avaliacaoGrow);
    if (!isNaN(avGrow)) {
        if (avGrow <= 1) riskPoints += 2;
        else if (avGrow === 2) riskPoints += 1;
    }

    const avEngage = parseInt(clientData.avaliacaoEngage);
    if (!isNaN(avEngage)) {
        if (avEngage <= 1) riskPoints += 2;
        else if (avEngage === 2) riskPoints += 1;
    }

    if (riskPoints >= 5 || clientData.engage === 'Em risco' || clientData.interacao === 'Resistência') {
        return 'Alto';
    } else if (riskPoints >= 3) {
        return 'Médio';
    } else {
        return 'Baixo';
    }
}

csForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const id = document.getElementById('csId').value || Date.now().toString();
    const name = document.getElementById('csName').value;
    const cnpj = document.getElementById('csCnpj').value;
    const contact = document.getElementById('csContact').value;
    const dateImpl = document.getElementById('csDateImpl').value;
    const dateStart = document.getElementById('csDateStart').value;
    const dateLastContact = document.getElementById('csDateLastContact').value;
    const dateDue = document.getElementById('csDateDue').value;

    const interacao = document.getElementById('csInteracao').value;
    const grow = document.getElementById('csGrow').value;
    const engage = document.getElementById('csEngage').value;
    const reclamacoes = document.getElementById('csReclamacoes').value;
    const avaliacaoGrow = document.getElementById('csAvaliacaoGrow').value;
    const avaliacaoEngage = document.getElementById('csAvaliacaoEngage').value;

    const obs = document.getElementById('csObs').value;

    const isNew = !document.getElementById('csId').value;

    const clientData = {
        id, name, cnpj, contact, dateImpl, dateStart,
        dateLastContact, dateDue, interacao, grow, engage,
        reclamacoes, avaliacaoGrow, avaliacaoEngage, obs
    };

    clientData.risk = calculateCSRisk(clientData);

    if (isNew) {
        db.collection('csClients').doc(clientData.id).set(clientData).then(() => {
            showToast('Cliente CS cadastrado com sucesso!');
        });
    } else {
        db.collection('csClients').doc(id).set(clientData).then(() => {
            showToast('Cliente CS atualizado!');
        });
    }

    closeCsModal();
});

// Relatórios (Geração de PDF)
const btnGeneratePDF = document.getElementById('btnGeneratePDF');
if (btnGeneratePDF) {
    btnGeneratePDF.addEventListener('click', () => {
        const reportMonth = document.getElementById('reportMonth').value;
        const reportSLAFilter = document.getElementById('reportSLAFilter').value;
        const reportTypeFilter = document.getElementById('reportTypeFilter').value;

        // Se for filtro de concluídas, o mês é obrigatório para evitar relatórios gigantes
        const isClosedOnly = ['all', 'ontime', 'overdue'].includes(reportSLAFilter);
        if (!reportMonth && isClosedOnly) {
            alert("Por favor, selecione o 'Mês de Referência' para gerar relatórios de demandas concluídas.");
            return;
        }

        // Filtra as tarefas baseadas nos critérios da tela de relatórios
        let reportData = getFilteredItems(tasks).filter(t => {
            // 0. Filtro de Cliente (Novo)
            const selectedCheckboxes = document.querySelectorAll('.report-client-checkbox:checked');
            if (selectedCheckboxes.length > 0) {
                const selectedClients = Array.from(selectedCheckboxes).map(cb => cb.value);
                if (!selectedClients.includes(t.cliente || 'Sem Cliente')) return false;
            }

            // 1. Filtro de Tipo de Demanda
            if (reportTypeFilter === 'demandas_all') {
                if (t.status.includes('Preventiva')) return false;
            } else if (reportTypeFilter !== 'all') {
                // Normaliza para comparação (remove acentos para evitar Analise vs Análise)
                const normalize = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
                if (!normalize(t.status).includes(normalize(reportTypeFilter))) return false;
            }

            // 2. Filtro de Status / SLA
            const isConcluida = t.status.includes('Concluida');

            if (reportSLAFilter === 'open_all') {
                if (isConcluida) return false;
            } else if (reportSLAFilter === 'open_overdue') {
                if (isConcluida) return false;
                const sla = checkSLA(t.date);
                if (sla.text !== 'Vencido' && sla.text !== 'Vence Hoje') return false;
            } else if (reportSLAFilter === 'both') {
                // Tudo: não filtra por status
            } else {
                // all, ontime, overdue
                if (!isConcluida) return false;
                if (reportSLAFilter !== 'all') {
                    const sla = checkSLA(t.date);
                    if (reportSLAFilter === 'ontime' && (sla.text === 'Vencido' || sla.text === 'Vence Hoje')) return false;
                    if (reportSLAFilter === 'overdue' && sla.text === 'No prazo') return false;
                }
            }

            // 3. Filtro de Mês (Opcional para Abertas, Prioriza Data de Fechamento para Concluídas)
            if (reportMonth) {
                // Se for "Abertas e Atrasadas", ignoramos o filtro de mês para mostrar TUDO que está atrasado hoje
                if (reportSLAFilter === 'open_overdue') {
                    // ignora filtro de mês
                } else {
                    const targetDate = isConcluida ? (t.closedAt || t.date) : (t.createdAt || t.date);
                    if (!targetDate || !targetDate.startsWith(reportMonth)) return false;
                }
            }

            return true;
        });

        if (reportData.length === 0) {
            alert("Nenhuma demanda encontrada com estes filtros para exportação.");
            return;
        }

        const reportFormat = document.getElementById('reportFormat')?.value || 'simplified';

        // Mapeamento de labels amigáveis para o PDF
        const slaLabels = {
            'both': 'Tudo (Abertas + Concluídas)',
            'open_all': 'Apenas Abertas',
            'open_overdue': 'Abertas e Atrasadas',
            'all': 'Apenas Concluídas',
            'ontime': 'Concluídas No Prazo',
            'overdue': 'Concluídas Atrasadas'
        };
        const typeLabels = {
            'demandas_all': 'Geral (sem Prev.)',
            'Análise': 'Análise',
            'QP - Melhoria': 'QP - Melhoria',
            'QP - Correção': 'QP - Correção',
            'Adhoc': 'Adhoc',
            'all': 'Tudo (incluindo Prev.)'
        };

        const labelSLA = slaLabels[reportSLAFilter] || reportSLAFilter;
        const labelType = typeLabels[reportTypeFilter] || reportTypeFilter;

        // Configuração jsPDF
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape'); // Orientação Paisagem

        // Capturar nomes dos clientes filtrados para o título
        const selectedCheckboxes = document.querySelectorAll('.report-client-checkbox:checked');
        let clientTitle = 'Todos os Clientes';
        if (selectedCheckboxes.length > 0) {
            const names = Array.from(selectedCheckboxes).map(cb => cb.value);
            clientTitle = names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} e +${names.length - 3}`;
        }

        // Função de sanitização robusta para evitar caracteres estranhos no PDF (jsPDF standard fonts)
        const sanitizeForPDF = (str) => {
            if (!str) return '';
            // Substitui caracteres acentuados comuns por versões sem acento para máxima compatibilidade
            return String(str)
                .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove acentos
                .replace(/[^\x20-\x7E]/g, ''); // Mantém apenas ASCII visível (32-126)
        };

        doc.setFontSize(18);
        doc.text("Relatorio de Demandas - PortalCS", 14, 15);
        doc.setFontSize(11);
        doc.text(`Tipo: ${sanitizeForPDF(labelType)} | Filtro: ${sanitizeForPDF(labelSLA)} | Periodo: ${reportMonth || 'Abertas'}`, 14, 23);
        doc.text(`Clientes: ${sanitizeForPDF(clientTitle)} | Formato: ${reportFormat === 'simplified' ? 'Simplificado' : 'Analitico'} | Total: ${reportData.length}`, 14, 29);

        // Preparar Dados da Tabela baseados no formato
        let tableColumn, tableRows, tableStyles;

        if (reportFormat === 'analytical') {
            tableColumn = ["Demanda / TiFlux #", "Detalhes (Cliente / Resp / Venc)", "Descricao / Descritivo"];
            tableRows = reportData.map(t => {
                const details = `Cliente: ${t.cliente || 'Desconhecido'}\nResp: ${t.responsavel || '-'}\nVenc: ${formatDate(t.date)}\nPrior: ${t.prioridade || 'Normal'}`;
                return [
                    `${sanitizeForPDF(t.status)}\n#${t.number || 'N/A'}`,
                    sanitizeForPDF(details),
                    sanitizeForPDF(t.desc || 'Sem descricao informada')
                ];
            });
            tableStyles = { 
                fontSize: 9, 
                cellPadding: 4,
                columnStyles: {
                    0: { cellWidth: 40 },
                    1: { cellWidth: 55 },
                    2: { cellWidth: 'auto' }
                }
            };
        } else {
            tableColumn = ["Status", "TiFlux #", "Cliente / Posto", "Responsavel", "Vencimento", "Prioridade"];
            tableRows = reportData.map(t => [
                sanitizeForPDF(t.status),
                t.number || 'N/A',
                sanitizeForPDF(t.cliente || 'Desconhecido'),
                sanitizeForPDF(t.responsavel || '-'),
                formatDate(t.date),
                sanitizeForPDF(t.prioridade || 'Normal')
            ]);
            tableStyles = { fontSize: 10, cellPadding: 3 };
        }

        // Desenhar a Tabela Usando AutoTable
        doc.autoTable({
            head: [tableColumn],
            body: tableRows,
            startY: 35,
            theme: 'striped',
            headStyles: { fillColor: [139, 92, 246], fontStyle: 'bold' }, // Tom de roxo
            styles: tableStyles,
            alternateRowStyles: { fillColor: [248, 248, 250] },
            margin: { left: 14, right: 14 },
            didDrawPage: (data) => {
                const str = "Pagina " + doc.internal.getNumberOfPages();
                const now = new Date().toLocaleDateString('pt-BR');
                doc.setFontSize(8);
                doc.setTextColor(150);
                doc.text(`Gerado em ${now} | Portal de Demandas GTHolding`, data.settings.margin.left, doc.internal.pageSize.height - 10);
                doc.text(str, doc.internal.pageSize.width - data.settings.margin.right - 10, doc.internal.pageSize.height - 10);
            }
        });

        // Save PDF
        doc.save(`relatorio_${reportFormat}_${reportSLAFilter}_${reportMonth || 'hoje'}.pdf`);
        showToast("PDF Gerado com Sucesso!");
    });
}

// Relatório de Preventivas (PDF)
const btnGeneratePreventivasPDF = document.getElementById('btnGeneratePreventivasPDF');
if (btnGeneratePreventivasPDF) {
    btnGeneratePreventivasPDF.addEventListener('click', () => {
        const filterVal = document.getElementById('reportPreventivaFilter').value;
        const preventivasByClient = {};

        // Coletar dados de preventivas (similar à lógica da aba de preventivas)
        getFilteredItems(tasks).forEach(task => {
            if (task.status.includes('Preventiva')) {
                const clientName = task.cliente || 'Sem Cliente';
                if (!preventivasByClient[clientName]) {
                    preventivasByClient[clientName] = [];
                }
                preventivasByClient[clientName].push(task);
            }
        });

        const clients = Object.keys(preventivasByClient).sort();
        const reportRows = [];

        const sanitizeForPDF = (str) => {
            if (!str) return '';
            return String(str).replace(/[^\x00-\xFF]/g, '');
        };


        clients.forEach(clientName => {
            const clientTasks = preventivasByClient[clientName].sort((a, b) => {
                const dateA = new Date(a.closedAt || a.createdAt || a.date || '1970-01-01');
                const dateB = new Date(b.closedAt || b.createdAt || b.date || '1970-01-01');
                return dateB - dateA;
            });

            const lastTask = clientTasks[0];
            let badgeClass = 'No Prazo';
            let proxPreventiva = '-';

            if (lastTask.closedAt) {
                const closedDate = new Date(lastTask.closedAt + 'T12:00:00');
                closedDate.setDate(closedDate.getDate() + 90);
                proxPreventiva = `${String(closedDate.getDate()).padStart(2, '0')}/${String(closedDate.getMonth() + 1).padStart(2, '0')}/${closedDate.getFullYear()}`;

                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const diff = closedDate - today;
                const daysToMaintenance = Math.ceil(diff / (1000 * 60 * 60 * 24));

                if (daysToMaintenance <= 0) badgeClass = 'Vencida';
                else if (daysToMaintenance <= 15) badgeClass = 'Proxima (15d)';
            } else {
                badgeClass = 'Em Aberto';
                proxPreventiva = 'Pendente';
            }

            // Aplicar Filtro do Relatório
            if (filterVal === 'vencidas' && badgeClass !== 'Vencida') return;
            if (filterVal === 'perto' && badgeClass !== 'Proxima (15d)') return;

            reportRows.push([
                sanitizeForPDF(clientName),
                sanitizeForPDF(lastTask.responsavel || '-'),
                formatDate(lastTask.closedAt),
                proxPreventiva,
                badgeClass
            ]);
        });

        if (reportRows.length === 0) {
            alert("Nenhuma preventiva encontrada para exportação com estes filtros.");
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape');
        doc.setFontSize(18);
        doc.text("Relatório de Status de Preventivas", 14, 15);
        doc.setFontSize(11);
        doc.text(`Filtro: ${filterVal === 'all' ? 'Todas' : (filterVal === 'vencidas' ? 'Apenas Vencidas' : 'Próximas 15 dias')}`, 14, 23);

        doc.autoTable({
            head: [["Cliente / Posto", "Últ. Responsável", "Últ. Realizada", "Próxima Visita", "Status"]],
            body: reportRows,
            startY: 35,
            theme: 'striped',
            headStyles: { fillColor: [16, 185, 129], fontStyle: 'bold' }, // Verde para preventivas
            styles: { fontSize: 9, cellPadding: 2.5 },
            alternateRowStyles: { fillColor: [240, 253, 244] },
            didDrawPage: function (data) {
                const str = "Página " + doc.internal.getNumberOfPages();
                const now = new Date().toLocaleDateString('pt-BR');
                doc.setFontSize(8);
                doc.setTextColor(150);
                doc.text(`Gerado em ${now} | Portal de Demandas GTHolding`, data.settings.margin.left, doc.internal.pageSize.height - 10);
                doc.text(str, doc.internal.pageSize.width - data.settings.margin.right - 15, doc.internal.pageSize.height - 10);
            }
        });

        doc.save(`relatorio_preventivas_${filterVal}.pdf`);
        showToast("Relatório de Preventivas Gerado!");
    });
}

// Relatório de CS (PDF)
const btnGenerateCSPDF = document.getElementById('btnGenerateCSPDF');
if (btnGenerateCSPDF) {
    btnGenerateCSPDF.addEventListener('click', () => {
        const filterVal = document.getElementById('reportCSFilter').value;
        const reportRows = [];

        const sanitizeForPDF = (str) => {
            if (!str) return '';
            return String(str).replace(/[^\x00-\xFF]/g, '');
        };

        getFilteredItems(csClients, 'cs').forEach(client => {
            const risk = client.risk || 'Baixo';

            // Filtro
            if (filterVal === 'alto' && risk !== 'Alto') return;
            if (filterVal === 'medio' && risk !== 'Médio' && risk !== 'Medio') return;

            reportRows.push([
                sanitizeForPDF(client.name),
                sanitizeForPDF(client.interacao || '-'),
                sanitizeForPDF(client.grow || '-'),
                sanitizeForPDF(client.engage || '-'),
                sanitizeForPDF(risk)
            ]);
        });

        if (reportRows.length === 0) {
            alert("Nenhum cliente CS encontrado para exportação.");
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF(); // Retrato para CS parece ok
        doc.setFontSize(18);
        doc.text("Relatório de Saúde Customer Success", 14, 15);
        doc.setFontSize(11);
        doc.text(`Filtrando por Risco: ${filterVal === 'all' ? 'Todos' : filterVal}`, 14, 23);

        doc.autoTable({
            head: [["Cliente", "Interação", "CS Grow", "CS Engage", "Índice de Risco"]],
            body: reportRows,
            startY: 35,
            theme: 'striped',
            headStyles: { fillColor: [139, 92, 246], fontStyle: 'bold' }, // Roxo
            styles: { fontSize: 9, cellPadding: 2.5 },
            alternateRowStyles: { fillColor: [245, 247, 250] },
            didDrawPage: function (data) {
                const str = "Página " + doc.internal.getNumberOfPages();
                const now = new Date().toLocaleDateString('pt-BR');
                doc.setFontSize(8);
                doc.setTextColor(150);
                doc.text(`Gerado em ${now} | Portal de Demandas GTHolding`, data.settings.margin.left, doc.internal.pageSize.height - 10);
                doc.text(str, doc.internal.pageSize.width - data.settings.margin.right - 15, doc.internal.pageSize.height - 10);
            }
        });

        doc.save(`relatorio_saude_cs_${filterVal}.pdf`);
        showToast("Relatório de CS Gerado!");
    });
}

// Relatório de Implantações (PDF)
const btnGenerateImplantacoesPDF = document.getElementById('btnGenerateImplantacoesPDF');
if (btnGenerateImplantacoesPDF) {
    btnGenerateImplantacoesPDF.addEventListener('click', () => {
        const monthFilter = document.getElementById('reportImplantationMonth').value;
        const statusFilter = document.getElementById('reportImplantationFilter').value;
        const reportRows = [];

        if (!monthFilter) {
            alert("Por favor, selecione um mês de referência.");
            return;
        }

        const sanitizeForPDF = (str) => {
            if (!str) return '';
            return String(str).replace(/[^\x00-\xFF]/g, '');
        };


        // Filtrar implantações
        getFilteredItems(implantacoes, 'implantacao').forEach(imp => {
            // Filtro de Mês (previsao: "YYYY-MM-DD")
            if (imp.previsao && !imp.previsao.startsWith(monthFilter)) return;

            // Filtro de Status
            const status = (imp.status || 'Pendente').toLowerCase();
            if (statusFilter === 'pendente' && status === 'concluido') return;
            if (statusFilter === 'concluido' && status !== 'concluido') return;

            reportRows.push([
                sanitizeForPDF(imp.rede || '-'),
                sanitizeForPDF(imp.unidade || '-'),
                sanitizeForPDF(imp.cnpj || '-'),
                formatDate(imp.previsao),
                sanitizeForPDF(imp.tipo || '-'),
                sanitizeForPDF(imp.contrato || '-'),
                sanitizeForPDF(imp.implantador || '-'),
                sanitizeForPDF(imp.status || 'Pendente'),
                sanitizeForPDF(imp.qualidade || '-'),
                sanitizeForPDF(imp.obs || '-')
            ]);
        });

        if (reportRows.length === 0) {
            alert("Nenhuma implantação encontrada para este mês/filtro.");
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape');
        doc.setFontSize(18);
        doc.setTextColor(13, 148, 136); // Emerald 700
        doc.text("Relatório de Implantações", 14, 15);

        doc.setFontSize(10);
        doc.setTextColor(100);
        const [y, m] = monthFilter.split('-');
        doc.text(`Mês de Referência: ${m}/${y} | Filtro: ${statusFilter === 'all' ? 'Todas' : (statusFilter === 'pendente' ? 'Pendentes' : 'Concluídas')}`, 14, 23);

        doc.autoTable({
            head: [["Rede", "Unidade", "CNPJ", "Previsão", "Tipo", "Contrato", "Implantador", "Status", "Quality", "Obs"]],
            body: reportRows,
            startY: 30,
            theme: 'striped',
            headStyles: { fillColor: [13, 148, 136], fontStyle: 'bold', fontSize: 8 },
            styles: { fontSize: 7, cellPadding: 2 },
            alternateRowStyles: { fillColor: [240, 253, 250] }, // Very light emerald
            didDrawPage: function (data) {
                const str = "Página " + doc.internal.getNumberOfPages();
                const now = new Date().toLocaleDateString('pt-BR');
                doc.setFontSize(8);
                doc.setTextColor(150);
                doc.text(`Gerado em ${now} | Portal de Demandas Globaltera`, data.settings.margin.left, doc.internal.pageSize.height - 10);
                doc.text(str, doc.internal.pageSize.width - data.settings.margin.right - 15, doc.internal.pageSize.height - 10);
            }
        });

        const fileName = `relatorio-implantacoes-${monthFilter.trim()}-${statusFilter.trim()}.pdf`;
        doc.save(fileName);
        showToast("Relatório de Implantações Gerado!");
    });
}




// Delete Task (Secured)
function deleteTask(id) {
    const isClientUser = localStorage.getItem('portalCS_isClient') === 'true';
    if (isClientUser) {
        showToast('Acesso restrito: Apenas visualização.', 'warning');
        return;
    }

    // Check if user is in hardcoded list
    const isHardcodedAdmin = ADMIN_USERS.includes(currentUser);
    // Check if user is in Firebase customUsers and has isAdmin == true
    const isCustomAdmin = customUsers.find(u => u.name === currentUser && u.isAdmin);

    if (!currentUser || (!isHardcodedAdmin && !isCustomAdmin)) {
        showAlertModal('Acesso Negado', 'Apenas administradores podem excluir demandas.');
        return;
    }

    showConfirmModal(
        'Excluir Demanda',
        'Tem certeza que deseja EXCLUIR esta demanda? Esta ação não pode ser desfeita.',
        () => {
            db.collection('tasks').doc(id).delete().then(() => {
                showToast('Demanda excluída!', 'critical');
            });
        },
        true // isCritical
    );
}

// Complete Task Trigger (Opens Modal)
let pendingCompleteTaskId = null;
let pendingCompleteNewStatus = null;

function completeTask(id, newStatus = null) {
    const isClientUser = localStorage.getItem('portalCS_isClient') === 'true';
    if (isClientUser) {
        showToast('Acesso restrito: Apenas visualização.', 'warning');
        return;
    }

    pendingCompleteTaskId = id;
    pendingCompleteNewStatus = newStatus;

    document.getElementById('resolveTaskId').value = id;
    document.getElementById('taskResolvedVersion').value = ''; // clear previous
    document.getElementById('taskResolvedValidator').value = ''; // clear previous
    document.getElementById('taskResolvedDesc').value = ''; // clear previous
    
    // Verificar e-mail do cliente para preenchimento automático
    const task = tasks.find(t => t.id === id);
    const recipient = task ? getNetworkEmailByClient(task.cliente) : '';
    const emailField = document.getElementById('taskResolvedEmail');
    const sendEmailCheckbox = document.getElementById('sendCompletionEmail');
    
    if (emailField) {
        emailField.value = recipient || '';
        if (recipient) {
            console.log(`[Email Prep] Preenchendo e-mail automático: ${recipient}`);
            if (sendEmailCheckbox) sendEmailCheckbox.checked = true;
        } else {
            console.log(`[Email Prep] Nenhum e-mail automático encontrado para o cliente: ${task ? task.cliente : 'N/A'}`);
            if (sendEmailCheckbox) sendEmailCheckbox.checked = false;
        }
    }

    if (document.getElementById('sendCompletionEmail')) {
        document.getElementById('sendCompletionEmail').checked = false;
    }
    resolveModal.classList.add('active');
}

function reopenTask(id) {
    const isClientUser = localStorage.getItem('portalCS_isClient') === 'true';
    if (isClientUser) {
        showToast('Acesso restrito: Apenas visualização.', 'warning');
        return;
    }

    const index = tasks.findIndex(t => t.id === id);
    if (index !== -1) {
        const task = { ...tasks[index] };
        
        // Remove " Concluida" ou " Concluída" do status
        const oldStatus = task.status;
        task.status = task.status.replace(' Concluida', '').replace(' Concluída', '');
        
        // Limpar dados de resolução se existirem
        delete task.resolvedVersion;
        delete task.resolvedValidator;
        delete task.resolvedDesc;
        delete task.closedAt;

        showConfirmModal(
            'Reabrir Demanda',
            `Deseja reabrir a demanda #${task.number}? Ela voltará para a coluna "${task.status}".`,
            () => {
                db.collection('tasks').doc(id).set(task).then(() => {
                    showToast('Demanda reaberta com sucesso!', 'success');
                    // Mudar para a aba de demandas se não estiver nela
                    switchView('demandas');
                });
            }
        );
    }
}

function closeResolveModal() {
    resolveModal.classList.remove('active');
    pendingCompleteTaskId = null;
    pendingCompleteNewStatus = null;
}

if (btnCloseResolveModal) btnCloseResolveModal.addEventListener('click', closeResolveModal);
if (btnCancelResolveModal) btnCancelResolveModal.addEventListener('click', closeResolveModal);
if (resolveModal) resolveModal.addEventListener('click', (e) => {
    if (e.target === resolveModal) closeResolveModal();
});

// Submit Resolve Form
resolveForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!pendingCompleteTaskId) return;

    const resolvedVersion = document.getElementById('taskResolvedVersion').value.trim();
    const resolvedValidator = document.getElementById('taskResolvedValidator').value.trim();
    const resolvedDesc = document.getElementById('taskResolvedDesc').value.trim();
    const id = pendingCompleteTaskId;
    const index = tasks.findIndex(t => t.id === id);

    if (index !== -1) {
        let finalStatus = pendingCompleteNewStatus;
        if (!finalStatus) {
            const currentStatus = tasks[index].status;
            if (currentStatus === 'Analise') finalStatus = 'Analise Concluida';
            else if (currentStatus === 'QP - Melhoria') finalStatus = 'QP - Melhoria Concluida';
            else if (currentStatus === 'QP - Correção') finalStatus = 'QP - Correção Concluida';
            else if (currentStatus === 'Adhoc') finalStatus = 'Adhoc Concluida';
            else finalStatus = 'Analise Concluida'; // Fallback
        }

        const taskObj = { ...tasks[index] }; // Garantir cópia para evitar problemas de referência
        taskObj.status = finalStatus;
        if (resolvedVersion) taskObj.resolvedVersion = resolvedVersion;
        if (resolvedValidator) taskObj.resolvedValidator = resolvedValidator;
        if (resolvedDesc) taskObj.resolvedDesc = resolvedDesc;

        const sendEmail = document.getElementById('sendCompletionEmail').checked;
        const recipient = document.getElementById('taskResolvedEmail').value.trim();

        db.collection('tasks').doc(taskObj.id).set(taskObj).then(() => {
            showToast('Demanda concluída com sucesso!', 'success');
            
            // Enviar e-mail se solicitado
            if (sendEmail && recipient) {
                fetch('/api/send-completion-email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ task: taskObj, recipient: recipient })
                })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        showToast(`E-mail de conclusão enviado para ${recipient}`);
                    } else {
                        console.error('Erro ao enviar e-mail:', data.error);
                        showToast('Erro ao enviar e-mail de conclusão.', 'warning');
                    }
                })
                .catch(err => {
                    console.error('Erro de rede ao enviar e-mail:', err);
                });
            } else if (sendEmail && !recipient) {
                showToast('Não foi possível encontrar o e-mail para envio da notificação.', 'warning');
            }

            // Mudar automaticamente para a aba de concluídas para mostrar o resultado
            switchView('concluidas');
        }).catch(err => {
            console.error('Erro ao concluir:', err);
            showToast('Erro ao salvar conclusão.', 'critical');
        });
    }

    closeResolveModal();
});

// SLA Logic (Color Coding)
function checkSLA(dateStr) {
    if (!dateStr) return { class: 'status-normal', badge: 'badge-normal', icon: '<circle cx="12" cy="12" r="10"/>' };

    // Parse the task date as UTC at midnight to match the input date correctly
    const [year, month, day] = dateStr.split('-');
    const taskDate = new Date(year, month - 1, day);

    const today = new Date();
    today.setHours(0, 0, 0, 0); // Ignore time for comparison

    const diffTime = taskDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) {
        // Overdue or Due Today (Vencido / Vence Hoje)
        return {
            class: 'status-critical',
            badge: 'badge-critical',
            icon: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
            text: diffDays === 0 ? 'Vence Hoje' : 'Vencido'
        };
    } else if (diffDays <= 3) {
        // Warning (3 days or less)
        return {
            class: 'status-warning',
            badge: 'badge-warning',
            icon: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
            text: `Faltam ${diffDays} dias`
        };
    } else {
        // Normal
        return {
            class: 'status-normal',
            badge: 'badge-normal',
            icon: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
            text: 'No prazo'
        };
    }
}

// View Toggle Logic
const btnViewDemandas = document.getElementById('btnViewDemandas');
const btnViewCS = document.getElementById('btnViewCS');
const btnViewConcluidas = document.getElementById('btnViewConcluidas');
const btnViewCSMaintenance = document.getElementById('btnViewCSMaintenance');
const btnViewRelatorios = document.getElementById('btnViewRelatorios');
const btnViewConfig = document.getElementById('btnViewConfig');

const demandasFilterBar = document.getElementById('demandasFilterBar');
const relatoriosBoard = document.getElementById('relatoriosBoard');
const configBoard = document.getElementById('configBoard');
const maintenanceBoard = document.getElementById('maintenanceBoard');

function switchView(viewName) {
    // Update active class on nav
    [btnViewDemandas, btnViewCS, btnViewConcluidas, btnViewCSMaintenance, btnViewRelatorios, btnViewConfig, btnViewImplantacoes].forEach(btn => {
        if (btn) btn.classList.remove('active');
    });

    // Ocultar tudo inicialmente
    if (btnNewTask) btnNewTask.style.display = 'none';
    if (btnNewCS) btnNewCS.style.display = 'none';
    if (btnNewImplantation) btnNewImplantation.style.display = 'none';
    if (kanbanBoard) kanbanBoard.style.display = 'none';
    if (csBoard) csBoard.style.display = 'none';
    if (implantacoesBoard) implantacoesBoard.style.display = 'none';
    if (relatoriosBoard) relatoriosBoard.style.display = 'none';
    if (configBoard) configBoard.style.display = 'none';
    if (maintenanceBoard) maintenanceBoard.style.display = 'none';
    if (demandasFilterBar) demandasFilterBar.style.display = 'none';

    if (viewName === 'demandas' && btnViewDemandas) {
        btnViewDemandas.classList.add('active');
        if (btnNewTask) btnNewTask.style.display = 'inline-flex';
        if (kanbanBoard) {
            kanbanBoard.style.display = 'flex';
            kanbanBoard.dataset.view = 'demandas';
        }
        if (demandasFilterBar) demandasFilterBar.style.display = 'flex';
        if (slaFilter) slaFilter.style.display = 'block';
    }
    else if (viewName === 'cs' && btnViewCS) {
        btnViewCS.classList.add('active');
        if (btnNewCS) btnNewCS.style.display = 'inline-flex';
        if (csBoard) csBoard.style.display = 'block';
        if (typeof renderCSBoard === 'function') renderCSBoard();
    }
    else if (viewName === 'implantacoes' && btnViewImplantacoes) {
        if (btnViewImplantacoes) btnViewImplantacoes.classList.add('active');
        if (btnNewImplantation) btnNewImplantation.style.display = 'inline-flex';
        if (implantacoesBoard) implantacoesBoard.style.display = 'block';
        if (typeof renderImplantacoesBoard === 'function') renderImplantacoesBoard();
    }
    else if (viewName === 'maintenance' && btnViewCSMaintenance) {
        btnViewCSMaintenance.classList.add('active');
        if (maintenanceBoard) maintenanceBoard.style.display = 'flex';
        if (typeof renderMaintenanceBoard === 'function') renderMaintenanceBoard();
    }
    else if (viewName === 'concluidas' && btnViewConcluidas) {
        btnViewConcluidas.classList.add('active');
        if (kanbanBoard) {
            kanbanBoard.style.display = 'flex';
            kanbanBoard.dataset.view = 'concluidas';
        }
        if (demandasFilterBar) demandasFilterBar.style.display = 'flex';
        if (slaFilter) slaFilter.style.display = 'none';
    }
    else if (viewName === 'relatorios' && btnViewRelatorios) {
        btnViewRelatorios.classList.add('active');
        relatoriosBoard.style.display = 'block';
    }
    else if (viewName === 'config' && btnViewConfig) {
        btnViewConfig.classList.add('active');
        configBoard.style.display = 'block';
        if (typeof renderUserAdminList === 'function') renderUserAdminList();
    }

    // Show/Hide Kanban columns based on view if Kanban is visible
    if (kanbanBoard.style.display !== 'none') {
        document.querySelectorAll('.kanban-column').forEach(col => {
            if (col.dataset.view === viewName) {
                col.style.display = 'flex';
            } else {
                col.style.display = 'none';
            }
        });
    }

    // DISPARAR RENDERIZAÇÃO IMEDIATA AO TROCAR DE ABA
    // Isso garante que os filtros de aba (concluídas vs abertas) sejam aplicados na hora.
    renderBoard();
}

if (btnViewDemandas) btnViewDemandas.addEventListener('click', (e) => { e.preventDefault(); switchView('demandas'); });
if (btnViewCS) btnViewCS.addEventListener('click', (e) => { e.preventDefault(); switchView('cs'); });
if (btnViewImplantacoes) btnViewImplantacoes.addEventListener('click', (e) => { e.preventDefault(); switchView('implantacoes'); });
if (btnViewCSMaintenance) btnViewCSMaintenance.addEventListener('click', (e) => { e.preventDefault(); switchView('maintenance'); });
if (btnViewConcluidas) btnViewConcluidas.addEventListener('click', (e) => { e.preventDefault(); switchView('concluidas'); });
if (btnViewRelatorios) btnViewRelatorios.addEventListener('click', (e) => { e.preventDefault(); switchView('relatorios'); });
if (btnViewConfig) btnViewConfig.addEventListener('click', (e) => { e.preventDefault(); switchView('config'); });

// Render Board
function renderBoard() {
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    const slaFilterValue = slaFilter ? slaFilter.value : 'all';
    const isClientUser = localStorage.getItem('portalCS_isClient') === 'true';

    let filteredTasks = getFilteredItems(tasks).filter(task => {
        // Texto Filter
        const matchesSearch = !searchTerm ||
            (task.number && task.number.toLowerCase().includes(searchTerm)) ||
            (task.quality && task.quality.toLowerCase().includes(searchTerm)) ||
            (task.cliente && task.cliente.toLowerCase().includes(searchTerm)) ||
            (task.desc && task.desc.toLowerCase().includes(searchTerm));

        if (!matchesSearch) return false;

        // SLA Filter
        const isCompleted = task.status.includes('Concluida');

        // Se estiver na aba Concluidas, ignora os filtros SLA de (vencimento, aberto, etc)
        // e exibe a tarefa. Se NÃO estiver na aba Concluidas (estiver no Quadro Demandas),
        // ela DEVE ficar escondida.
        const inConcluidasView = btnViewConcluidas && btnViewConcluidas.classList.contains('active');

        // Se for uma tarefa concluída e não estou na aba de concluídas: oculta.
        if (isCompleted && !inConcluidasView) return false;

        // Se estou na aba de concluídas, exibo apenas se estiver concluída. Oculto as abertas.
        if (inConcluidasView) {
            return isCompleted;
        }

        // AGORA o check de "all" para as pendentes no KanBan original
        if (slaFilterValue === 'all') return true;

        // Se passar por aqui, é porque estou no Quadro Demandas normal E a tarefa está aberta
        const sla = checkSLA(task.date);
        if (slaFilterValue === 'vencidas') {
            return sla.text === 'Vencido' || sla.text === 'Vence Hoje';
        } else if (slaFilterValue === 'perto') {
            return sla.text.includes('Faltam');
        } else if (slaFilterValue === 'longe') {
            return sla.text === 'No prazo';
        }

        return true;
    }).sort((a, b) => {
        // Ordenação por Vencimento (mais próximo/atrasado primeiro)
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1;  // Sem data vai para o fim
        if (!b.date) return -1; // Sem data vai para o fim
        
        return new Date(a.date) - new Date(b.date);
    });

    // Clear all columns
    document.querySelectorAll('.column-content').forEach(col => {
        col.innerHTML = '';
        // Update counter based on filtered tasks
        const status = col.parentElement.dataset.status;
        const count = filteredTasks.filter(t => t.status === status).length;
        col.parentElement.querySelector('.counter').textContent = count;
    });

    // Build cards
    filteredTasks.forEach(task => {
        const sla = checkSLA(task.date);

        let dateDisplay = formatDate(task.date);

        let createdDisplay = '-';
        const rawCreatedAt = task.createdAt || task.date;
        if (rawCreatedAt) {
            createdDisplay = formatDate(rawCreatedAt);
        }

        // Fallback extraction for older tasks stored without the quality field
        let displayQuality = task.quality || '';
        if (!displayQuality && task.desc) {
            const qpMatch = task.desc.match(/\[?(?:qp|quality|an[áa]lise)(?:.*?-)?\s*(\d+)\]?/i);
            if (qpMatch) displayQuality = qpMatch[1];
        }

        const isCompleted = task.status.includes('Concluida');

        let contatoTexto = '';
        if (task.solicitante || task.contato) {
            const nom = task.solicitante ? `<b>${task.solicitante}</b>` : '';
            const tel = task.contato ? `${task.contato}` : '';
            const sep = (nom && tel) ? ' - ' : '';
            contatoTexto = ` | ${nom}${sep}${tel}`;
        }

        const obsHtml = task.obs ? `
            <div style="margin-top: 8px; padding: 6px 8px; background: rgba(0,0,0,0.1); border-radius: 4px; font-size: 0.7rem; color: var(--text-muted); font-style: italic; display: flex; align-items: flex-start; gap: 4px; border: 1px dashed rgba(255,255,255,0.1);">
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; margin-top: 2px;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <span style="overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">${task.obs}</span>
            </div>
        ` : '';

        const cardHTML = `
            <div class="task-card ${sla.class} ${isCompleted ? 'completed-card' : ''}" draggable="${!isCompleted}" data-id="${task.id}">
                <div class="card-header">
                    <div>
                        <span class="task-num" title="Número TiFlux">#${task.number || '---'}</span>
                        ${displayQuality ? `<span class="task-num" style="background: rgba(139, 92, 246, 0.1); color: #a78bfa; margin-left: 4px;" title="Número Quality">Q:${displayQuality}</span>` : ''}
                    </div>
                    ${!isCompleted ? `<div class="sla-indicator" title="Status SLA: ${sla.text}"></div>` : ''}
                </div>
                ${task.info ? `
                <div class="task-info-box">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                    </svg>
                    <span>${task.info}</span>
                </div>
                ` : ''}
                ${task.hasUpdate ? `
                <div class="update-indicator" title="Este chamado tem novidades!">
                    <span class="update-dot"></span>
                    <span class="update-text">Novidade</span>
                </div>
                ` : ''}
                <div class="task-cliente" title="Cliente" style="line-height: 1.4;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px; vertical-align:middle;">
                        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
                        <circle cx="12" cy="7" r="4"/>
                    </svg>
                    ${task.cliente || 'Cliente não informado'} ${contatoTexto}
                    ${getNetworkNameByClient(task.cliente) ? `<span class="network-badge">${getNetworkNameByClient(task.cliente)}</span>` : ''}
                </div>
                <div style="font-size: 0.70rem; color: var(--text-muted); margin-top: 2px; margin-bottom: 8px; display: flex; align-items: center; gap: 4px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                    Data Abertura: ${createdDisplay}
                </div>
                <div class="task-desc">${task.desc}</div>
                ${obsHtml}
                ${(isCompleted && (task.resolvedValidator || task.resolvedDesc)) ? `
                <div class="task-resolution-info" style="margin-top: 8px; padding: 6px 8px; background: rgba(0,0,0,0.2); border-left: 2px solid var(--status-success); border-radius: 4px; font-size: 0.75rem;">
                    ${task.resolvedValidator ? `<div style="color: var(--text-color); margin-bottom: 2px;"><b>Validado por:</b> ${task.resolvedValidator}</div>` : ''}
                    ${task.resolvedDesc ? `<div style="color: var(--text-muted);">${task.resolvedDesc}</div>` : ''}
                </div>
                ` : ''}
                <div class="card-footer">
                    <span class="task-resp" title="Responsável">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px; vertical-align:text-bottom"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        ${task.responsavel || 'Não atribuído'}
                    </span>
                    <div class="sla-badge ${isCompleted ? 'badge-completed' : sla.badge}" title="${isCompleted ? 'Concluída' : sla.text}">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            ${isCompleted ? '<path d="M20 6 9 17l-5-5"/>' : sla.icon}
                        </svg>
                        <span>${dateDisplay}</span>
                    </div>
                    <div class="card-actions" style="display: flex; gap: 4px;">
                        ${!isCompleted ? `
                        <button class="btn-whatsapp" onclick="${isClientUser ? "void(0)" : `sendWhatsappCobrança('${task.id}')`}" 
                                title="${isClientUser ? "Acesso restrito" : "Cobrar via WhatsApp"}" 
                                style="background: none; border: none; cursor: ${isClientUser ? "not-allowed" : "pointer"}; color: #25D366; display:flex; align-items:center; opacity: ${isClientUser ? "0.4" : "1"};">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21zm6.5-10.5c.34-.34 1.1-.34 1.45 0 .4.4 1.05.4 1.45 0l1.2-1.2c.4-.4.4-1.05 0-1.45l-.73-.73c-.4-.4-1.05-.4-1.45 0-.5.5-1.3 1.1-2 1.4-1.4.6-3-.2-3.8-1.5-.4-.7-.2-1.6.3-2.1.3-.3.9-.3 1.2 0l1.4 1.4z"/></svg>
                        </button>
                        <button class="btn-complete" onclick="${isClientUser ? "void(0)" : `completeTask('${task.id}')`}" 
                                title="${isClientUser ? "Acesso restrito" : "Concluir"}" 
                                style="background: none; border: none; cursor: ${isClientUser ? "not-allowed" : "pointer"}; color: var(--status-normal); opacity: ${isClientUser ? "0.4" : "1"};">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                        </button>
                        ` : ''}
                        <button class="btn-delete" onclick="${isClientUser ? "void(0)" : `deleteTask('${task.id}')`}" 
                                title="${isClientUser ? "Acesso restrito" : "Excluir"}" 
                                style="background: none; border: none; cursor: ${isClientUser ? "not-allowed" : "pointer"}; color: var(--status-critical); opacity: ${isClientUser ? "0.4" : "1"};">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                        </button>
                        ${isCompleted ? `
                        <button class="btn-reopen" onclick="${isClientUser ? "void(0)" : `reopenTask('${task.id}')`}" 
                                title="${isClientUser ? "Acesso restrito" : "Reabrir Demanda"}" 
                                style="background: none; border: none; cursor: ${isClientUser ? "not-allowed" : "pointer"}; color: var(--accent-primary); opacity: ${isClientUser ? "0.4" : "1"};">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                        </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;

        const targetCol = document.getElementById(`col-${task.status}`);
        if (targetCol) {
            targetCol.insertAdjacentHTML('beforeend', cardHTML);
        }
    });

    // Reattach drag events to new cards
    setupDragAndDrop();
}

function setupDragAndDrop() {
    const cards = document.querySelectorAll('.task-card');
    const contents = document.querySelectorAll('.column-content');

    cards.forEach(card => {
        card.addEventListener('dragstart', () => {
            card.classList.add('dragging');
        });

        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
        });

        // Edit on double click
        card.addEventListener('dblclick', (e) => {
            if (e.target.closest('button')) return; // Ignore buttons
            const taskId = card.dataset.id;
            openEditModal(taskId);
        });
    });

    contents.forEach(content => {
        content.addEventListener('dragover', e => {
            e.preventDefault();
            content.classList.add('drag-over');
            const draggable = document.querySelector('.dragging');
            if (draggable) {
                content.appendChild(draggable);
            }
        });

        content.addEventListener('dragleave', () => {
            content.classList.remove('drag-over');
        });

        content.addEventListener('drop', e => {
            content.classList.remove('drag-over');
            const draggable = document.querySelector('.dragging');
            if (draggable) {
                const taskId = draggable.dataset.id;
                const newStatus = content.parentElement.dataset.status;

                // Update object
                const index = tasks.findIndex(t => t.id === taskId);
                if (index !== -1 && tasks[index].status !== newStatus) {
                    if (newStatus.includes('Concluida')) {
                        completeTask(taskId, newStatus);
                    } else {
                        const taskToUpdate = tasks.find(t => t.id === taskId);
                        if (taskToUpdate) {
                            taskToUpdate.status = newStatus;
                            db.collection('tasks').doc(taskId).set(taskToUpdate);
                        }
                    }
                }
            }
        });
    });
}

function sendWhatsappCobrança(id) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    let extractedQuality = task.quality || '';
    if (!extractedQuality && task.desc) {
        const qpMatch = task.desc.match(/\[?(?:qp|quality|an[áa]lise)(?:.*?-)?\s*(\d+)\]?/i);
        if (qpMatch) extractedQuality = qpMatch[1];
    }

    const clientName = task.cliente || 'o cliente';
    const numQuality = extractedQuality ? `${extractedQuality}` : 'Sem número Quality';

    // Mount the message text based on the type of task
    let message = '';

    if (task.status === 'QP') {
        message = `Olá pessoal !\nPoderiam verificar o status da QP: "${numQuality}", por favor !\nAgradeço o apoio!`;
    } else {
        message = `Olá pessoal !\nPoderiam verificar o status do Chamado: "${numQuality}" do cliente *${clientName}*, por favor !\nAgradeço o apoio!`;
    }

    const encodedMsg = encodeURIComponent(message);
    let whatsappUrl = `https://api.whatsapp.com/send?text=${encodedMsg}`;

    // Open in new tab
    window.open(whatsappUrl, '_blank');
}

function saveTasks() {
    localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
}

function saveCS() {
    localStorage.setItem(CS_STORAGE_KEY, JSON.stringify(csClients));
}

// Render CS Board
function renderCSBoard() {
    const csTableBody = document.getElementById('csTableBody');
    if (!csTableBody) return;

    csTableBody.innerHTML = '';

    const getBadgeClass = (value, type) => {
        if (!value) return 'badge-neutral';
        const val = value.toLowerCase();

        if (type === 'interacao') {
            if (val === 'ótimo' || val === 'otimo') return 'badge-success';
            if (val === 'baixo') return 'badge-warning';
            if (val === 'resistência' || val === 'resistencia') return 'badge-critical';
        } else if (type === 'grow') {
            if (val === 'concluído' || val === 'concluido') return 'badge-success';
            if (val === 'em andamento') return 'badge-warning';
            if (val.includes('estagnado')) return 'badge-critical';
        } else if (type === 'engage') {
            if (val === 'satisfeito') return 'badge-success';
            if (val === 'neutro') return 'badge-warning'; // changed to warning for visibility
            if (val === 'em risco') return 'badge-critical';
        } else if (type === 'risk') {
            if (val === 'baixo') return 'badge-success';
            if (val === 'médio' || val === 'medio') return 'badge-warning';
            if (val === 'alto') return 'badge-critical';
        }
        return 'badge-neutral';
    };


    getFilteredItems(csClients, 'cs').forEach(client => {
        const tr = document.createElement('tr');
        tr.className = 'cs-table-row';
        tr.style.borderBottom = '1px solid var(--border-color)';
        tr.style.transition = 'background 0.2s';

        tr.onmouseover = () => tr.style.background = 'rgba(255,255,255,0.02)';
        tr.onmouseout = () => tr.style.background = 'transparent';

        const interacaoBadge = client.interacao ? `<span class="cs-badge ${getBadgeClass(client.interacao, 'interacao')}">${client.interacao}</span>` : '-';
        const growBadge = client.grow ? `<span class="cs-badge ${getBadgeClass(client.grow, 'grow')}">${client.grow}</span>` : '-';
        const engageBadge = client.engage ? `<span class="cs-badge ${getBadgeClass(client.engage, 'engage')}">${client.engage}</span>` : '-';
        const riskBadge = client.risk ? `<span class="cs-badge ${getBadgeClass(client.risk, 'risk')}">${client.risk}</span>` : '-';


        tr.innerHTML = `
            <td style="padding: 1rem; color: var(--text-primary); font-weight: 500; font-size: 0.875rem;">${client.name}</td>
            <td style="padding: 1rem; color: var(--text-secondary); font-size: 0.8rem;">${client.contact || '-'}</td>
            <td style="padding: 1rem; color: var(--text-secondary); font-size: 0.8rem;">${formatDate(client.dateLastContact)}</td>
            <td style="padding: 1rem; color: var(--text-secondary); font-size: 0.8rem;">${formatDate(client.dateDue)}</td>
            <td style="padding: 1rem;">${interacaoBadge}</td>
            <td style="padding: 1rem;">${growBadge}</td>
            <td style="padding: 1rem;">${engageBadge}</td>
            <td style="padding: 1rem;">${riskBadge}</td>
            <td style="padding: 1rem; font-size: 0.75rem; color: var(--text-muted); max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${client.obs || ''}">${client.obs || '-'}</td>
            <td style="padding: 1rem; white-space: nowrap;">
                <button class="btn-icon" onclick="openEditCsModal('${client.id}')" title="Editar">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                </button>
            </td>
        `;
        csTableBody.appendChild(tr);
    });
}

function renderMaintenanceBoard() {
    const tableBody = document.getElementById('maintenanceTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    const preventivasByClient = {};
    const searchVal = document.getElementById('maintenanceSearch')?.value.toLowerCase() || '';
    const filterVal = document.getElementById('maintenanceFilter')?.value || 'all';

    getFilteredItems(tasks).forEach(task => {
        if (task.status.includes('Preventiva')) {
            const clientName = task.cliente || 'Sem Cliente';
            if (!preventivasByClient[clientName]) {
                preventivasByClient[clientName] = [];
            }
            preventivasByClient[clientName].push(task);
        }
    });

    // 1. Coleta e ordenação de clientes por atividade mais recente
    const clientsData = Object.keys(preventivasByClient).map(clientName => {
        const clientTasks = preventivasByClient[clientName];
        
        // Ordenar tarefas deste cliente para achar a mais recente
        clientTasks.sort((a, b) => {
            const dateA = new Date(a.closedAt || a.createdAt || a.date || '1970-01-01');
            const dateB = new Date(b.closedAt || b.createdAt || b.date || '1970-01-01');
            return dateB - dateA;
        });

        const latestTask = clientTasks[0];
        const latestActivityDate = new Date(latestTask?.closedAt || latestTask?.createdAt || latestTask?.date || '1970-01-01');

        return {
            name: clientName,
            tasks: clientTasks,
            latestActivityDate: latestActivityDate
        };
    });

    // Ordenar clientes por data da atividade mais recente (DESC)
    clientsData.sort((a, b) => b.latestActivityDate - a.latestActivityDate);

    if (clientsData.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 2rem; color: var(--text-muted);">Nenhuma preventiva encontrada</td></tr>';
        return;
    }

    let count = 0;

    clientsData.forEach(client => {
        const clientName = client.name;
        const clientTasks = client.tasks;

        // Ordenar por data (mais recente primeiro)
        clientTasks.sort((a, b) => {
            const dateA = new Date(a.closedAt || a.createdAt || a.date || '1970-01-01');
            const dateB = new Date(b.closedAt || b.createdAt || b.date || '1970-01-01');
            return dateB - dateA;
        });

        // Encontrar a última CONCLUÍDA para a data realizada (robusto com acentos)
        const lastCompleted = clientTasks.find(t => 
            t.status.toLowerCase().includes('preventiva') && 
            (t.status.toLowerCase().includes('concluida') || t.status.toLowerCase().includes('concluída'))
        );
        // Encontrar se existe uma em andamento
        const openTask = clientTasks.find(t => t.status === 'Preventiva');

        let proxPreventiva = '-';
        let badgeClass = 'badge-neutral';
        let dataRealizada = '-';

        if (lastCompleted && lastCompleted.closedAt) {
            dataRealizada = formatDate(lastCompleted.closedAt);
            const closedDate = new Date(lastCompleted.closedAt + 'T12:00:00');
            closedDate.setDate(closedDate.getDate() + 90);

            const y = closedDate.getFullYear();
            const m = String(closedDate.getMonth() + 1).padStart(2, '0');
            const d = String(closedDate.getDate()).padStart(2, '0');
            proxPreventiva = `${d}/${m}/${y}`;

            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const diff = closedDate - today;
            const daysToMaintenance = Math.ceil(diff / (1000 * 60 * 60 * 24));

            if (daysToMaintenance <= 0) badgeClass = 'badge-critical';
            else if (daysToMaintenance <= 15) badgeClass = 'badge-warning';
            else badgeClass = 'badge-success';
        } else {
            dataRealizada = 'Sem histórico';
        }

        const matchSearch = clientName.toLowerCase().includes(searchVal);

        let matchStatus = true;
        if (filterVal === 'vencidas' && badgeClass !== 'badge-critical') matchStatus = false;
        if (filterVal === 'perto' && badgeClass !== 'badge-warning') matchStatus = false;
        if (filterVal === 'longe' && badgeClass !== 'badge-success' && badgeClass !== 'badge-neutral') matchStatus = false;

        if (matchSearch && matchStatus) {
            count++;
            const tr = document.createElement('tr');
            tr.className = 'cs-table-row';
            tr.style.borderBottom = '1px solid var(--border-color)';

            const maintenanceBadge = `<span class="cs-badge ${badgeClass}">${proxPreventiva}</span>`;
            const inProgressBadge = openTask ? `<span class="cs-badge badge-neutral" style="margin-left: 8px; font-size: 0.65rem; border: 1px dashed var(--border-color);">Em andamento</span>` : '';

            tr.innerHTML = `
                <td style="padding: 1rem; color: var(--text-primary); font-weight: 500; font-size: 0.875rem;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <a href="#" onclick="showMaintenanceHistory('${clientName.replace(/'/g, "\\'")}')" style="color: var(--accent-primary); text-decoration: none; font-weight: 600;">${clientName}</a>
                        ${inProgressBadge}
                    </div>
                </td>
                <td style="padding: 1rem; color: var(--text-secondary); font-size: 0.8rem;">${(openTask || lastCompleted)?.responsavel || '-'}</td>
                <td style="padding: 1rem; color: var(--text-secondary); font-size: 0.8rem;">${dataRealizada}</td>
                <td style="padding: 1rem;">${maintenanceBadge}</td>
            `;
            tableBody.appendChild(tr);
        }
    });

    if (count === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 2rem; color: var(--text-muted);">Nenhuma preventiva encontrada para os filtros atuais.</td></tr>';
    }
}

function showMaintenanceHistory(clientName) {
    const modal = document.getElementById('historyModal');
    const title = document.getElementById('historyClientName');
    const tableBody = document.getElementById('historyTableBody');

    if (!modal || !title || !tableBody) return;

    title.textContent = clientName;
    tableBody.innerHTML = '';

    const history = tasks
        .filter(t => t.cliente === clientName && t.status.includes('Preventiva'))
        .sort((a, b) => {
            const dateA = new Date(a.closedAt || a.createdAt || a.date || '1970-01-01');
            const dateB = new Date(b.closedAt || b.createdAt || b.date || '1970-01-01');
            return dateB - dateA;
        });

    if (history.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 2rem; color: var(--text-muted);">Nenhum registro encontrado.</td></tr>';
    } else {
        const formatDate = (dateStr) => {
            if (!dateStr) return '-';
            const parts = dateStr.split('T')[0].split(' ')[0].split(/[\/-]/);
            if (parts.length < 3) return dateStr;
            const [y, m, d] = parts;
            return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y.slice(-4)}`;
        };

        history.forEach(t => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';

            const isCompleted = t.status.toLowerCase().includes('concluida') || t.status.toLowerCase().includes('concluída');
            const statusClass = isCompleted ? 'badge-success' : 'badge-neutral';
            const statusText = isCompleted ? 'Concluída' : 'Em andamento';
            const dateToShow = t.closedAt || t.createdAt || t.date;

            tr.innerHTML = `
                <td style="padding: 0.75rem; font-size: 0.85rem; color: var(--text-primary); font-weight: 600;">#${t.number}</td>
                <td style="padding: 0.75rem; font-size: 0.8rem; color: var(--text-secondary);">${formatDate(dateToShow)}</td>
                <td style="padding: 0.75rem; font-size: 0.8rem; color: var(--text-secondary);">${t.responsavel || '-'}</td>
                <td style="padding: 0.75rem;"><span class="cs-badge ${statusClass}">${statusText}</span></td>
            `;
            tableBody.appendChild(tr);
        });
    }

    modal.classList.add('active');
}

// Global scope expose
window.showMaintenanceHistory = showMaintenanceHistory;

function updateBadgePreventivas() {
    const badge = document.getElementById('badgePreventivas');
    if (!badge) return;

    let totalAlerts = 0;
    const preventivasByClient = {};

    tasks.forEach(task => {
        if (task.status.includes('Preventiva')) {
            const clientName = task.cliente || 'Sem Cliente';
            if (!preventivasByClient[clientName]) {
                preventivasByClient[clientName] = [];
            }
            preventivasByClient[clientName].push(task);
        }
    });

    Object.keys(preventivasByClient).forEach(clientName => {
        const clientTasks = preventivasByClient[clientName];
        clientTasks.sort((a, b) => {
            const dateA = new Date(a.closedAt || a.createdAt || a.date || '1970-01-01');
            const dateB = new Date(b.closedAt || b.createdAt || b.date || '1970-01-01');
            return dateB - dateA;
        });

        const lastTask = clientTasks[0];

        if (lastTask && lastTask.closedAt) {
            const closedDate = new Date(lastTask.closedAt + 'T12:00:00');
            closedDate.setDate(closedDate.getDate() + 90);

            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const diff = closedDate - today;
            const daysToMaintenance = Math.ceil(diff / (1000 * 60 * 60 * 24));

            if (daysToMaintenance <= 15) {
                totalAlerts++;
            }
        }
    });

    if (totalAlerts > 0) {
        badge.textContent = totalAlerts;
        badge.style.display = 'block';
    } else {
        badge.style.display = 'none';
    }
}

// Expose functions to global scope (to be used in HTML onclick)
window.deleteTask = deleteTask;
window.completeTask = completeTask;
window.reopenTask = reopenTask;
window.sendWhatsappCobrança = sendWhatsappCobrança;
window.openEditCsModal = openEditCsModal;
window.editImplantation = openImplantationModal;
window.deleteImplantation = function (id) {
    showConfirmModal(
        'Excluir Implantação',
        'Deseja realmente excluir esta implantação?',
        () => {
            db.collection('implantacoes').doc(id).delete().then(() => {
                showToast('Implantação excluída.', 'critical');
            });
        },
        true // isCritical
    );
};

function renderImplantacoesBoard() {
    const tableBody = document.getElementById('implantacoesTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    if (implantacoes.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 2rem; color: var(--text-muted);">Nenhuma implantação cadastrada.</td></tr>';
        return;
    }


    implantacoes.sort((a, b) => new Date(b.previsao) - new Date(a.previsao)).forEach(imp => {
        const tr = document.createElement('tr');
        tr.className = 'cs-table-row';
        tr.style.borderBottom = '1px solid var(--border-color)';

        tr.innerHTML = `
            <td style="padding: 1.2rem 1rem; color: var(--text-primary); font-weight: 600;">${imp.rede || '-'}</td>
            <td style="padding: 1.2rem 1rem; color: var(--text-primary); font-weight: 500;">${imp.unidade || '-'}</td>
            <td style="padding: 1.2rem 1rem; color: var(--text-secondary); font-size: 0.85rem;">${imp.cnpj || '-'}</td>
            <td style="padding: 1.2rem 1rem; color: var(--text-secondary); font-size: 0.85rem;">${formatDate(imp.previsao)}</td>
            <td style="padding: 1.2rem 1rem; color: var(--text-secondary); font-size: 0.85rem;">${imp.tipo || '-'}</td>
            <td style="padding: 1.2rem 1rem; color: var(--text-secondary); font-size: 0.85rem;">${imp.contrato || '-'}</td>
            <td style="padding: 1.2rem 1rem; color: var(--text-secondary); font-size: 0.85rem;">${imp.implantador || '-'}</td>
            <td style="padding: 1.2rem 1rem;"><span class="cs-badge badge-neutral">${imp.status || 'Pendente'}</span></td>
            <td style="padding: 1.2rem 1rem;"><span class="cs-badge badge-success">${imp.qualidade || '-'}</span></td>
            <td style="padding: 1.2rem 1rem; white-space: nowrap;">
                <button class="btn-icon" onclick="window.editImplantation('${imp.id}')" title="Editar">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                </button>
                <button class="btn-icon" onclick="window.deleteImplantation('${imp.id}')" title="Excluir" style="color: var(--status-critical);">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                </button>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

// History Modal Listeners
const btnCloseHistoryModal = document.getElementById('btnCloseHistoryModal');
const btnOkHistory = document.getElementById('btnOkHistory');
const historyModal = document.getElementById('historyModal');

if (btnCloseHistoryModal) btnCloseHistoryModal.addEventListener('click', () => historyModal.classList.remove('active'));
if (btnOkHistory) btnOkHistory.addEventListener('click', () => historyModal.classList.remove('active'));
if (historyModal) historyModal.addEventListener('click', (e) => {
    if (e.target === historyModal) historyModal.classList.remove('active');
});

// Gerenciamento de Abas nas Configurações
window.switchSettingsTab = function(tabId) {
    // Esconder todos os conteúdos
    document.querySelectorAll('.settings-tab-content').forEach(tab => {
        tab.classList.remove('active');
    });

    // Desativar todos os botões
    document.querySelectorAll('.settings-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // Mostrar aba selecionada
    const targetTab = document.getElementById(tabId);
    if (targetTab) {
        targetTab.classList.add('active');
        
        // Ativar botão correspondente
        const btn = document.querySelector(`.settings-tab-btn[onclick*="${tabId}"]`);
        if (btn) btn.classList.add('active');
        
        // Persistir no localStorage
        localStorage.setItem('activeSettingsTab', tabId);
    }
};

// Inicializar aba ativa ao carregar
document.addEventListener('DOMContentLoaded', () => {
    const savedTab = localStorage.getItem('activeSettingsTab');
    if (savedTab && document.getElementById(savedTab)) {
        switchSettingsTab(savedTab);
    }
});

