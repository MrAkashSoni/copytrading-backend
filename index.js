const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const axios = require('axios');
const cors = require('cors');

require('dotenv').config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());

wss.on('connection', (ws) => {
  console.log('Client connected');
  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

app.use(express.json());

app.post('/api/trade', async (req, res) => {
  try {
    // Broadcast status: Connected to Backend
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send('Connected to Backend...');
      }
    });

    // Ping the lambda function to get the master trade details
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send('Get Master Trade... (Pinging Lambda Function)');
      }
    });
    const masterTradeResponse = await axios.get('https://pdzsl5xw2kwfmvauo5g77wok3q0yffpl.lambda-url.us-east-2.on.aws/');
    const masterTrade = masterTradeResponse.data;

    // Replicate the trade on the slave account using MT4 API
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send('Replicating Master Trade');
      }
    });
    const connectResponse = await axios.get(`${process.env.MT4_API_BASE_URL}/Connect`, {
      params: {
        user: '44712225',
        password: 'tfkp48',
        host: '18.209.126.198',
        port: 443,
      },
    });

    console.log('connectResponse ---> ', connectResponse.data)

    const connectionId = connectResponse.data.id;
    const tradeResponse = await axios.get(`${process.env.MT4_API_BASE_URL}/OrderSend`, {
      params: {
        id: connectionId,
        symbol: masterTrade.symbol,
        operation: masterTrade.operation,
        volume: masterTrade.volume,
        takeprofit: masterTrade.takeprofit,
        comment: masterTrade.comment,
      },
    });

    console.log('tradeResponse ---> ', tradeResponse.data)

    const slaveTrade = tradeResponse.data;

    // Broadcast status: Successfully Replicated Master Trade
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send('Successfully Replicated Master Trade');
        client.send(`Displaying Trade Details:\n${JSON.stringify(slaveTrade, null, 2)}`);
      }
    });

    res.json(slaveTrade);
  } catch (error) {
    console.error('Error processing trade:', error);
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send('Error processing trade');
      }
    });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

server.listen(process.env.PORT, () => {
  console.log(`Server is running on port ${process.env.PORT}`);
});
