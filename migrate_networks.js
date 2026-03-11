import admin from 'firebase-admin';
import dotenv from 'dotenv';

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

async function migrateNetworks() {
    try {
        console.log("--- Iniciando Migração de Redes ---");
        const networksSnap = await db.collection('networks').get();
        const batch = db.batch();
        let count = 0;

        networksSnap.forEach(doc => {
            const data = doc.data();
            if (data.clients && Array.isArray(data.clients)) {
                const newClients = data.clients.map(client => {
                    if (typeof client === 'string') {
                        return { name: client, active: true };
                    }
                    return client; // Already migrated or different format
                });
                batch.update(doc.ref, { clients: newClients });
                count++;
            }
        });

        if (count > 0) {
            await batch.commit();
            console.log(`Migração concluída! ${count} redes atualizadas.`);
        } else {
            console.log("Nenhuma rede precisou de migração.");
        }

    } catch (error) {
        console.error("Erro na migração:", error);
    } finally {
        process.exit();
    }
}

migrateNetworks();
