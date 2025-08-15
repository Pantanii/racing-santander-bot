// Bot de Noticias del Racing de Santander
// Configurado para Railway.app

const express = require('express');
const axios = require('axios');
const cron = require('node-cron');

const app = express();
app.use(express.json());

// ¡¡¡CONFIGURACIÓN IMPORTANTE!!!
// Cambia estos valores en Railway (Variables de entorno)
const BOT_TOKEN = process.env.BOT_TOKEN || 'TU_TOKEN_AQUI';
const CHAT_ID = process.env.CHAT_ID || 'TU_ID_DEL_GRUPO';
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

console.log('🤖 Bot del Racing iniciando...');
console.log('Token configurado:', BOT_TOKEN.length > 10 ? '✅' : '❌');
console.log('Chat ID configurado:', CHAT_ID.length > 3 ? '✅' : '❌');

// Función para enviar mensajes a Telegram
async function sendMessage(chatId, text) {
  try {
    const response = await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    });
    console.log('✅ Mensaje enviado correctamente');
    return true;
  } catch (error) {
    console.error('❌ Error enviando mensaje:', error.response?.data?.description || error.message);
    return false;
  }
}

// Función para buscar noticias del Racing
async function getRacingNews() {
  const news = [];
  console.log('🔍 Buscando noticias del Racing de Santander...');
  
  const searchTerms = [
    'Racing Santander',
    '"Racing de Santander"',
    'Real Racing Club Santander'
  ];
  
  try {
    for (const term of searchTerms) {
      try {
        const encodedTerm = encodeURIComponent(term);
        const rssUrl = `https://news.google.com/rss/search?q=${encodedTerm}&hl=es&gl=ES&ceid=ES:es`;
        
        console.log(`📡 Buscando: ${term}`);
        
        const response = await axios.get(rssUrl, {
          timeout: 15000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; RacingBot/1.0)'
          }
        });
        
        const items = parseGoogleNewsRSS(response.data);
        
        // Filtrar noticias del Racing
        const racingNews = items.filter(item => {
          const title = item.title.toLowerCase();
          const isRacing = title.includes('racing');
          const isSantander = title.includes('santander') || title.includes('club');
          return isRacing && isSantander;
        });
        
        // Añadir noticias únicas
        racingNews.forEach(newsItem => {
          const exists = news.some(existing => 
            existing.title === newsItem.title
          );
          
          if (!exists && news.length < 5) {
            news.push(newsItem);
          }
        });
        
        if (news.length >= 5) break;
        
      } catch (searchError) {
        console.log(`⚠️ Error buscando "${term}":`, searchError.message);
      }
    }
    
    console.log(`📊 Encontradas ${news.length} noticias del Racing`);
    return news;
    
  } catch (error) {
    console.error('❌ Error general:', error.message);
    return [];
  }
}

// Parser para Google News RSS
function parseGoogleNewsRSS(xmlData) {
  const items = [];
  
  try {
    const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/g;
    let match;
    
    while ((match = itemRegex.exec(xmlData)) !== null && items.length < 10) {
      const itemContent = match[1];
      
      const titleMatch = itemContent.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/);
      const title = titleMatch ? titleMatch[1].trim() : null;
      
      const linkMatch = itemContent.match(/<link>(.*?)<\/link>/);
      const link = linkMatch ? linkMatch[1].trim() : null;
      
      const pubDateMatch = itemContent.match(/<pubDate>(.*?)<\/pubDate>/);
      const pubDate = pubDateMatch ? pubDateMatch[1].trim() : null;
      
      if (title && link) {
        items.push({
          title: cleanTitle(title),
          link: link,
          pubDate: pubDate
        });
      }
    }
    
  } catch (error) {
    console.error('❌ Error parseando RSS:', error.message);
  }
  
  return items;
}

// Limpiar títulos
function cleanTitle(title) {
  return title.replace(/ - [^-]+$/, '').trim();
}

// Formatear mensaje
function formatNewsMessage(newsItems) {
  const today = new Date().toLocaleDateString('es-ES', {
    weekday: 'long',
    year: 'numeric', 
    month: 'long', 
    day: 'numeric'
  });
  
  let message = `📰 <b>NOTICIAS DEL RACING</b> ⚽\n`;
  message += `📅 ${today}\n\n`;
  
  if (!newsItems || newsItems.length === 0) {
    message += `😔 No se encontraron noticias nuevas del Racing hoy.\n\n`;
  } else {
    newsItems.forEach((news, index) => {
      message += `🔸 <b>${index + 1}. ${news.title}</b>\n`;
      message += `🔗 <a href="${news.link}">Leer más</a>\n\n`;
    });
  }
  
  message += `💚🤍 <b>¡HALA RACING!</b> 🤍💚`;
  
  return message;
}

