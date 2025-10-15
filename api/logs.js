const { readLogs } = require('./services/logger');

module.exports = async (req, res) => {
  const logs = await readLogs();
  res.status(200).json(logs);
};