const Web3 = require("web3");
const apiKey = process.env.INFURA_API_KEY;
function web3Api(network) {
  return new Web3(
    new Web3.providers.HttpProvider(`https://${network}.infura.io/v3/${apiKey}`)
  );
}

module.exports = { web3Api };
