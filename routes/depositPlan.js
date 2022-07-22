const express = require('express');
const router = express.Router();
const { Plan } = require('../models/plan');
const { Fund } = require('../models/fund');

router.get('/', async (req,res) => {

    const data = {};

    const plans = await Plan.find();
    if(plans && plans.length > 0) data['plans'] = plans;

    const funds = await Fund.find();
    if(funds && funds.length > 0) data['funds'] = funds;

    res.json({
        status: 'ok',
        data: data
    })

})

router.post('/', async (req,res) => {

    //May refer to sample input (req.body) in sample.json

    const account_ref = req.body.account_ref;
    const plans = req.body.plans;
    const funds = req.body.funds;
    const batch_id = Date.now().toString(36);

    // == Input validation ==
    if(!account_ref) return errorHandler("Account reference number is missing.", res);
    if(!plans) return errorHandler("Deposit plan(s) is missing.", res);
    if(!funds) return errorHandler("Deposit fund(s) is missing.", res);

    for (let i = 0; i < plans.length; i++) {
        if (!plans[i].amount) return errorHandler(`Amount for plan ${i+1} is missing.`, res);
        if (!plans[i].type) return errorHandler(`Type for plan ${i+1} is missing.`, res);
        if (!plans[i].portfolios) return errorHandler(`Portfolio(s) for plan ${i+1} is missing.`, res);

        for (let y = 0; y < plans[i].portfolios.length; y++) {
            if (! plans[i].portfolios[y].portfolio_ref) return errorHandler(`Portfolio reference no for plan ${i+1} is missing.`, res);
            if (! plans[i].portfolios[y].portfolio_amount) return errorHandler(`Portfolio amount for plan ${i+1} is missing.`, res);
            if (! plans[i].portfolios[y].priority) return errorHandler(`Portfolio priority for plan ${i+1} is missing.`, res);
        }

        plans[i].account_ref = account_ref;
        plans[i].batch_id = batch_id;
    }


    for (let i = 0; i < funds.length; i++) {
        if (!funds[i].amount) return errorHandler(`Amount for deposit fund ${i+1} is missing.`, res);
        funds[i].account_ref = account_ref;
        funds[i].leftover_amount = funds[i].amount;
        funds[i].batch_id = batch_id;
    }


    // == Insert new plans and funds into db ==
    var newPlans = {};
    for (let i = 0; i < plans.length; i++) {
        var all_plans = await Plan.find();
        var plans_length = all_plans.length;
        plans[i].plan_id = plans_length + 1;
        plans[i] = new Plan(plans[i]);
        newPlans[i] = await plans[i].save(plans[i]);
    }

    var newFunds = {};
    for (let i = 0; i < funds.length; i++) {
        var all_funds = await Fund.find();
        var funds_length = all_funds.length;
        funds[i].deposit_id = funds_length + 1;
        funds[i] = new Fund(funds[i]);
        newFunds[i] = await funds[i].save(funds[i]);
    }


    // == Allocate deposit fund ==
    // - one time deposit plan is prioritized (type: 'once'/'monthly')
    newPlans = await Plan.find({
        account_ref: account_ref,
        batch_id: batch_id
    });

    newFunds = await Fund.find({
        account_ref: account_ref,
        batch_id: batch_id
    });

    //Extract portfolio data in plans, in the order of priority (once > monthly)
    let onceIdx = newPlans.findIndex(x => x.type === "once");
    let monthIdx = newPlans.findIndex(x => x.type === "monthly");
    const portfolioList = [];

    for (var k in newPlans[onceIdx].portfolios) {
        var v = newPlans[onceIdx].portfolios[k];
        v['plan_id'] = newPlans[onceIdx].plan_id;
        v['type'] = newPlans[onceIdx].type;
        portfolioList.push(v);
    }

    for (var k in newPlans[monthIdx].portfolios) {
        var v = newPlans[monthIdx].portfolios[k];
        v['plan_id'] = newPlans[monthIdx].plan_id;
        v['type'] = newPlans[monthIdx].type;
        portfolioList.push(v);
    }

    const allocationList = [];
    for (var k in newFunds) {
        var v = newFunds[k];
        var deposit_id = v['deposit_id'];
        var fund_amount = v['amount'];

        for (var k2 in portfolioList) {
            var v2 = portfolioList[k2];
            var portfolio_ref = v2['portfolio_ref'];
            var portfolio_amount = v2['portfolio_amount'];
            var paid_amount = v2['paid_amount'];
            var payable_amount = portfolio_amount - paid_amount;
            var allocated_amount;

            if (fund_amount <= 0) continue;
            if (payable_amount <= 0) continue;

            if (fund_amount >= payable_amount) {
                allocated_amount = payable_amount;
                paid_amount += payable_amount;
                fund_amount -= payable_amount;
            } else {
                allocated_amount = fund_amount;
                paid_amount += fund_amount;
                fund_amount = 0;
            }

            portfolioList[k2]['paid_amount'] = paid_amount;
            newFunds[k]['amount'] = fund_amount;

            if (allocated_amount > 0) {
                const allocation = {
                    deposit_id: deposit_id,
                    portfolio_ref: portfolio_ref,
                    allocated_amount: allocated_amount,
                    plan_type: v2['type']
                }
                allocationList.push(allocation);
            }
        }
    }

    // == Update fund in db (insert allocation) ==
    var inserted = [];
    for (const k in allocationList) {
        let v = allocationList[k];
        if (inserted.includes(v['deposit_id'])) continue;
        inserted.push(v['deposit_id']);
        const target = allocationList.filter(x => x.deposit_id === v['deposit_id']);

        //check is the deposit fund fully allocated.
        var isEmpty = false;
        let init_amount = await Fund.findOne({ deposit_id: v['deposit_id']}).select('amount');
        init_amount = init_amount['amount'];
        let total_amount = target.map(x => x.allocated_amount).reduce((prev, next) => prev + next);
        let leftover_amount = init_amount - total_amount;
        if (leftover_amount <= 0) isEmpty = true;

        //update db
        const filter = { deposit_id: v['deposit_id'] };
        const update = {
            leftover_amount: leftover_amount,
            isEmpty: isEmpty,
            allocation: target };
        await Fund.updateOne(filter, update);
    }

    // == Update plan in db ==
    for (const k in newPlans) {
        let v = newPlans[k];

        //check is the deposit fund fully allocated.
        var isFulfilled = false;
        let init_amount = v['amount'];
        var this_portfolios = portfolioList.filter(x => x.plan_id === v['plan_id']);
        let total_amount = this_portfolios.map(x => x.paid_amount).reduce((prev, next) => prev + next);
        if (init_amount == total_amount) isFulfilled = true;


        for (let i = 0; i < this_portfolios.length; i++) {
            if (this_portfolios[i]['portfolio_amount'] == this_portfolios[i]['paid_amount']) this_portfolios[i]['isPaid'] = true;
        }

        //update db
        const filter = { _id: v['_id'] };
        const update = {
            isFulfilled: isFulfilled,
            portfolios: this_portfolios
        };
        await Plan.updateOne(filter, update);
    }


    // == Retrieve updated plan & fund ==
    newPlans = await Plan.find({
        account_ref: account_ref,
        batch_id: batch_id
    });
    newFunds = await Fund.find({
        account_ref: account_ref,
        batch_id: batch_id
    });



    // == Return data ==
    //Check the leftover amount (unspent)
    var leftover_amount = newFunds.map(x => x.leftover_amount).reduce((prev, next) => prev + next);

    const return_data = {
        plans: newPlans,
        funds: newFunds,
        allocation: allocationList,
        leftover_amount: leftover_amount
    }

    let msg = `Successfully performed deposit plan.`;
    if (leftover_amount > 0) msg += ` You have ${leftover_amount} extra fund left unspent.`;
    else msg += ` You have spent all deposited fund.`;

    res.json({
        status: 'ok',
        msg: msg,
        data: return_data
    })

})

function errorHandler (err, res) {
    res.status(400).json({
        status: 'error',
        msg: err
    })
}


module.exports = router;
