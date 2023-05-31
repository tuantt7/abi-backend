var express = require("express");
var router = express.Router();
require("dotenv").config();
const abiDecoder = require("abi-decoder");
const axios = require("axios");
var cors = require("cors");
router.use(cors());
const { web3Api } = require("../web3");
const { etherScan } = require("../etherScan");

let timeout = 10000;

router.use(function (req, res, next) {
  // console.log("Request live");
  live();

  const accept = [
    "http://localhost:5173",
    "http://172.16.110.226:5173",
    "https://thanhtuan.onrender.com",
  ];
  const origin = req.headers.origin;
  const authorised = accept.includes(origin);
  const { contract } = req.query;
  if (authorised || contract === process.env.MY_ADDRESS) {
    next();
  } else {
    return res.status(403).send("Unauthorised!");
  }
});

function network(req, res, next) {
  const net = req.query.net || req.body.net;
  const network =
    net === "sepolia" ? process.env.SEPOLIA_URL : process.env.MAINNET_URL;
  req.network = network;
  next();
}

async function live() {
  if (timeout) clearTimeout(timeout);
  timeout = setTimeout(async () => {
    const params = {
      contract: process.env.MY_ADDRESS,
      net: "sepolia",
    };
    try {
      await axios.get("https://thanhtuan-api.onrender.com/abi", { params });
      console.log("Live");
    } catch (error) {
      console.log(error.message);
    }
    live();
  }, 600000);
}

router.post("/decode", network, async function (req, res, next) {
  const contract = req.body.contract;
  const hx = req.body.hx;
  const network = req.network;

  try {
    const address = (await getImplementation(network, contract)) || contract;

    const response = await getABI(network, address);
    if (response.status == 0 && response.message == "NOTOK") {
      res.send(response);
      return;
    }
    const abi = JSON.parse(response.result);
    abiDecoder.addABI(abi);
    const decodedData = abiDecoder.decodeMethod(hx) || {};
    if (decodedData && decodedData.name) decodedData.status = 1;
    res.send({ decodedData, abi });
  } catch (error) {
    console.log(error.message);
    res.status(404).send({ message: error.message });
  }
});

router.get("/transaction", async function (req, res, next) {
  const web3 = web3Api(req.query.net);
  const { hash } = req.query;
  try {
    const response = await web3.eth.getTransaction(hash);
    const receipt = await web3.eth.getTransactionReceipt(hash);
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
    console.log(error.message);
    res.status(404).send({ message: error.message });
  }
});

router.get("/block", async function (req, res, next) {
  const web3 = web3Api(req.query.net);
  const blockNumber = req.query.number;
  try {
    const response = await web3.eth.getBlock(blockNumber);

    const latestFinalizedBlock = await web3.eth.getBlock("finalized");
    const latest = await web3.eth.getBlock("latest");
    response.finalized = blockNumber <= latestFinalizedBlock.number;
    response.latest = latest.number;

    res.status(200).send(response);
  } catch (error) {
    console.log(error.message);
    res.status(404).send({ message: error.message });
  }
});

router.get("/txn-block", async function (req, res, next) {
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
    console.log(error.message);
    res.status(404).send({ message: error.message });
  }
});

router.get("/abi", network, async function (req, res, next) {
  const contract = req.query.contract;
  const network = req.network;
  const response = await getABI(network, contract);
  res.send(response);
});

router.get("/get-log", network, async function (req, res, next) {
  const hash = req.query.hash;
  const net = req.query.net;
  const network = req.network;
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
      const address =
        (await getImplementation(network, p.address)) || p.address;

      const result = await getABI(network, address);
      if (result.status == 1) {
        const temp = {
          address: p.address,
          abi: JSON.parse(result.result || ""),
          block: p.blockNumber,
          id: p.id,
        };
        logs.push(temp);
      }
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
          logIndex: trasnfers.logIndex,
        };
      })
    );

    logs.forEach((item) => {
      item.data = Object.assign({}, item.trasnfers.returnValues);
      item.addressLogs = [];
      for (const property in item.data) {
        if (isNumeric(property) && web3.utils.isAddress(item.data[property])) {
          item.addressLogs.push(item.data[property]);
          delete item.data[property];
        } else if (
          isNumeric(property) ||
          (item.event === "Transfer" &&
            (property === "to" || property === "from")) ||
          (!isNumeric(property) && web3.utils.isAddress(item.data[property]))
        ) {
          delete item.data[property];
        }
      }
    });

    res.status(200).send(logs);
  } catch (error) {
    console.log(error.message);
    res.status(404).send({ message: error.message });
  }
});

