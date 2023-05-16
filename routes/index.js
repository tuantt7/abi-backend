var express = require("express");
var router = express.Router();
require("dotenv").config();
const abiDecoder = require("abi-decoder");
const axios = require("axios");
var cors = require("cors");
router.use(cors());

router.post("/abi", async function (req, res, next) {
  const contract = req.body.contract;
  const hx = req.body.hx;
  const net = req.body.net;
  const network = net === "sepolia" ? process.env.S_U : process.env.M_U;

  const response = await axios.get(
    `${network}/api?module=contract&action=getabi&address=${contract}&apikey=${process.env.API_T}`
  );
  if (response.data.status == 0 && response.data.message == "NOTOK") {
    res.send(response.data);
    return;
  }
  const abi = JSON.parse(response.data.result);
  abiDecoder.addABI(abi);
  const decodedData = abiDecoder.decodeMethod(hx) || {};
  if (decodedData && decodedData.name) decodedData.status = 1;
  res.send(decodedData);
});

module.exports = router;
