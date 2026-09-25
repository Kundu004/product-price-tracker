require('dotenv').config();

const app = require('./app');

// Render (and most PaaS hosts) assign the port dynamically via process.env.PORT.
// Hardcoding a port number here would break deployment, so we always fall back
// to a local default only for running on your own machine.
const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
