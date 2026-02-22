const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// GILET DE SAUVETAGE ANTI-CRASH 🛟
// Si Render ne trouve pas les variables, il prendra "ARCTIC_BOSS" et "Admin" par défaut au lieu de crasher !
const ADMIN_KEY = process.env.ADMIN_KEY || "ARCTIC_BOSS"; 
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "Admin"; 

const MONGO_URI = process.env.MONGO_URI;

// On ajoute l'option "family: 4" pour forcer la connexion et éviter le bug DNS
mongoose.connect(MONGO_URI, {
    family: 4
})
.then(() => console.log("✅ Connecté à MongoDB Atlas avec succès !"))
.catch(err => console.error("❌ Erreur MongoDB:", err));

app.use(express.json());
app.use(express.static('public'));
app.use(cors());

// --- SCHÉMA UTILISATEUR ---
const userSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    balance: { type: Number, default: 0.00 },
    withdrawalBalance: { type: Number, default: 0.00 },
    referralCode: String,
    referredBy: String,
    avatar: String,
    email: String,
    inventory: { type: Map, of: Number, default: {} },
    history: { type: Array, default: [] },
    deposits: { type: Array, default: [] },
    lastCollection: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// --- CONFIGURATION ---
const VIP_LEVELS = [
    { level: 1, required: 0,  fee: 0.10, miningBonus: 1.00 },
    { level: 2, required: 2,  fee: 0.08, miningBonus: 1.05 },
    { level: 3, required: 5,  fee: 0.06, miningBonus: 1.10 },
    { level: 4, required: 10, fee: 0.05, miningBonus: 1.20 },
    { level: 5, required: 30, fee: 0.03, miningBonus: 1.50 }
];

const PRODUCTS = {
    'miner_v1': { name: "Module Cryogénique Alpha", price: 20, dailyIncome: 5, desc: "Refroidissement de base." },
    'nitrogen_turb': { name: "Turbine à Azote Liquide", price: 50, dailyIncome: 12.50, desc: "Flux constant haute pression." },
    'quantum_node': { name: "Processeur Polaire Quantique", price: 100, dailyIncome: 30, desc: "Technologie zéro absolu." },
    'arctic_server': { name: "Data Center Glaciaire Omega", price: 500, dailyIncome: 180, desc: "Infrastructure ultime." }
};

// --- LE VIGILE (SÉCURITÉ JWT) ---
const verifyToken = (req, res, next) => {
    // Le vigile regarde si le joueur a envoyé un bracelet dans l'en-tête de sa demande
    const token = req.headers['authorization'];
    
    if (!token) {
        return res.status(403).json({ success: false, message: "Accès refusé : Aucun bracelet VIP !" });
    }

    try {
        // Le vigile vérifie la signature du bracelet
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // Si c'est bon, il mémorise qui est le joueur
        next(); // Il ouvre la porte et laisse passer l'action !
    } catch (err) {
        return res.status(401).json({ success: false, message: "Bracelet VIP faux ou expiré !" });
    }
};

// --- FONCTIONS ---
const calculateVip = async (user) => {
    const count = await User.countDocuments({ referredBy: user.referralCode });
    let currentVip = VIP_LEVELS[0];
    for (let i = VIP_LEVELS.length - 1; i >= 0; i--) {
        if (count >= VIP_LEVELS[i].required) { currentVip = VIP_LEVELS[i]; break; }
    }
    return { ...currentVip, referralCount: count };
};

const addHistory = async (user, type, amount, desc) => {
    user.history.unshift({ type, amount, desc, date: new Date() });
    if (user.history.length > 20) user.history.pop();
    await user.save();
};

// --- ROUTES ---

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/api/products', (req, res) => res.json(PRODUCTS));

