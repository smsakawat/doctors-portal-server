const express = require("express");
const fileUpload = require("express-fileupload");
const app = express();
require("dotenv").config();
const admin = require("firebase-admin");
const ObjectId = require("mongodb").ObjectId;
const stripe = require("stripe")(process.env.SECRET_KEY);
const cors = require("cors");
const { MongoClient } = require("mongodb");

const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
// setting up middlware for converting files
app.use(fileUpload());

// setting up firebase sdk
const serviceAccount = require("./doctors-portal-abc57-firebase-adminsdk-7ejth-c1b92c0959.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// middlware function for verifying the jwt token

async function verifyToken(req, res, next) {
  // we have to use optional chaining here for safety
  if (req.body.headers?.authorization?.startsWith("Bearer ")) {
    const idToken = req.body.headers?.authorization?.split(" ")[1];
    // console.log(idToken);
    try {
      const decodedUser = await admin.auth().verifyIdToken(idToken);
      // console.log(decodedUser);
      if (decodedUser) {
        req.decodedUserEmail = decodedUser.email;
      }
    } catch {}
  }

  next();
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.23ilw.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function run() {
  try {
    await client.connect();
    const database = client.db("Doctors_Portal");
    const appointmentCollection = database.collection("appointments");
    const userCollection = database.collection("users");

    // get api for booked appointmens by date
    app.get("/bookedAppointments", async (req, res) => {
      const date = req.query.date;
      const email = req.query.email;
      // we can also add more then one props in query to find our results depending on those props like a email and also a date
      const query = { email: email, date: date };

      const result = await appointmentCollection.find(query).toArray();

      res.json(result);
    });

    // get api for checking the user is admin or not
    app.get("/users/:email", async (req, res) => {
      const userEmail = req.params.email;
      const query = { email: userEmail };
      const user = await userCollection.findOne(query);
      let isAdmin = false;
      if (user?.role === "admin") {
        isAdmin = true;
      }

      res.json({ admin: isAdmin });
    });

    // post api for appointments
    app.post("/appointments", async (req, res) => {
      const appointment = req.body;
      const result = await appointmentCollection.insertOne(appointment);
      res.json(result);
    });
    // post api for saving user details in db
    app.post("/users", async (req, res) => {
      const user = req.body;
      const result = userCollection.insertOne(user);
      res.json(result);
    });
    // put api for upserting user details when user uses google sign in
    app.put("/users", async (req, res) => {
      const user = req.body;
      const filter = { email: user.email };
      // this is for the reason that,if a user is already in my collection then i don't need to add..but i don't have the user then i am inserting him to my db
      const options = { upsert: true };
      const updateDoc = { $set: user };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      res.json(result);
    });

    // put api for making an admin
    app.put("/users/admin", verifyToken, async (req, res) => {
      const user = req.body;
      console.log(req.decodedUserEmail);
      const query = { email: req.decodedUserEmail };
      const requester = await userCollection.findOne(query);
      if (requester) {
        if (requester.role === "admin") {
          const filter = { email: user.email };
          const updateDoc = { $set: { role: "admin" } };
          const result = await userCollection.updateOne(filter, updateDoc);
          res.json(result);
        }
      } else {
        res.status(403).json({ message: "user is forbidden" });
      }
    });
    // get api for getting specific bookedAppointment details by user to get payment
    app.get("/appointments/:id", async (req, res) => {
      const result = await appointmentCollection.findOne({
        _id: ObjectId(req.params.id),
      });
      res.json(result);
    });

    // put api for updating payment informaion after user successfully paid
    app.put("/appointments/:id", async (req, res) => {
      const payment = req.body;
      const filter = { _id: ObjectId(req.params.id) };
      const updateDoc = {
        $set: {
          payment: payment,
        },
      };
      const result = await appointmentCollection.updateOne(filter, updateDoc);
      res.json(result);
    });

    // api for saving doctors info in db
    app.post("/doctors", async (req, res) => {
      console.log(req.body);
      console.log(req.files);
    });

    // post api for getting user paymentInfo and to create an intent based on this
    app.post("/create-payment-intent", async (req, res) => {
      const paymentInfo = req.body;
      // stirpe always takes price in scents that's why we have to covert the dollar in scent
      const amount = req.body.price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({ clientSecret: paymentIntent.client_secret });
    });
  } finally {
    // await client.close()
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Running doctors portal server");
});

app.listen(port, () => {
  console.log("Listenig server on port", port);
});
