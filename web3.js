const Web3 = require("web3");
const apiKey = process.env.INFURA_API_KEY;
function web3Api(network) {
  return new Web3(
    new Web3.providers.HttpProvider(`https://${network}.infura.io/v3/${apiKey}`)
  );
}

// const web3 = new Web3(new Web3.providers.HttpProvider(`https://${network}.infura.io/v3/${apiKey}`))

// const signer = web3.eth.accounts.privateKeyToAccount(privateKey)
// web3.eth.accounts.wallet.add(signer)
// web3.account = signer.address

module.exports = { web3Api };
