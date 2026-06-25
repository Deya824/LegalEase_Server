const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const { verifyToken, requireRole } = require('./middleware/auth');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors({}));
app.use(express.json());

const uri = process.env.MONGO_DB_URI;
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

let isConnected = false;

async function connectDB() {
    if (!isConnected) {
        await client.connect();
        isConnected = true;
        console.log('Connected to MongoDB');
    }
}

const database = client.db("HireLa_DB");
const lawyerCollection = database.collection("lawyerInfo");
const hireCollection = database.collection("hireRequests");
const commentCollection = database.collection("comments");
const userCollection = client.db(process.env.AUTH_DB_NAME).collection("user");

// Ensure DB connection before any route runs
app.use(async (req, res, next) => {
    try {
        await connectDB();
        next();
    } catch (err) {
        console.error("DB connection failed:", err);
        res.status(500).send({ message: "Database connection failed", error: err.message });
    }
});

app.get('/', (req, res) => res.send('LegalEase Backend Server is Running!'));

// ... rest of your routes stay exactly the same

// ==================== LAWYER PROFILE ROUTES ====================

app.post('/api/lawyer/profile', verifyToken, async (req, res) => {
    try {
        const profileData = req.body;
        if (!profileData.userId)
            return res.status(400).send({ message: "userId is required." });

        const existing = await lawyerCollection.findOne({ userId: profileData.userId });
        if (existing)
            return res.status(400).send({ message: "Profile already exists." });

        const result = await lawyerCollection.insertOne({
            ...profileData,
            services: [],
            createdAt: new Date(),
        });
        res.status(201).send(result);
    } catch (error) {
        res.status(500).send({ message: "Error creating profile", error });
    }
});

// Get my transactions (User)
app.get('/api/transactions/my-hires', verifyToken, async (req, res) => {
    try {
        const transactions = await hireCollection.find({ 
            clientId: req.user.id, 
            paid: true 
        }).toArray();
        res.send(transactions);
    } catch (error) {
        res.status(500).send({ message: "Error fetching transactions", error });
    }
});

// Admin view for all transactions
app.get('/api/admin/transactions',  async (req, res) => {
    try {
        const transactions = await hireCollection.find({ paid: true }).toArray();
        res.send(transactions);
    } catch (error) {
        res.status(500).send({ message: "Error fetching transactions", error });
    }
});

app.get('/api/transactions/user/:userId', verifyToken, requireRole('user'), async (req, res) => {
    try {
        const result = await hireCollection.find({ 
            clientId: req.params.userId, 
            paid: true 
        }).toArray();
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: "Error fetching transactions", error });
    }
});

app.get('/api/transactions/lawyer/:lawyerId', verifyToken, requireRole('lawyer'), async (req, res) => {
    try {
        const result = await hireCollection.find({ 
            lawyerId: req.params.lawyerId, 
            paid: true 
        }).toArray();
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: "Error fetching transactions", error });
    }
});

app.patch('/api/lawyer/profile', verifyToken, async (req, res) => {
    try {
        const profileData = req.body;
        if (!profileData.userId)
            return res.status(400).send({ message: "userId is required." });

        const filter = { userId: profileData.userId };
        const updateDoc = { $set: { ...profileData, updatedAt: new Date() } };
        const result = await lawyerCollection.updateOne(filter, updateDoc);

        if (result.matchedCount === 0)
            return res.status(404).send({ message: "Profile not found." });

        res.send(result);
    } catch (error) {
        res.status(500).send({ message: "Error updating profile", error });
    }
});

app.patch('/api/lawyer/services', verifyToken, async (req, res) => {
    try {
        const { userId, services } = req.body;
        if (!userId)
            return res.status(400).send({ message: "userId is required." });

        const result = await lawyerCollection.updateOne(
            { userId },
            { $set: { services, updatedAt: new Date() } }
        );

        if (result.matchedCount === 0)
            return res.status(404).send({ message: "Profile not found." });

        res.send(result);
    } catch (error) {
        res.status(500).send({ message: "Error updating services", error });
    }
});

app.get('/api/lawyer/:userId', async (req, res) => {
    try {
        const result = await lawyerCollection.findOne({ userId: req.params.userId });
        res.send(result || {});
    } catch (error) {
        res.status(500).send({ message: "Error fetching profile", error });
    }
});

app.get('/api/lawyers', async (req, res) => {
    try {
        const result = await lawyerCollection.find({}).toArray();
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: "Error fetching lawyers", error });
    }
});

// ==================== HIRE REQUEST ROUTES ====================

app.post('/api/hire', verifyToken, async (req, res) => {
    try {
        const hireData = req.body;
        if (!hireData.lawyerId || !hireData.clientId)
            return res.status(400).send({ message: "Missing required fields." });

        const result = await hireCollection.insertOne({
            ...hireData,
            status: "pending",
            createdAt: new Date(),
        });
        res.status(201).send(result);
    } catch (error) {
        res.status(500).send({ message: "Error creating hire request", error });
    }
});

app.get('/api/hire/lawyer/:lawyerId', verifyToken, async (req, res) => {
    try {
        const result = await hireCollection.find({ lawyerId: req.params.lawyerId }).toArray();
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: "Error fetching hire requests", error });
    }
});

