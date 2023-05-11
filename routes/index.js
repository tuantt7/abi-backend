var express = require("express");
var router = express.Router();
require('dotenv').config()
const abiDecoder = require("abi-decoder");
const axios = require("axios");
var cors = require('cors');
router.use(cors());

/* GET home page. */
router.get("/abi", async function (req, res, next) {
  // res.header("Access-Control-Allow-Origin", "*");
  const contract = req.query.contract;
  const hx = req.query.hx;
  console.log(contract);

  const response = await axios.get(
    `${process.env.S_U}/api?module=contract&action=getabi&address=${contract}&apikey=${process.env.API_T}`
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