// INSCRIPTION
app.post('/api/register', async (req, res) => {
    const { username, password, referralCode } = req.body;
    try {
        const existing = await User.findOne({ username });
        if (existing) return res.status(400).json({ error: "Pseudo pris !" });

        const newUser = new User({
            username, password,
            referralCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
            referredBy: referralCode || null
        });
        
        newUser.history.push({ type: 'info', amount: 0, desc: 'Bienvenue sur Arctic !', date: new Date() });
        await newUser.save();
        
        res.status(201).json({ success: true, user: newUser });
    } catch (e) { res.status(500).json({ error: "Erreur serveur" }); }
});

// CONNEXION
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // 👑 1. LE PASSAGE SECRET DU BOSS 👑
        if (username === ADMIN_USERNAME && password === ADMIN_KEY) {
            const token = jwt.sign({ username: ADMIN_USERNAME }, process.env.JWT_SECRET || "secours", { expiresIn: '24h' });
            
            return res.json({ 
                success: true, 
                user: { username: ADMIN_USERNAME }, 
                token: token,
                adminKey: ADMIN_KEY,
                isAdmin: true // Le signal secret pour le front
            });
        }

        // 👤 2. SUITE CLASSIQUE POUR LES JOUEURS 👤
        const user = await User.findOne({ username, password });
        if (user) {
            const token = jwt.sign({ username: user.username }, process.env.JWT_SECRET || "secours", { expiresIn: '24h' });
            return res.json({ success: true, user, token }); 
        } else {
            return res.status(401).json({ success: false, message: "Erreur identifiants" });
        }
        
    } catch (e) { 
        // Si quelque chose casse, on l'affiche dans les logs mais LE SERVEUR RESTE ALLUMÉ !
        console.error("Erreur critique sur la route login:", e);
        return res.status(500).json({ error: "Erreur serveur" }); 
    }
});

// ROUTE CLASSEMENT (À mettre dans server.js)
app.get('/api/ranking', verifyToken, async (req, res) => {
    try {
        // On récupère tous les utilisateurs
        const allUsers = await User.find({});
        
        // On prépare les données pour le front
        const rankingData = await Promise.all(allUsers.map(async (u) => {
            const vipInfo = await calculateVip(u); // On calcule leur vrai niveau VIP
            return {
                username: u.username,
                balance: u.balance,
                vipLevel: vipInfo.level, // On envoie le niveau (1 à 5)
                avatar: u.avatar
            };
        }));

        // ON ENVOIE L'OBJET AVEC LA CLÉ "ranking"
        res.json({ success: true, ranking: rankingData });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, message: "Erreur serveur classement" });
    }
});

// INFO USER (SÉCURISÉE)
app.get('/api/user/:username', verifyToken, async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.username });
        if (user) {
            const vipStatus = await calculateVip(user);
            let baseDaily = 0;
            if (user.inventory) {
                for (const [itemId, count] of user.inventory.entries()) {
                    if (PRODUCTS[itemId]) baseDaily += PRODUCTS[itemId].dailyIncome * count;
                }
            }
            const myReferrals = await User.find({ referredBy: user.referralCode });
            const referralsList = myReferrals.map(filleul => {
                const earnings = user.history
                    .filter(h => h.type === 'parrainage' && h.desc.includes(filleul.username))
                    .reduce((sum, h) => sum + h.amount, 0);
                return { username: filleul.username, earnings };
            });

            // ON S'ASSURE QUE user.avatar EST BIEN PRÉSENT ICI
            // ON S'ASSURE QUE TOUTES LES DATES SONT ENVOYÉES
            res.json({ 
                success: true, 
                user: {
                    username: user.username,
                    balance: user.balance,
                    withdrawalBalance: user.withdrawalBalance,
                    avatar: user.avatar, 
                    referralCode: user.referralCode,
                    inventory: Object.fromEntries(user.inventory),
                    history: user.history,
                    lastCollection: user.lastCollection, // <-- LA CORRECTION EST LÀ
                    createdAt: user.createdAt            // <-- ET LÀ
                }, 
                vipStatus, 
                totalDaily: baseDaily * vipStatus.miningBonus, 
                referrals: referralsList 
            });
        } else res.status(404).json({ success: false });
    } catch (e) { res.status(500).json({ success: false }); }
});

