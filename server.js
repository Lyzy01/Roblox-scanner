const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '/')));

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

// --- GAME SCAN ---
app.get('/api/scan/:id', async (req, res) => {
    try {
        let id = req.params.id;
        try {
            const conv = await axios.get(`https://apis.roblox.com/universes/v1/places/${id}/universe`);
            if (conv.data?.universeId) id = conv.data.universeId;
        } catch (e) {}
        const [g, t] = await Promise.all([
            axios.get(`https://games.roblox.com/v1/games?universeIds=${id}`),
            axios.get(`https://thumbnails.roblox.com/v1/games/multiget/thumbnails?universeIds=${id}&size=768x432&format=Png`)
        ]);
        const data = g.data.data[0];
        if (!data) return res.status(404).json({ error: "Game not found" });
        let score = 100;
        if (data.visits < 1000) score -= 30;
        res.json({ name: data.name, score, risk: score < 70 ? "HIGH" : "LOW", visits: data.visits.toLocaleString() });
    } catch (e) { res.status(500).json({ error: "Scan error" }); }
});

// --- PLAYER SCAN ---
app.get('/api/player/:query', async (req, res) => {
    try {
        let q = req.params.query, uid = q;
        if (isNaN(q)) {
            const s = await axios.post('https://users.roblox.com/v1/usernames/users', { usernames: [q] });
            if (!s.data.data.length) return res.status(404).json({ error: "User not found" });
            uid = s.data.data[0].id;
        }
        const [u, t, f] = await Promise.all([
            axios.get(`https://users.roblox.com/v1/users/${uid}`),
            axios.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${uid}&size=150x150&format=Png`),
            axios.get(`https://friends.roblox.com/v1/users/${uid}/friends/count`)
        ]);
        res.json({ name: u.data.name, display: u.data.displayName, friends: f.data.count, thumb: t.data.data[0].imageUrl });
    } catch (e) { res.status(500).json({ error: "Player error" }); }
});

// --- LIVE COUNTER ---
app.get('/api/live/:id', async (req, res) => {
    try {
        let id = req.params.id;
        try {
            const conv = await axios.get(`https://apis.roblox.com/universes/v1/places/${id}/universe`);
            if (conv.data?.universeId) id = conv.data.universeId;
        } catch (e) {}
        const [g, v, f] = await Promise.all([
            axios.get(`https://games.roblox.com/v1/games?universeIds=${id}`),
            axios.get(`https://games.roblox.com/v1/games/votes?universeIds=${id}`),
            axios.get(`https://games.roblox.com/v1/games/${id}/favorites/count`)
        ]);
        const game = g.data.data[0];
        const votes = v.data.data[0];
        const rate = Math.floor((votes.upVotes / (votes.upVotes + votes.downVotes)) * 100);
        res.json({ name: game.name, playing: game.playing.toLocaleString(), favs: f.data.favoritesCount.toLocaleString(), likes: votes.upVotes.toLocaleString(), rating: rate + "%" });
    } catch (e) { res.status(500).json({ error: "Live error" }); }
});

// --- GROUP AUDIT ---
app.get('/api/group/:id', async (req, res) => {
    try {
        const [g, r] = await Promise.all([
            axios.get(`https://groups.roblox.com/v1/groups/${req.params.id}`),
            axios.get(`https://groups.roblox.com/v1/groups/${req.params.id}/roles`)
        ]);
        res.json({ name: g.data.name, owner: g.data.owner?.username || "None", members: g.data.memberCount.toLocaleString(), ranks: r.data.roles.length });
    } catch (e) { res.status(500).json({ error: "Group error" }); }
});

// --- ECONOMY TRACKER (Simulated for Demo) ---
app.get('/api/economy', (req, res) => {
    // In a real app, you'd scrape a site like Rolimons
    const rap = Math.floor(Math.random() * (50000 - 45000) + 45000);
    res.json({ item: "Super Happy Face", rap: rap });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Nexus Suite Online on ${PORT}`));
