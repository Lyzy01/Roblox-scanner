const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();

// Allows your GitHub Pages frontend to communicate with this Render backend
app.use(cors());
app.use(express.json());

app.get('/api/scan/:universeId', async (req, res) => {
    try {
        const id = req.params.universeId;

        // 1. Fetch Game Metadata (Name, Creator, Visits)
        const gameReq = await axios.get(`https://games.roblox.com/v1/games?universeIds=${id}`);
        const gameData = gameReq.data.data[0];

        if (!gameData) return res.status(404).json({ error: "Game not found" });

        // 2. Fetch Game Thumbnail
        const thumbReq = await axios.get(`https://thumbnails.roblox.com/v1/games/multiget/thumbnails?universeIds=${id}&size=768x432&format=Png`);
        const thumbUrl = thumbReq.data.data[0]?.thumbnails[0]?.imageUrl;

        // 3. Fetch Creator Info (To check account age)
        let creatorAge = "Unknown";
        let isNewAccount = false;
        
        if (gameData.creator.creatorType === "User") {
            const userReq = await axios.get(`https://users.roblox.com/v1/users/${gameData.creator.id}`);
            const createdDate = new Date(userReq.data.created);
            creatorAge = createdDate.toLocaleDateString();
            
            // Flag if account is less than 30 days old
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            isNewAccount = createdDate > thirtyDaysAgo;
        }

        // --- ACCURACY LOGIC: Risk Scoring ---
        let score = 100;
        let riskLevel = "LOW";

        // Scenario: New account with high visits is often a sign of a botted/backdoored game
        if (isNewAccount && gameData.visits > 1000) {
            score -= 50;
        }
        // Very low visit counts indicate unverified reputation
        if (gameData.visits < 500) {
            score -= 20;
        }
        // If the game is copyable, assets might be exposed
        if (gameData.copyingAllowed) {
            score -= 10;
        }

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
        res.status(500).json({ error: "Failed to connect to Roblox APIs" });
    }
});

// Render dynamic port selection
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend live on port ${PORT}`));
