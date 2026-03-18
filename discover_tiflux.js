import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const TIFLUX_API_TOKEN = process.env.TIFLUX_API_TOKEN;
const TIFLUX_API_URL = 'https://api.tiflux.com.br/api/v2';

async function dumpTickets() {
    try {
        const headers = { 'Authorization': `Bearer ${TIFLUX_API_TOKEN}` };
        console.log('--- BUSCANDO PRIMEIROS 5 CHAMADOS ---');
        
        const response = await axios.get(`${TIFLUX_API_URL}/tickets?limit=5`, { headers });
        const tickets = response.data?.data || response.data || [];
        
        console.log(JSON.stringify(tickets, null, 2));

    } catch (error) {
        console.error('Erro:', error.response?.data || error.message);
    }
}

dumpTickets();
