import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const TIFLUX_API_TOKEN = process.env.TIFLUX_API_TOKEN;
const TIFLUX_API_URL = 'https://api.tiflux.com/api/v2';

async function testPagination() {
    const headers = { 'Authorization': `Bearer ${TIFLUX_API_TOKEN}` };
    try {
        console.log('--- TESTANDO OFFSET 100 ---');
        const res = await axios.get(`${TIFLUX_API_URL}/tickets?limit=5&offset=100`, { headers });
        console.log(`  SUCESSO! Status: ${res.status}`);
        const tickets = res.data?.data || res.data || [];
        tickets.forEach(t => console.log(`    #${t.ticket_number} (Created: ${t.created_at})`));
        
        console.log('\n--- TESTANDO OFFSET 200 ---');
        const res2 = await axios.get(`${TIFLUX_API_URL}/tickets?limit=5&offset=200`, { headers });
        console.log(`  SUCESSO! Status: ${res2.status}`);
        const tickets2 = res2.data?.data || res2.data || [];
        tickets2.forEach(t => console.log(`    #${t.ticket_number} (Created: ${t.created_at})`));

    } catch (error) {
        console.error('Erro:', error.response?.data || error.message);
    }
}

testPagination();