// Función principal - enviar noticias diarias
async function sendDailyNews() {
  console.log('🚀 Enviando noticias diarias...');
  
  try {
    const news = await getRacingNews();
    const message = formatNewsMessage(news);
    
    const success = await sendMessage(CHAT_ID, message);
    
    if (success) {
      console.log(`✅ Noticias enviadas: ${news.length} encontradas`);
    }
    
  } catch (error) {
    console.error('❌ Error enviando noticias:', error.message);
    
    try {
      await sendMessage(CHAT_ID, 
        '❌ Error técnico obteniendo noticias.\n🔄 Intentaré más tarde.\n\n💚🤍 ¡HALA RACING! 🤍💚'
      );
    } catch (e) {
      console.error('❌ No se pudo enviar mensaje de error');
    }
  }
}

// Webhook para comandos
app.post('/webhook', async (req, res) => {
  const { message } = req.body;
  
  if (!message || !message.text) {
    return res.sendStatus(200);
  }
  
  const chatId = message.chat.id;
  const text = message.text.toLowerCase();
  const userName = message.from.first_name || 'Racinguista';
  
  console.log(`📩 Comando: "${text}" de ${userName}`);
  
  try {
    switch(text) {
      case '/start':
        const welcome = `⚽ ¡Hola <b>${userName}</b>!\n\n` +
                       `Soy el bot del Racing de Santander 💚🤍\n\n` +
                       `🕘 <b>Noticias automáticas:</b> 9:00 AM diario\n` +
                       `📰 <b>Comandos:</b>\n` +
                       `• /noticias - Últimas noticias\n` +
                       `• /test - Comprobar bot\n\n` +
                       `💚🤍 <b>¡HALA RACING!</b> 🤍💚`;
        await sendMessage(chatId, welcome);
        break;
        
      case '/noticias':
        await sendMessage(chatId, '🔍 Buscando noticias del Racing...');
        const news = await getRacingNews();
        const newsMessage = formatNewsMessage(news);
        await sendMessage(chatId, newsMessage);
        break;
        
      case '/test':
        const testMsg = `🧪 <b>TEST DEL BOT</b>\n\n` +
                       `✅ Bot funcionando\n` +
                       `📅 ${new Date().toLocaleString('es-ES')}\n` +
                       `🤖 Sistema: OK\n\n` +
                       `💚🤍 <b>¡Todo perfecto!</b> 🤍💚`;
        await sendMessage(chatId, testMsg);
        break;
    }
  } catch (error) {
    console.error('❌ Error procesando comando:', error.message);
  }
  
  res.sendStatus(200);
});

// Programar envío diario 9:00 AM España
cron.schedule('0 9 * * *', () => {
  console.log('⏰ Enviando noticias programadas...');
  sendDailyNews();
}, {
  scheduled: true,
  timezone: "Europe/Madrid"
});

// Rutas adicionales
app.get('/', (req, res) => {
  res.json({
    status: '✅ Racing News Bot activo',
    time: new Date().toLocaleString('es-ES'),
    message: '⚽ ¡HALA RACING! 💚🤍'
  });
});

app.get('/send-news', async (req, res) => {
  try {
    await sendDailyNews();
    res.json({ success: true, message: 'Noticias enviadas' });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Configurar webhook
async function setupWebhook() {
  if (BOT_TOKEN.length > 10) {
    try {
      const webhookUrl = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/webhook`;
      await axios.post(`${TELEGRAM_API}/setWebhook`, {
        url: webhookUrl
      });
      console.log(`✅ Webhook configurado: ${webhookUrl}`);
    } catch (error) {
      console.error('❌ Error webhook:', error.message);
    }
  }
}

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Bot iniciado en puerto ${PORT}`);
  console.log(`📰 Noticias diarias: 9:00 AM`);
  console.log(`⚽ ¡HALA RACING! 💚🤍`);
  
  setTimeout(setupWebhook, 3000);
});

// Keep alive
setInterval(() => {
  console.log(`💓 Bot activo: ${new Date().toLocaleString('es-ES')}`);
}, 300000);