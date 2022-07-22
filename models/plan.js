const mongoose = require('mongoose')
const Schema = mongoose.Schema

const portfolioSchema = Schema({
  portfolio_ref: {
    type: String,
    required: true
  },
  portfolio_amount: {
    type: Number,
    required: true
  },
  paid_amount: {
    type: Number,
    required: true,
    default: 0
  },
  isPaid: {
    type: Boolean,
    required: true,
    default: false
  },
  priority: {
    type: Number,
    required: true
  }
})

const planSchema = Schema({
  plan_id: {
    type: Number,
    required: true,
    unique: true
  },
  account_ref: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  isFulfilled: {
    type: Boolean,
    required: true,
    default: false
  },
  portfolios: [portfolioSchema],
  type: {
    type: String,
    required: true
  },
  batch_id: {
    type: String,
    required: true
  }
}, {timestamps: true});

const Plan = mongoose.model('Plan', planSchema)

module.exports = { Plan }