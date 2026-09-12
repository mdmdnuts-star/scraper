const express = require('express');
const cors = require('cors');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// Supabase configuration
const SUPABASE_URL = 'https://vhhsaiqpjgelbpmaajum.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_0N2OZlzojCxu1_ZUa4YDog_BQ5b3WKU';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// AI Intelligence configuration
const GEMINI_API_KEY = 'AQ.Ab8RN6JG12CkDBxctlNDO2ah6n2Q08NdRcB63Pjt5faVdnWKdQ';
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const PORT = process.env.PORT || 3000;

// Retry helper with backoff
async function generateWithRetry(model, prompt, retries = 3, delay = 2000) {
    for (let i = 0; i < retries; i++) {
        try {
            const result = await model.generateContent(prompt);
            return result.response.text();
        } catch (err) {
            if ((err.message.includes('503') || err.message.includes('404')) && i < retries - 1) {
                console.log(`API Warning / Overload. Retrying in ${delay / 1000}s...`);
                await new Promise(res => setTimeout(res, delay));
                delay *= 2;
            } else {
                throw err;
            }
        }
    }
}

// 1. Ultimate Website Scraper
app.post('/api/scrape', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    try {
        console.log(`Executing ultimate website harvest: ${url}`);
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        });

        if (!response.ok) throw new Error(`Failed to fetch URL, status: ${response.status}`);

        const html = await response.text();
        const $ = cheerio.load(html);
        const title = $('title').text().trim() || 'No title found';

        let mediaAssets = [];
        $('img').each((_, el) => {
            const src = $(el).attr('src');
            if (src && mediaAssets.length < 10) {
                mediaAssets.push(src.startsWith('http') ? src : new URL(src, url).href);
            }
        });

        let outboundLinks = [];
        $('a[href]').each((_, el) => {
            const href = $(el).attr('href');
            if (href && href.startsWith('http') && !href.includes(new URL(url).hostname) && outboundLinks.length < 15) {
                outboundLinks.push(href);
            }
        });

        const rawText = $('body').text().replace(/\s+/g, ' ').trim().substring(0, 8000);

        console.log('Sending payload to Gemini...');

        const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });
        const prompt = `You are an elite cyber intelligence analyst. Perform a deep-dive analysis on this harvested website corpus:
        - Title: "${title}"
        - Discovered Media Assets Count: ${mediaAssets.length}
        - Outbound Digital Footprints / Social Links: ${JSON.stringify(outboundLinks)}
        - Massive Content Archive Sample: "${rawText}"
        
        Return ONLY a valid JSON object with exactly two keys: 
        1. "summary" (A comprehensive, highly detailed 4-sentence intelligence report covering corporate scale, technical structure, digital footprint analysis, and geographical location/base if found).
        2. "sentiment" (One single word: Positive, Neutral, Negative, or Promotional).`;

        let aiText = await generateWithRetry(model, prompt);
        aiText = aiText.replace(/```json/g, '').replace(/```/g, '').trim();
        const aiData = JSON.parse(aiText);

        const { data, error } = await supabase
            .from('scraped_data')
            .insert([{ 
                url: url, 
                title: title, 
                snippet: aiData.summary, 
                sentiment: aiData.sentiment,
                media_urls: mediaAssets,
                outbound_links: outboundLinks
            }])
            .select();

        if (error) throw error;
        res.json({ success: true, message: 'Ultimate website assets harvested!', data: data[0] });

    } catch (err) {
        console.error('Pipeline error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// 2. Ultimate Instagram Scraper
app.post('/api/scrape-instagram', async (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Instagram username is required' });

    let browser;
    try {
        console.log(`Executing ultimate Instagram asset and history sweep for: @${username}`);
        
        browser = await puppeteer.launch({ 
            headless: true, 
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
        });
        const page = await browser.newPage();
        
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        const profileUrl = `https://www.instagram.com/${username}/`;
        await page.goto(profileUrl, { waitUntil: 'networkidle2', timeout: 30000 });

        const ultimatePayload = await page.evaluate(() => {
            const metaDesc = document.querySelector('meta[property="og:description"]');
            const metaTitle = document.querySelector('meta[property="og:title"]');
            const metaImage = document.querySelector('meta[property="og:image"]');

            let externalLinks = [];
            document.querySelectorAll('a').forEach(a => {
                const href = a.href;
                if (!href) return;

                const ignoredDomains = [
                    'instagram.com', 'facebook.com', 'meta.com', 'threads.net', 
                    'fb.com', 'fbcdn.net', 'fbsbx.com', 'messenger.com', 
                    'whatsapp.com', 'meta.ai', 'muse.ai', 'apple.com', 'google.com'
                ];

                const isIgnored = ignoredDomains.some(domain => href.includes(domain));

                if (!isIgnored && href.startsWith('http') && externalLinks.length < 10) {
                    externalLinks.push(href);
                }
            });

            let scriptPayloads = [];
            document.querySelectorAll('script').forEach(script => {
                const text = script.innerText;
                if (text.includes('edge_owner_to_timeline_media') || text.includes('biography') || text.includes('follower_count')) {
                    scriptPayloads.push(text);
                }
            });

            return {
                title: metaTitle ? metaTitle.content : document.title,
                bio: metaDesc ? metaDesc.content : 'No public bio found',
                avatarUrl: metaImage ? metaImage.content : '',
                externalLinks: externalLinks,
                telemetryContext: scriptPayloads.join(' ').substring(0, 8000)
            };
        });

        await browser.close();

        console.log('Sending ultimate Instagram payload to Gemini...');

        const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });
        const prompt = `You are an elite digital intelligence analyst. Perform a full-spectrum asset audit on this Instagram account:
        - Bio & Meta: "${ultimatePayload.bio}"
        - Avatar/Media Graphic URL: "${ultimatePayload.avatarUrl}"
        - Cross-Referenced External Footprint Links (Linktree/Websites): ${JSON.stringify(ultimatePayload.externalLinks)}
        - Deep Script & Historical Telemetry Corpus: "${ultimatePayload.telemetryContext}"
        
        Return ONLY a valid JSON object with exactly two keys: 
        1. "summary" (A comprehensive 4-sentence intelligence report detailing scale metrics, external ecosystem footprint, content historical focus, and geographical location/country derived from the data).
        2. "sentiment" (One single word: Positive, Neutral, Negative, or Promotional).`;

        let aiText = await generateWithRetry(model, prompt);
        aiText = aiText.replace(/```json/g, '').replace(/```/g, '').trim();
        const aiData = JSON.parse(aiText);

        const { data, error } = await supabase
            .from('scraped_data')
            .insert([{ 
                url: profileUrl, 
                title: ultimatePayload.title, 
                snippet: aiData.summary, 
                sentiment: aiData.sentiment,
                media_urls: ultimatePayload.avatarUrl ? [ultimatePayload.avatarUrl] : [],
                outbound_links: ultimatePayload.externalLinks
            }])
            .select();

        if (error) throw error;

        res.json({ success: true, message: 'Ultimate Instagram assets & history harvested!', data: data[0] });

    } catch (err) {
        if (browser) await browser.close();
        console.error('Ultimate Instagram scraping error:', err.message);
        res.status(500).json({ error: 'Failed to complete ultimate Instagram harvest.' });
    }
});

app.listen(PORT, () => {
    console.log(`Ultimate All-In-One Intelligence Pipeline running on port ${PORT}`);
});