router.get("/get-implementation", network, async function (req, res, next) {
  const contract = req.query.contract;
  const network = req.network;
  const response = await getImplementation(network, contract);
  res.status(200).send(response);
});

router.get("/transactions", network, async function (req, res, next) {
  const network = req.network;
  const { address, endblock } = req.query;

  const params = {
    module: "account",
    action: "txlist",
    address,
    startblock: 0,
    endblock,
    page: 1,
    offset: 10000,
    sort: "desc",
  };

  try {
    const response = await etherScan(network, params);
    res.status(200).send(response.data.result);
    return;
  } catch (error) {
    console.log(error.message);
    res.status(400).send({ message: error.message });
  }
  res.status(400).send({ message: "Not found" });
});

router.get("/account", network, async function (req, res, next) {
  const { net, address } = req.query;
  const network = req.network;
  const web3 = web3Api(net);
  let addressCode = null;
  try {
    addressCode = await web3.eth.getCode(address);
  } catch (error) {
    console.log(error.message);
    res.status(400).send({ message: error.message });
    return;
  }
  const type = addressCode === "0x" ? "Address" : "Contract";
  const result = await web3.eth.getBalance(address);
  const balance = web3.utils.fromWei(result, "ether");
  const abi = await getABI(network, address);
  const verified = abi.message !== "NOTOK";
  const params = {
    module: "account",
    action: "txlist",
    address,
    startblock: 0,
    endblock: 99999999,
    page: 1,
    offset: 1,
    sort: "asc",
  };
  const response = await etherScan(network, params);
  const firstTransaction = response.data.result[0];

  res.status(200).send({
    type,
    balance,
    firstTransaction,
    verified,
  });
});

router.get("/revert", network, async function (req, res, next) {
  const { net, hash } = req.query;
  const web3 = web3Api(net);

  const tx = await web3.eth.getTransaction(hash);
  let message = "";
  try {
    await web3.eth.call(tx, tx.blockNumber);
  } catch (error) {
    message = error.message.replace("Returned error: execution reverted", "");
    if (message.length) message = message.replace(": ", "");
  } finally {
    res.status(200).send({ message });
  }
});

router.get("/mined", network, async function (req, res, next) {
  const network = req.network;
  const { address, page } = req.query;
  const params = {
    module: "account",
    action: "getminedblocks",
    address,
    blocktype: "blocks",
    page,
    offset: 50,
  };

  try {
    const response = await etherScan(network, params);
    res.status(200).send(response.data.result);
    return;
  } catch (error) {
    console.log(error.message);
    res.status(400).send({ message: error.message });
  }
  res.status(400).send({ message: "Not found" });
});

router.get("/total-mined", network, async function (req, res, next) {
  const network = req.network;
  const { address } = req.query;
  let page = 1;
  const get = async (page) => {
    const params = {
      module: "account",
      action: "getminedblocks",
      address,
      blocktype: "blocks",
      page,
      offset: 10000,
    };
    try {
      const response = await etherScan(network, params);
      if (response.data.result.length === 10000) {
        get(page + 1, network, address);
      } else {
        res
          .status(200)
          .send({ total: (page - 1) * 10000 + response.data.result.length });
        return;
      }
    } catch (error) {
      return [];
    }
  };

  await get(page, network, address);

  res.status(200);
});

router.get("/in-txn", network, async function (req, res, next) {
  const network = req.network;
  const { hash } = req.query;

  const params = {
    module: "account",
    action: "txlistinternal",
    txhash: hash,
  };

  try {
    const response = await etherScan(network, params);
    res.status(200).send(response.data.result);
    return;
  } catch (error) {
    console.log(error.message);
    res.status(400).send({ message: error.message });
  }
  res.status(400).send({ message: "Not found" });
});

const getImplementation = async (network, contract) => {
  const params = {
    module: "contract",
    action: "getsourcecode",
    address: contract,
  };
  const response = await etherScan(network, params);
  const source = response.data.result.find((item) => item.Implementation);

  return source?.Implementation ?? "";
};

const getABI = async (network, contract) => {
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