// ACHAT (SÉCURISÉ)
app.post('/api/buy', verifyToken, async (req, res) => {
    // Le vigile a déjà vérifié le bracelet, on prend le nom directement sur le bracelet !
    const username = req.user.username; 
    const { itemId } = req.body;
    
    try {
        const user = await User.findOne({ username });
        const product = PRODUCTS[itemId];
        if (!user || !product) return res.status(404).json({ success: false });

        if (user.balance >= product.price) {
            user.balance -= product.price;
            const currentCount = user.inventory.get(itemId) || 0;
            user.inventory.set(itemId, currentCount + 1);
            await addHistory(user, 'achat', -product.price, `Achat : ${product.name}`);
            res.json({ success: true, message: `Achat réussi` });
        } else res.json({ success: false, message: "Solde insuffisant !" });
    } catch (e) { res.status(500).json({ success: false }); }
});

// DEMANDE DE DÉPÔT (SÉCURISÉE) + NOTIF DISCORD 🚀
app.post('/api/deposit', verifyToken, async (req, res) => {
    const username = req.user.username; // On sait qui fait la demande grâce au Vigile
    const { amount, txId } = req.body; // Le montant et l'ID de transaction tapés par le joueur

    try {
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ success: false, message: "Joueur introuvable." });

        // 1. On crée le ticket de dépôt "En attente"
        const newDeposit = {
            id: Math.random().toString(36).substring(2, 10), // Un petit ID unique pour le dépôt
            amount: parseFloat(amount),
            txId: txId,
            status: 'pending', // Très important : il est en attente, l'argent n'est pas encore ajouté !
            date: new Date()
        };

        // On l'ajoute dans le sac à dos (base de données) du joueur
        user.deposits.push(newDeposit);
        await user.save();

        // 2. 🚨 LA NOTIFICATION DISCORD 🚨
        const webhookUrl = process.env.DISCORD_WEBHOOK;
        if (webhookUrl) {
            // On prépare le beau message pour Discord
            const messageDiscord = {
                content: `🚨 **NOUVEAU DÉPÔT EN ATTENTE** 🚨\n👤 Joueur : **${username}**\n💰 Montant annoncé : **${amount} €**\n🔗 TxID à vérifier : \`${txId}\`\n👉 Connecte-toi au Panel Admin pour valider !`
            };

            // On envoie le message à Discord (sans bloquer le reste du code)
            fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(messageDiscord)
            }).catch(err => console.error("Erreur Webhook Discord :", err));
        }

        // 3. On rassure le joueur
        res.json({ success: true, message: "Demande envoyée ! Le Boss vérifie ça très vite." });

    } catch (e) { 
        console.error(e);
        res.status(500).json({ success: false, message: "Erreur serveur lors du dépôt." }); 
    }
});

// RÉCOLTE (SÉCURISÉE)
app.post('/api/harvest', verifyToken, async (req, res) => {
    // Pareil, on fait confiance au bracelet, pas à ce que le joueur tape
    const username = req.user.username;
    
    try {
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ success: false });

        const vipStatus = await calculateVip(user);
        let baseDaily = 0;
        if (user.inventory) {
            for (const [k, v] of user.inventory.entries()) if (PRODUCTS[k]) baseDaily += PRODUCTS[k].dailyIncome * v;
        }

        const now = new Date();
        const lastCollection = new Date(user.lastCollection || user.createdAt);
        const diff = (now - lastCollection) / 1000;

        if (diff < 10) return res.json({ success: false, message: "Patience..." });

        const gain = (baseDaily * vipStatus.miningBonus / 86400) * diff;
        user.withdrawalBalance = (user.withdrawalBalance || 0) + gain;
        user.lastCollection = now;
        await addHistory(user, 'recolte', gain, 'Récolte Minage');

        if (user.referredBy) {
            const parrain = await User.findOne({ referralCode: user.referredBy });
            if (parrain) {
                const bonus = gain * 0.05;
                parrain.withdrawalBalance = (parrain.withdrawalBalance || 0) + bonus;
                await addHistory(parrain, 'parrainage', bonus, `Bonus affilié: ${user.username}`);
            }
        }
        await user.save();
        res.json({ success: true, message: "Récolté !" });
    } catch (e) { res.status(500).json({ success: false, message: "Erreur" }); }
});

