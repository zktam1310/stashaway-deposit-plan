const express = require('express')
const mongoose = require('mongoose')
const cors = require('cors')
const dotenv = require('dotenv')

dotenv.config({path: '.env'})
const port = process.env.PORT || 3000;
const app = express()
app.use(cors())
app.use(express.json())

//Routing
const depositRoute = require('./routes/depositPlan')
app.use('/api/deposit', depositRoute)

//Catch fallback routes
app.get('/', (req,res ) => {
  res.json({
    status: 'ok',
    msg: 'Invalid route.'
  })
})

//Connect Mongo DB
async function connectMongo() {
  try {
    await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true });
  } catch (error) {
    console.error(error);
  }
  console.log(`Connected Mongo DB(${process.env.MONGO_URI})`);
}

connectMongo();

app.listen(port, () => {
  console.log(`Express backend running on localhost:${port}`)
})