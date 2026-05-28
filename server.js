const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '/')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/scan/:id', async (req, res) => {
    try {
        let id = req.params.id;

        // --- STEP 1: THE TRANSLATOR ---
        // We check if this is a Place ID. If it is, we convert it to a Universe ID.
        try {
            const conversionReq = await axios.get(`https://apis.roblox.com/universes/v1/places/${id}/universe`);
            if (conversionReq.data && conversionReq.data.universeId) {
                id = conversionReq.data.universeId; // Successfully converted!
            }
        } catch (e) {
            // If it fails, it might already be a Universe ID, so we just continue.
            console.log("ID is likely already a Universe ID or conversion failed.");
        }

        // --- STEP 2: FETCH METADATA ---
        const gameReq = await axios.get(`https://games.roblox.com/v1/games?universeIds=${id}`);
        const gameData = gameReq.data.data[0];

        if (!gameData) return res.status(404).json({ error: "Game not found. Try the exact ID." });

        // Fetch Thumbnail
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

        // Risk Logic
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
        console.error("Scan Error:", error.message);
        res.status(500).json({ error: "Failed to fetch data. Ensure the ID is valid." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend live on port ${PORT}`));
