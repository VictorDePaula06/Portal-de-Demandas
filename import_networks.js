import admin from 'firebase-admin';
import xlsx from 'xlsx';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const FIREBASE_SERVICE_ACCOUNT = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!FIREBASE_SERVICE_ACCOUNT) {
    console.error("Erro: FIREBASE_SERVICE_ACCOUNT não definida no .env");
    process.exit(1);
}

const serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const EXCEL_PATH = "C:\\Users\\SUP002-VICTOR\\Downloads\\Excel_clientes_1773182081.xlsx";

async function importNetworks() {
    try {
        console.log("--- Iniciando Importação de Redes (AP, LIBER, GULF) ---");
        
        if (!fs.existsSync(EXCEL_PATH)) {
            console.error(`Erro: Arquivo não encontrado em ${EXCEL_PATH}`);
            return;
        }

        const workbook = xlsx.readFile(EXCEL_PATH);
        const sheetName = workbook.SheetNames[0];
        const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        console.log(`Excel lido. Total de linhas: ${rows.length}`);

        const redesParaImportar = ['AP', 'LIBER', 'GULF'];
        
        for (const redeNome of redesParaImportar) {
            console.log(`\nProcessando rede: ${redeNome}...`);
            
            // Filtrar linhas para esta rede (coluna _16)
            const redeRows = rows.filter(r => r['_16'] && String(r['_16']).toUpperCase().includes(redeNome));
            
            if (redeRows.length === 0) {
                console.log(`Nenhuma linha encontrada para ${redeNome}.`);
                continue;
            }

            // Extrair nomes únicos dos postos (coluna __EMPTY)
            const postos = [...new Set(redeRows.map(r => r['__EMPTY']))]
                .filter(p => p && String(p).trim() !== '' && String(p).toUpperCase() !== 'CLIENTE')
                .sort();

            console.log(`Total de postos únicos para ${redeNome}: ${postos.length}`);

            // Buscar se a rede já existe
            const snapshot = await db.collection('networks').where('name', '==', redeNome).get();
            
            if (!snapshot.empty) {
                // Se existe, pergunta: atualizar? O usuário disse "alem da Gulf que ja esta".
                // Vou atualizar mantendo os que já existem e adicionando os novos.
                const doc = snapshot.docs[0];
                const existingData = doc.data();
                const existingClients = existingData.clients || [];
                
                // Converter existentes para formato objeto se for string
                const normalizedExisting = existingClients.map(c => typeof c === 'string' ? { name: c, active: true } : c);
                
                // Adicionar novos (evitando duplicidade por nome)
                let novosAdicionados = 0;
                const updatedClients = [...normalizedExisting];
                
                postos.forEach(pName => {
                    const exists = updatedClients.some(c => c.name === pName);
                    if (!exists) {
                        updatedClients.push({ name: pName, active: true });
                        novosAdicionados++;
                    }
                });

                await doc.ref.update({ clients: updatedClients });
                console.log(`Rede ${redeNome} atualizada! ${novosAdicionados} novos postos adicionados.`);
            } else {
                // Se não existe, cria nova
                const clients = postos.map(p => ({ name: p, active: true }));
                await db.collection('networks').add({
                    name: redeNome,
                    clients: clients,
                    reportEmail: '',
                    autoReport: false
                });
                console.log(`Rede ${redeNome} criada com ${clients.length} postos.`);
            }
        }

        console.log("\n--- Importação concluída! ---");

    } catch (error) {
        console.error("Erro na importação:", error);
    } finally {
        process.exit();
    }
}

importNetworks();