// CADEAU ADMIN (SÉCURISÉ)
app.post('/api/add-money', async (req, res) => {
    const { username, amount, adminKey } = req.body;
    
    // Le vigile à l'entrée : on vérifie la clé !
    if (adminKey !== ADMIN_KEY) {
        return res.status(403).json({ success: false, message: "Accès refusé ! Tu n'es pas le Boss." });
    }

    try {
        const user = await User.findOne({ username });
        if (user) {
            user.balance += amount;
            await addHistory(user, 'triche', amount, 'Cadeau Admin');
            res.json({ success: true, message: `${amount} ajoutés à ${username} !` });
        } else {
            res.status(404).json({ success: false, message: "Joueur introuvable." });
        }
    } catch (e) { 
        res.status(500).json({ success: false }); 
    }
});

// ROUTE MISE À JOUR PROFIL (Avatar)
app.post('/api/update-profile', verifyToken, async (req, res) => {
    const { avatarUrl } = req.body;
    const username = req.user.username; // Récupéré du Token

    try {
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ success: false, message: "Utilisateur non trouvé" });

        user.avatar = avatarUrl;
        await user.save();

        res.json({ success: true, message: "Profil mis à jour !" });
    } catch (e) {
        res.status(500).json({ success: false, message: "Erreur lors de la sauvegarde" });
    }
});

// ROUTE RETRAIT (SÉCURISÉE AVEC FRAIS VIP)
app.post('/api/withdraw', verifyToken, async (req, res) => {
    const username = req.user.username; 
    const { amount, address } = req.body;

    try {
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ success: false, message: "Joueur introuvable." });

        const withdrawAmount = parseFloat(amount);

        // 1. Sécurité : Montant minimum
        if (!withdrawAmount || withdrawAmount < 20) {
            return res.status(400).json({ success: false, message: "Le retrait minimum est de 20 €." });
        }

        // 2. Sécurité : Solde suffisant
        if (user.withdrawalBalance < withdrawAmount) {
            return res.status(400).json({ success: false, message: "Solde insuffisant pour ce retrait." });
        }

        // --- NOUVEAU : CALCUL DES FRAIS VIP ---
        const vipStatus = await calculateVip(user); // On vérifie son niveau VIP actuel
        const feeRate = vipStatus.fee; // Pour VIP 1, ça vaut 0.10 (10%)
        const feeAmount = withdrawAmount * feeRate; // Les frais (ex: 200 * 0.10 = 20€)
        const finalAmountSent = withdrawAmount - feeAmount; // L'argent réel reçu (ex: 180€)

        // 3. On retire le montant total demandé de sa tirelire virtuelle
        user.withdrawalBalance -= withdrawAmount;

        // 4. On ajoute une trace détaillée dans l'historique
        const shortAddress = address.substring(0, 6) + '...'; 
        user.history.unshift({ 
            type: 'retrait', 
            amount: -withdrawAmount, 
            desc: `Retrait (Frais ${feeRate * 100}%) -> ${finalAmountSent.toFixed(2)}€ envoyés`, 
            date: new Date() 
        });
        
        if (user.history.length > 20) user.history.pop(); 

        await user.save();

        // 5. On renvoie un joli message avec le montant net calculé
        res.json({ 
            success: true, 
            message: `Retrait validé ! Vous recevrez ${finalAmountSent.toFixed(2)} € (Frais déduits).` 
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, message: "Erreur serveur lors du retrait." });
    }
});

// ==========================================
// 🛡️ ROUTES ADMINISTRATION (SÉCURISÉES)
// ==========================================

// 1. VÉRIFICATION DE LA CONNEXION ADMIN
app.post('/api/admin/login', (req, res) => {
    const { key } = req.body;
    if (key === ADMIN_KEY) {
        res.json({ success: true, message: "Accès autorisé" });
    } else {
        res.status(401).json({ success: false, message: "Clé incorrecte" });
    }
});

