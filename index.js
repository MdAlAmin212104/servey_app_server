const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_NAME}:${process.env.DB_PASS}@cluster0.ythezyh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    //await client.connect();
    // Send a ping to confirm a successful connection
    //await client.db("admin").command({ ping: 1 });

    const userCollections = client.db("survey").collection("users");
    const surveyCollections = client.db("survey").collection("surveyList");

    app.get("/user", async (req, res) => {
      const users = await userCollections.find({}).toArray();
      res.send(users);
    });

    app.post("/user", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const isExist = await userCollections.findOne(query);
      if (isExist) return res.send(isExist);
      const result = await userCollections.insertOne(user);
      res.send(result);
    });

    app.get("/survey", async (req, res) => {
      const email = req.query.email;
      let query = {};
      if (email) {
        query = { surveyEmail: email };
      }
      const result = await surveyCollections.find(query).toArray();
      res.send(result);
    });

    app.post("/survey", async (req, res) => {
      const information = req.body;
      const PresentDate = new Date().getDate();
      const month = new Date().getMonth() + 1;
      const year = new Date().getFullYear();
      let timestamp = `${year}-${month}-${PresentDate}`;
      const formattedDeadline = timestamp
        .split("-")
        .map((part) => part.padStart(2, "0"))
        .join("-");
      const surveyQuestion = {
        ...information,
        status: "publish",
        timestamp: formattedDeadline,
      };
      const result = await surveyCollections.insertOne(surveyQuestion);
      res.send(result);
    });

    app.get("/survey/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await surveyCollections.findOne(query);
      res.send(result);
    });

    app.delete("/survey/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await surveyCollections.deleteOne(query);
      res.send(result);
    });

    app.patch("/survey/:id", async (req, res) => {
      const id = req.params.id;
      const survey = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          title: survey.title,
          category: survey.category,
          question: survey.question,
          date: survey.date,
          desc: survey.desc,
        },
      };
      const result = await surveyCollections.updateOne(filter, updateDoc);
      res.send(result);
    });

    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    //await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Servey surver start");
});

app.listen(5000, () => {
  console.log(`Surver starting on port ${port}`);
});
