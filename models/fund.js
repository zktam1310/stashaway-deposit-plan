const mongoose = require('mongoose')

const allocationSchema = mongoose.Schema({
  portfolio_ref: {
    type: String
  },
  allocated_amount: {
    type: Number
  },
  plan_type: {
    type: String
  }
})

const fundSchema = mongoose.Schema({
  deposit_id: {
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
  leftover_amount: {
    type: Number,
    required: true
  },
  allocation: [allocationSchema],
  isEmpty: {
    type: Boolean,
    required: true,
    default: false
  },
  batch_id: {
    type: String,
    required: true
  }
}, {timestamps: true});

const Fund = mongoose.model('Fund', fundSchema)

module.exports = { Fund }