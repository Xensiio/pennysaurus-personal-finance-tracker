const express = require("express");
const app = require("./server/app");

const handler = express();
handler.use(app);

module.exports = handler;
