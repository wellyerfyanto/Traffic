const express = require('express');
const app = express();

app.use(express.json());
app.use(express.static('public'));

// Basic route untuk test
app.get('/', (req, res) => {
    res.send(`
        <html>
            <head><title>GitHub Traffic Bot</title></head>
            <body>
                <h1>GitHub Traffic Bot - Deployment Success!</h1>
                <p>Server is running successfully on Railway.</p>
                <p>Next: Implement bot functionality step by step.</p>
            </body>
        </html>
    `);
});

// Test Puppeteer installation
app.get('/test-puppeteer', async (req, res) => {
    try {
        const puppeteer = require('puppeteer');
        res.json({ 
            success: true, 
            message: 'Puppeteer is working!',
            chromePath: process.env.PUPPETEER_EXECUTABLE_PATH 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`✅ Environment: ${process.env.NODE_ENV}`);
});