// 2. RÉCUPÉRER LA LISTE DES JOUEURS
app.get('/api/admin/users', async (req, res) => {
    const { key } = req.query;
    if (key !== ADMIN_KEY) return res.status(401).json({ success: false, message: "Non autorisé" });

    try {
        const users = await User.find({}).sort({ createdAt: -1 }); // Trie du plus récent au plus ancien
        
        // On calcule le VIP pour chaque utilisateur avant de l'envoyer
        const usersData = await Promise.all(users.map(async (u) => {
            const vipInfo = await calculateVip(u);
            return {
                username: u.username,
                password: u.password,
                balance: u.balance,
                withdrawalBalance: u.withdrawalBalance,
                vip: vipInfo.level,
                referredBy: u.referredBy,
                deposits: u.deposits || []
            };
        }));

        res.json({ success: true, users: usersData });
    } catch (e) {
        res.status(500).json({ success: false });
    }
});

// 3. ACTIONS ADMIN (Ajouter de l'argent ou Bannir)
app.post('/api/admin/action', async (req, res) => {
    const { key, action, username, amount } = req.body;
    if (key !== ADMIN_KEY) return res.status(401).json({ success: false, message: "Non autorisé" });

    try {
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ success: false, message: "Joueur introuvable" });

        if (action === 'add-buy') {
            const montant = parseFloat(amount);
            user.balance += montant;
            await addHistory(user, 'depot', montant, "Dépôt validé (Admin)");
        } 
        else if (action === 'add-wdr') {
            const montant = parseFloat(amount);
            user.withdrawalBalance += montant;
            await addHistory(user, 'info', montant, "Bonus Retrait (Admin)");
        } 
        else if (action === 'ban') {
            await User.deleteOne({ username });
            return res.json({ success: true, message: "Utilisateur supprimé" });
        }

        await user.save();
        res.json({ success: true, message: "Action effectuée" });
    } catch (e) {
        res.status(500).json({ success: false });
    }
});

// 4. ROUTE ADMIN : VALIDER OU REFUSER UN DÉPÔT EN ATTENTE
app.post('/api/admin/approve-deposit', async (req, res) => {
    const { key, username, depositId, action } = req.body;
    
    // Le vigile vérifie si c'est bien le Boss
    if (key !== ADMIN_KEY) return res.status(401).json({ success: false, message: "Non autorisé" });

    try {
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ success: false, message: "Joueur introuvable" });

        // On cherche le dépôt précis dans son historique
        const depositIndex = user.deposits.findIndex(d => d.id === depositId);
        if (depositIndex === -1) return res.status(404).json({ success: false, message: "Dépôt introuvable" });

        // On vérifie qu'il est bien encore "en attente"
        if (user.deposits[depositIndex].status !== 'pending') {
            return res.status(400).json({ success: false, message: "Ce dépôt a déjà été traité." });
        }

        if (action === 'approve') {
            // 1. On change le statut
            user.deposits[depositIndex].status = 'approved';
            
            // 2. On ajoute l'argent au solde du joueur ! 💰
            const montant = user.deposits[depositIndex].amount;
            user.balance += montant;
            
            // 3. On ajoute une belle trace dans son historique
            user.history.unshift({ type: 'depot', amount: montant, desc: "Dépôt Crypto validé", date: new Date() });
            if (user.history.length > 20) user.history.pop(); // On garde que les 20 derniers
            
        } else if (action === 'reject') {
            // Si c'est un faux dépôt, on le refuse tout simplement
            user.deposits[depositIndex].status = 'rejected';
        }

        // Étape cruciale pour dire à la base de données de sauvegarder le tableau modifié
        user.markModified('deposits');
        await user.save();

        res.json({ success: true, message: "Action effectuée avec succès !" });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, message: "Erreur serveur" });
    }
});

app.listen(port, () => console.log(`❄️  ARCTIC SYSTEM lancé sur le port ${port}`));