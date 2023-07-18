// uniswap data
//const data = require('./03:23-json/uniV3EthPriceDataDaily.json');

const fs = require('fs');
const csv = require('csv-parser');

let data = [];

fs.createReadStream('ETH_1min.csv')
  .pipe(csv())
  .on('data', (row, i) => {
    data.push({
      price: parseFloat(row.Open),
    });
  })
  .on('end', () => {
    console.log('CSV file successfully processed');


    /********* global vars *********/

    // set reserves to first price in data
    const initialReserveA = 1000000; // usd
    const initialReserveB = initialReserveA / data[0].price; // eth

    // some parameters for the pretend external amm
    const targetExternalTvl = 1000000000; // $1B
    const externalFeeFactor = 0.9997; // 3 bps

    const pretendGasCost = 0.5; // usd



    /********* tests *********/

    // calculate LP value on CPAMM with fee of 30bps
    const calcCpamm = () => {
        console.log('\n------CPAMM------');
        let ammReserveA = initialReserveA;
        let ammReserveB = initialReserveB;
        const ammFeeFactor = 0.997; // 30bps

        let totalProfitA = 0;
        let totalProfitB = 0;
        data.forEach((d, i) => {
            // we will pretend there is some external AMM with X tvl that quotes the correct price
            const externalReserveA = targetExternalTvl / 2; // usd
            const externalReserveB = (targetExternalTvl / 2) / d.price; // eth

            // calculate arb from a->b->a
            const arbSwapAmountA = (
                (Math.sqrt(ammReserveA * ammReserveB * externalReserveA * externalReserveB * ammFeeFactor * externalFeeFactor) - (ammReserveA * externalReserveB)) / 
                (ammFeeFactor * (externalReserveB + (ammReserveB * externalFeeFactor)))
            );
            const intermediateAmountOutB = ammReserveB - ((ammReserveA * ammReserveB) / (ammReserveA + (arbSwapAmountA * ammFeeFactor)));
            const amountOutA = externalReserveA - ((externalReserveA * externalReserveB) / (externalReserveB + (intermediateAmountOutB * externalFeeFactor)));
            const profitA = amountOutA - arbSwapAmountA;

            // calculate arb from b->a->b
            const arbSwapAmountB = (
                (Math.sqrt(ammReserveA * ammReserveB * externalReserveA * externalReserveB * ammFeeFactor * externalFeeFactor) - (ammReserveB * externalReserveA)) / 
                (ammFeeFactor * (externalReserveA + (ammReserveA * externalFeeFactor)))
            );
            const intermediateAmountOutA = ammReserveA - ((ammReserveA * ammReserveB) / (ammReserveB + (arbSwapAmountB * ammFeeFactor)));
            const amountOutB = externalReserveB - ((externalReserveA * externalReserveB) / (externalReserveA + (intermediateAmountOutA * externalFeeFactor)));
            const profitB = (amountOutB - arbSwapAmountB) * d.price; // convert to usd

            // if profitable, do the arb
            if (profitA > 0 && profitA > pretendGasCost && arbSwapAmountA > 0) {
                // arb a->b
                ammReserveA += arbSwapAmountA;
                ammReserveB -= intermediateAmountOutB;
                totalProfitA += profitA;
            }
            if (profitB > 0 && profitB > pretendGasCost && arbSwapAmountB > 0) {
                // arb b->a
                ammReserveB += arbSwapAmountB;
                ammReserveA -= intermediateAmountOutA;
                totalProfitB += profitB;
            }
        });

        console.log('Arb profit A: ', totalProfitA);
        console.log('Arb profit B: ', totalProfitB);

        // calc LP profit
        const initialLpValueUsd = initialReserveA + (initialReserveB * data[0].price);
        const hodlValue = initialReserveA + (initialReserveB * data[data.length - 1].price);
        const currentLpValue = ammReserveA + (ammReserveB * data[data.length - 1].price);
        const impermanentLoss = ((currentLpValue / hodlValue) - 1) * 100;
        console.log('Initial LP Value: ', initialLpValueUsd);
        console.log('Hodl Value: ', hodlValue);
        console.log('Current LP Value: ', currentLpValue);
        console.log('IL: ', impermanentLoss + '%');
    }
    calcCpamm();



    // calculate LP value on TWAMM with dynamic fee
    const calcTwamm = () => {
        console.log('\n\n------TWAMM------')
        let ammReserveA = initialReserveA;
        let ammReserveB = initialReserveB;

        let totalProfitA = 0;
        let totalProfitB = 0;
        data.forEach((d, i) => {
            // we will pretend there is some external AMM with X tvl that quotes the correct price
            const externalReserveA = targetExternalTvl / 2; // usd
            const externalReserveB = (targetExternalTvl / 2) / d.price; // eth

            // calculate arb from a->b->a
            const arbSwapAmountA = (
                ((-2 * Math.pow(externalReserveB, 2) * ammReserveA) - (externalReserveB * ammReserveB * ammReserveA) + 
                Math.sqrt(externalReserveB * ammReserveA * ((4 * Math.pow(externalReserveB, 3) * ammReserveA) - (4 * Math.pow(externalReserveB, 2) * ammReserveA) + (4 * externalReserveB * Math.pow(ammReserveB, 2) * externalReserveA * externalFeeFactor) + (4 * externalReserveB * ammReserveB * externalReserveA * externalFeeFactor) + (Math.pow(ammReserveB, 3) * externalReserveA * externalFeeFactor)))) /
                ((4 * externalReserveB) + (4 * externalReserveB * ammReserveB) + Math.pow(ammReserveB, 2))
            )
            const intermediateAmountOutB = (arbSwapAmountA * ammReserveB) / (ammReserveA + (2 * arbSwapAmountA));
            const amountOutA = externalReserveA - ((externalReserveA * externalReserveB) / (externalReserveB + (intermediateAmountOutB * externalFeeFactor)));
            const profitA = amountOutA - arbSwapAmountA;

            // calculate arb from b->a->b
            const arbSwapAmountB = (
                ((-2 * Math.pow(externalReserveA, 2) * ammReserveB) - (externalReserveA * ammReserveA * ammReserveB) + 
                Math.sqrt(externalReserveA * ammReserveB * ((4 * Math.pow(externalReserveA, 3) * ammReserveB) - (4 * Math.pow(externalReserveA, 2) * ammReserveB) + (4 * externalReserveA * Math.pow(ammReserveA, 2) * externalReserveB * externalFeeFactor) + (4 * externalReserveA * ammReserveA * externalReserveB * externalFeeFactor) + (Math.pow(ammReserveA, 3) * externalReserveB * externalFeeFactor)))) /
                ((4 * externalReserveA) + (4 * externalReserveA * ammReserveA) + Math.pow(ammReserveA, 2))
            );
            const intermediateAmountOutA = (arbSwapAmountB * ammReserveA) / (ammReserveB + (2 * arbSwapAmountB));
            const amountOutB = externalReserveB - ((externalReserveA * externalReserveB) / (externalReserveA + (intermediateAmountOutA * externalFeeFactor)));
            const profitB = (amountOutB - arbSwapAmountB) * d.price; // convert to usd

            // if profitable, do the arb
            if (profitA > 0 && profitA > pretendGasCost && arbSwapAmountA > 0) {
                // arb a->b
                ammReserveA += arbSwapAmountA;
                ammReserveB -= intermediateAmountOutB;
                totalProfitA += profitA;
            }
            if (profitB > 0 && profitB > pretendGasCost && arbSwapAmountB > 0) {
                // arb b->a
                ammReserveB += arbSwapAmountB;
                ammReserveA -= intermediateAmountOutA;
                totalProfitB += profitB;
            }
        });

        console.log('Arb profit A: ', totalProfitA);
        console.log('Arb profit B: ', totalProfitB);

        // calc LP profit
        const initialLpValueUsd = initialReserveA + (initialReserveB * data[0].price);
        const hodlValue = initialReserveA + (initialReserveB * data[data.length - 1].price);
        const currentLpValue = ammReserveA + (ammReserveB * data[data.length - 1].price);
        const impermanentLoss = ((currentLpValue / hodlValue) - 1) * 100;
        console.log('Initial LP Value: ', initialLpValueUsd);
        console.log('Hodl Value: ', hodlValue);
        console.log('Current LP Value: ', currentLpValue);
        console.log('IL: ', impermanentLoss + '%');
    }
    calcTwamm();

});