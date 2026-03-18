import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const TIFLUX_API_TOKEN = process.env.TIFLUX_API_TOKEN;
const TIFLUX_API_URL = 'https://api.tiflux.com.br/api/v2';
const TICKET_NUMBER = '28324';

async function checkTicket() {
    try {
        const headers = { 'Authorization': `Bearer ${TIFLUX_API_TOKEN}` };
        console.log(`Buscando chamado #${TICKET_NUMBER}...`);
        
        const response = await axios.get(`${TIFLUX_API_URL}/tickets/${TICKET_NUMBER}`, { headers });
        const ticket = response.data?.data || response.data;
        
        if (ticket) {
            console.log('--- DADOS DO CHAMADO ---');
            console.log('Número:', ticket.ticket_number);
            console.log('Título:', ticket.title);
            console.log('Status:', ticket.status?.name || ticket.status);
            console.log('Estágio:', ticket.stage?.name || ticket.stage);
            console.log('Desk ID:', ticket.desk_id);
            console.log('Desk Name:', ticket.desk?.name);
            console.log('Is Closed:', ticket.is_closed);
            console.log('Created At:', ticket.created_at);
            console.log('Updated At:', ticket.updated_at);
            console.log('------------------------');
        } else {
            console.log('Chamado não encontrado.');
        }
    } catch (error) {
        console.error('Erro ao buscar chamado:', error.response?.data || error.message);
    }
}

checkTicket();
