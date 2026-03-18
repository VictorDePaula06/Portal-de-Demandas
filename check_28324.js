import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const TIFLUX_API_TOKEN = process.env.TIFLUX_API_TOKEN;
const TIFLUX_API_URL = 'https://api.tiflux.com/api/v2';
const TICKET_NUMBER = '28324';

async function checkTicket() {
    const headers = { 'Authorization': `Bearer ${TIFLUX_API_TOKEN}`, 'Accept': 'application/json' };
    try {
        console.log(`Buscando ticket #${TICKET_NUMBER}...`);
        const res = await axios.get(`${TIFLUX_API_URL}/tickets/${TICKET_NUMBER}`, { headers });
        const ticket = res.data?.data || res.data;
        
        console.log('--- DADOS DO TICKET ---');
        console.log('Ticket Number:', ticket.ticket_number);
        console.log('Title:', ticket.title);
        console.log('Desk ID:', ticket.desk_id || ticket.desk?.id);
        console.log('Desk Name:', ticket.desk?.name);
        console.log('Stage ID:', ticket.stage_id || ticket.stage?.id);
        console.log('Stage Name:', ticket.stage?.name || ticket.stage_name);
        console.log('Status Name:', ticket.status_name || ticket.status?.name);
        console.log('Is Closed:', ticket.is_closed);
        console.log('RAW JSON:', JSON.stringify(ticket, null, 2));
        console.log('-----------------------');
        
    } catch (err) {
        console.error('Erro:', err.response?.data || err.message);
    }
}

checkTicket();
