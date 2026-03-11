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

async function importGulf() {
    try {
        console.log("--- Iniciando Importação GULF ---");
        
        // 1. Limpar Coleção 'networks'
        console.log("Limpando coleção 'networks'...");
        const networksSnap = await db.collection('networks').get();
        const batchDelete = db.batch();
        networksSnap.forEach(doc => batchDelete.delete(doc.ref));
        await batchDelete.commit();
        console.log("Coleção 'networks' limpa.");

        // 2. Ler Excel
        if (!fs.existsSync(EXCEL_PATH)) {
            console.error(`Erro: Arquivo não encontrado em ${EXCEL_PATH}`);
            return;
        }

        const workbook = xlsx.readFile(EXCEL_PATH);
        const sheetName = workbook.SheetNames[0];
        const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        console.log(`Excel lido. Total de linhas: ${rows.length}`);

        // 3. Filtrar por GULF
        // Na planilha, geralmente temos uma coluna "Rede" ou similar.
        // Vou procurar por colunas que contenham "Rede" ou "Network".
        const gulfRows = rows.filter(row => {
            return Object.values(row).some(val => 
                String(val).toUpperCase().includes('GULF')
            );
        });

        console.log(`Linhas GULF encontradas: ${gulfRows.length}`);

        if (gulfRows.length === 0) {
            console.warn("Nenhuma linha com 'GULF' encontrada. Verifique os dados.");
            return;
        }

        // 4. Extrair nomes dos postos (Colunas comuns: "Cliente", "Nome", "Posto")
        const postos = [...new Set(gulfRows.map(row => {
            // Tenta pegar de colunas conhecidas ou da primeira coluna que não seja "GULF"
            return row['Cliente'] || row['Nome'] || row['Posto'] || row['NOME'] || Object.values(row)[0];
        }))].filter(p => p && String(p).toUpperCase() !== 'GULF').sort();

        console.log(`Total de postos únicos para GULF: ${postos.length}`);

        // 5. Criar Rede GULF
        const networkData = {
            name: "GULF",
            clients: postos
        };

        await db.collection('networks').add(networkData);
        console.log("Rede GULF importada com sucesso!");

    } catch (error) {
        console.error("Erro na importação:", error);
    } finally {
        process.exit();
    }
}

importGulf();