app.get('/api/hire/client/:clientId', async (req, res) => {
    try {
        const result = await hireCollection.find({ clientId: req.params.clientId }).toArray();
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: "Error fetching hire requests", error });
    }
});

app.get('/api/hire/check/:lawyerId/:clientId', async (req, res) => {
    try {
        const { lawyerId, clientId } = req.params;
        const hireRecord = await hireCollection.findOne({ lawyerId, clientId });
        res.send({ hasHired: !!hireRecord });
    } catch (error) {
        res.status(500).send({ message: "Error checking hire status", error });
    }
});

app.patch('/api/hire/:id', async (req, res) => {
    try {
        const { status } = req.body;

        const result = await hireCollection.updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: { status, updatedAt: new Date() } }
        );

        if (result.matchedCount === 0)
            return res.status(404).send({ message: "Request not found." });

        res.send(result);
    } catch (error) {
        res.status(500).send({ message: "Error updating request", error });
    }
});

app.patch('/api/hire/:id/pay', verifyToken, async (req, res) => {
    try {
        const result = await hireCollection.updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: { paid: true, paidAt: new Date() } }
        );

        if (result.matchedCount === 0)
            return res.status(404).send({ message: "Request not found." });

        res.send(result);
    } catch (error) {
        res.status(500).send({ message: "Error updating payment status", error });
    }
});

// ==================== COMMENT ROUTES ====================

app.post('/api/comments', async (req, res) => {
    try {
        const commentData = req.body;
        if (!commentData.lawyerId || !commentData.userId || !commentData.text)
            return res.status(400).send({ message: "Missing required fields." });

        const hireRecord = await hireCollection.findOne({
            lawyerId: commentData.lawyerId,
            clientId: commentData.userId,
        });

        if (!hireRecord) {
            return res.status(403).send({ message: "You must hire this lawyer before commenting." });
        }

        const result = await commentCollection.insertOne({
            ...commentData,
            createdAt: new Date(),
        });
        res.status(201).send(result);
    } catch (error) {
        res.status(500).send({ message: "Error adding comment", error });
    }
});

app.get('/api/comments/lawyer/:lawyerId', async (req, res) => {
    try {
        const result = await commentCollection.find({ lawyerId: req.params.lawyerId }).toArray();
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: "Error fetching comments", error });
    }
});

app.get('/api/comments/user/:userId', async (req, res) => {
    try {
        const result = await commentCollection.find({ userId: req.params.userId }).toArray();
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: "Error fetching comments", error });
    }
});

app.patch('/api/comments/:id', verifyToken, async (req, res) => {
    try {
        const { text } = req.body;
        const result = await commentCollection.updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: { text, updatedAt: new Date() } }
        );
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: "Error updating comment", error });
    }
});

app.delete('/api/comments/:id', verifyToken, async (req, res) => {
    try {
        const result = await commentCollection.deleteOne({ _id: new ObjectId(req.params.id) });
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: "Error deleting comment", error });
    }
});

// ==================== ADMIN ROUTES ====================

app.get('/api/admin/users', verifyToken, requireRole('admin'), async (req, res) => {
    try {
        const users = await userCollection.find({}).toArray();
        res.send(users);
    } catch (error) {
        res.status(500).send({ message: "Error fetching users", error });
    }
});

app.post('/api/auth/update-user', verifyToken, async (req, res) => {
    try {
        const { userId, name, image } = req.body;
        
        if (!userId) {
            return res.status(400).send({ message: "userId is required." });
        }

        const result = await userCollection.updateOne(
            { _id: new ObjectId(userId) }, 
            { $set: { name, image, updatedAt: new Date() } }
        );

        if (result.matchedCount === 0) {
            return res.status(404).send({ message: "User not found." });
        }

        res.send({ message: "Profile updated successfully!" });
    } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Error updating profile", error });
    }
});

app.patch('/api/admin/users/:id/role', async (req, res) => {
    try {
        const { role } = req.body;
        const result = await userCollection.updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: { role } }
        );

        if (result.matchedCount === 0)
            return res.status(404).send({ message: "User not found." });

        res.send(result);
    } catch (error) {
        res.status(500).send({ message: "Error updating role", error });
    }
});

app.delete('/api/admin/users/:id', async (req, res) => {
    try {
        const result = await userCollection.deleteOne({ _id: new ObjectId(req.params.id) });
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: "Error deleting user", error });
    }
});

app.get('/api/admin/transactions', async (req, res) => {
    try {
        const transactions = await hireCollection.find({ paid: true }).toArray();
        res.send(transactions);
    } catch (error) {
        res.status(500).send({ message: "Error fetching transactions", error });
    }
});

app.get('/api/admin/analytics', async (req, res) => {
    try {
        const totalUsers = await userCollection.countDocuments({ role: { $ne: "lawyer" } });
        const totalLawyers = await userCollection.countDocuments({ role: "lawyer" });
        const totalHires = await hireCollection.countDocuments({});
        const paidHires = await hireCollection.find({ paid: true }).toArray();
        const totalRevenue = paidHires.reduce((sum, h) => sum + (Number(h.fee) || 0), 0);

        res.send({
            totalUsers,
            totalLawyers,
            totalHires,
            totalRevenue,
        });
    } catch (error) {
        res.status(500).send({ message: "Error fetching analytics", error });
    }
});

app.listen(port, () => console.log(`Server listening on port ${port}`));

module.exports = app;