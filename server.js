const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '/')));

// --- FRONTEND ROUTE ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- GAME SCAN ENDPOINT ---
app.get('/api/scan/:id', async (req, res) => {
    try {
        let id = req.params.id;
        
        // 1. ID Conversion Logic
        try {
            const conversionReq = await axios.get(`https://apis.roblox.com/universes/v1/places/${id}/universe`);
            if (conversionReq.data && conversionReq.data.universeId) {
                id = conversionReq.data.universeId;
            }
        } catch (e) { console.log("ID is likely already a Universe ID."); }

        // 2. Fetch Game Info & Thumbnail in Parallel
        const [gameReq, thumbReq] = await Promise.all([
            axios.get(`https://games.roblox.com/v1/games?universeIds=${id}`),
            axios.get(`https://thumbnails.roblox.com/v1/games/multiget/thumbnails?universeIds=${id}&size=768x432&format=Png`)
        ]);

        const gameData = gameReq.data.data[0];
        if (!gameData) return res.status(404).json({ error: "Game not found." });

        const thumbUrl = thumbReq.data.data[0]?.thumbnails[0]?.imageUrl || "";

        // 3. Creator Data Logic
        let creatorAge = "Unknown";
        let isNewAccount = false;
        let creatorThumb = "";

        if (gameData.creator.creatorType === "User") {
            const userReq = await axios.get(`https://users.roblox.com/v1/users/${gameData.creator.id}`);
            const createdDate = new Date(userReq.data.created);
            creatorAge = createdDate.toLocaleDateString();
            isNewAccount = createdDate > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        }

        try {
            const type = gameData.creator.creatorType === "User" ? "users" : "groups";
            const cThumbReq = await axios.get(`https://thumbnails.roblox.com/v1/${type}/icons?itemIds=${gameData.creator.id}&size=150x150&format=Png`);
            creatorThumb = cThumbReq.data.data[0]?.imageUrl || "";
        } catch(e) { console.log("Creator thumb fetch failed"); }

        // 4. Scoring Engine
        let score = 100;
        if (isNewAccount && gameData.visits > 1000) score -= 50;
        if (gameData.visits < 500) score -= 20;
        if (gameData.copyingAllowed) score -= 10;
        
        let riskLevel = score < 60 ? "HIGH" : (score < 85 ? "MEDIUM" : "LOW");

        res.json({
            name: gameData.name,
            creator: gameData.creator.name,
            creatorThumb: creatorThumb,
            thumbnail: thumbUrl,
            visits: gameData.visits.toLocaleString(),
            age: creatorAge,
            safetyScore: score,
            riskLevel: riskLevel
        });
    } catch (error) { 
        res.status(500).json({ error: "Scan failed." }); 
    }
});

// --- PLAYER SCAN ENDPOINT ---
app.get('/api/player/:query', async (req, res) => {
    try {
        const query = req.params.query;
        let userId;

        if (isNaN(query)) {
            const userSearch = await axios.post('https://users.roblox.com/v1/usernames/users', { usernames: [query], excludeBannedUsers: false });
            if (!userSearch.data.data.length) return res.status(404).json({ error: "User not found" });
            userId = userSearch.data.data[0].id;
        } else {
            userId = query;
        }

        const [userInfo, userThumb, friendsCount] = await Promise.all([
            axios.get(`https://users.roblox.com/v1/users/${userId}`),
            axios.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=true`),
            axios.get(`https://friends.roblox.com/v1/users/${userId}/friends/count`)
        ]);

        const createdDate = new Date(userInfo.data.created);
        const accountAgeDays = Math.floor((new Date() - createdDate) / (1000 * 60 * 60 * 24));
        
        let status = "LIKELY HUMAN";
        let color = "#32d74b";

        if (accountAgeDays < 7 && friendsCount.data.count === 0) {
            status = "HIGHLY SUSPICIOUS (POSSIBLE BOT)";
            color = "#ff453a"; 
        } else if (accountAgeDays < 30 || friendsCount.data.count === 0) {
            status = "NEW ACCOUNT";
            color = "#ffcc00"; 
        }

        res.json({
            name: userInfo.data.name,
            displayName: userInfo.data.displayName,
            userId: userId,
            joined: createdDate.toLocaleDateString(),
            verified: userInfo.data.hasVerifiedBadge,
            friends: friendsCount.data.count,
            thumbnail: userThumb.data.data[0]?.imageUrl,
            integrity: status,
            integrityColor: color
        });
    } catch (error) {
        res.status(500).json({ error: "Player not found." });
    }
});

// --- LIVE COUNTER ENDPOINT (FIXED & SEPARATED) ---
app.get('/api/live/:id', async (req, res) => {
    try {
        let id = req.params.id;

        try {
            const conv = await axios.get(`https://apis.roblox.com/universes/v1/places/${id}/universe`);
            if (conv.data && conv.data.universeId) id = conv.data.universeId;
        } catch (e) {}

        const [gameReq, voteReq, favReq] = await Promise.all([
            axios.get(`https://games.roblox.com/v1/games?universeIds=${id}`),
            axios.get(`https://games.roblox.com/v1/games/votes?universeIds=${id}`),
            axios.get(`https://games.roblox.com/v1/games/${id}/favorites/count`)
        ]);

        const gameData = gameReq.data.data[0];
        const voteData = voteReq.data.data[0];

        if (!gameData) return res.status(404).json({ error: "Game not found" });

        const totalVotes = voteData.upVotes + voteData.downVotes;
        const rating = totalVotes > 0 ? Math.floor((voteData.upVotes / totalVotes) * 100) : 0;

        res.json({
            name: gameData.name,
            playing: gameData.playing.toLocaleString(),
            visits: gameData.visits.toLocaleString(),
            likes: voteData.upVotes.toLocaleString(),
            dislikes: voteData.downVotes.toLocaleString(),
            rating: rating + "%",
            favorites: favReq.data.favoritesCount.toLocaleString()
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch live data." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Nexus Server running on port ${PORT}`));
