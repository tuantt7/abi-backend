var express = require("express");
var router = express.Router();
require("dotenv").config();
const abiDecoder = require("abi-decoder");
const axios = require("axios");
var cors = require("cors");
router.use(cors());
const { web3Api } = require("../web3");

router.use(function (req, res, next) {
  const accept = [
    "http://localhost:5173",
    "http://172.16.110.226:5173",
    "https://thanhtuan.onrender.com",
  ];
  const origin = req.headers.origin;
  const authorised = accept.includes(origin);
  if (!authorised) {
    return res.status(403).send(origin + "Unauthorised!");
  } else {
    next();
  }
});

router.post("/decode", async function (req, res, next) {
  const contract = req.body.contract;
  const hx = req.body.hx;
  const net = req.body.net;
  const network =
    net === "sepolia" ? process.env.SEPOLIA_URL : process.env.MAINNET_URL;
  const response = await getABI(network, contract);
  if (response.status == 0 && response.message == "NOTOK") {
    res.send(response);
    return;
  }
  const abi = JSON.parse(response.result);
  abiDecoder.addABI(abi);
  const decodedData = abiDecoder.decodeMethod(hx) || {};
  if (decodedData && decodedData.name) decodedData.status = 1;
  res.send({ decodedData, abi });
});

router.get("/transaction", async function (req, res, next) {
  const web3 = web3Api(req.query.net);
  try {
    const response = await web3.eth.getTransaction(req.query.id);
    const receipt = await web3.eth.getTransactionReceipt(req.query.id);
    const block = await web3.eth.getBlock(response.blockNumber);
    response.timestamp = block.timestamp;
    let isContract = false;
    if (response.to) {
      const code = await web3.eth.getCode(response.to);
      isContract = code !== "0x";
    }
    response.isContract = isContract;
    res.status(200).send({ response, receipt });
  } catch (error) {
    console.log(error);
    res.status(200).send(error);
  }
});

router.get("/block", async function (req, res, next) {
  const web3 = web3Api(req.query.net);
  try {
    const response = await web3.eth.getBlock(req.query.id);

    const latestFinalizedBlock = await web3.eth.getBlock("finalized");
    response.finalized = req.query.id <= latestFinalizedBlock.number;

    res.status(200).send(response);
  } catch (error) {
    console.log(error);
    res.status(200).send(error);
  }
});

router.get("/txsBlock", async function (req, res, next) {
  const web3 = web3Api(req.query.net);
  const { page } = req.query;

  try {
    const response = await web3.eth.getBlock(req.query.id);
    const transactions = [];
    const filterData = response.transactions
      .sort()
      .filter(
        (item, index) => index >= page * 10 - 10 && index <= page * 10 - 1
      );
    for (let index = 0; index < filterData.length; index++) {
      const p = filterData[index];
      const detail = await web3.eth.getTransaction(p);
      const detail2 = await web3.eth.getTransactionReceipt(p);
      detail.contractAddress = detail2.contractAddress;
      detail.timestamp = response.timestamp;
      transactions.push(detail);
    }

    res.status(200).send({
      transactions,
      total: response.transactions.length,
    });
  } catch (error) {
    console.log(error);
    res.status(200).send(error);
  }
});

router.get("/abi", async function (req, res, next) {
  const contract = req.query.contract;
  const net = req.query.net;
  console.log(contract, net);
  const network =
    net === "sepolia" ? process.env.SEPOLIA_URL : process.env.MAINNET_URL;
  const response = await getABI(network, contract);
  res.send(response);
});

router.get("/get-log", async function (req, res, next) {
  const hash = req.query.hash;
  const net = req.query.net;
  const network =
    net === "sepolia" ? process.env.SEPOLIA_URL : process.env.MAINNET_URL;
  const web3 = web3Api(net);

  try {
    const receipt = await web3.eth.getTransactionReceipt(hash);

    let logs = [];
    const wait = (millisec) => {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve("");
        }, millisec);
      });
    };
    for (let index = 0; index < receipt.logs.length; index++) {
      await wait(250);
      const p = { ...receipt.logs[index] };

      let storagePosition =
        "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
      let address = await web3.eth.getStorageAt(p.address, storagePosition);
      console.log(address);
      const notAddress =
        "0x0000000000000000000000000000000000000000000000000000000000000000";
      if (address !== notAddress) {
        address = address.replace("000000000000000000000000", "");
      } else address = p.address;
      const result = await getABI(network, address);
      const temp = {
        address: p.address,
        abi: JSON.parse(result.result || ""),
        block: p.blockNumber,
        id: p.id,
      };
      logs.push(temp);
    }

    logs = await Promise.all(
      logs.map(async (item) => {
        const contract = new web3.eth.Contract(item.abi, item.address);
        const name = contract.methods.name
          ? await contract.methods.name().call()
          : "";
        const decimals = contract.methods.decimals
          ? await contract.methods.decimals().call()
          : "";
        const symbol = contract.methods.symbol
          ? await contract.methods.symbol().call()
          : "";
        let trasnfers = await contract.getPastEvents("allEvents", {
          fromBlock: item.block,
          toBlock: item.block,
        });
        trasnfers = trasnfers.find((i) => i.id === item.id);
        const value = trasnfers.returnValues.value;
        return {
          ...item,
          name,
          decimals,
          symbol,
          trasnfers,
          value,
          from: trasnfers.returnValues.from,
          to: trasnfers.returnValues.to,
          event: trasnfers.event,
        };
      })
    );

    logs.forEach((item) => {
      item.data = Object.assign({}, item.trasnfers.returnValues);
      item.addressLogs = [];
      for (const property in item.data) {
        if (web3.utils.isAddress(item.data[property]) && isNumeric(property)) {
          item.addressLogs.push(item.data[property]);
          delete item.data[property];
        } else if (
          isNumeric(property) ||
          web3.utils.isAddress(item.data[property])
        ) {
          delete item.data[property];
        }
      }
    });

    res.status(200).send(logs);
  } catch (error) {
    console.log(error);
    res.status(200).send(error);
  }
});

const getABI = async (network, contract) => {
  console.log(network + "---" + contract);
  const response = await axios.get(
    `${network}/api?module=contract&action=getabi&address=${contract}&apikey=${process.env.SEPOLIA_SCAN_KEY}`
  );
  return response.data;
};

const isNumeric = (str) => {
  if (typeof str != "string") return false;
  return !isNaN(str) && !isNaN(parseFloat(str));
};

module.exports = router;
