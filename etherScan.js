const axios = require("axios");

async function etherScan(network, params) {
  params.apikey = process.env.SEPOLIA_SCAN_KEY;
  return await axios.get(`${network}/api`, { params });
}

module.exports = { etherScan };
