const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path'); // Required to handle file paths
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// 1. SERVE FRONTEND FILES
// This tells Express to look for index.html, CSS, or JS in your root folder
app.use(express.static(path.join(__dirname, '/')));

// 2. RENDER THE HOMEPAGE
// This fixes the "Cannot GET /" error by sending your index.html file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 3. API ROUTE: Scan Roblox Game
app.get('/api/scan/:universeId', async (req, res) => {
    try {
        const id = req.params.universeId;

        // Fetch Game Metadata (Name, Creator, Visits)
        const gameReq = await axios.get(`https://games.roblox.com/v1/games?universeIds=${id}`);
        const gameData = gameReq.data.data[0];

        if (!gameData) return res.status(404).json({ error: "Game not found" });

        // Fetch Game Thumbnail
        const thumbReq = await axios.get(`https://thumbnails.roblox.com/v1/games/multiget/thumbnails?universeIds=${id}&size=768x432&format=Png`);
        const thumbUrl = thumbReq.data.data[0]?.thumbnails[0]?.imageUrl;

        // Fetch Creator Info
        let creatorAge = "Unknown";
        let isNewAccount = false;
        
        if (gameData.creator.creatorType === "User") {
            const userReq = await axios.get(`https://users.roblox.com/v1/users/${gameData.creator.id}`);
            const createdDate = new Date(userReq.data.created);
            creatorAge = createdDate.toLocaleDateString();
            
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            isNewAccount = createdDate > thirtyDaysAgo;
        }

        // Risk Scoring Logic
        let score = 100;
        let riskLevel = "LOW";

        if (isNewAccount && gameData.visits > 1000) score -= 50;
        if (gameData.visits < 500) score -= 20;
        if (gameData.copyingAllowed) score -= 10;

        if (score < 60) riskLevel = "HIGH";
        else if (score < 85) riskLevel = "MEDIUM";

        res.json({
            name: gameData.name,
            creator: gameData.creator.name,
            thumbnail: thumbUrl || "",
            visits: gameData.visits.toLocaleString(),
            age: creatorAge,
            safetyScore: score,
            riskLevel: riskLevel
        });

    } catch (error) {
        console.error("API Error:", error.message);
        res.status(500).json({ error: "Failed to connect to Roblox APIs" });
    }
});

// 4. START SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Backend live on port ${PORT}`);
});
