require('dotenv').config();
const { startSmtp } = require('./smtp');
const { app } = require('./web');
const { startRetentionJob } = require('./retention');

const WEB_PORT = parseInt(process.env.WEB_PORT || '3000', 10);

app.listen(WEB_PORT, () => {
  console.log(`Web server listening on port ${WEB_PORT}`);
});

startSmtp();
startRetentionJob();
