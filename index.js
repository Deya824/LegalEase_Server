const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();
const port = 5000;

app.use(cors());
app.use(express.json());

const uri = process.env.MONGO_DB_URI;
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        await client.connect();
        await client.db("admin").command({ ping: 1 });
        console.log("Connected successfully to HireLa_DB");

        const database = client.db("HireLa_DB");
        const lawyerCollection = database.collection("lawyerInfo");
        const hireCollection = database.collection("hireRequests");
        const commentCollection = database.collection("comments");

        // ==================== LAWYER PROFILE ROUTES ====================

        // POST: Create new lawyer profile
        app.post('/api/lawyer/profile', async (req, res) => {
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

        // PATCH: Update lawyer profile info
        app.patch('/api/lawyer/profile', async (req, res) => {
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

        // PATCH: Update lawyer services list
        app.patch('/api/lawyer/services', async (req, res) => {
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

        // GET: Fetch lawyer profile by userId
        app.get('/api/lawyer/:userId', async (req, res) => {
            try {
                const result = await lawyerCollection.findOne({ userId: req.params.userId });
                res.send(result || {});
            } catch (error) {
                res.status(500).send({ message: "Error fetching profile", error });
            }
        });

        // GET: All lawyers (for public listing)
        app.get('/api/lawyers', async (req, res) => {
            try {
                const result = await lawyerCollection.find({}).toArray();
                res.send(result);
            } catch (error) {
                res.status(500).send({ message: "Error fetching lawyers", error });
            }
        });

        // ==================== HIRE REQUEST ROUTES ====================

        // POST: Create new hire request
        app.post('/api/hire', async (req, res) => {
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

        // GET: Hire requests for a specific lawyer
        app.get('/api/hire/lawyer/:lawyerId', async (req, res) => {
            try {
                const result = await hireCollection.find({ lawyerId: req.params.lawyerId }).toArray();
                res.send(result);
            } catch (error) {
                res.status(500).send({ message: "Error fetching hire requests", error });
            }
        });

        // GET: Hire requests made by a specific client/user
        app.get('/api/hire/client/:clientId', async (req, res) => {
            try {
                const result = await hireCollection.find({ clientId: req.params.clientId }).toArray();
                res.send(result);
            } catch (error) {
                res.status(500).send({ message: "Error fetching hire requests", error });
            }
        });

        // GET: Check if a specific client has hired a specific lawyer
        app.get('/api/hire/check/:lawyerId/:clientId', async (req, res) => {
            try {
                const { lawyerId, clientId } = req.params;
                const hireRecord = await hireCollection.findOne({ lawyerId, clientId });
                res.send({ hasHired: !!hireRecord });
            } catch (error) {
                res.status(500).send({ message: "Error checking hire status", error });
            }
        });

        // PATCH: Accept or Reject a hire request
        app.patch('/api/hire/:id', async (req, res) => {
            try {
                const { status } = req.body; // "accepted" or "rejected"

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

        // ==================== COMMENT ROUTES ====================

        // POST: Add a comment on a lawyer profile (only if user has hired this lawyer)
        app.post('/api/comments', async (req, res) => {
            try {
                const commentData = req.body;
                if (!commentData.lawyerId || !commentData.userId || !commentData.text)
                    return res.status(400).send({ message: "Missing required fields." });

                // Check if this user has a hire record with this lawyer
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

        // GET: Comments for a specific lawyer (public - shown on lawyer details page)
        app.get('/api/comments/lawyer/:lawyerId', async (req, res) => {
            try {
                const result = await commentCollection.find({ lawyerId: req.params.lawyerId }).toArray();
                res.send(result);
            } catch (error) {
                res.status(500).send({ message: "Error fetching comments", error });
            }
        });

        // GET: Comments by a specific user (for "My Comments" page)
        app.get('/api/comments/user/:userId', async (req, res) => {
            try {
                const result = await commentCollection.find({ userId: req.params.userId }).toArray();
                res.send(result);
            } catch (error) {
                res.status(500).send({ message: "Error fetching comments", error });
            }
        });

        // PATCH: Update a comment
        app.patch('/api/comments/:id', async (req, res) => {
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

        // DELETE: Remove a comment
        app.delete('/api/comments/:id', async (req, res) => {
            try {
                const result = await commentCollection.deleteOne({ _id: new ObjectId(req.params.id) });
                res.send(result);
            } catch (error) {
                res.status(500).send({ message: "Error deleting comment", error });
            }
        });
        // PATCH: Mark a hire request as paid
app.patch('/api/hire/:id/pay', async (req, res) => {
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

    } catch (err) {
        console.error("Database connection error:", err);
        process.exit(1);
    }
}

run().catch(console.dir);

app.get('/', (req, res) => res.send('LegalEase Backend Server is Running!'));

app.listen(port, () => console.log(`Server listening on port ${port}`));