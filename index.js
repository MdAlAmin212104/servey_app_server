const express = require("express");
const cors = require("cors");
const jwt = require('jsonwebtoken');
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
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
    const paymentCollections = client.db("survey").collection("payments");
    const votingCollections = client.db("survey").collection("voting");
    const reportCollections = client.db("survey").collection("report");
    const commentCollections = client.db("survey").collection("comment");
    const feedbackCollections = client.db("survey").collection("feedback");


    // jwt token create
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN, {
        expiresIn: "20h",
      });
      res.send({ token });
    });

    // middleware 

    const verifyToken = (req, res, next) => {
      //console.log('insert the token',req.headers)
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorize access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "unauthorize access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    // verify admin middleware
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollections.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // admin operation in backend

    // get admin user profile
    app.post("/user", verifyToken, async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const isExist = await userCollections.findOne(query);
      if (isExist) return res.send(isExist);
      const result = await userCollections.insertOne(user);
      res.send(result);
    });


    app.get("/user/admin/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await userCollections.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });
    
    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
      //console.log(req.headers.authorization);
      const role = req.query.role;
      let query = {};
      if (role) {
        query = { role: role };
      }
      const users = await userCollections.find(query).toArray();
      res.send(users);
    })

    app.delete("/user/:id",verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollections.deleteOne(query);
      res.send(result);
    });

    // payment intent
    app.post("/create_payment_intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post("/payment", verifyToken, async (req, res) => {
      const payment = req.body;
      const userEmail = payment.email
      const user = await userCollections.findOne({email : userEmail})
      if(user){
        const updateDoc = {
          $set : {
            role : 'pro-user'
          }
        }
        const userUpdate = await userCollections.updateOne({email : userEmail}, updateDoc)
        res.send(userUpdate)
        
      }

    });

    app.get('/payment', async (req, res) => {
      const payments = await paymentCollections.find().toArray();
      res.send(payments);
    })

    app.put('/updateUserRole', verifyToken, async (req, res) => {
      const userInfo = req.body;
      const id = userInfo._id;
      if(id){
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            role: userInfo.role,
          },
        };
        const result = await userCollections.updateOne(filter, updateDoc);
        res.send(result);
      };
    })


    app.post('/voting', verifyToken, async (req, res) => {
      const voting = req.body;
      const vote = voting.voting;
      const survey_id = voting.survey_id;
      let surveyUpdate;
  
      if (survey_id) {
          const filter = {
              _id: new ObjectId(survey_id)
          };
  
          const surveyList = await surveyCollections.findOne(filter);
  
          const update = vote === true ?
            { $inc: { 'votes.yesVotes': 1 } } :
            { $inc: { 'votes.noVotes': 1 } };
  
        surveyUpdate = await surveyCollections.updateOne(filter, update, { new: true });
      }
  
    const result = await votingCollections.insertOne(voting);
    res.send({result, surveyUpdate});
  });
  

    app.get('/voting', async (req, res) => {
      const survey_id = req.query.survey_id;
      let query = {}
      if(survey_id){
        query = { survey_id : survey_id};
      }
      const voting = await votingCollections.find(query).toArray();
      res.send(voting);
    })
    

    app.get("/survey", async (req, res) => {
      const email = req.query.email;
      let query = {};
      if (email) {
        query = { surveyEmail: email };
      }
      const result = await surveyCollections.find(query).toArray();
      const pipeline = [
        {
          $addFields: {
            totalVotes: { $add: ['$votes.yesVotes', '$votes.noVotes'] }
          }
        },
        {
          $sort: { totalVotes: -1 }
        },
        {
          $limit: 6
        }
      ];
      const MostVotingSurvey = await surveyCollections.aggregate(pipeline).toArray();
      const recentSurveys = await surveyCollections.find().sort({ timestamp: -1 }).limit(6).toArray();
      res.send({result, MostVotingSurvey, recentSurveys});
    });

    app.post("/survey", verifyToken, async (req, res) => {
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

    app.delete("/survey/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await surveyCollections.deleteOne(query);
      res.send(result);
    });

    app.patch("/survey/:id", verifyToken, async (req, res) => {
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


    app.patch('/statusUpdate/:id', async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: "unpublished",
        },
      };
      const result = await surveyCollections.updateOne(query, updateDoc);
      res.send(result);
    })


    // user url 
    app.get('/voting/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const voting = await votingCollections.find(query).toArray();
      const survey_id = voting.map(element => element.survey_id);
      const ids = survey_id.map(
        (id) => new ObjectId(id.toString())
      );
      const survey = await surveyCollections.find({ _id: { $in: ids } }).toArray();
      res.send({voting, survey});
    })
    
    app.post('/report', verifyToken, async (req, res) => {
      const report = req.body;
      const result = await reportCollections.insertOne(report);
      res.send(result);
    })

    app.get('/report', verifyToken, async (req, res) => {
      const email = req.query.email;
      let query = {};
      if(email){
        query = { reporterEmail : email};
      }
      const report = await reportCollections.find(query).toArray();
      const survey_id = report.map(element => element.id);
      const ids = survey_id.map(
        (id) => new ObjectId(id.toString())
      );
      const survey = await surveyCollections.find({ _id: { $in: ids } }).toArray();

      res.send({report, survey});
    })

    app.post('/comment', verifyToken, async (req, res) => {
      const comment = req.body;
      console.log(comment);
      const result = await commentCollections.insertOne(comment);
      res.send(result);
    })

    app.get('/comment', verifyToken, async (req, res) => {
      const email = req.query.email;
      //console.log(email);
      let query = {};
      if(email){
        query = { commentEmail : email};
      }
      const comment = await commentCollections.find(query).toArray();
      const survey_id = comment.map(element => element.survey_id);
      const ids = survey_id.map(
        (id) => new ObjectId(id.toString())
      );
      const survey = await surveyCollections.find({ _id: { $in: ids } }).toArray();
      //console.log(survey);
      res.send({comment, survey});
    })
    

    // get surveyor user profile
    app.get("/user/surveyor/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await userCollections.findOne(query);
      let surveyor = false;
      if (user) {
        surveyor = user?.role === "surveyor";
      }
      res.send({ surveyor });
    });

    app.post('/feedback', verifyToken, async (req, res) => {
      const feedback = req.body;
      const result = await feedbackCollections.insertOne(feedback);
      res.send(result);
    })

    app.get('/feedback', async (req, res) => {
      const email = req.query.email;
      let query = {};
      if(email){
        query = { surveyEmail : email };
      }
      const feedback = await feedbackCollections.find(query).toArray();
      const survey_id = feedback.map(element => element.survey_id);
      const ids = survey_id.map(
        (id) => new ObjectId(id.toString())
      );
      const findSurvey = await surveyCollections.find({ _id: { $in: ids } }).toArray();
      res.send({feedback, findSurvey});
    })

    


    // get proUser user profile
    app.get("/user/proUser/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await userCollections.findOne(query);
      let proUser = false;
      if (user) {
        proUser = user?.role === "pro-user";
      }
      res.send({ proUser });
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
